"""
TickerPulse AI v3.0 — Unified error code taxonomy.

Provides a canonical set of error codes for consistent API error responses
and machine-readable frontend error handling logic.
"""

from enum import Enum


class ErrorCode(Enum):
    """Unified error codes for API responses.

    These codes provide a machine-readable taxonomy for frontend error handling,
    allowing the UI to display context-specific messages and apply retry logic
    based on the error category.
    """

    # Client errors (4xx)
    INVALID_INPUT = 'INVALID_INPUT'
    TICKER_NOT_FOUND = 'TICKER_NOT_FOUND'
    ALERT_NOT_FOUND = 'ALERT_NOT_FOUND'
    AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED'
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'

    # Server errors (5xx)
    DATABASE_ERROR = 'DATABASE_ERROR'
    PROVIDER_ERROR = 'PROVIDER_ERROR'
    INTERNAL_ERROR = 'INTERNAL_ERROR'

    # Validation errors
    VALIDATION_ERROR = 'VALIDATION_ERROR'
    MISSING_FIELD = 'MISSING_FIELD'
    DUPLICATE_ENTRY = 'DUPLICATE_ENTRY'


# Canonical HTTP status code for each error code.
HTTP_STATUS_MAP: dict[str, int] = {
    ErrorCode.INVALID_INPUT.value:         400,
    ErrorCode.TICKER_NOT_FOUND.value:      404,
    ErrorCode.ALERT_NOT_FOUND.value:       404,
    ErrorCode.AUTHENTICATION_FAILED.value: 401,
    ErrorCode.RATE_LIMIT_EXCEEDED.value:   429,
    ErrorCode.DATABASE_ERROR.value:        503,
    ErrorCode.PROVIDER_ERROR.value:        502,
    ErrorCode.INTERNAL_ERROR.value:        500,
    ErrorCode.VALIDATION_ERROR.value:      400,
    ErrorCode.MISSING_FIELD.value:         400,
    ErrorCode.DUPLICATE_ENTRY.value:       409,
}


def http_status(code: ErrorCode) -> int:
    """Return the standard HTTP status code for *code*.

    Falls back to 500 for any code not in the map (should not happen
    in practice since the map covers every enum member).
    """
    return HTTP_STATUS_MAP.get(code.value, 500)