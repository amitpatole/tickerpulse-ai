"""
TickerPulse AI v3.0 — Structured error code registry.

Provides an ErrorCode enum and HTTP status mapping used across all API
blueprints.  Import ErrorCode rather than using ad-hoc string literals
so that error codes stay consistent and are traceable end-to-end.
"""

from enum import Enum


class ErrorCode(str, Enum):
    """Canonical error codes returned in API error responses."""

    # 4xx — client errors
    BAD_REQUEST = 'BAD_REQUEST'
    MISSING_FIELD = 'MISSING_FIELD'
    INVALID_TYPE = 'INVALID_TYPE'
    NOT_FOUND = 'NOT_FOUND'
    TICKER_NOT_FOUND = 'TICKER_NOT_FOUND'
    PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE'

    # 5xx — server errors
    INTERNAL_ERROR = 'INTERNAL_ERROR'
    DATA_PROVIDER_UNAVAILABLE = 'DATA_PROVIDER_UNAVAILABLE'
    DATABASE_ERROR = 'DATABASE_ERROR'


# HTTP status code for each error code.
HTTP_STATUS: dict['ErrorCode', int] = {
    ErrorCode.BAD_REQUEST: 400,
    ErrorCode.MISSING_FIELD: 400,
    ErrorCode.INVALID_TYPE: 400,
    ErrorCode.NOT_FOUND: 404,
    ErrorCode.TICKER_NOT_FOUND: 404,
    ErrorCode.PAYLOAD_TOO_LARGE: 413,
    ErrorCode.INTERNAL_ERROR: 500,
    ErrorCode.DATA_PROVIDER_UNAVAILABLE: 503,
    ErrorCode.DATABASE_ERROR: 500,
}