"""
YFinance Data Provider for TickerPulse AI v3.0

Default (free) provider using Yahoo Finance data.
Uses the requests library to hit Yahoo's v8 chart API directly (matching the
existing pattern in ai_analytics.py) and falls back to the yfinance library
when the direct API call fails.

No API key required.
"""

import logging
import time
from datetime import datetime, timezone
from typing import List, Optional

import requests

from .base import (
    DataProvider,
    PriceBar,
    PriceHistory,
    ProviderInfo,
    Quote,
    TickerResult,
)

logger = logging.getLogger(__name__)

# Period-to-interval mapping used by both the direct API and the yfinance lib
_INTERVAL_MAP = {
    '1d': '5m',
    '5d': '15m',
    '1mo': '1d',
    '3mo': '1d',
    '6mo': '1d',
    '1y': '1wk',
    '2y': '1wk',
    '5y': '1mo',
}


class YFinanceProvider(DataProvider):
    """Yahoo Finance data provider (free, no API key needed)."""

    def __init__(self, api_key: str = ''):
        super().__init__(api_key)
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        self._base_url = 'https://query2.finance.yahoo.com'

    # ------------------------------------------------------------------
    # Resource management
    # ------------------------------------------------------------------

    def close(self):
        """Close the underlying HTTP session."""
        self.session.close()

    def __del__(self):
        self.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False

    # ------------------------------------------------------------------
    # Provider metadata
    # ------------------------------------------------------------------

    def get_provider_info(self) -> ProviderInfo:
        return ProviderInfo(
            name='yfinance',
            display_name='Yahoo Finance',
            tier='free',
            requires_key=False,
            supported_markets=['US', 'IN', 'UK', 'EU', 'JP', 'HK', 'AU', 'CA'],
            has_realtime=False,
            rate_limit_per_minute=120,
            description='Free delayed quotes via Yahoo Finance. Supports global markets. '
                        'No API key required. Data may be delayed 15-20 minutes.',
        )

    # ------------------------------------------------------------------
    # Direct Yahoo v8 chart API helpers (matches ai_analytics.py)
    # ------------------------------------------------------------------

    def _fetch_chart_v8(self, ticker: str, range_: str = '1mo',
                        interval: str = '1d') -> Optional[dict]:
        """Hit the Yahoo v8 chart endpoint directly (same as ai_analytics.py)."""
        url = f'{self._base_url}/v8/finance/chart/{ticker}'
        params = {
            'range': range_,
            'interval': interval,
            'indicators': 'quote',
            'includeTimestamps': 'true',
        }
        try:
            resp = self.session.get(url, params=params, timeout=10)
            self._request_count += 1
            self._last_request_time = datetime.now(timezone.utc)
            self._track_request()
            if resp.status_code == 200:
                data = resp.json()
                result = data.get('chart', {}).get('result', [None])[0]
                return result
        except Exception as e:
            logger.debug(f"YFinance v8 API error for {ticker}: {e}")
        return None

    # ------------------------------------------------------------------
    # yfinance library fallback helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _yf_available() -> bool:
        """Check whether the yfinance library is importable."""
        try:
            import yfinance  # noqa: F401
            return True
        except ImportError:
            return False

    def _fetch_via_yfinance(self, ticker: str, period: str = '1mo',
                            interval: str = '1d') -> Optional[dict]:
        """Fetch data through the yfinance library (fallback)."""
        try:
            import yfinance as yf
            tk = yf.Ticker(ticker)
            hist = tk.history(period=period, interval=interval)
            if hist.empty:
                return None
            return {
                'timestamps': [int(ts.timestamp()) for ts in hist.index],
                'open': hist['Open'].tolist(),
                'high': hist['High'].tolist(),
                'low': hist['Low'].tolist(),
                'close': hist['Close'].tolist(),
                'volume': hist['Volume'].tolist(),
            }
        except Exception as e:
            logger.debug(f"yfinance library fallback error for {ticker}: {e}")
            return None

    # ------------------------------------------------------------------
    # DataProvider interface
    # ------------------------------------------------------------------

    def get_quote(self, ticker: str) -> Optional[Quote]:
        """Return the latest quote for *ticker*.

        Tries the v8 chart API with a 1-day range first, then falls back to
        the yfinance library.
        """
        # --- attempt 1: direct v8 API ---
        result = self._fetch_chart_v8(ticker, range_='1d', interval='5m')
        if result:
            try:
                meta = result.get('meta', {})
                quote_data = result.get('indicators', {}).get('quote', [{}])[0]
                timestamps = result.get('timestamp', [])

                # Walk backwards from the most recent bar to find a non-None close
                closes = quote_data.get('close', [])
                opens = quote_data.get('open', [])
                highs = quote_data.get('high', [])
                lows = quote_data.get('low', [])
                volumes = quote_data.get('volume', [])

                idx = len(closes) - 1
                while idx >= 0 and closes[idx] is None:
                    idx -= 1

                if idx >= 0:
                    price = closes[idx]
                    prev_close = meta.get('chartPreviousClose', meta.get('previousClose', price))
                    change = price - prev_close if prev_close else 0.0
                    change_pct = (change / prev_close * 100) if prev_close else 0.0

                    # Determine currency from ticker suffix
                    currency = meta.get('currency', 'USD')

                    return Quote(
                        ticker=ticker,
                        price=price,
                        open=opens[idx] if opens[idx] is not None else price,
                        high=highs[idx] if highs[idx] is not None else price,
                        low=lows[idx] if lows[idx] is not None else price,
                        volume=int(volumes[idx] or 0),
                        # Yahoo Finance returns Unix timestamps in UTC; use timezone.utc
                        # so the datetime is locale-independent across all server timezones.
                        timestamp=datetime.fromtimestamp(timestamps[idx], tz=timezone.utc)
                                  if timestamps else datetime.now(timezone.utc),
                        currency=currency,
                        change=round(change, 4),
                        change_percent=round(change_pct, 4),
                        source='yfinance',
                    )
            except Exception as e:
                logger.debug(f"Error parsing v8 quote for {ticker}: {e}")

        # --- attempt 2: yfinance library ---
        if self._yf_available():
            try:
                import yfinance as yf
                tk = yf.Ticker(ticker)
                info = tk.fast_info
                price = getattr(info, 'last_price', None)
                if price is None:
                    hist = tk.history(period='1d')
                    if hist.empty:
                        return None
                    price = hist['Close'].iloc[-1]
                    open_ = hist['Open'].iloc[-1]
                    high_ = hist['High'].iloc[-1]
                    low_ = hist['Low'].iloc[-1]
                    vol = int(hist['Volume'].iloc[-1])
                else:
                    open_ = getattr(info, 'open', price)
                    high_ = getattr(info, 'day_high', price)
                    low_ = getattr(info, 'day_low', price)
                    vol = int(getattr(info, 'last_volume', 0) or 0)

                prev = getattr(info, 'previous_close', price)
                change = price - prev if prev else 0.0
                change_pct = (change / prev * 100) if prev else 0.0
                currency = getattr(info, 'currency', 'USD') or 'USD'

                return Quote(
                    ticker=ticker,
                    price=float(price),
                    open=float(open_),
                    high=float(high_),
                    low=float(low_),
                    volume=vol,
                    timestamp=datetime.now(timezone.utc),
                    currency=currency,
                    change=round(change, 4),
                    change_percent=round(change_pct, 4),
                    source='yfinance',
                )
            except Exception as e:
                logger.warning(f"yfinance library quote failed for {ticker}: {e}")

        return None

    def get_historical(self, ticker: str, period: str = '1mo') -> Optional[PriceHistory]:
        """Return historical OHLCV data for *ticker*.

        Mirrors the data format that ``ai_analytics.py`` ``get_stock_price_data()``
        produces so existing analytics continue to work.
        """
        interval = _INTERVAL_MAP.get(period, '1d')

        # --- attempt 1: direct v8 API (matches ai_analytics.py) ---
        result = self._fetch_chart_v8(ticker, range_=period, interval=interval)
        if result:
            try:
                quote_data = result.get('indicators', {}).get('quote', [{}])[0]
                timestamps = result.get('timestamp', [])
                opens = quote_data.get('open', [])
                highs = quote_data.get('high', [])
                lows = quote_data.get('low', [])
                closes = quote_data.get('close', [])
                volumes = quote_data.get('volume', [])

                bars = []
                for i in range(len(timestamps)):
                    # Skip bars where close is None (trading halt, missing data)
                    if closes[i] is None:
                        continue
                    bars.append(PriceBar(
                        timestamp=timestamps[i],
                        open=opens[i] if opens[i] is not None else closes[i],
                        high=highs[i] if highs[i] is not None else closes[i],
                        low=lows[i] if lows[i] is not None else closes[i],
                        close=closes[i],
                        volume=int(volumes[i] or 0),
                    ))

                if bars:
                    return PriceHistory(
                        ticker=ticker,
                        bars=bars,
                        period=period,
                        source='yfinance',
                    )
            except Exception as e:
                logger.debug(f"Error parsing v8 history for {ticker}: {e}")

        # --- attempt 2: yfinance library ---
        if self._yf_available():
            data = self._fetch_via_yfinance(ticker, period=period, interval=interval)
            if data and data.get('timestamps'):
                bars = []
                for i in range(len(data['timestamps'])):
                    c = data['close'][i]
                    if c is None:
                        continue
                    bars.append(PriceBar(
                        timestamp=data['timestamps'][i],
                        open=data['open'][i] if data['open'][i] is not None else c,
                        high=data['high'][i] if data['high'][i] is not None else c,
                        low=data['low'][i] if data['low'][i] is not None else c,
                        close=c,
                        volume=int(data['volume'][i] or 0),
                    ))
                if bars:
                    return PriceHistory(
                        ticker=ticker,
                        bars=bars,
                        period=period,
                        source='yfinance',
                    )

        return None

    def search_ticker(self, query: str) -> List[TickerResult]:
        """Search for tickers using Yahoo Finance auto-complete API."""
        results: List[TickerResult] = []

        # --- Yahoo v1 auto-complete endpoint ---
        url = f'{self._base_url}/v1/finance/search'
        params = {
            'q': query,
            'quotesCount': 10,
            'newsCount': 0,
            'enableFuzzyQuery': True,
            'quotesQueryId': 'tss_match_phrase_query',
        }
        try:
            resp = self.session.get(url, params=params, timeout=10)
            self._request_count += 1
            self._track_request()
            if resp.status_code == 200:
                data = resp.json()
                for q in data.get('quotes', []):
                    type_map = {
                        'EQUITY': 'stock',
                        'ETF': 'etf',
                        'CRYPTOCURRENCY': 'crypto',
                        'INDEX': 'index',
                        'MUTUALFUND': 'etf',
                        'FUTURE': 'stock',
                    }
                    results.append(TickerResult(
                        ticker=q.get('symbol', ''),
                        name=q.get('shortname', q.get('longname', '')),
                        exchange=q.get('exchange', ''),
                        type=type_map.get(q.get('quoteType', ''), 'stock'),
                        market=q.get('market', 'US'),
                    ))
                return results
        except Exception as e:
            logger.debug(f"Yahoo search API error: {e}")

        # --- yfinance library fallback ---
        if self._yf_available():
            try:
                import yfinance as yf
                # yfinance >= 0.2.31 exposes a search helper
                if hasattr(yf, 'Search'):
                    search = yf.Search(query)
                    for q in getattr(search, 'quotes', []):
                        results.append(TickerResult(
                            ticker=q.get('symbol', ''),
                            name=q.get('shortname', q.get('longname', '')),
                            exchange=q.get('exchange', ''),
                            type='stock',
                            market='US',
                        ))
            except Exception as e:
                logger.debug(f"yfinance search fallback error: {e}")

        return results