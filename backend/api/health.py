"""
TickerPulse AI v3.0 - Health Check Blueprint

Exposes:
  GET /api/health       — full per-subsystem status (DB, scheduler, agents, providers, freshness)
  GET /api/health/ready — lightweight liveness probe for Electron startup
"""

import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

from flask import Blueprint, Flask, current_app, jsonify

from backend.config import Config
from backend.database import _get_pool, db_session

logger = logging.getLogger(__name__)

health_bp = Blueprint("health", __name__)

_APP_VERSION = "3.0.0"

# Stale threshold — exposed as a module-level constant so tests can override it.
_FRESHNESS_THRESHOLD_MINUTES = 15


# ---------------------------------------------------------------------------
# Per-subsystem probes
# ---------------------------------------------------------------------------


def _check_db() -> dict[str, Any]:
    """Probe the DB via a pooled session; return connectivity and pool stats.

    Returns a dict with keys: status, latency_ms, wal_mode, pool.
    On failure, also includes 'error' with the exception message.
    """
    result: dict[str, Any] = {
        "status": "error",
        "latency_ms": None,
        "wal_mode": None,
        "pool": None,
    }
    try:
        t0 = time.monotonic()
        with db_session() as conn:
            row = conn.execute("PRAGMA journal_mode").fetchone()
            wal_mode = row[0] if row else None
            conn.execute("SELECT 1")
        latency_ms = round((time.monotonic() - t0) * 1000, 2)

        result.update(
            {
                "status": "ok",
                "latency_ms": latency_ms,
                "wal_mode": wal_mode,
                "pool": _get_pool().stats(),
            }
        )
    except Exception as exc:
        logger.warning("health: DB check failed: %s", exc)
        result["error"] = str(exc)
    return result


def _check_db_depth() -> dict[str, Any]:
    """Return DB file size and row counts for key tables.

    Returns a dict with keys: status, file_size_mb, table_counts.
    On failure, also includes 'error' with the exception message.
    """
    result: dict[str, Any] = {"status": "error", "file_size_mb": None, "table_counts": None}
    try:
        db_path = Config.DB_PATH
        try:
            size_bytes = os.path.getsize(db_path)
            file_size_mb = round(size_bytes / (1024 * 1024), 2)
        except OSError as exc:
            result["error"] = str(exc)
            return result

        table_counts: dict[str, int] = {}
        with db_session() as conn:
            for table in ("stocks", "agent_runs", "news", "ai_ratings", "earnings_events"):
                try:
                    row = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
                    table_counts[table] = row[0] if row else 0
                except Exception:
                    pass

        result.update(
            {
                "status": "ok",
                "file_size_mb": file_size_mb,
                "table_counts": table_counts,
            }
        )
    except Exception as exc:
        logger.warning("health: DB depth check failed: %s", exc)
        result["error"] = str(exc)
    return result


def _check_scheduler(app: Flask) -> dict[str, Any]:
    """Return APScheduler running state and registered job count.

    status is one of: 'ok', 'stopped', 'not_configured', 'error'.
    """
    result: dict[str, Any] = {"status": "unknown", "running": None, "job_count": None}
    try:
        sched = getattr(app, "scheduler", None)
        if sched is None:
            result.update({"status": "not_configured", "running": False})
        elif sched.running:
            result.update({"status": "ok", "running": True})
        else:
            result.update({"status": "stopped", "running": False})

        # Optional: count jobs from SchedulerManager (doesn't affect status)
        try:
            from backend.scheduler import scheduler_manager  # noqa: PLC0415

            result["job_count"] = len(scheduler_manager._job_registry)
        except Exception:
            pass
    except Exception as exc:
        logger.warning("health: scheduler check failed: %s", exc)
        result.update({"status": "error", "error": str(exc)})
    return result


