"""
TickerPulse AI v3.0 - API Error Code Taxonomy
Centralised enum + HTTP status mapping used across all API blueprints.
"""

from enum import Enum


class ErrorCode(Enum):
    """Unified machine-readable error codes for API responses."""

    # Client errors (4xx)
    BAD_REQUEST = 'BAD_REQUEST'
    MISSING_FIELD = 'MISSING_FIELD'
    INVALID_TYPE = 'INVALID_TYPE'
    NOT_FOUND = 'NOT_FOUND'
    TICKER_NOT_FOUND = 'TICKER_NOT_FOUND'
    PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE'
    CONFLICT = 'CONFLICT'
    UNAUTHORIZED = 'UNAUTHORIZED'
    FORBIDDEN = 'FORBIDDEN'
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'

    # Server errors (5xx)
    INTERNAL_ERROR = 'INTERNAL_ERROR'
    DATA_PROVIDER_UNAVAILABLE = 'DATA_PROVIDER_UNAVAILABLE'
    DATABASE_ERROR = 'DATABASE_ERROR'
    SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'


#: Maps each ``ErrorCode`` to its canonical HTTP status code.
HTTP_STATUS: dict[ErrorCode, int] = {
    ErrorCode.BAD_REQUEST: 400,
    ErrorCode.MISSING_FIELD: 400,
    ErrorCode.INVALID_TYPE: 400,
    ErrorCode.NOT_FOUND: 404,
    ErrorCode.TICKER_NOT_FOUND: 404,
    ErrorCode.PAYLOAD_TOO_LARGE: 413,
    ErrorCode.CONFLICT: 409,
    ErrorCode.UNAUTHORIZED: 401,
    ErrorCode.FORBIDDEN: 403,
    ErrorCode.RATE_LIMIT_EXCEEDED: 429,
    ErrorCode.INTERNAL_ERROR: 500,
    ErrorCode.DATABASE_ERROR: 500,
    ErrorCode.DATA_PROVIDER_UNAVAILABLE: 503,
    ErrorCode.SERVICE_UNAVAILABLE: 503,
}
