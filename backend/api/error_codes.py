"""
Backward-compatible re-export of the canonical error code registry.

All new code should import directly from ``backend.core.error_codes``.
This module exists so that existing callers (e.g. settings.py) and the
PyInstaller spec entry continue to work without modification.
"""

from backend.core.error_codes import (  # noqa: F401
    ErrorCode,
    HTTP_STATUS_MAP,
    http_status,
)

# Legacy alias — the original module exposed HTTP_STATUS keyed by ErrorCode
# members.  Since ErrorCode is now a str-Enum the dict is identical; the alias
# preserves the old name for any code that references it directly.
HTTP_STATUS = HTTP_STATUS_MAP

__all__ = ['ErrorCode', 'HTTP_STATUS', 'HTTP_STATUS_MAP', 'http_status']