def _check_agent_registry(app: Flask) -> dict[str, Any]:
    """Return agent registry presence and agent count.

    status is one of: 'ok', 'not_configured', 'error'.
    """
    result: dict[str, Any] = {"status": "unknown", "agent_count": None}
    try:
        registry = app.extensions.get("agent_registry")
        if registry is None:
            result["status"] = "not_configured"
        else:
            result.update({"status": "ok", "agent_count": len(registry.list_agents())})
    except Exception as exc:
        logger.warning("health: agent_registry check failed: %s", exc)
        result.update({"status": "error", "error": str(exc)})
    return result


def _check_data_providers(app: Flask) -> dict[str, Any]:
    """Return data provider registry presence check (simple).

    status is one of: 'ok', 'not_configured', 'error'.
    """
    result: dict[str, Any] = {"status": "unknown", "configured": False}
    try:
        registry = app.extensions.get("data_registry")
        if registry is None:
            result.update({"status": "not_configured", "configured": False})
        else:
            result.update({"status": "ok", "configured": True})
    except Exception as exc:
        logger.warning("health: data_providers check failed: %s", exc)
        result.update({"status": "error", "error": str(exc)})
    return result


def _check_data_provider_detail(app: Flask) -> dict[str, Any]:
    """Return per-provider status from the data_providers_config table.

    Returns a dict with keys: status, configured, providers (list of per-provider dicts).
    Each provider dict contains: name, active, has_api_key, rate_limit_remaining, last_used.
    """
    result: dict[str, Any] = {"status": "unknown", "configured": False, "providers": []}
    try:
        registry = app.extensions.get("data_registry")
        if registry is None:
            result.update({"status": "not_configured", "configured": False})
            return result

        providers: list[dict[str, Any]] = []
        with db_session() as conn:
            rows = conn.execute(
                "SELECT provider_name, is_active, api_key, rate_limit_remaining, last_used"
                " FROM data_providers_config ORDER BY priority ASC"
            ).fetchall()
            for row in rows:
                providers.append(
                    {
                        "name": row["provider_name"],
                        "active": bool(row["is_active"]),
                        "has_api_key": bool(row["api_key"]),
                        "rate_limit_remaining": row["rate_limit_remaining"],
                        "last_used": row["last_used"],
                    }
                )

        result.update({"status": "ok", "configured": True, "providers": providers})
    except Exception as exc:
        logger.warning("health: data provider detail check failed: %s", exc)
        result.update({"status": "error", "error": str(exc)})
    return result


def _check_data_freshness() -> dict[str, Any]:
    """Return freshness signals for prices (ai_ratings) and earnings (earnings_events).

    stale is True when prices_age_min exceeds _FRESHNESS_THRESHOLD_MINUTES.
    """
    result: dict[str, Any] = {
        "prices_updated_at": None,
        "prices_age_min": None,
        "earnings_updated_at": None,
        "stale": False,
    }
    try:
        with db_session() as conn:
            row = conn.execute("SELECT MAX(updated_at) FROM ai_ratings").fetchone()
            prices_updated_at = row[0] if row else None

            row = conn.execute("SELECT MAX(updated_at) FROM earnings_events").fetchone()
            earnings_updated_at = row[0] if row else None

        result["prices_updated_at"] = prices_updated_at
        result["earnings_updated_at"] = earnings_updated_at

        if prices_updated_at:
            try:
                ts = datetime.fromisoformat(prices_updated_at)
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                age_min = round((datetime.now(timezone.utc) - ts).total_seconds() / 60, 1)
                result["prices_age_min"] = age_min
                result["stale"] = age_min > _FRESHNESS_THRESHOLD_MINUTES
            except Exception:
                pass
    except Exception as exc:
        logger.warning("health: data freshness check failed: %s", exc)
    return result


def _get_error_log_count_1h() -> int:
    """Count error_log rows created in the last hour.

    Returns -1 when the query fails (e.g. table not yet created).
    Uses a parameterised placeholder to satisfy the no-SQL-injection rule.
    """
    try:
        with db_session() as conn:
            row = conn.execute(
                "SELECT COUNT(*) FROM error_log"
                " WHERE created_at >= datetime('now', ?)",
                ("-1 hours",),
            ).fetchone()
            return row[0] if row else 0
    except Exception as exc:
        logger.warning("health: error_log count failed: %s", exc)
        return -1


