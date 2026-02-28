"""
TickerPulse AI v3.0 - Request Logging Middleware

Attaches a unique request ID to every incoming request and optionally logs
request/response metadata for structured observability.
"""

import logging
import uuid

from flask import Flask, g, request

logger = logging.getLogger(__name__)


def init_request_logging(app: Flask) -> None:
    """Register before/after request hooks on *app*.

    Sets ``g.request_id`` from the ``X-Request-ID`` header (or generates a
    UUID v4 when the header is absent).  Downstream code reads the ID via
    ``g.request_id`` and includes it in JSON error responses for correlation.
    """

    @app.before_request
    def _attach_request_id() -> None:
        g.request_id = request.headers.get('X-Request-ID') or str(uuid.uuid4())

    @app.after_request
    def _echo_request_id(response):
        response.headers['X-Request-ID'] = getattr(g, 'request_id', '-')
        return response
