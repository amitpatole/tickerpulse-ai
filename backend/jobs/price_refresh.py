"""
TickerPulse AI v3.0 - Price Refresh Job
Periodic APScheduler job that fetches live prices for the active watchlist,
persists price columns to ai_ratings, and broadcasts via both WebSocket and SSE.

Key invariant: only current_price, price_change, price_change_pct are updated.
AI fields (rating, score, confidence, rsi, etc.) are never touched.
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_refresh_interval_from_db() -> int:
    """Read price_refresh_interval from the settings table.

    Returns the stored interval in seconds, or the config default on error.
    Returns 0 when manual mode is explicitly stored.
    """
    from backend.config import Config
    from backend.database import pooled_session
    try:
        with pooled_session() as conn:
            row = conn.execute(
                "SELECT value FROM settings WHERE key = 'price_refresh_interval'"
            ).fetchone()
        if row is not None:
            return int(row['value'])
    except Exception as exc:
        logger.warning("price_refresh: could not read interval from DB: %s", exc)
    return Config.PRICE_REFRESH_INTERVAL_SECONDS


def _fetch_price(ticker: str) -> Optional[dict]:
    """Fetch the current price for *ticker* from Yahoo Finance.

    Returns a dict with keys: price, change, change_pct, volume, ts.
    Returns None when the fetch fails or the symbol yields no data.

    This function is also imported by app.py for manual WS refresh requests,
    so the return contract must stay stable.
    """
    try:
        import yfinance as yf
        info = yf.Ticker(ticker).fast_info

        price = getattr(info, 'last_price', None)
        if price is None:
            return None

        prev_close = getattr(info, 'previous_close', None)
        volume = getattr(info, 'last_volume', None)

        change = float(price - prev_close) if prev_close else 0.0
        change_pct = (change / prev_close * 100.0) if prev_close else 0.0

        return {
            'price': float(price),
            'change': change,
            'change_pct': change_pct,
            'volume': int(volume) if volume is not None else 0,
            'ts': int(time.time()),
        }
    except Exception as exc:
        logger.debug("price_refresh: fetch failed for %s: %s", ticker, exc)
        return None


def _fetch_prices_parallel(tickers: list, max_workers: int = 0) -> dict:
    """Fetch prices for all tickers in parallel using ThreadPoolExecutor.

    Each ticker is fetched independently via ``_fetch_price()``.  Partial
    failures (individual tickers raising or returning None) are silently
    omitted — mirroring the behaviour of the per-ticker sequential loop it
    replaces.

    Parameters
    ----------
    tickers:     List of ticker symbols to fetch.
    max_workers: Thread pool size.  Defaults to ``Config.PRICE_REFRESH_WORKERS``
                 when 0 (the default).

    Returns a ``{ticker: {price, change, change_pct, volume, ts}}`` dict.
    """
    if not tickers:
        return {}

    from backend.config import Config
    workers = max_workers or Config.PRICE_REFRESH_WORKERS

    results: dict = {}
    with ThreadPoolExecutor(max_workers=min(workers, len(tickers))) as executor:
        future_to_ticker = {executor.submit(_fetch_price, t): t for t in tickers}
        for future in as_completed(future_to_ticker):
            ticker = future_to_ticker[future]
            try:
                data = future.result()
                if data is not None:
                    results[ticker] = data
            except Exception as exc:
                logger.debug(
                    "price_refresh: parallel fetch exception for %s: %s", ticker, exc
                )

    return results


def _fetch_prices_batch(tickers: list) -> dict:
    """Fetch prices for all tickers in a single ``yf.download()`` call.

    Replaces the per-ticker ``_fetch_price()`` loop in the scheduled job,
    cutting N HTTP round-trips to Yahoo Finance down to one.

    Returns a ``{ticker: {price, change, change_pct, volume, ts}}`` dict.
    Tickers for which data cannot be parsed are silently omitted (partial
    success is acceptable, mirroring the old per-ticker behaviour).
    """
    import yfinance as yf

    try:
        df = yf.download(
            tickers,
            period="2d",
            group_by="ticker",
            auto_adjust=True,
            progress=False,
            threads=True,
        )
    except Exception as exc:
        logger.warning("price_refresh: yf.download batch call failed: %s", exc)
        return {}

    if df is None or df.empty:
        logger.warning("price_refresh: yf.download returned empty DataFrame")
        return {}

    now_ts = int(time.time())
    prices: dict = {}

    for ticker in tickers:
        try:
            # Multi-ticker download with group_by='ticker' produces MultiIndex
            # columns (ticker, field).  Single-ticker download yields flat columns.
            if hasattr(df.columns, 'levels') and ticker in df.columns.get_level_values(0):
                ticker_df = df[ticker]
                close_series = ticker_df['Close'].dropna()
                vol_series = ticker_df.get('Volume')
            elif 'Close' in df.columns:
                # Flat columns — single-ticker path
                close_series = df['Close'].dropna()
                vol_series = df.get('Volume')
            else:
                logger.debug("price_refresh: no data column found for %s", ticker)
                continue

            if close_series.empty:
                logger.debug("price_refresh: empty close series for %s", ticker)
                continue

            current = float(close_series.iloc[-1])
            prev = float(close_series.iloc[-2]) if len(close_series) >= 2 else current

            volume = 0
            if vol_series is not None:
                vol_clean = vol_series.dropna()
                if not vol_clean.empty:
                    volume = int(vol_clean.iloc[-1])

            change = current - prev
            change_pct = (change / prev * 100.0) if prev else 0.0

            prices[ticker] = {
                'price': current,
                'change': change,
                'change_pct': change_pct,
                'volume': volume,
                'ts': now_ts,
            }
        except Exception as exc:
            logger.debug("price_refresh: batch parse error for %s: %s", ticker, exc)

    return prices


def _get_watchlist_tickers() -> list:
    """Return all active tickers from the stocks table."""
    from backend.database import pooled_session
    try:
        with pooled_session() as conn:
            rows = conn.execute(
                "SELECT ticker FROM stocks WHERE active = 1"
            ).fetchall()
        return [row['ticker'] for row in rows]
    except Exception as exc:
        logger.error("price_refresh: could not load watchlist tickers: %s", exc)
        return []


def _persist_prices(prices: dict) -> None:
    """Write price fields to ai_ratings for each ticker in *prices*.

    Only updates current_price, price_change, price_change_pct, and updated_at.
    Does NOT touch rating, score, confidence, or any AI analysis field.
    Uses batch_upsert to INSERT-or-UPDATE all tickers in a single executemany
    call, cutting 2*N round-trips down to 1.
    """
    if not prices:
        return
    from backend.database import pooled_session, batch_upsert
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        rows = [
            {
                'ticker': ticker,
                'rating': 'hold',
                'score': 0,
                'confidence': 0,
                'current_price': data['price'],
                'price_change': data['change'],
                'price_change_pct': data['change_pct'],
                'updated_at': now_iso,
            }
            for ticker, data in prices.items()
        ]
        with pooled_session() as conn:
            batch_upsert(
                conn, 'ai_ratings', rows,
                conflict_cols=['ticker'],
                update_cols=['current_price', 'price_change', 'price_change_pct', 'updated_at'],
            )
    except Exception as exc:
        logger.error("price_refresh: DB persist error: %s", exc)


def _broadcast_sse(prices: dict) -> None:
    """Emit a price_update SSE event per ticker to all connected SSE clients."""
    try:
        from backend.app import send_sse_event
    except ImportError:
        logger.debug("price_refresh: send_sse_event not available, skipping SSE broadcast")
        return

    timestamp = datetime.now(timezone.utc).isoformat()
    for ticker, data in prices.items():
        send_sse_event('price_update', {
            'ticker': ticker,
            'price': data['price'],
            'change': data['change'],
            'change_pct': data['change_pct'],
            'volume': data['volume'],
            'timestamp': timestamp,
        })


# ---------------------------------------------------------------------------
# Scheduler entry point
# ---------------------------------------------------------------------------

def run_price_refresh() -> None:
    """APScheduler entry point for the periodic price refresh job.

    Execution flow
    --------------
    1. Read interval from DB; skip if manual mode (interval == 0).
    2. Load all active watchlist tickers.
    3. Fetch live prices for all tickers in a single batch yf.download() call.
    4. Persist price columns to ai_ratings (AI fields unchanged).
    5. Broadcast via WebSocket (price_batch per subscribed client).
    6. Broadcast via SSE (price_update event per ticker).
    7. Evaluate enabled price alerts against the persisted prices.
    """
    from backend.config import Config

    # 1. Check manual mode
    interval = _get_refresh_interval_from_db()
    if interval == 0:
        logger.debug("price_refresh: skipping — manual mode (interval=0)")
        return

    # 2. Load tickers
    tickers = _get_watchlist_tickers()
    if not tickers:
        logger.debug("price_refresh: skipping — empty watchlist")
        return

    logger.info("price_refresh: fetching prices for %d tickers", len(tickers))

    # 3. Fetch prices in a single batch call (cuts N round-trips to one yf.download() call)
    prices = _fetch_prices_batch(tickers)

    if not prices:
        logger.warning("price_refresh: no price data returned for any ticker")
        return

    logger.info("price_refresh: fetched %d/%d tickers", len(prices), len(tickers))

    # 4. Persist price columns (AI fields untouched)
    _persist_prices(prices)

    # 5. WebSocket broadcast (price_batch per subscribed client)
    if Config.WS_PRICE_BROADCAST:
        try:
            from backend.core.ws_manager import ws_manager
            ws_count = ws_manager.broadcast_prices(prices)
            if ws_count > 0:
                logger.debug("price_refresh: WS price_batch sent to %d clients", ws_count)
        except Exception as exc:
            logger.error("price_refresh: WS broadcast error: %s", exc)

    # 6. SSE broadcast (price_update per ticker)
    _broadcast_sse(prices)

    # 7. Evaluate price alerts against freshly persisted prices
    try:
        from backend.core.alert_manager import evaluate_price_alerts
        evaluate_price_alerts(list(prices.keys()))
    except ImportError:
        logger.debug("price_refresh: alert_manager not available, skipping alert eval")
    except Exception as exc:
        logger.error("price_refresh: alert evaluation error: %s", exc)