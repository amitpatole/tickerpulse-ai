"""
TickerPulse AI v3.0 — Request logging middleware and global error handlers.

Provides two public symbols consumed by the application factory (app.py):

  JsonFormatter
      Structured JSON log formatter for the rotating file handler.
      Each record is emitted as a single JSON object; extra fields
      attached via ``logger.info('…', extra={…})`` are preserved verbatim.

  init_request_logging(app)
      Registers before/after request hooks and a catch-all exception handler
      on a Flask application instance:
        - Attaches a request_id (from X-Request-ID header or generated UUID)
          and a monotonic start timestamp to flask.g on every request.
        - Writes a structured audit log entry after every response, including
          the error_code field for 5xx JSON responses.
        - Reflects X-Request-ID back in every response header.
        - Catches unhandled Python exceptions, logs them with full tracebacks,
          persists them to error_log, and returns a structured 500 JSON response.
"""

import json
import logging
import time
import traceback
import uuid
from datetime import datetime, timezone

from flask import Flask, g, jsonify, request
from werkzeug.exceptions import HTTPException

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# JSON log formatter
# ---------------------------------------------------------------------------

class JsonFormatter(logging.Formatter):
    """Emit each log record as a single JSON object on one line.

    Extra fields attached to the LogRecord via ``extra={…}`` (for example,
    the ``request_id``, ``method``, and ``status`` fields written by the
    audit hook) are included verbatim in the output object.
    """

    # Standard LogRecord internals that should not be echoed as extra fields.
    _SKIP = frozenset({
        'args', 'asctime', 'created', 'exc_info', 'exc_text',
        'filename', 'funcName', 'levelname', 'levelno', 'lineno',
        'module', 'msecs', 'message', 'msg', 'name', 'pathname',
        'process', 'processName', 'relativeCreated', 'stack_info',
        'thread', 'threadName', 'taskName',
    })

    def format(self, record: logging.LogRecord) -> str:
        log_data: dict = {
            'timestamp': datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
        }
        if record.exc_info:
            log_data['exc_info'] = self.formatException(record.exc_info)
        if record.stack_info:
            log_data['stack_info'] = self.formatStack(record.stack_info)
        # Merge extra fields set by the caller
        for key, value in record.__dict__.items():
            if key not in self._SKIP and not key.startswith('_'):
                log_data[key] = value
        return json.dumps(log_data, default=str)


# ---------------------------------------------------------------------------
# Middleware registration
# ---------------------------------------------------------------------------

def init_request_logging(app: Flask) -> None:
    """Register request lifecycle hooks and a catch-all exception handler.

    Safe to call multiple times; Flask de-duplicates registered hooks.
    """

    @app.before_request
    def _attach_request_id() -> None:
        """Assign a request_id and record the request start time in g."""
        g.request_id = request.headers.get('X-Request-ID') or uuid.uuid4().hex
        g.request_start = time.monotonic()

    @app.after_request
    def _log_audit(response):
        """Write a structured audit entry and echo X-Request-ID header."""
        start = g.get('request_start')
        duration_ms = int((time.monotonic() - start) * 1000) if start is not None else 0

        audit: dict = {
            'request_id': g.get('request_id', '-'),
            'method': request.method,
            'path': request.path,
            'status': response.status_code,
            'duration_ms': duration_ms,
            'remote_addr': request.remote_addr,
        }

        # Propagate error_code from 5xx JSON responses into the audit log so
        # operators can correlate HTTP errors with structured error codes
        # without parsing response bodies separately.
        if response.status_code >= 500:
            try:
                ct = response.content_type or ''
                if 'application/json' in ct and not response.is_streamed:
                    body = json.loads(response.get_data(as_text=True))
                    if isinstance(body, dict) and 'error_code' in body:
                        audit['error_code'] = body['error_code']
            except Exception:
                pass  # Best-effort; never let audit logging break a response

        level = logging.WARNING if response.status_code >= 400 else logging.INFO
        logger.log(level, 'audit', extra=audit)

        response.headers['X-Request-ID'] = g.get('request_id', '-')
        return response

    @app.errorhandler(Exception)
    def _handle_exception(exc: Exception):
        """Catch-all handler for unhandled Python exceptions.

        HTTPException subclasses (404, 405, etc.) are delegated to Werkzeug's
        default handlers so existing HTTP error responses are not disturbed.
        All other exceptions produce a 500 with a structured JSON body and are
        persisted to the error_log table for later analysis.
        """
        # Let Werkzeug handle standard HTTP errors (404, 405, etc.)
        if isinstance(exc, HTTPException):
            return exc

        request_id: str = g.get('request_id', '-')

        logger.error(
            'Unhandled exception [%s] %s %s: %s',
            request_id, request.method, request.path, exc,
            exc_info=True,
        )

        # Persist to error_log — best-effort; failure must not mask the original error.
        try:
            from backend.database import db_session
            with db_session() as conn:
                conn.execute(
                    """
                    INSERT INTO error_log
                        (source, error_code, message, stack, request_id, severity)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        'backend',
                        'INTERNAL_ERROR',
                        str(exc),
                        traceback.format_exc(),
                        request_id,
                        'critical',
                    ),
                )
        except Exception as db_exc:
            logger.error('Failed to persist exception to error_log: %s', db_exc)

        return jsonify({
            'success': False,
            'error': 'An unexpected server error occurred.',
            'error_code': 'INTERNAL_ERROR',
            'request_id': request_id,
        }), 500