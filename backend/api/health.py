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
from backend.database import db_session, _get_pool

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
    """Probe the APScheduler instance attached to the Flask app."""
    try:
        if not hasattr(app, 'scheduler'):
            return {'status': 'not_configured', 'running': False}

        scheduler = app.scheduler
        running = bool(getattr(scheduler, 'running', False))
        status = 'ok' if running else 'stopped'

        job_count = None
        try:
            import sys
            sm_mod = sys.modules.get('backend.scheduler')
            if sm_mod is not None:
                manager = getattr(sm_mod, 'scheduler_manager', None)
                if manager is not None:
                    job_count = len(manager._job_registry)
        except Exception:
            pass

        result: Dict[str, Any] = {'status': status, 'running': running}
        if job_count is not None:
            result['job_count'] = job_count
        return result

    except Exception as exc:
        logger.warning('_check_scheduler: %s', exc)
        return {'status': 'error', 'running': None, 'error': str(exc)}


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


def _derive_overall_status(
    db_status: str,
    scheduler_status: str,
    stale: bool = False,
) -> str:
    """Derive overall health from subsystem statuses.

    Returns 'degraded' when the DB is not ok, the scheduler has errored or
    stopped, or prices are stale.  'not_configured' and unknown scheduler
    values are treated as ok.
    """
    if db_status != 'ok':
        return 'degraded'
    if scheduler_status in ('error', 'stopped'):
        return 'degraded'
    if stale:
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
    scheduler_info = _check_scheduler(app)
    agent_info = _check_agent_registry(app)
    data_provider_info = _check_data_provider_detail(app)
    freshness_info = _check_data_freshness()
    error_log_count = _get_error_log_count_1h()
    sse_count = _get_sse_client_count()

    stale = freshness_info.get('stale', False)
    overall = _derive_overall_status(
        db_info['status'],
        scheduler_info['status'],
        stale=stale,
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
        'services': {
            'db': db_combined,
            'scheduler': scheduler_info,
            'agent_registry': agent_info,
            'data_providers': data_provider_info,
            'data_freshness': freshness_info,
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