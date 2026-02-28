"""
Finnhub Data Provider for TickerPulse AI v3.0

Uses direct HTTP requests to the Finnhub REST API (https://finnhub.io).
Free tier: 60 calls/minute, real-time US quotes.

API key required -- get a free key at https://finnhub.io/register
"""

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

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

# Map TickerPulse period strings to Finnhub candle resolution + seconds-back
_RESOLUTION_MAP: Dict[str, tuple] = {
    '1d':  ('5',  86400),           # 5-min candles, 1 day
    '5d':  ('15', 86400 * 5),       # 15-min candles, 5 days
    '1mo': ('D',  86400 * 30),      # daily candles, 30 days
    '3mo': ('D',  86400 * 90),      # daily candles, 90 days
    '6mo': ('D',  86400 * 180),     # daily candles, 180 days
    '1y':  ('W',  86400 * 365),     # weekly candles, 1 year
    '2y':  ('W',  86400 * 730),     # weekly candles, 2 years
    '5y':  ('M',  86400 * 1825),    # monthly candles, 5 years
}


class FinnhubProvider(DataProvider):
    """Finnhub stock data provider (REST API, free tier 60 req/min)."""

    def __init__(self, api_key: str = ''):
        super().__init__(api_key)
        self._base_url = 'https://finnhub.io/api/v1'
        self.session = requests.Session()

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
            name='finnhub',
            display_name='Finnhub',
            tier='freemium',
            requires_key=True,
            supported_markets=['US'],
            has_realtime=True,
            rate_limit_per_minute=60,
            description='Real-time US stock quotes and candle data via Finnhub. '
                        'Free tier provides 60 API calls/min. '
                        'Premium plans available for international markets and higher limits.',
        )

    # ------------------------------------------------------------------
    # Internal HTTP helper
    # ------------------------------------------------------------------

    def _get(self, path: str, params: Optional[dict] = None) -> Optional[dict]:
        """Issue a GET request to the Finnhub REST API."""
        params = params or {}
        params['token'] = self.api_key
        url = f'{self._base_url}{path}'
        try:
            resp = self.session.get(url, params=params, timeout=10)
            self._request_count += 1
            self._last_request_time = datetime.now(timezone.utc)
            self._track_request()
            if resp.status_code == 200:
                return resp.json()
            elif resp.status_code == 429:
                logger.warning("Finnhub rate limit reached (60/min free tier)")
            else:
                logger.debug(f"Finnhub API {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            logger.warning(f"Finnhub API request error: {e}")
        return None

    # ------------------------------------------------------------------
    # DataProvider interface
    # ------------------------------------------------------------------

    def get_quote(self, ticker: str) -> Optional[Quote]:
        """Get the latest quote for *ticker* from Finnhub."""
        ticker = ticker.upper()
        data = self._get('/quote', {'symbol': ticker})
        if not data or data.get('c') is None or data.get('c') == 0:
            return None

        price = data['c']           # current price
        open_ = data.get('o', price)
        high = data.get('h', price)
        low = data.get('l', price)
        prev_close = data.get('pc', price)
        change = data.get('d', price - prev_close)
        change_pct = data.get('dp', 0.0)
        ts = data.get('t', int(time.time()))

        return Quote(
            ticker=ticker,
            price=price,
            open=open_,
            high=high,
            low=low,
            volume=0,  # Finnhub /quote does not include volume
            # Finnhub 't' is a Unix timestamp in UTC seconds
            timestamp=datetime.fromtimestamp(ts, tz=timezone.utc),
            currency='USD',
            change=round(change, 4),
            change_percent=round(change_pct, 4),
            source='finnhub',
        )

    def get_historical(self, ticker: str, period: str = '1mo') -> Optional[PriceHistory]:
        """Return OHLCV candle data for *ticker* over *period*."""
        ticker = ticker.upper()
        resolution, seconds_back = _RESOLUTION_MAP.get(period, ('D', 86400 * 30))
        now = int(time.time())
        from_ts = now - seconds_back

        data = self._get('/stock/candle', {
            'symbol': ticker,
            'resolution': resolution,
            'from': from_ts,
            'to': now,
        })

        if not data or data.get('s') != 'ok':
            return None

        timestamps = data.get('t', [])
        opens = data.get('o', [])
        highs = data.get('h', [])
        lows = data.get('l', [])
        closes = data.get('c', [])
        volumes = data.get('v', [])

        bars = []
        for i in range(len(timestamps)):
            bars.append(PriceBar(
                timestamp=timestamps[i],
                open=opens[i],
                high=highs[i],
                low=lows[i],
                close=closes[i],
                volume=int(volumes[i]) if i < len(volumes) else 0,
            ))

        if bars:
            return PriceHistory(ticker=ticker, bars=bars, period=period, source='finnhub')
        return None

    def search_ticker(self, query: str) -> List[TickerResult]:
        """Search for tickers matching *query* using Finnhub symbol search."""
        results: List[TickerResult] = []
        data = self._get('/search', {'q': query})

        if not data or 'result' not in data:
            return results

        type_map = {
            'Common Stock': 'stock',
            'ETF': 'etf',
            'Crypto': 'crypto',
            'Index': 'index',
            'ADR': 'stock',
            'REIT': 'stock',
        }

        for item in data['result'][:10]:
            symbol = item.get('symbol', '')
            # Finnhub returns many international results; prefer those without dots
            # for the primary US market listing
            results.append(TickerResult(
                ticker=symbol,
                name=item.get('description', ''),
                exchange=item.get('displaySymbol', ''),
                type=type_map.get(item.get('type', ''), 'stock'),
                market='US',
            ))

        return results