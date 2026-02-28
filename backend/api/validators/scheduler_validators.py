```python
"""
Input validation for scheduler API endpoints.

All validation is done at the API boundary — no changes to scheduler.py core logic.
Follows the same pattern established in backend/api/alerts.py: regex for string
fields, explicit numeric range checks, and unknown-key rejection.
"""

import re
from datetime import datetime

# ---------------------------------------------------------------------------
# Job ID
# ---------------------------------------------------------------------------

_JOB_ID_RE = re.compile(r'^[A-Za-z0-9_-]{1,64}$')

# ---------------------------------------------------------------------------
# Cron field allowlists
# ---------------------------------------------------------------------------

_CRON_ALLOWED_KEYS = frozenset({
    'hour', 'minute', 'second', 'month', 'day', 'week', 'day_of_week', 'year',
})

_DAY_OF_WEEK_RE = re.compile(
    r'^(mon|tue|wed|thu|fri|sat|sun|\d)([,-](mon|tue|wed|thu|fri|sat|sun|\d))*$'
)

_CRON_INT_RANGES = {
    'hour':   (0, 23),
    'minute': (0, 59),
    'second': (0, 59),
    'month':  (1, 12),
    'day':    (1, 31),
    'week':   (1, 53),
    'year':   (2000, 2100),
}

# ---------------------------------------------------------------------------
# Interval field allowlists
# ---------------------------------------------------------------------------

_INTERVAL_ALLOWED_KEYS = frozenset({'weeks', 'days', 'hours', 'minutes', 'seconds'})

_INTERVAL_MIN = 1
_INTERVAL_MAX = 52_560_000  # 100 years in minutes (smallest interval unit)

# ---------------------------------------------------------------------------
# Date field allowlists
# ---------------------------------------------------------------------------

_DATE_ALLOWED_KEYS = frozenset({'run_date'})


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def validate_job_id(job_id: str):
    """Return ``(True, None)`` when *job_id* is safe, or ``(False, error_msg)``."""
    if not _JOB_ID_RE.match(job_id):
        return False, (
            f"Invalid job_id '{job_id}'. "
            "Must be 1–64 characters: letters, digits, underscores, or hyphens."
        )
    return True, None


def validate_cron_args(args: dict):
    """Validate cron trigger arguments.

    Args:
        args: Mapping of cron field names to their values (trigger key already
              removed by the caller).

    Returns:
        ``(True, None)`` on success, or ``(False, error_message)`` on failure.
    """
    unknown = set(args) - _CRON_ALLOWED_KEYS
    if unknown:
        return False, f"Unknown cron field(s): {', '.join(sorted(unknown))}."

    if not args:
        return False, (
            "Cron trigger requires at least 'hour' or 'minute'. "
            "An empty trigger_args would schedule the job to fire every second."
        )

    for field, (lo, hi) in _CRON_INT_RANGES.items():
        if field not in args:
            continue
        try:
            val = int(args[field])
        except (TypeError, ValueError):
            return False, f"Cron field '{field}' must be an integer."
        if not (lo <= val <= hi):
            return False, f"Cron field '{field}' must be between {lo} and {hi}, got {val}."

    if 'day_of_week' in args:
        dow = str(args['day_of_week']).strip().lower()
        if not _DAY_OF_WEEK_RE.match(dow):
            return False, (
                f"Invalid day_of_week '{args['day_of_week']}'. "
                "Must be a comma/hyphen-separated list of "
                "mon|tue|wed|thu|fri|sat|sun or single digits."
            )

    return True, None


def validate_interval_args(args: dict):
    """Validate interval trigger arguments.

    Args:
        args: Mapping of interval field names to their values (trigger key
              already removed by the caller).

    Returns:
        ``(True, None)`` on success, or ``(False, error_message)`` on failure.
    """
    unknown = set(args) - _INTERVAL_ALLOWED_KEYS
    if unknown:
        return False, f"Unknown interval field(s): {', '.join(sorted(unknown))}."

    provided = {k: v for k, v in args.items() if k in _INTERVAL_ALLOWED_KEYS}
    if not provided:
        return False, (
            "At least one interval field is required: "
            f"{', '.join(sorted(_INTERVAL_ALLOWED_KEYS))}."
        )

    for field, raw in provided.items():
        try:
            val = int(raw)
        except (TypeError, ValueError):
            return False, f"Interval field '{field}' must be an integer."
        if not (_INTERVAL_MIN <= val <= _INTERVAL_MAX):
            return False, (
                f"Interval field '{field}' must be between "
                f"{_INTERVAL_MIN} and {_INTERVAL_MAX}, got {val}."
            )

    return True, None


def validate_date_args(args: dict):
    """Validate date trigger arguments.

    Args:
        args: Mapping of date field names to their values (trigger key already
              removed by the caller).

    Returns:
        ``(True, None)`` on success, or ``(False, error_message)`` on failure.
    """
    unknown = set(args) - _DATE_ALLOWED_KEYS
    if unknown:
        return False, f"Unknown date field(s): {', '.join(sorted(unknown))}."

    if 'run_date' not in args:
        return False, "Date trigger requires 'run_date' field (ISO 8601 string)."

    try:
        datetime.fromisoformat(str(args['run_date']))
    except (ValueError, TypeError):
        return False, (
            f"Invalid run_date '{args['run_date']}'. "
            "Must be a valid ISO 8601 datetime string (e.g. '2026-03-01T09:00:00')."
        )

    return True, None


def validate_trigger_args(trigger: str, args: dict):
    """Dispatch to the appropriate per-trigger validator.

    Args:
        trigger: One of ``'cron'``, ``'interval'``, ``'date'``.
        args:    Trigger arguments dict (trigger key already removed).

    Returns:
        ``(True, None)`` on success, or ``(False, error_message)`` on failure.
    """
    if trigger == 'cron':
        return validate_cron_args(args)
    if trigger == 'interval':
        return validate_interval_args(args)
    if trigger == 'date':
        return validate_date_args(args)
    # Caller is responsible for rejecting unknown trigger types before calling here.
    return False, f"Unknown trigger type: '{trigger}'."
```