"""
TickerPulse AI v3.0 — Unified error code taxonomy.

Canonical registry for all API error codes.  Import *ErrorCode* from this
module so that codes stay consistent and are traceable end-to-end.

The backward-compatible shim at ``backend.api.error_codes`` re-exports
everything from here, so existing callers do not need to change import paths.
"""

from enum import Enum


class ErrorCode(str, Enum):
    """Machine-readable error codes returned in API error responses.

    Inherits from ``str`` so that enum members serialise directly to their
    string value in JSON responses (no need to call ``.value`` explicitly).
    """

    # 4xx — client errors
    BAD_REQUEST = 'BAD_REQUEST'
    INVALID_INPUT = 'INVALID_INPUT'
    INVALID_TYPE = 'INVALID_TYPE'
    MISSING_FIELD = 'MISSING_FIELD'
    NOT_FOUND = 'NOT_FOUND'
    TICKER_NOT_FOUND = 'TICKER_NOT_FOUND'
    ALERT_NOT_FOUND = 'ALERT_NOT_FOUND'
    PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE'
    AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED'
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
    DUPLICATE_ENTRY = 'DUPLICATE_ENTRY'
    VALIDATION_ERROR = 'VALIDATION_ERROR'
    DAYS_OUT_OF_RANGE = 'DAYS_OUT_OF_RANGE'
    PAGE_SIZE_INVALID = 'PAGE_SIZE_INVALID'

    # 5xx — server errors
    INTERNAL_ERROR = 'INTERNAL_ERROR'
    DATABASE_ERROR = 'DATABASE_ERROR'
    PROVIDER_ERROR = 'PROVIDER_ERROR'
    DATA_PROVIDER_UNAVAILABLE = 'DATA_PROVIDER_UNAVAILABLE'
    SSE_ERROR = 'SSE_ERROR'
    EXPORT_ERROR = 'EXPORT_ERROR'
    SYNC_FAILED = 'SYNC_FAILED'
    SCHEDULER_ERROR = 'SCHEDULER_ERROR'

    # 2xx with degraded state — request succeeded but data is incomplete or stale
    DEGRADED_DATA = 'DEGRADED_DATA'


# Canonical HTTP status code for each error code.
HTTP_STATUS_MAP: dict[str, int] = {
    ErrorCode.BAD_REQUEST:               400,
    ErrorCode.INVALID_INPUT:             400,
    ErrorCode.INVALID_TYPE:              400,
    ErrorCode.MISSING_FIELD:             400,
    ErrorCode.NOT_FOUND:                 404,
    ErrorCode.TICKER_NOT_FOUND:          404,
    ErrorCode.ALERT_NOT_FOUND:           404,
    ErrorCode.PAYLOAD_TOO_LARGE:         413,
    ErrorCode.AUTHENTICATION_FAILED:     401,
    ErrorCode.RATE_LIMIT_EXCEEDED:       429,
    ErrorCode.DUPLICATE_ENTRY:           409,
    ErrorCode.VALIDATION_ERROR:          400,
    ErrorCode.DAYS_OUT_OF_RANGE:         400,
    ErrorCode.PAGE_SIZE_INVALID:         400,
    ErrorCode.INTERNAL_ERROR:            500,
    ErrorCode.DATABASE_ERROR:            503,
    ErrorCode.PROVIDER_ERROR:            502,
    ErrorCode.DATA_PROVIDER_UNAVAILABLE: 503,
    ErrorCode.SSE_ERROR:                 500,
    ErrorCode.EXPORT_ERROR:              500,
    ErrorCode.SYNC_FAILED:               502,
    ErrorCode.SCHEDULER_ERROR:           500,
    ErrorCode.DEGRADED_DATA:             200,
}


def http_status(code: ErrorCode) -> int:
    """Return the canonical HTTP status code for *code*.

    Falls back to 500 for any code not present in the map (should not happen
    in practice since the map covers every enum member).
    """
    return HTTP_STATUS_MAP.get(code, 500)
