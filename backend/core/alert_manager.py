"""
TickerPulse AI v3.0 — Alert Manager

Manages price alert CRUD, sound type resolution, and test-fire logic.

Sound resolution strategy
-------------------------
- Each price alert stores a ``sound_type`` column ('default' | 'chime' | 'alarm' | 'silent').
- Global sound settings live in the ``settings`` KV table.
- At fire-time ``'default'`` resolves to the global ``alert_sound_type`` setting.
  This resolution is also used by ``fire_test_alert`` so preview behaviour
  matches live behaviour exactly.
"""

import logging
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.database import pooled_session
from backend.core.settings_manager import get_setting, set_setting
from backend.api.validators.alert_validators import (
    validate_sound_type,
    sanitize_sse_alert_payload,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Sound settings — KV keys and defaults
# ---------------------------------------------------------------------------

_SOUND_KV: Dict[str, str] = {
    'alert_sound_enabled':    'true',
    'alert_sound_type':       'chime',
    'alert_sound_volume':     '70',
    'alert_mute_when_active': 'false',
}


def get_global_sound_settings() -> Dict[str, Any]:
    """Read global alert-sound settings from the ``settings`` KV table.

    Returns a dict with keys:
    - ``enabled``          bool
    - ``sound_type``       str  — one of 'chime' | 'alarm' | 'silent'
    - ``volume``           int  — 0-100
    - ``mute_when_active`` bool
    """
    enabled_raw    = get_setting('alert_sound_enabled',    _SOUND_KV['alert_sound_enabled'])
    sound_type_raw = get_setting('alert_sound_type',       _SOUND_KV['alert_sound_type'])
    volume_raw     = get_setting('alert_sound_volume',     _SOUND_KV['alert_sound_volume'])
    mute_raw       = get_setting('alert_mute_when_active', _SOUND_KV['alert_mute_when_active'])

    try:
        volume = int(volume_raw or '70')
    except (ValueError, TypeError):
        volume = 70

    # The global sound_type must never be 'default' (circular); fall back to 'chime'.
    sound_type = sound_type_raw if sound_type_raw in ('chime', 'alarm', 'silent') else 'chime'

    return {
        'enabled':          enabled_raw != 'false',
        'sound_type':       sound_type,
        'volume':           max(0, min(100, volume)),
        'mute_when_active': mute_raw == 'true',
    }


def resolve_alert_sound_type(alert_sound_type: str, global_sound_type: str) -> str:
    """Resolve 'default' to the global sound type at fire-time.

    Any unrecognised value also falls back to the global setting.
    """
    safe = validate_sound_type(alert_sound_type)
    if safe == 'default':
        return global_sound_type if global_sound_type in ('chime', 'alarm', 'silent') else 'chime'
    return safe


# ---------------------------------------------------------------------------
# Alert CRUD
# ---------------------------------------------------------------------------

def get_all_alerts() -> List[Dict[str, Any]]:
    """Return all price alerts, newest first."""
    with pooled_session() as conn:
        rows = conn.execute(
            'SELECT id, ticker, condition_type, threshold, enabled, sound_type,'
            '       triggered_at, notification_sent, fired_at, fire_count, created_at'
            '  FROM price_alerts'
            ' ORDER BY created_at DESC'
        ).fetchall()
    return [dict(row) for row in rows]


def get_active_alerts() -> List[Dict[str, Any]]:
    """Return enabled, not-yet-triggered price alerts."""
    with pooled_session() as conn:
        rows = conn.execute(
            'SELECT id, ticker, condition_type, threshold, enabled, sound_type,'
            '       triggered_at, notification_sent, fired_at, fire_count, created_at'
            '  FROM price_alerts'
            ' WHERE enabled = 1 AND triggered_at IS NULL'
            ' ORDER BY created_at DESC'
        ).fetchall()
    return [dict(row) for row in rows]


def get_alert_by_id(alert_id: int) -> Optional[Dict[str, Any]]:
    """Return a single alert by ID, or None if not found."""
    with pooled_session() as conn:
        row = conn.execute(
            'SELECT id, ticker, condition_type, threshold, enabled, sound_type,'
            '       triggered_at, notification_sent, fired_at, fire_count, created_at'
            '  FROM price_alerts WHERE id = ?',
            (alert_id,),
        ).fetchone()
    return dict(row) if row else None


def create_alert(
    ticker: str,
    condition_type: str,
    threshold: float,
    sound_type: str = 'default',
) -> Dict[str, Any]:
    """Insert a new price alert and return it as a dict."""
    safe_sound = validate_sound_type(sound_type)
    with pooled_session() as conn:
        cursor = conn.execute(
            'INSERT INTO price_alerts (ticker, condition_type, threshold, sound_type)'
            ' VALUES (?, ?, ?, ?)',
            (ticker, condition_type, threshold, safe_sound),
        )
        alert_id = cursor.lastrowid
    result = get_alert_by_id(alert_id)
    if result is None:
        raise RuntimeError(f"Failed to retrieve newly created alert (id={alert_id})")
    return result


def update_alert(
    alert_id: int,
    condition_type: Optional[str] = None,
    threshold: Optional[float] = None,
    sound_type: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Update editable fields on an existing alert.

    Only non-None arguments are included in the UPDATE.  Returns the updated
    alert dict, or None if alert_id does not exist.
    """
    fields: list[tuple[str, Any]] = []
    if condition_type is not None:
        fields.append(('condition_type', condition_type))
    if threshold is not None:
        fields.append(('threshold', threshold))
    if sound_type is not None:
        fields.append(('sound_type', validate_sound_type(sound_type)))

    if not fields:
        return get_alert_by_id(alert_id)

    set_clause = ', '.join(f'{col} = ?' for col, _ in fields)
    values = [v for _, v in fields] + [alert_id]
    with pooled_session() as conn:
        conn.execute(f'UPDATE price_alerts SET {set_clause} WHERE id = ?', values)
    return get_alert_by_id(alert_id)


def toggle_alert(alert_id: int) -> Optional[Dict[str, Any]]:
    """Flip the enabled flag on a price alert."""
    with pooled_session() as conn:
        conn.execute(
            'UPDATE price_alerts'
            '   SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END'
            ' WHERE id = ?',
            (alert_id,),
        )
    return get_alert_by_id(alert_id)


def delete_alert(alert_id: int) -> bool:
    """Delete a price alert.  Returns True if a row was removed."""
    with pooled_session() as conn:
        cursor = conn.execute(
            'DELETE FROM price_alerts WHERE id = ?', (alert_id,)
        )
        return cursor.rowcount > 0


# ---------------------------------------------------------------------------
# Per-alert sound override
# ---------------------------------------------------------------------------

def update_alert_sound_type(
    alert_id: int, sound_type: str
) -> Optional[Dict[str, Any]]:
    """Set the per-alert sound_type override.

    Returns the updated alert dict, or None if alert_id does not exist.
    Any unrecognised *sound_type* is silently normalised to 'default'.
    """
    safe_sound = validate_sound_type(sound_type)
    with pooled_session() as conn:
        cursor = conn.execute(
            'UPDATE price_alerts SET sound_type = ? WHERE id = ?',
            (safe_sound, alert_id),
        )
        if cursor.rowcount == 0:
            return None
    return get_alert_by_id(alert_id)


# ---------------------------------------------------------------------------
# Test-fire (SSE only — no DB write)
# ---------------------------------------------------------------------------

def fire_test_alert(alert_id: int) -> Optional[Dict[str, Any]]:
    """Build a test SSE alert payload without modifying the database.

    Resolves 'default' sound_type using the current global settings so the
    test preview matches what a real alert fire would produce.

    Returns the sanitized payload dict ready to pass to ``send_sse_event``,
    or None if *alert_id* does not exist.
    """
    alert = get_alert_by_id(alert_id)
    if alert is None:
        return None

    global_settings = get_global_sound_settings()
    resolved_sound = resolve_alert_sound_type(
        alert.get('sound_type', 'default'),
        global_settings['sound_type'],
    )

    payload = sanitize_sse_alert_payload({
        'alert_id':      alert['id'],
        'ticker':        alert['ticker'],
        'condition_type': alert['condition_type'],
        'threshold':     alert['threshold'],
        'message':       f"Test alert for {alert['ticker']}",
        'sound_type':    resolved_sound,
        'type':          'price_alert',
        'severity':      'info',
        'fire_count':    0,
        'current_price': None,
        'timestamp':     datetime.now(timezone.utc).isoformat(),
    })
    return payload


# ---------------------------------------------------------------------------
# Alert firing (used by price-monitoring jobs)
# ---------------------------------------------------------------------------

def mark_alert_fired(alert_id: int, current_price: float) -> None:
    """Record that a price alert has fired.

    Sets ``triggered_at``, increments ``fire_count``, and marks
    ``notification_sent = 1``.
    """
    now = datetime.now(timezone.utc).isoformat()
    with pooled_session() as conn:
        conn.execute(
            'UPDATE price_alerts'
            '   SET triggered_at = ?,'
            '       fired_at = ?,'
            '       fire_count = fire_count + 1,'
            '       notification_sent = 1'
            ' WHERE id = ?',
            (now, now, alert_id),
        )
    logger.info("Alert %d fired at price %.4f", alert_id, current_price)


def build_sse_alert_payload(
    alert: Dict[str, Any],
    current_price: float,
    global_sound_type: str,
) -> Dict[str, Any]:
    """Build the SSE payload for a fired alert.

    Resolves 'default' sound_type and sanitizes float fields.
    """
    resolved_sound = resolve_alert_sound_type(
        alert.get('sound_type', 'default'),
        global_sound_type,
    )
    condition = alert.get('condition_type', '')
    threshold = alert.get('threshold', 0)

    if condition == 'price_above':
        message = f"rose above ${threshold:.2f} (now ${current_price:.2f})"
    elif condition == 'price_below':
        message = f"fell below ${threshold:.2f} (now ${current_price:.2f})"
    elif condition == 'pct_change':
        message = f"moved ±{threshold:.1f}% (now ${current_price:.2f})"
    else:
        message = f"triggered at ${current_price:.2f}"

    return sanitize_sse_alert_payload({
        'alert_id':      alert['id'],
        'ticker':        alert['ticker'],
        'condition_type': condition,
        'threshold':     threshold,
        'current_price': current_price,
        'message':       message,
        'sound_type':    resolved_sound,
        'type':          'price_alert',
        'severity':      'high',
        'fire_count':    (alert.get('fire_count') or 0) + 1,
        'timestamp':     datetime.now(timezone.utc).isoformat(),
    })
