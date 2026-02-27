"""
TickerPulse AI v3.0 - Flask Application Factory
Creates and configures the Flask app, registers blueprints, sets up SSE,
initialises the database and scheduler.
"""

import json
import os
import queue
import logging
import threading
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, send_from_directory

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
        # Remove any clients whose queues overflowed
        for dead in dead_clients:
            sse_clients.remove(dead)

    # Invalidate stale sentiment cache whenever a news event lands so the
    # next GET /api/stocks/<ticker>/sentiment recomputes immediately.
    if event_type == 'news':
        ticker = data.get('ticker')
        if ticker:
            try:
                from backend.core.sentiment_service import invalidate_ticker
                invalidate_ticker(ticker)
            except Exception as exc:
                logger.debug("Sentiment cache invalidation skipped: %s", exc)


def _ws_handle_manual_refresh(tickers: set[str], manager: Any) -> None:
    """Fetch live prices for *tickers* and broadcast to WS subscribers and SSE.

    Called when a WebSocket client sends ``{"type": "refresh"}``.  Keeps both
    channels in sync: WS subscribers receive a ``price_update`` message;
    SSE clients receive the same data via the existing ``send_sse_event`` path.
    Import of ``_fetch_price`` is deferred to avoid a circular import at module
    load time (price_refresh imports ``send_sse_event`` from this module).
    """
    if not tickers:
        return
    try:
        from backend.jobs.price_refresh import _fetch_price
    except ImportError as exc:
        logger.warning("_ws_handle_manual_refresh: cannot import _fetch_price: %s", exc)
        return

    timestamp = datetime.now(timezone.utc).isoformat()
    for ticker in tickers:
        price_data = _fetch_price(ticker)
        if price_data is None:
            logger.debug("_ws_handle_manual_refresh: no data for %s", ticker)
            continue
        ws_payload: dict = {
            'type': 'price_update',
            'ticker': ticker,
            'price': price_data['price'],
            'change': price_data['change'],
            'change_pct': price_data['change_pct'],
            'volume': price_data.get('volume', 0),
            'timestamp': timestamp,
        }
        manager.broadcast_to_subscribers(ticker, ws_payload)
        # Mirror to SSE so clients on both channels stay consistent.
        send_sse_event('price_update', {k: v for k, v in ws_payload.items() if k != 'type'})


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

    # -- Request tracing & global error handlers -----------------------------
    from backend.middleware.request_logging import init_request_logging
    init_request_logging(app)
    logger.info("Request tracing middleware registered")

    # -- CORS ----------------------------------------------------------------
    try:
        from flask_cors import CORS
        CORS(app, origins=Config.CORS_ORIGINS, supports_credentials=True)
    except ImportError:
        logger.warning(
            "flask-cors is not installed -- CORS headers will NOT be added. "
            "Install with: pip install flask-cors"
        )

    # -- Rate limiter --------------------------------------------------------
    try:
        from backend.extensions import limiter as _limiter
        if _limiter is not None:
            _limiter.init_app(app)
            logger.info("Rate limiter initialized (in-memory storage)")
    except (ImportError, Exception) as exc:
        logger.warning("Rate limiter not initialized: %s", exc)

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

    # -- SSE endpoint --------------------------------------------------------
    @app.route('/api/stream')
    def stream():
        """Server-Sent Events stream for real-time UI updates."""
        def event_stream():
            q: queue.Queue = queue.Queue(maxsize=256)
            with sse_lock:
                sse_clients.append(q)
            try:
                # Send immediate heartbeat so the browser knows we're connected
                yield "event: heartbeat\ndata: {}\n\n"
                # Push current state so the UI has initial data without
                # waiting for the next scheduled job to fire.
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
                        # Send a heartbeat so proxies / browsers don't drop
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
                'X-Accel-Buffering': 'no',  # nginx compatibility
                'Connection': 'keep-alive',
            },
        )

    # -- WebSocket endpoint (flask-sock) -------------------------------------
    try:
        from flask_sock import Sock
        from backend.core.ws_manager import ws_manager as _ws_manager

        sock = Sock(app)

        @sock.route('/api/ws/prices')
        def ws_prices(ws: Any) -> None:
            """WebSocket endpoint for subscription-scoped real-time price updates.

            Protocol (client → server):
              {"type": "subscribe",   "tickers": ["AAPL", "MSFT"]}
              {"type": "unsubscribe", "tickers": ["AAPL"]}
              {"type": "refresh"}   -- immediate price fetch for subscribed tickers
              {"type": "ping"}

            Protocol (server → client):
              {"type": "connected",    "client_id": "<uuid>"}
              {"type": "subscribed",   "tickers": [...]}
              {"type": "unsubscribed", "tickers": [...]}
              {"type": "price_update", "ticker": "AAPL", "price": ..., ...}
              {"type": "pong"}
              {"type": "error",        "message": "..."}
            """
            client_id = _ws_manager.register(ws)
            logger.info("WS client connected: %s", client_id)
            try:
                ws.send(json.dumps({"type": "connected", "client_id": client_id}))
                while True:
                    raw = ws.receive()
                    if raw is None:
                        break
                    try:
                        msg = json.loads(raw)
                    except (json.JSONDecodeError, ValueError):
                        ws.send(json.dumps({"type": "error", "message": "Invalid JSON"}))
                        continue
                    if not isinstance(msg, dict):
                        ws.send(json.dumps({"type": "error", "message": "Expected a JSON object"}))
                        continue

                    msg_type = msg.get("type", "")

                    if msg_type == "subscribe":
                        tickers = msg.get("tickers", [])
                        if isinstance(tickers, list):
                            _ws_manager.subscribe(client_id, tickers)
                        ws.send(json.dumps({
                            "type": "subscribed",
                            "tickers": sorted(_ws_manager.get_subscriptions(client_id)),
                        }))

                    elif msg_type == "unsubscribe":
                        tickers = msg.get("tickers", [])
                        if isinstance(tickers, list):
                            _ws_manager.unsubscribe(client_id, tickers)
                        ws.send(json.dumps({
                            "type": "unsubscribed",
                            "tickers": [t.upper() for t in tickers if isinstance(t, str)],
                        }))

                    elif msg_type == "refresh":
                        subscribed = _ws_manager.get_subscriptions(client_id)
                        _ws_handle_manual_refresh(subscribed, _ws_manager)

                    elif msg_type == "ping":
                        ws.send(json.dumps({"type": "pong"}))

                    else:
                        ws.send(json.dumps({
                            "type": "error",
                            "message": f"Unknown message type: {msg_type!r}",
                        }))

            except Exception as exc:
                logger.debug("WS connection %s closed: %s", client_id, exc)
            finally:
                _ws_manager.unregister(client_id)
                logger.info("WS client disconnected: %s", client_id)

        logger.info("WebSocket endpoint available at /api/ws/prices")

    except ImportError:
        logger.warning(
            "flask-sock is not installed -- WebSocket endpoint disabled. "
            "Install with: pip install flask-sock"
        )

    # -- Health check --------------------------------------------------------
    @app.route('/api/health')
    def health():
        """Health-check endpoint with per-subsystem status for monitoring."""
        import sqlite3

        db_status = 'error'
        try:
            conn = sqlite3.connect(Config.DB_PATH)
            conn.execute('SELECT 1')
            conn.close()
            db_status = 'ok'
        except Exception:
            pass

        scheduler_status = 'error'
        try:
            sched = getattr(app, 'scheduler', None)
            if sched is None:
                # Scheduler not initialised (e.g. flask-apscheduler not installed);
                # treat as ok since it's optional.
                scheduler_status = 'ok'
            elif sched.running:
                scheduler_status = 'ok'
        except Exception:
            pass

        error_log_count_1h = 0
        try:
            with db_session() as conn:
                row = conn.execute(
                    "SELECT COUNT(*) FROM error_log"
                    " WHERE created_at >= datetime('now', '-1 hours')"
                ).fetchone()
                error_log_count_1h = row[0] if row else 0
        except Exception:
            pass

        overall = 'ok' if db_status == 'ok' else 'degraded'

        return jsonify({
            'status': overall,
            'version': '3.0.0',
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'db': db_status,
            'scheduler': scheduler_status,
            'error_log_count_1h': error_log_count_1h,
        })

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
    """Configure application-wide logging with rotating file handler.

    Also installs a ``sys.excepthook`` so that any Python exception that
    escapes the web-framework (e.g. from a background job thread) is written
    to the structured log file rather than silently printed to stderr.
    """
    import sys

    log_dir = Path(Config.LOG_DIR)
    log_dir.mkdir(parents=True, exist_ok=True)

    log_level = getattr(logging, Config.LOG_LEVEL.upper(), logging.INFO)

    if Config.LOG_FORMAT_JSON:
        try:
            from backend.middleware.request_logging import JsonFormatter
            formatter: logging.Formatter = JsonFormatter()
        except ImportError:
            formatter = logging.Formatter(Config.LOG_FORMAT)
    else:
        formatter = logging.Formatter(Config.LOG_FORMAT)

    # Rotating file handler
    file_handler = RotatingFileHandler(
        str(log_dir / 'tickerpulse.log'),
        maxBytes=Config.LOG_MAX_BYTES,
        backupCount=Config.LOG_BACKUP_COUNT,
    )
    file_handler.setLevel(log_level)
    file_handler.setFormatter(formatter)

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)

    # Apply to root logger so all modules pick it up
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)

    app.logger.setLevel(log_level)

    # Catch exceptions that escape the web framework (background threads, etc.)
    _original_excepthook = sys.excepthook

    def _uncaught_exception_handler(exc_type, exc_value, exc_tb):
        if not issubclass(exc_type, KeyboardInterrupt):
            logging.getLogger(__name__).critical(
                "Uncaught exception",
                exc_info=(exc_type, exc_value, exc_tb),
            )
        _original_excepthook(exc_type, exc_value, exc_tb)

    sys.excepthook = _uncaught_exception_handler


def _register_blueprints(app: Flask) -> None:
    """Import and register API blueprints.

    Each blueprint lives in ``backend/api/<module>.py`` and exposes a
    Flask ``Blueprint`` instance named ``<name>_bp``.  Missing modules
    are logged as warnings so the app can still start during incremental
    development.
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
        'backend.api.watchlist':        'watchlist_bp',
        'backend.api.errors':           'errors_bp',
        'backend.api.error_stats':      'error_stats_bp',
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

        # Attach to app so backend.scheduler can access it later
        app.scheduler = scheduler
        logger.info("APScheduler initialised")
    except ImportError:
        logger.warning(
            "flask-apscheduler is not installed -- scheduler disabled. "
            "Install with: pip install flask-apscheduler"
        )

    # Register all jobs with SchedulerManager so they appear in the UI,
    # regardless of whether APScheduler is running.
    try:
        from backend.scheduler import scheduler_manager
        from backend.jobs import register_all_jobs

        register_all_jobs(scheduler_manager)

        # Initialize with the app (connects to APScheduler if available)
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