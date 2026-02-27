"""
TickerPulse AI v3.0 - Price Alert Manager
CRUD operations and evaluation logic for user-defined price alerts.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from backend.database import db_session
from backend.core.settings_manager import get_setting

logger = logging.getLogger(__name__)

# Price data older than this is considered too stale to fire an alert.
_AI_RATINGS_TTL_SECONDS = 1800  # 30 minutes

# Default cooldown period between repeated firings of the same alert.
_DEFAULT_COOLDOWN_MINUTES = 15

# Allowlists used for defense-in-depth validation in core functions.
# The API layer also validates these, but core functions must not trust callers.
_VALID_CONDITION_TYPES = frozenset({'price_above', 'price_below', 'pct_change'})
_VALID_SOUND_TYPES = frozenset({'default', 'chime', 'alarm', 'silent'})
_THRESHOLD_MAX = 1_000_000


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _row_to_dict(row) -> dict:
    """Convert a sqlite3.Row to a plain dict with bool-typed enabled."""
    d = dict(row)
    d['enabled'] = bool(d['enabled'])
    return d


def _get_cooldown_minutes() -> int:
    """Return the configured alert cooldown period in minutes.

    Reads ``alert_cooldown_minutes`` from the settings table.
    Falls back to ``_DEFAULT_COOLDOWN_MINUTES`` (15) if not set or invalid.
    """
    try:
        val = get_setting('alert_cooldown_minutes', str(_DEFAULT_COOLDOWN_MINUTES))
        return max(1, int(val))
    except (TypeError, ValueError):
        return _DEFAULT_COOLDOWN_MINUTES


# ---------------------------------------------------------------------------
# CRUD helpers
# ---------------------------------------------------------------------------

def get_alerts() -> list[dict]:
    """Return all price alerts ordered by creation date descending."""
    with db_session() as conn:
        cursor = conn.execute(
            'SELECT * FROM price_alerts ORDER BY created_at DESC'
        )
        return [_row_to_dict(row) for row in cursor.fetchall()]


def create_alert(ticker: str, condition_type: str, threshold: float, sound_type: str = 'default') -> dict:
    """Insert a new price alert and return the created row.

    Parameters
    ----------
    ticker : str
        Stock ticker symbol (must already exist in the stocks table).
    condition_type : str
        One of 'price_above', 'price_below', 'pct_change'.
    threshold : float
        Numeric threshold for the condition.
    sound_type : str, optional
        Per-alert sound: one of 'default', 'chime', 'alarm', 'silent'. Defaults to 'default'.

    Returns
    -------
    dict
        The newly created alert row.

    Raises
    ------
    ValueError
        If any argument fails validation.
    """
    if condition_type not in _VALID_CONDITION_TYPES:
        raise ValueError(
            f"Invalid condition_type {condition_type!r}. "
            f"Must be one of: {', '.join(sorted(_VALID_CONDITION_TYPES))}"
        )
    if sound_type not in _VALID_SOUND_TYPES:
        raise ValueError(
            f"Invalid sound_type {sound_type!r}. "
            f"Must be one of: {', '.join(sorted(_VALID_SOUND_TYPES))}"
        )
    threshold = float(threshold)
    if not (0 < threshold <= _THRESHOLD_MAX):
        raise ValueError(f"threshold must be > 0 and <= {_THRESHOLD_MAX}")
    if condition_type == 'pct_change' and threshold > 100:
        raise ValueError("threshold for pct_change must be <= 100")

    with db_session() as conn:
        cursor = conn.execute(
            '''INSERT INTO price_alerts (ticker, condition_type, threshold, sound_type)
               VALUES (?, ?, ?, ?)''',
            (ticker.upper(), condition_type, threshold, sound_type),
        )
        alert_id = cursor.lastrowid
        row = conn.execute(
            'SELECT * FROM price_alerts WHERE id = ?', (alert_id,)
        ).fetchone()
        return _row_to_dict(row)


def update_alert(
    alert_id: int,
    condition_type: Optional[str] = None,
    threshold: Optional[float] = None,
    sound_type: Optional[str] = None,
) -> Optional[dict]:
    """Edit an existing price alert's condition and/or sound type.

    Only the supplied fields are updated; omitted fields are unchanged.
    Updating a triggered alert resets ``fired_at`` and ``fire_count`` so it
    can fire again under the new condition.

    Returns
    -------
    dict or None
        Updated alert row, or None if the ID was not found.

    Raises
    ------
    ValueError
        If any supplied argument fails validation.
    """
    if condition_type is not None and condition_type not in _VALID_CONDITION_TYPES:
        raise ValueError(
            f"Invalid condition_type {condition_type!r}. "
            f"Must be one of: {', '.join(sorted(_VALID_CONDITION_TYPES))}"
        )
    if sound_type is not None and sound_type not in _VALID_SOUND_TYPES:
        raise ValueError(
            f"Invalid sound_type {sound_type!r}. "
            f"Must be one of: {', '.join(sorted(_VALID_SOUND_TYPES))}"
        )
    if threshold is not None:
        threshold = float(threshold)
        if not (0 < threshold <= _THRESHOLD_MAX):
            raise ValueError(f"threshold must be > 0 and <= {_THRESHOLD_MAX}")

    with db_session() as conn:
        row = conn.execute(
            'SELECT * FROM price_alerts WHERE id = ?', (alert_id,)
        ).fetchone()
        if row is None:
            return None

        sets = []
        params: list = []
        if condition_type is not None:
            sets.append('condition_type = ?')
            params.append(condition_type)
        if threshold is not None:
            sets.append('threshold = ?')
            params.append(threshold)
        if sound_type is not None:
            sets.append('sound_type = ?')
            params.append(sound_type)

        if not sets:
            return _row_to_dict(row)

        # Reset fire tracking so the edited alert starts fresh.
        sets.extend(['fired_at = NULL', 'fire_count = 0', 'triggered_at = NULL'])
        params.append(alert_id)

        conn.execute(
            f'UPDATE price_alerts SET {", ".join(sets)} WHERE id = ?',
            params,
        )
        updated = conn.execute(
            'SELECT * FROM price_alerts WHERE id = ?', (alert_id,)
        ).fetchone()
        return _row_to_dict(updated)


def update_alert_sound_type(alert_id: int, sound_type: str) -> Optional[dict]:
    """Update the sound_type of a price alert.

    Returns
    -------
    dict or None
        Updated alert row, or None if the ID was not found.

    Raises
    ------
    ValueError
        If ``sound_type`` is not a recognised value.
    """
    if sound_type not in _VALID_SOUND_TYPES:
        raise ValueError(
            f"Invalid sound_type {sound_type!r}. "
            f"Must be one of: {', '.join(sorted(_VALID_SOUND_TYPES))}"
        )

    with db_session() as conn:
        cursor = conn.execute(
            'UPDATE price_alerts SET sound_type = ? WHERE id = ?',
            (sound_type, alert_id),
        )
        if cursor.rowcount == 0:
            return None
        row = conn.execute(
            'SELECT * FROM price_alerts WHERE id = ?', (alert_id,)
        ).fetchone()
        return _row_to_dict(row)


def delete_alert(alert_id: int) -> bool:
    """Delete a price alert by ID. Returns True if a row was deleted."""
    with db_session() as conn:
        cursor = conn.execute(
            'DELETE FROM price_alerts WHERE id = ?', (alert_id,)
        )
        return cursor.rowcount > 0


def toggle_alert(alert_id: int) -> Optional[dict]:
    """Flip the enabled flag on a price alert.

    When re-enabling an alert, ``notification_sent``, ``fired_at``, and
    ``fire_count`` are reset so the alert can fire again if its condition is met.

    Returns
    -------
    dict or None
        Updated alert row, or None if the ID was not found.
    """
    with db_session() as conn:
        row = conn.execute(
            'SELECT * FROM price_alerts WHERE id = ?', (alert_id,)
        ).fetchone()
        if row is None:
            return None
        new_enabled = 0 if row['enabled'] else 1
        if new_enabled == 1:
            # Re-enabling: clear all fire-tracking fields so the alert can fire again.
            conn.execute(
                '''UPDATE price_alerts
                   SET enabled = 1, notification_sent = 0, fired_at = NULL, fire_count = 0
                   WHERE id = ?''',
                (alert_id,),
            )
        else:
            conn.execute(
                'UPDATE price_alerts SET enabled = 0 WHERE id = ?',
                (alert_id,),
            )
        updated = conn.execute(
            'SELECT * FROM price_alerts WHERE id = ?', (alert_id,)
        ).fetchone()
        return _row_to_dict(updated)


def fire_test_alert(alert_id: int) -> Optional[dict]:
    """Fire a test SSE notification for the given alert without evaluating its condition.

    The alert is not modified; only an SSE event is emitted so the user can
    verify that their notification pipeline (sound, desktop notification) works.

    Returns
    -------
    dict or None
        The alert row if found, None if the alert does not exist.
    """
    with db_session() as conn:
        row = conn.execute(
            'SELECT * FROM price_alerts WHERE id = ?', (alert_id,)
        ).fetchone()
        if row is None:
            return None
        alert = _row_to_dict(row)

    try:
        from backend.app import send_sse_event
    except ImportError:
        logger.warning("fire_test_alert: could not import send_sse_event")
        return alert

    ticker = alert['ticker']
    condition = alert['condition_type']
    threshold = float(alert['threshold'])

    cond_labels = {
        'price_above': f"price rose above ${threshold:.2f}",
        'price_below': f"price fell below ${threshold:.2f}",
        'pct_change': f"moved \u00b1{threshold:.1f}%",
    }
    # Use a safe static fallback instead of the raw condition value to prevent
    # untrusted DB content from being injected into notification messages.
    message = f"[TEST] {ticker} alert: {cond_labels.get(condition, 'condition triggered')}"

    try:
        send_sse_event('alert', {
            'ticker': ticker,
            'type': 'price_alert',
            'message': message,
            'severity': 'info',
            'alert_id': alert_id,
            'condition_type': condition,
            'threshold': threshold,
            'current_price': None,
            'sound_type': alert['sound_type'],
            'is_test': True,
        })
    except Exception as exc:
        logger.warning("fire_test_alert: SSE send failed for alert %d: %s", alert_id, exc)

    return alert


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def evaluate_price_alerts(tickers: list[str]) -> None:
    """Check enabled alerts against the latest prices in ai_ratings.

    Called at the tail of run_price_refresh() after prices are persisted.

    Condition types
    ---------------
    * ``price_above``  – fires when current_price > threshold
    * ``price_below``  – fires when current_price < threshold
    * ``pct_change``   – fires when abs(price_change_pct) >= threshold

    Cooldown
    --------
    An alert that has already fired is suppressed for ``alert_cooldown_minutes``
    (default 15) after its last firing. Once the cooldown expires the alert can
    fire again. ``fire_count`` tracks the total number of times each alert has
    fired; ``fired_at`` records the most-recent firing timestamp.
    """
    if not tickers:
        return

    try:
        from backend.app import send_sse_event
    except ImportError:
        logger.warning("evaluate_price_alerts: could not import send_sse_event")
        send_sse_event = None  # type: ignore[assignment]

    cooldown_minutes = _get_cooldown_minutes()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    with db_session() as conn:
        # Fetch all enabled alerts for the current watchlist tickers
        placeholders = ','.join('?' * len(tickers))
        rows = conn.execute(
            f'SELECT * FROM price_alerts WHERE enabled = 1 AND ticker IN ({placeholders})',
            tickers,
        ).fetchall()

        if not rows:
            return

        # Build a lookup: ticker -> (current_price, price_change_pct)
        price_rows = conn.execute(
            f'SELECT ticker, current_price, price_change_pct, updated_at'
            f' FROM ai_ratings WHERE ticker IN ({placeholders})',
            tickers,
        ).fetchall()
        prices: dict[str, tuple[float, float]] = {}
        for pr in price_rows:
            cp = pr['current_price']
            pcp = pr['price_change_pct'] or 0.0
            if cp is not None:
                prices[pr['ticker']] = (float(cp), float(pcp))

        for alert in rows:
            ticker = alert['ticker'].strip().upper()
            if ticker not in prices:
                continue

            # Cooldown check: skip if alert fired recently.
            fired_at_str = alert['fired_at'] if 'fired_at' in alert.keys() else None
            if fired_at_str:
                try:
                    fired_at = datetime.fromisoformat(fired_at_str)
                    if fired_at.tzinfo is None:
                        fired_at = fired_at.replace(tzinfo=timezone.utc)
                    elapsed = (now - fired_at).total_seconds() / 60.0
                    if elapsed < cooldown_minutes:
                        logger.debug(
                            "Alert %d for %s suppressed: cooldown %.1f / %d min",
                            alert['id'], ticker, elapsed, cooldown_minutes,
                        )
                        continue
                except (ValueError, TypeError):
                    pass  # Unparseable fired_at — allow alert to fire

            current_price, pct_change = prices[ticker]
            condition = alert['condition_type']
            threshold = float(alert['threshold'])
            triggered = False

            if condition == 'price_above' and current_price > threshold:
                triggered = True
            elif condition == 'price_below' and current_price < threshold:
                triggered = True
            elif condition == 'pct_change' and abs(pct_change) >= threshold:
                triggered = True

            if not triggered:
                continue

            # Update fired_at and fire_count atomically.
            # We still use a conditional update to prevent duplicate fires from
            # concurrent threads: only the thread whose UPDATE affects 1 row wins.
            current_fire_count = alert['fire_count'] if 'fire_count' in alert.keys() else 0
            update_cursor = conn.execute(
                '''UPDATE price_alerts
                   SET fired_at = ?, fire_count = ?, triggered_at = ?
                   WHERE id = ? AND (fired_at IS NULL OR fired_at = ?)''',
                (now_iso, current_fire_count + 1, now_iso, alert['id'], fired_at_str),
            )
            if update_cursor.rowcount == 0:
                # Another thread already updated this alert; skip notification.
                continue

            logger.info(
                "Price alert %d triggered: %s %s %.4f (current=%.4f, fire_count=%d)",
                alert['id'], ticker, condition, threshold, current_price, current_fire_count + 1,
            )

            # Build human-readable message. Use a safe static fallback instead of
            # the raw condition value to prevent untrusted DB content from being
            # injected into notification messages sent via SSE.
            cond_labels = {
                'price_above': f"price rose above ${threshold:.2f}",
                'price_below': f"price fell below ${threshold:.2f}",
                'pct_change': f"moved {pct_change:+.2f}% (threshold \u00b1{threshold:.1f}%)",
            }
            message = f"{ticker} alert: {cond_labels.get(condition, 'condition triggered')}"

            if send_sse_event is not None:
                try:
                    send_sse_event('alert', {
                        'ticker': ticker,
                        'type': 'price_alert',
                        'message': message,
                        'severity': 'high',
                        'alert_id': alert['id'],
                        'condition_type': condition,
                        'threshold': threshold,
                        'current_price': current_price,
                        'sound_type': alert['sound_type'],
                        'fire_count': current_fire_count + 1,
                    })
                except Exception as exc:
                    logger.warning("Failed to send SSE for alert %d: %s", alert['id'], exc)