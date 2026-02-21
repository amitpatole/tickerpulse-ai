"""
TickerPulse AI v3.0 - Earnings Calendar API
Blueprint serving upcoming earnings events with watchlist highlighting.
"""

import logging
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

from backend.database import db_session

logger = logging.getLogger(__name__)

earnings_bp = Blueprint('earnings', __name__, url_prefix='/api')

_STALE_THRESHOLD_HOURS = 1


@earnings_bp.route('/earnings', methods=['GET'])
def get_earnings():
    """Return upcoming earnings events within the requested look-ahead window.

    Query Parameters:
        days (int, optional): Number of calendar days to look ahead. Default 7.

    Returns:
        JSON object::

            {
                "events": [EarningsEvent, ...],
                "stale":  bool,
                "as_of":  str   # ISO-8601 UTC timestamp of newest fetched_at
            }

        Events are sorted: watchlist tickers first, then ascending by
        ``earnings_date``.  Returns 200 with an empty list when no events fall
        in the window — never 404 or 500 for missing data.
    """
    try:
        days = int(request.args.get('days', 7))
        if days < 1:
            days = 1
        elif days > 90:
            days = 90
    except (TypeError, ValueError):
        days = 7

    today = datetime.now(timezone.utc).date()
    end_date = today + timedelta(days=days)
    today_str = today.isoformat()
    end_str = end_date.isoformat()

    with db_session() as conn:
        rows = conn.execute(
            """
            SELECT
                e.id,
                e.ticker,
                e.company,
                e.earnings_date,
                e.time_of_day,
                e.eps_estimate,
                e.fiscal_quarter,
                e.fetched_at,
                CASE WHEN ws.ticker IS NOT NULL THEN 1 ELSE 0 END AS on_watchlist
            FROM earnings_events e
            LEFT JOIN watchlist_stocks ws ON ws.ticker = e.ticker
            WHERE e.earnings_date >= ? AND e.earnings_date <= ?
            ORDER BY on_watchlist DESC, e.earnings_date ASC
            """,
            (today_str, end_str),
        ).fetchall()

        # Determine freshness from the newest fetched_at across all events
        freshness_row = conn.execute(
            "SELECT MAX(fetched_at) AS newest FROM earnings_events"
        ).fetchone()

    events = []
    for row in rows:
        events.append({
            'id': row['id'],
            'ticker': row['ticker'],
            'company': row['company'],
            'earnings_date': row['earnings_date'],
            'time_of_day': row['time_of_day'],
            'eps_estimate': row['eps_estimate'],
            'fiscal_quarter': row['fiscal_quarter'],
            'fetched_at': row['fetched_at'],
            'on_watchlist': bool(row['on_watchlist']),
        })

    newest_fetched_at = freshness_row['newest'] if freshness_row else None
    stale = _is_stale(newest_fetched_at)

    return jsonify({
        'events': events,
        'stale': stale,
        'as_of': newest_fetched_at or '',
    })


def _is_stale(fetched_at_str: str | None) -> bool:
    """Return True if ``fetched_at`` is older than the stale threshold (or absent)."""
    if not fetched_at_str:
        return True
    try:
        # SQLite stores timestamps without timezone; treat as UTC
        fetched_at = datetime.fromisoformat(fetched_at_str.replace('Z', '+00:00'))
        if fetched_at.tzinfo is None:
            fetched_at = fetched_at.replace(tzinfo=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - fetched_at).total_seconds() / 3600
        return age_hours > _STALE_THRESHOLD_HOURS
    except (ValueError, OverflowError):
        return True
