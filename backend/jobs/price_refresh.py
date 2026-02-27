"""
TickerPulse AI v3.0 - Price Refresh Job
Fetches live prices for all active tickers and pushes ``price_update`` SSE events.
The refresh interval is configurable via GET/PUT /api/settings/refresh-interval.
When interval is 0 (manual mode) this job is a no-op.
"""

import logging
import sqlite3
import time
from datetime import datetime, timezone
from typing import Optional

from backend.config import Config
from backend.jobs._helpers import _get_watchlist, _send_sse

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Settings helpers
# ---------------------------------------------------------------------------

def _get_refresh_interval() -> int:
    """Return the configured refresh interval in seconds from app_settings.

    Falls back to Config.PRICE_REFRESH_INTERVAL_SECONDS if not set.
    Returns 0 when manual mode is selected (job should not fire).
    """
    try:
        conn = sqlite3.connect(Config.DB_PATH)
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT value FROM settings WHERE key = 'price_refresh_interval'"
        ).fetchone()
        conn.close()
        if row:
            return int(row['value'])
    except Exception as exc:
        logger.debug("Could not read price_refresh_interval from DB: %s", exc)
    return Config.PRICE_REFRESH_INTERVAL_SECONDS


# ---------------------------------------------------------------------------
# Price fetching
# ---------------------------------------------------------------------------

def _fetch_price_yfinance(ticker: str) -> Optional[dict]:
    """Fetch current price data for a single ticker via yfinance.

    Returns a dict with price, change, change_pct or None on failure.
    """
    try:
        import yfinance as yf  # type: ignore
        stock = yf.Ticker(ticker)
        info = stock.fast_info
        price = getattr(info, 'last_price', None)
        prev_close = getattr(info, 'previous_close', None)
        if price is None:
            return None
        change = (price - prev_close) if prev_close else 0.0
        change_pct = (change / prev_close * 100) if prev_close else 0.0
        volume = int(getattr(info, 'last_volume', 0) or 0)
        return {
            'price': round(float(price), 4),
            'change': round(float(change), 4),
            'change_pct': round(float(change_pct), 4),
            'volume': volume,
        }
    except Exception as exc:
        logger.debug("yfinance price fetch failed for %s: %s", ticker, exc)
        return None


def _fetch_price_finnhub(ticker: str) -> Optional[dict]:
    """Fetch current price data for a single ticker via Finnhub REST API.

    Only used when a Finnhub API key is configured.
    Returns a dict with price, change, change_pct or None on failure.
    """
    api_key = Config.FINNHUB_API_KEY
    if not api_key:
        return None
    try:
        import urllib.request
        import json as _json
        url = (
            f"https://finnhub.io/api/v1/quote"
            f"?symbol={ticker}&token={api_key}"
        )
        with urllib.request.urlopen(url, timeout=5) as resp:  # noqa: S310
            data = _json.loads(resp.read())
        price = data.get('c')
        prev_close = data.get('pc')
        change = data.get('d', 0.0)
        change_pct = data.get('dp', 0.0)
        if price is None or price == 0:
            return None
        return {
            'price': round(float(price), 4),
            'change': round(float(change or 0), 4),
            'change_pct': round(float(change_pct or 0), 4),
            'volume': 0,  # Finnhub /quote endpoint does not include volume
        }
    except Exception as exc:
        logger.debug("Finnhub price fetch failed for %s: %s", ticker, exc)
        return None


def _fetch_price(ticker: str) -> Optional[dict]:
    """Try Finnhub first (if key configured), then fall back to yfinance."""
    result = _fetch_price_finnhub(ticker) if Config.FINNHUB_API_KEY else None
    if result is None:
        result = _fetch_price_yfinance(ticker)
    return result


# ---------------------------------------------------------------------------
# Main job function
# ---------------------------------------------------------------------------

def run_price_refresh() -> None:
    """Fetch live prices for all active tickers and push SSE price_update events.

    This function is designed to be called by APScheduler at a configurable
    interval. When the interval is 0 (manual mode) it exits immediately.

    In addition to broadcasting SSE events, each fetched price is persisted
    back to the ``ai_ratings`` table so that a fresh page load shows the
    most-recent live price rather than the stale value from the last AI run.
    """
    interval = _get_refresh_interval()
    if interval == 0:
        logger.debug("Price refresh is in manual mode -- skipping run")
        return

    watchlist = _get_watchlist()
    if not watchlist:
        logger.debug("Price refresh: watchlist is empty -- nothing to do")
        return

    timestamp = datetime.now(timezone.utc).isoformat()
    fetched = 0
    failed = 0

    # Open one DB connection for all ai_ratings persistence writes this cycle.
    # A failure to open the connection is non-fatal: SSE events still fire.
    db_conn: Optional[sqlite3.Connection] = None
    try:
        db_conn = sqlite3.connect(Config.DB_PATH)
    except Exception as exc:
        logger.warning("Price refresh: could not open DB connection for persistence: %s", exc)

    try:
        for stock in watchlist:
            ticker = stock['ticker']
            price_data = _fetch_price(ticker)
            if price_data is None:
                failed += 1
                logger.debug("No price data for %s", ticker)
                continue

            _send_sse('price_update', {
                'ticker': ticker,
                'price': price_data['price'],
                'change': price_data['change'],
                'change_pct': price_data['change_pct'],
                'volume': price_data.get('volume', 0),
                'timestamp': timestamp,
            })

            # Persist live price to ai_ratings so page reload hydration is current.
            if db_conn is not None:
                try:
                    db_conn.execute(
                        """UPDATE ai_ratings
                           SET current_price    = ?,
                               price_change     = ?,
                               price_change_pct = ?,
                               updated_at       = ?
                           WHERE ticker = ?""",
                        (
                            price_data['price'],
                            price_data['change'],
                            price_data['change_pct'],
                            timestamp,
                            ticker,
                        ),
                    )
                except Exception as exc:
                    logger.debug("Failed to persist price for %s to ai_ratings: %s", ticker, exc)

            fetched += 1

        if db_conn is not None:
            try:
                db_conn.commit()
            except Exception as exc:
                logger.debug("Price refresh: DB commit error: %s", exc)

    finally:
        if db_conn is not None:
            try:
                db_conn.close()
            except Exception:
                pass

    if fetched > 0 or failed > 0:
        logger.debug(
            "Price refresh complete: %d fetched, %d failed", fetched, failed
        )