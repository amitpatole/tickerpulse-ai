```python

"""
TickerPulse AI v3.0 — Request tracing middleware and JSON log formatter.
"""

import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from flask import Flask, Response, g, jsonify, request

logger = logging.getLogger(__name__)

# Paths that produce long-lived connections and should not be logged by the
# after_request hook (the hook fires only once, after the connection closes,
# which would produce a misleading single-line log entry much later).
_STREAMING_PATHS = frozenset({'/api/stream', '/api/ws/prices'})


class JsonFormatter(logging.Formatter):
    """Emit each log record as a single-line JSON object."""

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

        for key, value in record.__dict__.items():
            if key not in self._RESERVED and not key.startswith('_'):
                log_entry[key] = value

        return json.dumps(log_entry, default=str)


def init_request_logging(app: Flask) -> None:
    """Register request tracing and global error handlers on *app*."""

    @app.before_request
    def _inject_request_id() -> None:
        g.request_id = request.headers.get('X-Request-ID') or str(uuid.uuid4())
        g.request_start_ns = time.monotonic_ns()

    @app.after_request
    def _audit_response(response: Response) -> Response:
        start_ns: int = g.get('request_start_ns', time.monotonic_ns())
        duration_ms: int = (time.monotonic_ns() - start_ns) // 1_000_000
        request_id: str = g.get('request_id', '-')

        # Skip long-lived streaming/WebSocket connections — their after_request
        # hook fires only when the connection finally closes, producing a
        # misleading log line with an inflated duration.
        if request.path not in _STREAMING_PATHS:
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
        return jsonify({
            'success': False,
            'error': 'Not found',
            'error_code': 'NOT_FOUND',
            'request_id': request_id,
        }), 404

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
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'error_code': 'INTERNAL_ERROR',
            'request_id': request_id,
        }), 500
```