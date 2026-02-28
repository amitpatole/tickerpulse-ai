"""
Input validation for agent API endpoints.

Follows the same (bool, error_msg) pattern used by scheduler_validators.py.
Date range validation returns parsed datetime objects as additional return
values to avoid re-parsing in the route.
"""

import re
from datetime import datetime

_DATE_ONLY_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def _parse_date_param(raw: str) -> datetime | None:
    """Parse YYYY-MM-DD or ISO 8601 datetime into a datetime.

    Returns None if the value cannot be parsed.
    """
    stripped = raw.strip()
    if not stripped:
        return None
    try:
        return datetime.fromisoformat(stripped)
    except ValueError:
        return None


def validate_date_range(
    date_from: str | None,
    date_to: str | None,
) -> tuple[bool, str | None, datetime | None, datetime | None]:
    """Validate and normalise *date_from* / *date_to* query parameters.

    Accepts YYYY-MM-DD (date-only) or full ISO 8601 datetime strings.
    When a date-only value is supplied for *date_to* the time component is
    extended to 23:59:59.999999 so the full calendar day is included.

    Returns:
        (valid, error_msg, parsed_from, parsed_to)
        - valid:       True when parameters are acceptable.
        - error_msg:   Human-readable reason on failure, else None.
        - parsed_from: Normalised datetime for the lower bound, or None.
        - parsed_to:   Normalised datetime for the upper bound, or None.
    """
    parsed_from: datetime | None = None
    parsed_to: datetime | None = None

    if date_from:
        parsed_from = _parse_date_param(date_from)
        if parsed_from is None:
            return (
                False,
                f"Invalid date_from '{date_from}'. "
                "Expected YYYY-MM-DD or an ISO 8601 datetime string.",
                None,
                None,
            )

    if date_to:
        parsed_to = _parse_date_param(date_to)
        if parsed_to is None:
            return (
                False,
                f"Invalid date_to '{date_to}'. "
                "Expected YYYY-MM-DD or an ISO 8601 datetime string.",
                None,
                None,
            )
        # Extend date-only values to end-of-day so the entire day is included.
        if _DATE_ONLY_RE.match(date_to.strip()):
            parsed_to = parsed_to.replace(
                hour=23, minute=59, second=59, microsecond=999999
            )

    if parsed_from is not None and parsed_to is not None:
        if parsed_from > parsed_to:
            return False, "date_from must not be later than date_to.", None, None

    return True, None, parsed_from, parsed_to
