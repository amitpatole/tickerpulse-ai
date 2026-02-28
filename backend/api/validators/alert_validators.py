"""
TickerPulse AI v3.0 — Alert Input Validators

Validates and sanitizes alert-related input: tickers, condition types,
sound types, pct_change values, and SSE event payloads.
"""

import math
import re
from typing import Any

# ---------------------------------------------------------------------------
# Allowlists
# ---------------------------------------------------------------------------

VALID_CONDITION_TYPES = frozenset({'price_above', 'price_below', 'pct_change'})

# Mirrors frontend VALID_SOUND_TYPES set in useSSEAlerts.ts.
# Both layers must agree on this set; update together.
VALID_SOUND_TYPES = frozenset({'default', 'chime', 'alarm', 'silent'})

# Ticker: 1–5 ASCII uppercase letters only (e.g. AAPL, TSLA, BRK).
_TICKER_RE = re.compile(r'^[A-Z]{1,5}$')

# Maximum percentage-change threshold
_PCT_CHANGE_MAX = 100.0


# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------

def validate_ticker(value: Any) -> str:
    """Return the ticker if valid, raise ValueError otherwise.

    Rejects:
    - Non-string values
    - Non-ASCII characters (homoglyphs, RTL overrides, Cyrillic lookalikes)
    - Tickers that don't match [A-Z]{1,5}
    - SQL / XSS injection payloads
    """
    if not isinstance(value, str):
        raise ValueError("ticker must be a non-empty string of 1-5 uppercase letters")
    # Reject any non-ASCII codepoints before the regex check.
    try:
        value.encode('ascii')
    except UnicodeEncodeError:
        raise ValueError("ticker must be a non-empty string of 1-5 uppercase letters")
    if not _TICKER_RE.match(value):
        raise ValueError("ticker must be a non-empty string of 1-5 uppercase letters")
    return value


def validate_condition_type(value: Any) -> str:
    """Return condition_type if it is in the allowlist, raise ValueError otherwise."""
    if value not in VALID_CONDITION_TYPES:
        raise ValueError(
            f"condition_type must be one of {sorted(VALID_CONDITION_TYPES)}"
        )
    return value


def validate_pct_change(value: Any) -> float:
    """Return validated pct_change, capped at 100.0.

    Raises ValueError for negative values or non-numeric input.
    Values above 100.0 are silently capped at 100.0.
    """
    try:
        pct = float(value)
    except (TypeError, ValueError):
        raise ValueError("pct_change must be a non-negative number")
    if pct < 0:
        raise ValueError(f"pct_change must be a non-negative number (got {pct:.4f})")
    return min(pct, _PCT_CHANGE_MAX)


def validate_sound_type(value: Any) -> str:
    """Return value if it is in VALID_SOUND_TYPES, else return 'default'.

    Does NOT raise — invalid or tampered values silently fall back to 'default'
    so that corrupted DB entries never cause a hard error.
    """
    if isinstance(value, str) and value in VALID_SOUND_TYPES:
        return value
    return 'default'


# ---------------------------------------------------------------------------
# SSE payload sanitization
# ---------------------------------------------------------------------------

def sanitize_sse_alert_payload(payload: dict) -> dict:
    """Return a sanitized copy of *payload* safe to serialize as SSE JSON.

    Replaces float('nan'), float('inf'), and float('-inf') with None so that
    ``json.dumps`` never raises on the value.  All other values are forwarded
    unchanged.
    """
    out: dict[str, Any] = {}
    for key, val in payload.items():
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
            out[key] = None
        else:
            out[key] = val
    return out
