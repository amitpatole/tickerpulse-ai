"""
TickerPulse AI v3.0 - Typed API Error Hierarchy and Handler Decorator
Provides a uniform exception-to-JSON-response pipeline for all API blueprints.
5xx errors are additionally persisted to the error_log table for observability.
"""

import logging
import traceback
from functools import wraps

from flask import g, jsonify

logger = logging.getLogger(__name__)


class ApiError(Exception):
    """Base class for all typed API errors.

    Subclasses define default status_code and error_code; callers can
    override both at instantiation time.
    """

    status_code: int = 500
    error_code: str = 'INTERNAL_ERROR'
    retry_after: int | None = None

    def __init__(
        self,
        message: str,
        *,
        error_code: str | None = None,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if error_code is not None:
            self.error_code = error_code
        if status_code is not None:
            self.status_code = status_code

    def to_response(self):
        body: dict = {
            'success': False,
            'error': self.message,
            'error_code': self.error_code,
        }
        request_id = getattr(g, 'request_id', None)
        if request_id:
            body['request_id'] = request_id

        resp = jsonify(body)
        resp.status_code = self.status_code
        if self.retry_after is not None:
            resp.headers['Retry-After'] = str(self.retry_after)
        return resp


class ValidationError(ApiError):
    """Raised when input data fails validation (400)."""

    status_code = 400
    error_code = 'INVALID_INPUT'


class NotFoundError(ApiError):
    """Raised when a requested resource does not exist (404)."""

    status_code = 404
    error_code = 'NOT_FOUND'


class ConflictError(ApiError):
    """Raised when a request conflicts with existing state (409)."""

    status_code = 409
    error_code = 'CONFLICT'


class DatabaseError(ApiError):
    """Raised when a database operation fails (500)."""

    status_code = 500
    error_code = 'DATABASE_ERROR'


class ServiceUnavailableError(ApiError):
    """Raised when an upstream data provider is unreachable (503)."""

    status_code = 503
    error_code = 'DATA_PROVIDER_UNAVAILABLE'


class UnauthorizedError(ApiError):
    """Raised when authentication is required but missing or invalid (401)."""

    status_code = 401
    error_code = 'UNAUTHORIZED'


class ForbiddenError(ApiError):
    """Raised when the authenticated user lacks permission for the action (403)."""

    status_code = 403
    error_code = 'FORBIDDEN'


class RateLimitError(ApiError):
    """Raised when the client has exceeded their request quota (429)."""

    status_code = 429
    error_code = 'RATE_LIMIT_EXCEEDED'
    retry_after = 60


def _emit_to_error_log(
    error_code: str,
    message: str,
    request_id: str | None,
    stack: str | None = None,
) -> None:
    """Write a backend 5xx error to the error_log table.

    Non-fatal: any failure here is logged and silently suppressed so the
    original error response is never disrupted.
    """
    try:
        from backend.database import db_session  # local import avoids circular deps
        with db_session() as conn:
            conn.execute(
                """
                INSERT INTO error_log
                    (source, error_code, message, stack, request_id, severity)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                ('backend', error_code, message, stack, request_id, 'error'),
            )
    except Exception as exc:
        logger.warning('Failed to write backend error to error_log: %s', exc)


def handle_api_errors(fn):
    """Decorator: catch ``ApiError`` subclasses and bare ``Exception`` → JSON.

    For 5xx responses the error is additionally written to the error_log table
    so backend failures appear alongside frontend errors in the same store.

    Usage::

        @blueprint.route('/path')
        @handle_api_errors
        def my_view():
            raise ValidationError('bad input')
    """

    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except ApiError as exc:
            logger.warning('%s in %s: %s', exc.error_code, fn.__name__, exc.message)
            if exc.status_code >= 500:
                request_id = getattr(g, 'request_id', None)
                _emit_to_error_log(
                    error_code=exc.error_code,
                    message=exc.message,
                    request_id=request_id,
                )
            return exc.to_response()
        except Exception as exc:
            logger.exception('Unhandled exception in %s', fn.__name__)
            request_id = getattr(g, 'request_id', None)
            stack = traceback.format_exc()
            _emit_to_error_log(
                error_code='INTERNAL_ERROR',
                message=str(exc),
                request_id=request_id,
                stack=stack,
            )
            return ApiError(str(exc)).to_response()

    return wrapper