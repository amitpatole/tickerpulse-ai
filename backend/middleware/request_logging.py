"""
TickerPulse AI v3.0 — Request tracing middleware and JSON log formatter.

Provides two public symbols consumed by the application factory:

* ``JsonFormatter``        — structured JSON log formatter for machine-parseable output.
* ``init_request_logging`` — registers Flask hooks for request-ID injection,
                             response audit logging, and global 404/500 error handlers.
"""

import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from flask import Flask, Response, g, jsonify, request

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Structured JSON log formatter
# ---------------------------------------------------------------------------

class JsonFormatter(logging.Formatter):
    """Emit each log record as a single-line JSON object.

    Standard ``logging.LogRecord`` attributes are mapped to a fixed set of
    top-level keys.  Any caller-supplied ``extra={}`` fields are merged in
    (after filtering out internal Python logging attributes) so that
    structured context — e.g. ``request_id``, ``duration_ms`` — flows
    through unchanged.

    Example output::

        {"timestamp": "2026-02-27T10:00:00.123456+00:00", "level": "INFO",
         "logger": "backend.app", "message": "GET /api/health → 200 (4ms)",
         "request_id": "f3a2...", "duration_ms": 4}
    """

    # Python's internal LogRecord fields that should NOT be forwarded as
    # extra context because they are either already mapped or are noisy.
    _RESERVED: frozenset[str] = frozenset({
        'args', 'created', 'exc_info', 'exc_text', 'filename',
        'funcName', 'levelname', 'levelno', 'lineno', 'message',
        'module', 'msecs', 'msg', 'name', 'pathname', 'process',
        'processName', 'relativeCreated', 'stack_info', 'taskName',
        'thread', 'threadName',
    })

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            'timestamp': datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(),
            'level':   record.levelname,
            'logger':  record.name,
            'message': record.getMessage(),
        }

        if record.exc_info:
            log_entry['exc_info'] = self.formatException(record.exc_info)

        # Merge caller-supplied extra fields (request_id, duration_ms, …)
        for key, value in record.__dict__.items():
            if key not in self._RESERVED and not key.startswith('_'):
                log_entry[key] = value

        return json.dumps(log_entry, default=str)


# ---------------------------------------------------------------------------
# Flask middleware hooks and global error handlers
# ---------------------------------------------------------------------------

def init_request_logging(app: Flask) -> None:
    """Register request tracing and global error handlers on *app*.

    Hooks registered
    ----------------
    ``before_request``
        Assigns a unique ``X-Request-ID`` to ``flask.g.request_id``
        (honouring any ``X-Request-ID`` header sent by the client) and
        records a high-resolution start timestamp in ``g.request_start_ns``.

    ``after_request``
        Logs method / path / status / duration for every non-SSE request
        and echoes the request ID back via the ``X-Request-ID`` response
        header so clients can correlate logs.

    ``errorhandler(404)``
        Returns a structured JSON body with the request ID instead of the
        default HTML 404 page.

    ``errorhandler(500)``
        Logs the exception with full traceback and returns a structured JSON
        500 body.  Flask converts unhandled exceptions to 500 before this
        handler fires, so this covers both explicit ``abort(500)`` calls and
        unexpected exceptions.
    """

    @app.before_request
    def _inject_request_id() -> None:
        g.request_id = request.headers.get('X-Request-ID') or str(uuid.uuid4())
        g.request_start_ns = time.monotonic_ns()

    @app.after_request
    def _audit_response(response: Response) -> Response:
        # Calculate duration; fall back gracefully if before_request didn't run.
        start_ns: int = g.get('request_start_ns', time.monotonic_ns())
        duration_ms: int = (time.monotonic_ns() - start_ns) // 1_000_000
        request_id: str = g.get('request_id', '-')

        # Skip the long-lived SSE stream to avoid a single log line that
        # only appears when the client disconnects minutes/hours later.
        if request.path != '/api/stream':
            logger.info(
                "%s %s → %d (%dms) [%s]",
                request.method,
                request.path,
                response.status_code,
                duration_ms,
                request_id,
            )

        response.headers['X-Request-ID'] = request_id
        return response

    @app.errorhandler(404)
    def _handle_404(exc: Exception) -> tuple[Response, int]:
        request_id: str = g.get('request_id', '-')
        logger.warning(
            "404 Not Found: %s %s [%s]",
            request.method,
            request.path,
            request_id,
        )
        return jsonify({'error': 'Not found', 'request_id': request_id}), 404

    @app.errorhandler(500)
    def _handle_500(exc: Exception) -> tuple[Response, int]:
        request_id: str = g.get('request_id', '-')
        logger.error(
            "500 Internal Server Error: %s %s [%s] — %s",
            request.method,
            request.path,
            request_id,
            exc,
            exc_info=True,
        )
        return jsonify({'error': 'Internal server error', 'request_id': request_id}), 500
