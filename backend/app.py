"""
TickerPulse AI v3.0 - Flask Application Factory
Creates and configures the Flask app, registers blueprints, sets up SSE,
initialises the database and scheduler.
"""

import json
import queue
import time
import logging
import threading
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_from_directory

from backend.config import Config
from backend.database import db_session, init_all_tables

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# OpenAPI / Swagger metadata (consumed by Flasgger)
# ---------------------------------------------------------------------------

_SWAGGER_TEMPLATE: dict = {
    'swagger': '2.0',
    'info': {
        'title': 'TickerPulse AI API',
        'description': (
            'REST API for TickerPulse AI v3.0 — stock monitoring, price alerts, '
            'AI ratings, agent management, and real-time SSE updates.'
        ),
        'version': '3.0.0',
        'contact': {'email': 'support@tickerpulse.ai'},
        'license': {'name': 'Proprietary'},
    },
    'basePath': '/',
    'schemes': ['http', 'https'],
    'consumes': ['application/json'],
    'produces': ['application/json'],
    'tags': [
        {'name': 'Stocks',   'description': 'Watchlist management and price data'},
        {'name': 'Alerts',   'description': 'Price alert CRUD and sound settings'},
        {'name': 'Analysis', 'description': 'AI ratings and chart data'},
        {'name': 'Agents',   'description': 'Agent management, execution, and cost tracking'},
        {'name': 'System',   'description': 'Health check and real-time SSE stream'},
    ],
    'definitions': {
        'Error': {
            'type': 'object',
            'properties': {
                'error': {'type': 'string', 'example': 'Descriptive error message'},
            },
        },
    },
}

# ---------------------------------------------------------------------------
# SSE (Server-Sent Events) infrastructure -- simple queue-based, no Redis
# ---------------------------------------------------------------------------

sse_clients: list[queue.Queue] = []
sse_lock = threading.Lock()

_ALLOWED_EVENT_TYPES = frozenset({
    'heartbeat', 'alert', 'provider_fallback', 'job_completed',
    'technical_alerts', 'regime_update', 'morning_briefing',
    'daily_summary', 'weekly_review', 'reddit_trending', 'download_tracker',
    'snapshot', 'rate_limit_update', 'price_update',
})
_MAX_PAYLOAD_BYTES = 65_536  # 64 KB


def _build_snapshot(db_path: str | None = None) -> dict:
    """Read current state from DB for the connect-time snapshot event.

    Returns a dict with keys: active_alerts, last_regime,
    last_technical_signal, timestamp.  On any DB error returns a
    best-effort partial result (empty alerts, null signals).
    """
    active_alerts: list = []
    last_regime = None
    last_technical_signal = None
    try:
        with db_session(db_path) as conn:
            active_alerts = [
                dict(row) for row in conn.execute(
                    'SELECT id, ticker, condition_type, threshold, created_at'
                    ' FROM price_alerts WHERE enabled = 1'
                    ' ORDER BY created_at DESC'
                ).fetchall()
            ]
            regime_row = conn.execute(
                "SELECT result_summary, status, executed_at FROM job_history"
                " WHERE job_id = 'regime_check' AND status = 'completed'"
                " ORDER BY executed_at DESC LIMIT 1"
            ).fetchone()
            last_regime = dict(regime_row) if regime_row else None

            tech_row = conn.execute(
                "SELECT result_summary, status, executed_at FROM job_history"
                " WHERE job_id = 'technical_monitor' AND status = 'completed'"
                " ORDER BY executed_at DESC LIMIT 1"
            ).fetchone()
            last_technical_signal = dict(tech_row) if tech_row else None
    except Exception as exc:
        logger.warning("_build_snapshot: DB read failed: %s", exc)
    return {
        'active_alerts': active_alerts,
        'last_regime': last_regime,
        'last_technical_signal': last_technical_signal,
        'timestamp': datetime.utcnow().isoformat() + 'Z',
    }


def send_sse_event(event_type: str, data: dict) -> None:
    """Push an event to every connected SSE client.

    Validates event_type against an allowlist, rejects non-serializable or
    oversized payloads, and silently drops invalid events with an error log.
    """
    if event_type not in _ALLOWED_EVENT_TYPES:
        logger.error("SSE blocked: unknown event_type %r", event_type)
        return
    try:
        serialized = json.dumps(data)
    except (TypeError, ValueError) as exc:
        logger.error("SSE blocked: non-serializable payload for %r: %s", event_type, exc)
        return
    if len(serialized.encode()) > _MAX_PAYLOAD_BYTES:
        logger.error("SSE blocked: payload for %r exceeds %d bytes", event_type, _MAX_PAYLOAD_BYTES)
        return
    with sse_lock:
        dead_clients: list[queue.Queue] = []
        for client_queue in sse_clients:
            try:
                client_queue.put_nowait((event_type, data))
            except queue.Full:
                dead_clients.append(client_queue)
        for dead in dead_clients:
            sse_clients.remove(dead)

    if event_type == 'news':
        ticker = data.get('ticker')
        if ticker:
            try:
                from backend.core.sentiment_service import invalidate_ticker
                invalidate_ticker(ticker)
            except Exception as exc:
                logger.debug("Sentiment cache invalidation skipped: %s", exc)


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

