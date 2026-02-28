"""
TickerPulse AI v3.0 - Request Logging Middleware

Attaches a unique request ID to every incoming request and optionally logs
request/response metadata for structured observability.
"""

import logging
import time
import uuid

from flask import Flask, g, request

logger = logging.getLogger(__name__)


def init_request_logging(app: Flask) -> None:
    """Register before/after request hooks on *app*.

    Sets ``g.request_id`` from the ``X-Request-ID`` header (or generates a
    UUID v4 when the header is absent).  Downstream code reads the ID via
    ``g.request_id`` and includes it in JSON error responses for correlation.

    Also records ``g.request_start`` (monotonic clock), logs each completed
    request with method, path, status code, and duration in milliseconds,
    and records latency into the in-process buffer for the /api/metrics/system
    endpoint.
    """

    @app.before_request
    def _attach_request_id() -> None:
        g.request_id = request.headers.get('X-Request-ID') or str(uuid.uuid4())
        g.request_start = time.monotonic()

    @app.after_request
    def _log_and_echo_request_id(response):
        response.headers['X-Request-ID'] = getattr(g, 'request_id', '-')
        start = getattr(g, 'request_start', None)
        if start is not None:
            duration_ms = int((time.monotonic() - start) * 1000)
            logger.info(
                '%s %s %d %dms',
                request.method,
                request.path,
                response.status_code,
                duration_ms,
            )
            try:
                from backend.core.latency_buffer import record as _record_latency
                _record_latency(
                    request.path,
                    request.method,
                    response.status_code,
                    float(duration_ms),
                )
            except Exception:
                pass
        return response