def _get_sse_client_count() -> int:
    """Return the number of currently connected SSE clients.

    The import is deferred into the function body to avoid a circular import:
    backend.app registers this blueprint, so a top-level import of
    backend.app here would create a cycle.  By the time a request reaches
    this function, backend.app is fully initialised in sys.modules.

    Returns -1 when the count cannot be determined.
    """
    try:
        from backend.app import sse_clients, sse_lock  # noqa: PLC0415

        with sse_lock:
            return len(sse_clients)
    except Exception as exc:
        logger.debug("health: SSE client count unavailable: %s", exc)
        return -1


def _derive_overall_status(
    db_status: str, scheduler_status: str, stale: bool = False
) -> str:
    """Derive the top-level status string from critical subsystem statuses.

    Rules
    -----
    - DB must be 'ok'; anything else → 'degraded'.
    - Scheduler 'stopped' or 'error' → 'degraded'.
    - Scheduler 'not_configured' or 'ok' is acceptable.
    - stale=True (prices older than _FRESHNESS_THRESHOLD_MINUTES) → 'degraded'.
    - Other subsystem failures are reported in the payload but do not
      change the overall status.
    """
    db_ok = db_status == "ok"
    scheduler_ok = scheduler_status in ("ok", "not_configured", "unknown")
    return "ok" if (db_ok and scheduler_ok and not stale) else "degraded"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@health_bp.route("/api/health")
def health() -> Any:
    """Health-check endpoint with per-subsystem status for monitoring.

    Always returns HTTP 200; callers should inspect the 'status' field
    ('ok' or 'degraded') for the authoritative service state.
    ---
    tags:
      - System
    responses:
      200:
        description: Service status report
        schema:
          type: object
          properties:
            status:
              type: string
              example: ok
            version:
              type: string
              example: "3.0.0"
            timestamp:
              type: string
              example: "2026-02-28T12:00:00+00:00"
            services:
              type: object
            metrics:
              type: object
    """
    app: Flask = current_app._get_current_object()

    db_check = _check_db()
    db_depth_check = _check_db_depth()
    scheduler_check = _check_scheduler(app)
    agent_registry_check = _check_agent_registry(app)
    data_provider_detail = _check_data_provider_detail(app)
    freshness_check = _check_data_freshness()

    # Merge depth info into the db result when both probes succeed.
    db_check["file_size_mb"] = db_depth_check.get("file_size_mb")
    db_check["table_counts"] = db_depth_check.get("table_counts")

    overall = _derive_overall_status(
        db_check["status"],
        scheduler_check["status"],
        stale=freshness_check.get("stale", False),
    )

    return jsonify(
        {
            "status": overall,
            "version": _APP_VERSION,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "services": {
                "db": db_check,
                "scheduler": scheduler_check,
                "agent_registry": agent_registry_check,
                "data_providers": data_provider_detail,
                "data_freshness": freshness_check,
            },
            "metrics": {
                "error_log_count_1h": _get_error_log_count_1h(),
                "sse_client_count": _get_sse_client_count(),
            },
        }
    )


@health_bp.route("/api/health/ready")
def health_ready() -> Any:
    """Lightweight liveness probe for Electron startup handshake.

    Runs only a DB connectivity check to minimise latency.
    Returns HTTP 200 with ready=true when DB is reachable.
    Returns HTTP 503 with ready=false when DB is unreachable.
    ---
    tags:
      - System
    responses:
      200:
        description: Service is ready
      503:
        description: Service is not ready (DB unreachable)
    """
    db_check = _check_db()
    ready = db_check["status"] == "ok"
    payload = {
        "ready": ready,
        "db": db_check["status"],
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    return jsonify(payload), 200 if ready else 503