def create_app() -> Flask:
    """Build and return a fully configured Flask application."""

    app = Flask(
        __name__,
        static_folder=str(Config.BASE_DIR / 'frontend' / 'build'),
        template_folder=str(Config.BASE_DIR / 'templates'),
    )

    # -- Core Flask config ---------------------------------------------------
    app.config['SECRET_KEY'] = Config.SECRET_KEY

    # -- Logging -------------------------------------------------------------
    _setup_logging(app)

    # -- CORS ----------------------------------------------------------------
    try:
        from flask_cors import CORS
        CORS(app, origins=Config.CORS_ORIGINS, supports_credentials=True)
    except ImportError:
        logger.warning(
            "flask-cors is not installed -- CORS headers will NOT be added. "
            "Install with: pip install flask-cors"
        )

    # -- Swagger / OpenAPI (Flasgger) ----------------------------------------
    if Config.SWAGGER_ENABLED:
        try:
            from flasgger import Swagger
            Swagger(app, template=_SWAGGER_TEMPLATE)
            logger.info("Swagger UI available at /apidocs  |  spec at /apispec_1.json")
        except ImportError:
            logger.warning(
                "flasgger is not installed -- Swagger UI disabled. "
                "Install with: pip install flasgger"
            )

    # -- Database ------------------------------------------------------------
    with app.app_context():
        init_all_tables()
        logger.info("Database tables initialised")

    # -- Agent Registry ------------------------------------------------------
    try:
        from backend.agents import create_default_agents
        registry = create_default_agents(Config.DB_PATH)
        app.extensions['agent_registry'] = registry
        logger.info(
            "Agent registry initialised with %d agents: %s",
            len(registry.list_agents()),
            ', '.join(a['name'] for a in registry.list_agents()),
        )
    except Exception as exc:
        logger.warning("Could not initialise agent registry: %s", exc)

    # -- Data Provider Registry ----------------------------------------------
    try:
        from backend.data_providers import create_registry as create_data_registry

        data_registry = create_data_registry()

        def _on_provider_fallback(from_name: str, to_name: str, reason: str) -> None:
            from_provider = data_registry.get_provider(from_name)
            to_provider = data_registry.get_provider(to_name)
            from_display = from_provider.get_provider_info().display_name if from_provider else from_name
            to_display = to_provider.get_provider_info().display_name if to_provider else to_name
            tier = to_provider.get_provider_info().tier if to_provider else 'free'
            send_sse_event('provider_fallback', {
                'from_provider': from_display,
                'to_provider': to_display,
                'tier': tier,
                'reason': reason,
                'timestamp': datetime.utcnow().isoformat() + 'Z',
            })

        data_registry.on_fallback = _on_provider_fallback
        app.extensions['data_registry'] = data_registry
        logger.info("Data provider registry initialised")
    except Exception as exc:
        logger.warning("Could not initialise data provider registry: %s", exc)

    # -- Register API blueprints ---------------------------------------------
    _register_blueprints(app)

    # -- Request ID and logging middleware -----------------------------------
    try:
        from backend.middleware.request_logging import init_request_logging
        init_request_logging(app)
    except Exception as exc:
        logger.warning("Could not initialise request logging middleware: %s", exc)

    # -- Latency tracking hooks ----------------------------------------------
    @app.before_request
    def _record_request_start() -> None:
        from flask import g
        g._request_start = time.monotonic()

    @app.after_request
    def _record_request_latency(response):
        try:
            from flask import g
            start = getattr(g, '_request_start', None)
            if start is not None:
                latency_ms = (time.monotonic() - start) * 1000
                from backend.core.latency_buffer import record as _record_latency
                _record_latency(
                    request.path,
                    request.method,
                    response.status_code,
                    latency_ms,
                )
        except Exception:
            pass
        return response

    # -- SSE endpoint --------------------------------------------------------
    @app.route('/api/stream')
    def stream():
        """Server-Sent Events stream for real-time UI updates."""
        def event_stream():
            q: queue.Queue = queue.Queue(maxsize=256)
            with sse_lock:
                sse_clients.append(q)
            try:
                yield "event: heartbeat\ndata: {}\n\n"
                try:
                    snapshot_data = _build_snapshot()
                    yield (
                        f"event: snapshot\n"
                        f"data: {json.dumps(snapshot_data)}\n\n"
                    )
                except Exception as exc:
                    logger.warning("event_stream: snapshot build failed: %s", exc)
                while True:
                    try:
                        event_type, data = q.get(timeout=15)
                        yield (
                            f"event: {event_type}\n"
                            f"data: {json.dumps(data)}\n\n"
                        )
                    except queue.Empty:
                        yield "event: heartbeat\ndata: {}\n\n"
            except GeneratorExit:
                pass
            finally:
                with sse_lock:
                    if q in sse_clients:
                        sse_clients.remove(q)

        return Response(
            event_stream(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
                'Connection': 'keep-alive',
            },
        )

    # -- Legacy dashboard fallback -------------------------------------------
    @app.route('/legacy')
    def legacy_dashboard():
        """Serve the original v1/v2 dashboard.html as a fallback."""
        return send_from_directory(
            str(Config.BASE_DIR / 'templates'),
            'dashboard.html',
        )

    # -- APScheduler ---------------------------------------------------------
    _init_scheduler(app)

    return app


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _setup_logging(app: Flask) -> None:
    """Configure application-wide logging with rotating file handler."""
    log_dir = Path(Config.LOG_DIR)
    log_dir.mkdir(parents=True, exist_ok=True)

    log_level = getattr(logging, Config.LOG_LEVEL.upper(), logging.INFO)

    file_handler = RotatingFileHandler(
        str(log_dir / 'tickerpulse.log'),
        maxBytes=Config.LOG_MAX_BYTES,
        backupCount=Config.LOG_BACKUP_COUNT,
    )
    file_handler.setLevel(log_level)
    file_handler.setFormatter(logging.Formatter(Config.LOG_FORMAT))

    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    console_handler.setFormatter(logging.Formatter(Config.LOG_FORMAT))

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)

    app.logger.setLevel(log_level)


