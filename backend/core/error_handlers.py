"""
TickerPulse AI v3.0 — Centralized API error handling

Provides three public components:

  APIError (and subclasses)
      Typed exceptions routes can raise instead of constructing jsonify(...)
      inline.  Each subclass carries the correct HTTP status code and a
      machine-readable error_code string.

  handle_api_errors
      Route decorator.  Catches APIError subclasses and maps them to
      structured JSON responses.  Unexpected exceptions fall through to
      the existing catch-all handler in middleware/request_logging.py so
      they are logged and persisted to error_log exactly once.

  register_error_handlers(app)
      Registers structured JSON handlers for the four most common HTTP
      error codes (400, 404, 405, 429), replacing Werkzeug's default HTML
      error pages.  Call once from create_app() after init_request_logging.
"""

from __future__ import annotations

import functools
import logging
from typing import Any, Callable, TypeVar

from flask import Flask, g, jsonify
from werkzeug.exceptions import HTTPException

logger = logging.getLogger(__name__)

F = TypeVar('F', bound=Callable[..., Any])


# ---------------------------------------------------------------------------
# Typed exception hierarchy
# ---------------------------------------------------------------------------

class APIError(Exception):
    """Base class for all TickerPulse API errors.

    Subclasses set ``http_status`` and ``error_code`` as class attributes;
    callers may override ``error_code`` per-instance via the constructor.
    """

    http_status: int = 500
    error_code: str = 'INTERNAL_ERROR'

    def __init__(self, message: str, *, error_code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        if error_code is not None:
            self.error_code = error_code

    def to_response(self) -> tuple[Any, int]:
        """Serialize to a Flask (response, status_code) tuple."""
        return jsonify({
            'error': self.message,
            'error_code': self.error_code,
            'request_id': g.get('request_id', '-'),
        }), self.http_status


class NotFoundError(APIError):
    """Raised when a requested resource does not exist (HTTP 404)."""
    http_status = 404
    error_code = 'NOT_FOUND'


class ValidationError(APIError):
    """Raised when request input fails validation (HTTP 400).

    Supports optional *field_errors* for per-field inline error messages::

        raise ValidationError(
            'Invalid alert fields',
            field_errors=[
                {'field': 'threshold', 'message': 'Must be greater than 0'},
            ],
        )
    """
    http_status = 400
    error_code = 'VALIDATION_ERROR'

    def __init__(
        self,
        message: str,
        *,
        error_code: str | None = None,
        field_errors: list[dict[str, str]] | None = None,
    ) -> None:
        super().__init__(message, error_code=error_code)
        self.field_errors: list[dict[str, str]] = field_errors or []

    def to_response(self) -> tuple[Any, int]:
        body: dict[str, Any] = {
            'error': self.message,
            'error_code': self.error_code,
            'request_id': g.get('request_id', '-'),
        }
        if self.field_errors:
            body['field_errors'] = self.field_errors
        return jsonify(body), self.http_status


class ConflictError(APIError):
    """Raised when an operation conflicts with existing state (HTTP 409)."""
    http_status = 409
    error_code = 'CONFLICT'


class ServiceUnavailableError(APIError):
    """Raised when a required backend service is unavailable (HTTP 503)."""
    http_status = 503
    error_code = 'SERVICE_UNAVAILABLE'


class DatabaseError(APIError):
    """Raised when a database operation fails (HTTP 500)."""
    http_status = 500
    error_code = 'DB_ERROR'


# ---------------------------------------------------------------------------
# Route decorator
# ---------------------------------------------------------------------------

def handle_api_errors(func: F) -> F:
    """Wrap a Flask route to convert APIError raises into structured responses.

    Only APIError subclasses are caught here; all other exceptions propagate
    to the app-level Exception handler in middleware/request_logging.py,
    which logs them and persists them to error_log (single responsibility).

    Usage::

        @agents_bp.route('/agents/<name>', methods=['GET'])
        @handle_api_errors
        def get_agent_detail(name: str):
            agent = registry.get(name)
            if agent is None:
                raise NotFoundError(f'Agent not found: {name}')
            return jsonify(agent)
    """

    @functools.wraps(func)
    def _wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return func(*args, **kwargs)
        except APIError as exc:
            logger.warning(
                'API error [%s] in %s: %s',
                exc.error_code,
                func.__qualname__,
                exc.message,
            )
            return exc.to_response()

    return _wrapper  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Flask HTTP error handlers
# ---------------------------------------------------------------------------

def register_error_handlers(app: Flask) -> None:
    """Register structured JSON handlers for common HTTP error codes.

    Replaces Werkzeug's default HTML error pages for 400, 404, 405, and 429
    so that API clients always receive application/json regardless of whether
    the error originates from Flask routing or application code.

    Must be called *after* init_request_logging so that X-Request-ID is
    already attached to g before these handlers run.
    """

    @app.errorhandler(400)
    def _bad_request(exc: HTTPException) -> tuple[Any, int]:
        description = exc.description or 'Bad request.'
        return jsonify({
            'error': description,
            'error_code': 'BAD_REQUEST',
            'request_id': g.get('request_id', '-'),
        }), 400

    @app.errorhandler(404)
    def _not_found(exc: HTTPException) -> tuple[Any, int]:
        return jsonify({
            'error': 'The requested resource was not found.',
            'error_code': 'NOT_FOUND',
            'request_id': g.get('request_id', '-'),
        }), 404

    @app.errorhandler(405)
    def _method_not_allowed(exc: HTTPException) -> tuple[Any, int]:
        return jsonify({
            'error': 'Method not allowed.',
            'error_code': 'METHOD_NOT_ALLOWED',
            'request_id': g.get('request_id', '-'),
        }), 405

    @app.errorhandler(429)
    def _too_many_requests(exc: HTTPException) -> tuple[Any, int]:
        return jsonify({
            'error': 'Too many requests. Please slow down.',
            'error_code': 'RATE_LIMITED',
            'request_id': g.get('request_id', '-'),
        }), 429

    logger.info('API error handlers registered (400, 404, 405, 429)')
