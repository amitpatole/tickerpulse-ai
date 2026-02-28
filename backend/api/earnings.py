```python
"""
TickerPulse AI v3.0 - Earnings Calendar API
Blueprint serving upcoming and past earnings events with watchlist filtering.
"""

import logging
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

from backend.database import db_session

logger = logging.getLogger(__name__)

earnings_bp = Blueprint('earnings', __name__, url_prefix='/api')

_STALE_THRESHOLD_HOURS = 1


def _compute_surprise_pct(eps_actual, eps_estimate):
    """Compute EPS surprise percentage. Returns None when inputs are missing or estimate is 0."""
    if eps_actual is None or eps_estimate is None:
        return None
    try:
        if abs(float(eps_estimate)) < 1e-9:
            return None
        return round(((float(eps_actual) - float(eps_estimate)) / abs(float(eps_estimate))) * 100, 2)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _row_to_dict(row):
    return {
        'id': row['id'],
        'ticker': row['ticker'],
        'company': row['company'],
        'earnings_date': row['earnings_date'],
        'time_of_day': row['time_of_day'],
        'eps_estimate': row['eps_estimate'],
        'eps_actual': row['eps_actual'],
        'revenue_estimate': row['revenue_estimate'],
        'revenue_actual': row['revenue_actual'],
        'fiscal_quarter': row['fiscal_quarter'],
        'fetched_at': row['fetched_at'],
        'updated_at': row['updated_at'],
        'on_watchlist': bool(row['on_watchlist']),
        'surprise_pct': _compute_surprise_pct(row['eps_actual'], row['eps_estimate']),
    }


@earnings_bp.route('/earnings', methods=['GET'])
def get_earnings():
    """Return upcoming and past earnings events split at today's date.

    Query parameters:
      days         (int, 1-90, default 30): Look-ahead and look-back window.
      watchlist_id (int, optional): Scope results to tickers in this watchlist.
      ticker       (str, optional): Filter to a single ticker symbol.
    """
    try:
        days = int(request.args.get('days', 30))
        days = max(1, min(90, days))
    except (TypeError, ValueError):
        days = 30

    watchlist_id = request.args.get('watchlist_id', type=int)

    raw_ticker = request.args.get('ticker', '').strip().upper()
    ticker_filter = raw_ticker if raw_ticker else None

    today = datetime.now(timezone.utc).date()
    today_str = today.isoformat()
    start_str = (today - timedelta(days=days)).isoformat()
    end_str = (today + timedelta(days=days)).isoformat()

    where_parts = ["e.earnings_date >= :start", "e.earnings_date <= :end"]
    bind: dict = {"start": start_str, "end": end_str}

    if ticker_filter:
        where_parts.append("e.ticker = :ticker")
        bind["ticker"] = ticker_filter

    if watchlist_id:
        where_parts.append(
            "e.ticker IN (SELECT ticker FROM watchlist_stocks WHERE watchlist_id = :wl_id)"
        )
        bind["wl_id"] = watchlist_id

    if watchlist_id:
        on_wl_expr = (
            "(SELECT COUNT(*) FROM watchlist_stocks "
            "WHERE ticker = e.ticker AND watchlist_id = :wl_id) > 0"
        )
    else:
        on_wl_expr = (
            "(SELECT COUNT(*) FROM watchlist_stocks WHERE ticker = e.ticker) > 0"
        )

    query = f"""
        SELECT
            e.id, e.ticker, e.company, e.earnings_date, e.time_of_day,
            e.eps_estimate, e.eps_actual, e.revenue_estimate, e.revenue_actual,
            e.fiscal_quarter, e.fetched_at, e.updated_at,
            ({on_wl_expr}) AS on_watchlist
        FROM earnings_events e
        WHERE {' AND '.join(where_parts)}
        ORDER BY e.earnings_date ASC
    """

    with db_session() as conn:
        rows = conn.execute(query, bind).fetchall()
        freshness_row = conn.execute(
            "SELECT MAX(fetched_at) AS newest FROM earnings_events"
        ).fetchone()

    upcoming = []
    past = []
    for row in rows:
        event = _row_to_dict(row)
        if row['earnings_date'] >= today_str:
            upcoming.append(event)
        else:
            past.append(event)

    past.sort(key=lambda e: e['earnings_date'], reverse=True)

    newest_fetched_at = freshness_row['newest'] if freshness_row else None
    stale = _is_stale(newest_fetched_at)

    return jsonify({
        'upcoming': upcoming,
        'past': past,
        'stale': stale,
        'as_of': newest_fetched_at or '',
    })


@earnings_bp.route('/earnings/<ticker>', methods=['GET'])
def get_ticker_earnings(ticker: str):
    """Return all earnings events for a specific ticker, sorted by date descending."""
    ticker = ticker.upper()

    with db_session() as conn:
        stock_row = conn.execute(
            "SELECT ticker FROM stocks WHERE ticker = ?", (ticker,)
        ).fetchone()

        rows = conn.execute(
            """
            SELECT
                e.id, e.ticker, e.company, e.earnings_date, e.time_of_day,
                e.eps_estimate, e.eps_actual, e.revenue_estimate, e.revenue_actual,
                e.fiscal_quarter, e.fetched_at, e.updated_at,
                0 AS on_watchlist
            FROM earnings_events e
            WHERE e.ticker = ?
            ORDER BY e.earnings_date DESC
            """,
            (ticker,),
        ).fetchall()

    if stock_row is None and not rows:
        return jsonify({'error': f'Ticker {ticker} not found'}), 404

    events = [_row_to_dict(row) for row in rows]
    return jsonify({'ticker': ticker, 'events': events})


@earnings_bp.route('/earnings/sync', methods=['POST'])
def sync_earnings():
    """Manually trigger an earnings calendar sync from Yahoo Finance."""
    try:
        from backend.jobs.earnings_sync import run_earnings_sync
        run_earnings_sync()
        return jsonify({
            'message': 'Earnings sync completed',
            'synced_at': datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:
        logger.error("Manual earnings sync failed: %s", exc)
        return jsonify({'error': str(exc)}), 500


def _is_stale(fetched_at_str: str | None) -> bool:
    """Return True if ``fetched_at`` is older than the stale threshold (or absent)."""
    if not fetched_at_str:
        return True
    try:
        fetched_at = datetime.fromisoformat(fetched_at_str.replace('Z', '+00:00'))
        if fetched_at.tzinfo is None:
            fetched_at = fetched_at.replace(tzinfo=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - fetched_at).total_seconds() / 3600
        return age_hours > _STALE_THRESHOLD_HOURS
    except (ValueError, OverflowError):
        return True
```