def _register_blueprints(app: Flask) -> None:
    """Import and register API blueprints.

    Each blueprint lives in ``backend/api/<module>.py``.  Missing modules
    are logged as warnings so the app starts during incremental development.
    """
    blueprint_map = {
        'backend.api.stocks':           'stocks_bp',
        'backend.api.news':             'news_bp',
        'backend.api.analysis':         'analysis_bp',
        'backend.api.agents':           'agents_bp',
        'backend.api.research':         'research_bp',
        'backend.api.chat':             'chat_bp',
        'backend.api.settings':         'settings_bp',
        'backend.api.scheduler_routes': 'scheduler_bp',
        'backend.api.downloads':        'bp',
        'backend.api.alerts':           'alerts_bp',
        'backend.api.earnings':         'earnings_bp',
        'backend.api.sentiment':        'sentiment_bp',
        'backend.api.providers':        'providers_bp',
        'backend.api.compare':          'compare_bp',
        'backend.api.comparison':       'comparison_bp',
        'backend.api.ai_compare':       'ai_compare_bp',
        'backend.api.watchlist':        'watchlist_bp',
        'backend.api.app_state':        'app_state_bp',
        'backend.api.metrics':          'metrics_bp',
        'backend.api.health':           'health_bp',
        'backend.api.errors':           'errors_bp',
        'backend.api.error_stats':      'error_stats_bp',
        'backend.api.activity':         'activity_bp',
    }

    for module_path, bp_name in blueprint_map.items():
        try:
            module = __import__(module_path, fromlist=[bp_name])
            bp = getattr(module, bp_name)
            app.register_blueprint(bp)
            logger.info("Registered blueprint: %s from %s", bp_name, module_path)
        except (ImportError, AttributeError) as exc:
            logger.warning(
                "Could not register blueprint %s from %s -- %s. "
                "The module may not exist yet; skipping.",
                bp_name, module_path, exc,
            )


def _init_scheduler(app: Flask) -> None:
    """Initialise APScheduler and register all scheduled jobs."""
    try:
        from flask_apscheduler import APScheduler

        app.config['SCHEDULER_API_ENABLED'] = Config.SCHEDULER_API_ENABLED
        app.config['SCHEDULER_API_PREFIX'] = Config.SCHEDULER_API_PREFIX

        scheduler = APScheduler()
        scheduler.init_app(app)

        app.scheduler = scheduler
        logger.info("APScheduler initialised")
    except ImportError:
        logger.warning(
            "flask-apscheduler is not installed -- scheduler disabled. "
            "Install with: pip install flask-apscheduler"
        )

    try:
        from backend.scheduler import scheduler_manager
        from backend.jobs import register_all_jobs

        register_all_jobs(scheduler_manager)

        if hasattr(app, 'scheduler'):
            scheduler_manager.init_app(app)
            scheduler_manager.start_all_jobs()
            logger.info("SchedulerManager connected to APScheduler, jobs started")

        logger.info("Registered %d scheduled jobs", len(scheduler_manager._job_registry))
    except Exception as exc:
        logger.warning("Could not register scheduled jobs: %s", exc)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    application = create_app()
    application.run(
        host='0.0.0.0',
        port=Config.FLASK_PORT,
        debug=Config.FLASK_DEBUG,
    )