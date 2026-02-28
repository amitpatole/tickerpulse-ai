```python
"""
TickerPulse AI v3.0 - Health Check API

GET /api/health — Detailed health check with service probes, DB pool stats,
data freshness indicators, and observability metrics.
GET /api/health/ready — Minimal readiness probe for load balancers / k8s.
"""

import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from flask import Blueprint, current_app, jsonify

from backend.config import Config
from backend.core.error_handlers import handle_api_errors
from backend.database import db_session, _get_pool, get_pool

logger = logging.getLogger(__name__)

health_bp = Blueprint('health', __name__, url_prefix='/api')

_VERSION = '3.0.0'
_STALE_THRESHOLD_MIN = 15  # prices older than this (minutes) → stale

# Tables included in the depth row-count snapshot.
_DEPTH_TABLES = [
    'stocks', 'agent_runs', 'job_history', 'ai_ratings',
    'earnings_events', 'error_log',
]


# ---------------------------------------------------------------------------
# Probe helpers
# ---------------------------------------------------------------------------


def _check_db() -> Dict[str, Any]:
    """Probe DB connectivity: measure query latency, WAL mode, and pool stats."""
    try:
        t0 = time.monotonic()
        with db_session() as conn:
            row = conn.execute("PRAGMA journal_mode").fetchone()
            wal_mode = row[0] if row else None
        latency_ms = round((time.monotonic() - t0) * 1000, 2)
        pool_stats = _get_pool().stats()
        return {
            'status': 'ok',
            'latency_ms': latency_ms,
            'wal_mode': wal_mode,
            'pool': pool_stats,
        }
    except Exception as exc:
        logger.warning('_check_db: %s', exc)
        return {
            'status': 'error',
            'error': str(exc),
            'latency_ms': None,
            'wal_mode': None,
            'pool': None,
        }


def _check_db_depth() -> Dict[str, Any]:
    """Probe DB file size and per-table row counts."""
    try:
        file_size_mb = round(os.path.getsize(Config.DB_PATH) / (1024 * 1024), 2)
    except OSError as exc:
        logger.warning('_check_db_depth: file stat failed: %s', exc)
        return {
            'status': 'error',
            'error': str(exc),
            'file_size_mb': None,
            'table_counts': None,
        }

    table_counts: Dict[str, int] = {}
    try:
        with db_session() as conn:
            for table in _DEPTH_TABLES:
                try:
                    row = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
                    table_counts[table] = row[0] if row else 0
                except Exception:
                    pass  # table may not exist yet
    except Exception as exc:
        logger.warning('_check_db_depth: query failed: %s', exc)

    return {
        'status': 'ok',
        'file_size_mb': file_size_mb,
        'table_counts': table_counts,
    }


def _check_scheduler(app) -> Dict[str, Any]:
    """Probe the scheduler via SchedulerManager.get_status()."""
    try:
        import sys
        sm_mod = sys.modules.get('backend.scheduler')
        if sm_mod is None:
            return {'status': 'not_configured', 'running': False, 'job_count': None, 'timezone': None}

        manager = getattr(sm_mod, 'scheduler_manager', None)
        if manager is None:
            return {'status': 'not_configured', 'running': False, 'job_count': None, 'timezone': None}

        info = manager.get_status()
        status = 'ok' if info['running'] else 'error'
        return {
            'status': status,
            'running': info['running'],
            'job_count': info['job_count'],
            'timezone': info['timezone'],
        }
    except Exception as exc:
        logger.warning('_check_scheduler: %s', exc)
        return {'status': 'error', 'running': None, 'job_count': None, 'timezone': None, 'error': str(exc)}


def _check_agent_registry(app) -> Dict[str, Any]:
    """Probe the agent registry in Flask app extensions."""
    try:
        registry = app.extensions.get('agent_registry')
        if registry is None:
            return {'status': 'not_configured', 'agent_count': None}
        agents = registry.list_agents()
        return {'status': 'ok', 'agent_count': len(agents)}
    except Exception as exc:
        logger.warning('_check_agent_registry: %s', exc)
        return {'status': 'error', 'agent_count': None, 'error': str(exc)}


def _check_data_providers(app) -> Dict[str, Any]:
    """Simple probe: is a data registry present in Flask extensions?"""
    try:
        registry = app.extensions.get('data_registry')
        if registry is None:
            return {'status': 'not_configured', 'configured': False}
        return {'status': 'ok', 'configured': True}
    except Exception as exc:
        logger.warning('_check_data_providers: %s', exc)
        return {'status': 'error', 'configured': False, 'error': str(exc)}


def _check_data_provider_detail(app) -> Dict[str, Any]:
    """Detailed probe: per-provider data from the data_providers_config table."""
    registry = None
    try:
        registry = app.extensions.get('data_registry')
    except Exception:
        pass

    if registry is None:
        return {'status': 'not_configured', 'configured': False, 'providers': []}

    try:
        with db_session() as conn:
            rows = conn.execute(
                "SELECT provider_name, is_active, api_key, rate_limit_remaining, last_used"
                " FROM data_providers_config"
            ).fetchall()
        providers = [
            {
                'name': row['provider_name'],
                'active': bool(row['is_active']),
                'has_api_key': bool(row['api_key']),
                'rate_limit_remaining': row['rate_limit_remaining'],
                'last_used': row['last_used'],
            }
            for row in rows
        ]
        return {'status': 'ok', 'configured': True, 'providers': providers}
    except Exception as exc:
        logger.warning('_check_data_provider_detail: %s', exc)
        return {
            'status': 'error',
            'configured': True,
            'error': str(exc),
            'providers': [],
        }


def _check_data_freshness() -> Dict[str, Any]:
    """Probe data freshness: age of the most recent ai_ratings prices."""
    try:
        with db_session() as conn:
            row = conn.execute(
                "SELECT MAX(updated_at) FROM ai_ratings"
            ).fetchone()
            prices_updated_at = row[0] if row else None

            row2 = conn.execute(
                "SELECT MAX(updated_at) FROM earnings_events"
            ).fetchone()
            earnings_updated_at = row2[0] if row2 else None

        prices_age_min: Optional[float] = None
        stale = False

        if prices_updated_at:
            try:
                updated = datetime.fromisoformat(
                    prices_updated_at.replace('Z', '+00:00')
                )
                now = datetime.now(timezone.utc)
                age_min = (now - updated).total_seconds() / 60
                prices_age_min = round(age_min, 2)
                stale = age_min > _STALE_THRESHOLD_MIN
            except Exception:
                pass

        return {
            'prices_updated_at': prices_updated_at,
            'prices_age_min': prices_age_min,
            'earnings_updated_at': earnings_updated_at,
            'stale': stale,
        }
    except Exception as exc:
        logger.warning('_check_data_freshness: %s', exc)
        return {
            'prices_updated_at': None,
            'prices_age_min': None,
            'earnings_updated_at': None,
            'stale': False,
        }


def _get_error_log_count_1h() -> int:
    """Return error_log row count from the last hour, or -1 on error."""
    try:
        with db_session() as conn:
            row = conn.execute(
                "SELECT COUNT(*) FROM error_log"
                " WHERE created_at >= datetime('now', '-1 hours')"
            ).fetchone()
            return row[0] if row else 0
    except Exception:
        return -1


def _get_sse_client_count() -> int:
    """Return the number of currently connected SSE clients, or -1 on error."""
    try:
        from backend.app import sse_clients, sse_lock
        with sse_lock:
            return len(sse_clients)
    except Exception:
        return -1


def _check_db_pool() -> Dict[str, Any]:
    """Probe the connection pool by acquiring a connection and reading stats."""
    try:
        pool = get_pool()
        with pool.acquire():
            pass
        stats = pool.stats()
        return {
            'status': 'ok',
            'pool_size': stats.get('size'),
            'available': stats.get('available'),
        }
    except Exception as exc:
        logger.warning('_check_db_pool: %s', exc)
        return {'status': 'error', 'error': str(exc), 'pool_size': None, 'available': None}


def _check_ws_manager(app) -> Dict[str, Any]:
    """Probe the WebSocket manager registered in Flask extensions."""
    try:
        ws_manager = app.extensions.get('ws_manager')
        if ws_manager is None:
            return {'status': 'not_configured', 'client_count': None}
        client_count = getattr(ws_manager, 'client_count', None)
        return {'status': 'ok', 'client_count': client_count}
    except Exception as exc:
        logger.warning('_check_ws_manager: %s', exc)
        return {'status': 'error', 'client_count': None, 'error': str(exc)}


def _check_ai_provider() -> Dict[str, Any]:
    """Check which AI provider API key is configured (first non-empty wins)."""
    try:
        candidates: Dict[str, str] = {
            'anthropic': Config.ANTHROPIC_API_KEY,
            'openai': Config.OPENAI_API_KEY,
            'google': Config.GOOGLE_AI_KEY,
            'xai': Config.XAI_API_KEY,
        }
        for name, key in candidates.items():
            if key:
                return {'status': 'ok', 'provider': name}
        return {'status': 'unconfigured', 'provider': None}
    except Exception as exc:
        logger.warning('_check_ai_provider: %s', exc)
        return {'status': 'error', 'provider': None, 'error': str(exc)}


def _check_job_health() -> Dict[str, Any]:
    """Probe job execution health: last-run status per job_id from job_history.

    Queries the 20 most recent rows ordered by executed_at DESC, then takes
    the first (most recent) row per job_id.  A job whose most recent run has
    a status other than 'success' causes overall status to become 'degraded'.
    """
    try:
        with db_session() as conn:
            rows = conn.execute(
                "SELECT job_id, status, executed_at"
                " FROM job_history"
                " ORDER BY executed_at DESC"
                " LIMIT 20"
            ).fetchall()

        jobs: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            jid = row['job_id']
            if jid not in jobs:
                jobs[jid] = {
                    'last_status': row['status'],
                    'last_run_at': row['executed_at'],
                }

        has_failure = any(j['last_status'] != 'success' for j in jobs.values())
        status = 'degraded' if has_failure else 'ok'
        return {'status': status, 'jobs': jobs}
    except Exception as exc:
        logger.warning('_check_job_health: %s', exc)
        return {'status': 'error', 'jobs': {}, 'error': str(exc)}


def _derive_overall_status(
    db_status: str,
    scheduler_status: str,
    stale: bool = False,
    ws_status: str = 'not_configured',
    job_health_status: str = 'ok',
) -> str:
    """Derive overall health from subsystem statuses.

    Returns 'degraded' when the DB is not ok, the scheduler has errored or
    stopped, prices are stale, the WebSocket manager has errored, or any job
    has a non-success last-run status.
    'not_configured' and unknown values are treated as ok.
    AI-provider status is informational only and never degrades overall health.
    Job health probe errors ('error') are informational; only 'degraded' propagates.
    """
    if db_status != 'ok':
        return 'degraded'
    if scheduler_status in ('error', 'stopped'):
        return 'degraded'
    if stale:
        return 'degraded'
    if ws_status == 'error':
        return 'degraded'
    if job_health_status == 'degraded':
        return 'degraded'
    return 'ok'


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@health_bp.route('/health', methods=['GET'])
@handle_api_errors
def health_check():
    """Return detailed service health.

    Response shape::

        {
            status:    'ok' | 'degraded',
            version:   str,
            timestamp: ISO-8601 UTC,
            services: {
                db: {
                    status, latency_ms, wal_mode, pool,
                    file_size_mb, table_counts
                },
                scheduler:      { status, running, job_count },
                agent_registry: { status, agent_count },
                data_providers: { status, configured, providers },
                data_freshness: {
                    prices_updated_at, prices_age_min,
                    earnings_updated_at, stale
                },
            },
            metrics: {
                error_log_count_1h: int,
                sse_client_count:   int,
            },
        }
    """
    app = current_app._get_current_object()

    db_info = _check_db()
    db_depth = _check_db_depth()
    db_pool_info = _check_db_pool()
    scheduler_info = _check_scheduler(app)
    agent_info = _check_agent_registry(app)
    data_provider_info = _check_data_provider_detail(app)
    freshness_info = _check_data_freshness()
    ws_info = _check_ws_manager(app)
    job_health_info = _check_job_health()
    error_log_count = _get_error_log_count_1h()
    sse_count = _get_sse_client_count()

    try:
        ai_provider_info = _check_ai_provider()
    except Exception as exc:
        logger.warning('health_check: ai_provider probe failed: %s', exc)
        ai_provider_info = {'status': 'error', 'provider': None}

    stale = freshness_info.get('stale', False)
    overall = _derive_overall_status(
        db_info['status'],
        scheduler_info['status'],
        stale=stale,
        ws_status=ws_info['status'],
        job_health_status=job_health_info['status'],
    )

    # Merge DB connectivity and depth stats into a single services.db dict;
    # db_info's 'status' takes precedence over db_depth's.
    db_combined = {
        **db_info,
        **{k: v for k, v in db_depth.items() if k != 'status'},
    }

    return jsonify({
        'status': overall,
        'version': _VERSION,
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        # Flat backwards-compatible fields
        'db': db_info['status'],
        'db_pool': db_pool_info['status'],
        'scheduler': scheduler_info['status'],
        'ai_provider': ai_provider_info['status'],
        'error_log_count_1h': error_log_count,
        # Structured checks map
        'checks': {
            'db': {
                'status': db_info['status'],
                'pool': db_info.get('pool'),
            },
            'db_pool': db_pool_info,
            'scheduler': {
                'status': scheduler_info['status'],
                'running': scheduler_info.get('running'),
                'job_count': scheduler_info.get('job_count'),
                'timezone': scheduler_info.get('timezone'),
            },
            'ai_provider': ai_provider_info,
            'ws_manager': ws_info,
            'job_health': {
                'status': job_health_info['status'],
            },
            'errors': {
                'count_1h': error_log_count,
            },
        },
        # Rich services dict (unchanged for existing consumers)
        'services': {
            'db': db_combined,
            'scheduler': scheduler_info,
            'agent_registry': agent_info,
            'data_providers': data_provider_info,
            'data_freshness': freshness_info,
            'job_health': job_health_info,
        },
        'metrics': {
            'error_log_count_1h': error_log_count,
            'sse_client_count': sse_count,
        },
    })


@health_bp.route('/health/ready', methods=['GET'])
@handle_api_errors
def health_ready():
    """Minimal readiness probe for load balancers and Kubernetes.

    Returns HTTP 200 with ``ready: true`` when the DB is reachable,
    HTTP 503 with ``ready: false`` otherwise.
    """
    db_info = _check_db()
    ready = db_info['status'] == 'ok'
    return jsonify({
        'ready': ready,
        'db': db_info['status'],
        'ts': datetime.utcnow().isoformat() + 'Z',
    }), (200 if ready else 503)


@health_bp.route('/health/live', methods=['GET'])
@handle_api_errors
def health_live():
    """Liveness probe — always returns HTTP 200 while the process is running.

    Unlike ``/health/ready``, this probe performs no I/O and never returns
    a non-2xx status.  Use it for container liveness checks to detect
    hung processes rather than dependency failures.
    """
    return jsonify({
        'alive': True,
        'ts': datetime.utcnow().isoformat() + 'Z',
    })


@health_bp.route('/health/status', methods=['GET'])
@handle_api_errors
def health_status():
    """Slim health status optimised for frontend polling (target: <5 ms).

    Combines job health (single DB query), scheduler (sys.modules read),
    data freshness (price age check), ws_manager (extension lookup), and
    AI provider (Config attribute read) without pool-stat or file-stat I/O.

    Response shape::

        {
            "status":         "ok" | "degraded",
            "db":             "ok" | "error",
            "scheduler":      "ok" | "error" | "not_configured",
            "job_health":     "ok" | "degraded" | "error",
            "data_freshness": { "stale": bool, "prices_age_min": float, ... },
            "ws_manager":     { "status": str, "client_count": int | null },
            "ai_provider":    "ok" | "unconfigured" | "error",
            "ts":             "<ISO-8601 UTC>"
        }
    """
    import sys
    app = current_app._get_current_object()

    # Single DB query covers both connectivity and job last-run status.
    job_health_info = _check_job_health()
    db_status = 'ok' if job_health_info['status'] != 'error' else 'error'

    # Scheduler — sys.modules read only, no I/O.
    scheduler_status = 'not_configured'
    try:
        sm_mod = sys.modules.get('backend.scheduler')
        if sm_mod is not None:
            manager = getattr(sm_mod, 'scheduler_manager', None)
            if manager is not None:
                info = manager.get_status()
                scheduler_status = 'ok' if info.get('running') else 'error'
    except Exception as exc:
        logger.warning('health_status: scheduler check: %s', exc)
        scheduler_status = 'error'

    # Data freshness — check if prices are stale.
    freshness_info = _check_data_freshness()
    stale = freshness_info.get('stale', False)

    # WebSocket manager — extension lookup, no I/O.
    ws_info = _check_ws_manager(app)

    # AI provider — Config attribute reads, no I/O.
    ai_status = _check_ai_provider()['status']

    overall = _derive_overall_status(
        db_status,
        scheduler_status,
        stale=stale,
        ws_status=ws_info['status'],
        job_health_status=job_health_info['status'],
    )

    return jsonify({
        'status': overall,
        'db': db_status,
        'scheduler': scheduler_status,
        'job_health': job_health_info['status'],
        'data_freshness': freshness_info,
        'ws_manager': ws_info,
        'ai_provider': ai_status,
        'ts': datetime.utcnow().isoformat() + 'Z',
    })
```