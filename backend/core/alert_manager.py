"""
TickerPulse AI v3.0 - Price Alert Manager
CRUD operations and evaluation logic for user-defined price alerts.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from backend.database import db_session

logger = logging.getLogger(__name__)

# Price data older than this is considered too stale to fire an alert.
_AI_RATINGS_TTL_SECONDS = 1800  # 30 minutes


# ---------------------------------------------------------------------------
# CRUD helpers
# ---------------------------------------------------------------------------

def _row_to_dict(row) -> dict:
    """Convert a sqlite3.Row to a plain dict with bool-typed enabled."""
    d = dict(row)
    d['enabled'] = bool(d['enabled'])
    return d


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
    """
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


def update_alert_sound_type(alert_id: int, sound_type: str) -> Optional[dict]:
    """Update the sound_type of a price alert.

    Returns
    -------
    dict or None
        Updated alert row, or None if the ID was not found.
    """
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

    When re-enabling an alert, ``notification_sent`` is reset to 0 so the
    alert can fire a desktop notification again if its condition is met.

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
            # Re-enabling: clear notification_sent so the alert can fire again.
            conn.execute(
                'UPDATE price_alerts SET enabled = 1, notification_sent = 0 WHERE id = ?',
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


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def evaluate_price_alerts(tickers: list[str]) -> None:
    """Check enabled alerts against the latest prices in ai_ratings.

    Called at the tail of run_technical_monitor() after the scanner run.

    Condition types
    ---------------
    * ``price_above``  – fires when current_price > threshold
    * ``price_below``  – fires when current_price < threshold
    * ``pct_change``   – fires when abs(price_change_pct) >= threshold

    When a condition is met the alert is stamped with ``triggered_at`` and
    disabled (``enabled = 0``) atomically so it cannot fire again.
    """
    if not tickers:
        return

    try:
        from backend.app import send_sse_event
    except ImportError:
        logger.warning("evaluate_price_alerts: could not import send_sse_event")
        send_sse_event = None  # type: ignore[assignment]

    with db_session() as conn:
        # Fetch all enabled alerts for the current watchlist tickers
        placeholders = ','.join('?' * len(tickers))
        rows = conn.execute(
            f'SELECT * FROM price_alerts WHERE enabled = 1 AND ticker IN ({placeholders})',
            tickers,
        ).fetchall()

        if not rows:
            return

        # Build a lookup: ticker -> (current_price, price_change_pct, cached_at)
        price_rows = conn.execute(
            f'SELECT ticker, current_price, price_change_pct, updated_at'
            f' FROM ai_ratings WHERE ticker IN ({placeholders})',
            tickers,
        ).fetchall()
        prices: dict[str, tuple[float, float, str]] = {}
        for pr in price_rows:
            cp = pr['current_price']
            pcp = pr['price_change_pct'] or 0.0
            if cp is not None:
                prices[pr['ticker']] = (float(cp), float(pcp), pr['updated_at'] or '')

        now = datetime.now(timezone.utc).isoformat()

        for alert in rows:
            ticker = alert['ticker']
            if ticker not in prices:
                continue

            current_price, pct_change, _cached_at = prices[ticker]
            condition = alert['condition_type']
            ticker = alert['ticker'].strip().upper()
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

            # Atomically disable + stamp; AND enabled = 1 ensures exactly one
            # concurrent thread wins the write (rowcount = 1) while all others
            # get rowcount = 0 and skip the SSE notification.
            update_cursor = conn.execute(
                'UPDATE price_alerts SET enabled = 0, triggered_at = ? WHERE id = ? AND enabled = 1',
                (now, alert['id']),
            )
            if update_cursor.rowcount == 0:
                # Another thread already claimed this alert; skip notification.
                continue

            logger.info(
                "Price alert %d triggered: %s %s %.4f (current=%.4f)",
                alert['id'], ticker, condition, threshold, current_price,
            )

            # Build human-readable message
            cond_labels = {
                'price_above': f"price rose above ${threshold:.2f}",
                'price_below': f"price fell below ${threshold:.2f}",
                'pct_change': f"moved {pct_change:+.2f}% (threshold ±{threshold:.1f}%)",
            }
            message = f"{ticker} alert: {cond_labels.get(condition, condition)}"

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
                    })
                except Exception as exc:
                    logger.warning("Failed to send SSE for alert %d: %s", alert['id'], exc)
