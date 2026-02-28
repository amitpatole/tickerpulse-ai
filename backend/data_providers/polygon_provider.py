"""
Polygon.io Data Provider for TickerPulse AI v3.0

Premium provider using the Polygon.io REST API.
Uses the official ``polygon-api-client`` library when available,
falling back to plain HTTP requests if the library is not installed.

API key required -- get one at https://polygon.io
Free tier: 5 calls/minute.  Paid plans start at $29/mo for unlimited.
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

# Try to import the official Polygon client (optional dependency)
try:
    from polygon import RESTClient as PolygonRESTClient
    HAS_POLYGON_LIB = True
except ImportError:
    HAS_POLYGON_LIB = False

# Map TickerPulse period strings to (multiplier, timespan, days_back) tuples
# that the Polygon /aggs/ticker endpoint expects.
_PERIOD_MAP: Dict[str, tuple] = {
    '1d':  (5,  'minute', 1),
    '5d':  (15, 'minute', 5),
    '1mo': (1,  'day',    30),
    '3mo': (1,  'day',    90),
    '6mo': (1,  'day',    180),
    '1y':  (1,  'week',   365),
    '2y':  (1,  'week',   730),
    '5y':  (1,  'month',  1825),
}


class PolygonProvider(DataProvider):
    """Polygon.io stock data provider."""

    def __init__(self, api_key: str = ''):
        super().__init__(api_key)
        self._base_url = 'https://api.polygon.io'
        self.session = requests.Session()
        # Initialise the official client if the library is available
        self._client: Optional[object] = None
        if HAS_POLYGON_LIB and self.api_key:
            try:
                self._client = PolygonRESTClient(api_key=self.api_key)
            except Exception as e:
                logger.debug(f"Could not create Polygon REST client: {e}")

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
            name='polygon',
            display_name='Polygon.io',
            tier='freemium',
            requires_key=True,
            supported_markets=['US'],
            has_realtime=True,
            rate_limit_per_minute=5,   # free tier; paid is unlimited
            description='Real-time and historical US stock data via Polygon.io. '
                        'Free tier offers 5 API calls/min with 15-min delayed quotes. '
                        'Paid plans ($29+/mo) unlock real-time data and higher limits.',
        )

    # ------------------------------------------------------------------
    # Internal HTTP helper
    # ------------------------------------------------------------------

    def _get(self, path: str, params: Optional[dict] = None) -> Optional[dict]:
        """Issue a GET request to the Polygon REST API."""
        params = params or {}
        params['apiKey'] = self.api_key
        url = f'{self._base_url}{path}'
        try:
            resp = self.session.get(url, params=params, timeout=10)
            self._request_count += 1
            self._last_request_time = datetime.now(timezone.utc)
            self._track_request()
            if resp.status_code == 200:
                return resp.json()
            else:
                logger.debug(f"Polygon API {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            logger.warning(f"Polygon API request error: {e}")
        return None

    # ------------------------------------------------------------------
    # DataProvider interface
    # ------------------------------------------------------------------

    def get_quote(self, ticker: str) -> Optional[Quote]:
        """Get the latest quote for *ticker* from Polygon."""
        ticker = ticker.upper()

        # -- Try official client first --
        if self._client and HAS_POLYGON_LIB:
            try:
                # Previous-day close via Aggs endpoint
                aggs = list(self._client.get_aggs(
                    ticker=ticker,
                    multiplier=1,
                    timespan='day',
                    from_=(datetime.now(timezone.utc) - timedelta(days=5)).strftime('%Y-%m-%d'),
                    to=datetime.now(timezone.utc).strftime('%Y-%m-%d'),
                    limit=5,
                ))
                if aggs:
                    latest = aggs[-1]
                    prev_close = aggs[-2].close if len(aggs) > 1 else latest.open
                    change = latest.close - prev_close
                    change_pct = (change / prev_close * 100) if prev_close else 0.0
                    return Quote(
                        ticker=ticker,
                        price=latest.close,
                        open=latest.open,
                        high=latest.high,
                        low=latest.low,
                        volume=int(latest.volume),
                        # Polygon timestamps are milliseconds UTC
                        timestamp=datetime.fromtimestamp(latest.timestamp / 1000, tz=timezone.utc),
                        currency='USD',
                        change=round(change, 4),
                        change_percent=round(change_pct, 4),
                        source='polygon',
                    )
            except Exception as e:
                logger.debug(f"Polygon client quote error for {ticker}: {e}")

        # -- Fallback to direct REST --
        # /v2/last/trade/{ticker}
        data = self._get(f'/v2/last/trade/{ticker}')
        if data and data.get('status') == 'OK':
            trade = data.get('results', {})
            price = trade.get('p', 0)
            if price:
                return Quote(
                    ticker=ticker,
                    price=price,
                    open=price,
                    high=price,
                    low=price,
                    volume=int(trade.get('s', 0)),
                    # Polygon last-trade 't' is nanoseconds UTC when > 1e12
                    timestamp=datetime.fromtimestamp(trade.get('t', time.time()) / 1e9, tz=timezone.utc)
                             if trade.get('t', 0) > 1e12 else datetime.now(timezone.utc),
                    currency='USD',
                    source='polygon',
                )

        # -- Another fallback: previous day aggs --
        yesterday = (datetime.now(timezone.utc) - timedelta(days=5)).strftime('%Y-%m-%d')
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        data = self._get(f'/v2/aggs/ticker/{ticker}/range/1/day/{yesterday}/{today}',
                         {'limit': 5, 'sort': 'desc'})
        if data and data.get('results'):
            bar = data['results'][0]
            return Quote(
                ticker=ticker,
                price=bar['c'],
                open=bar['o'],
                high=bar['h'],
                low=bar['l'],
                volume=int(bar.get('v', 0)),
                # Polygon agg 't' is milliseconds UTC
                timestamp=datetime.fromtimestamp(bar['t'] / 1000, tz=timezone.utc),
                currency='USD',
                source='polygon',
            )

        return None

    def get_historical(self, ticker: str, period: str = '1mo') -> Optional[PriceHistory]:
        """Return OHLCV bars for *ticker* over *period*."""
        ticker = ticker.upper()
        multiplier, timespan, days_back = _PERIOD_MAP.get(period, (1, 'day', 30))
        from_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime('%Y-%m-%d')
        to_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')

        # -- Try official client first --
        if self._client and HAS_POLYGON_LIB:
            try:
                aggs = list(self._client.get_aggs(
                    ticker=ticker,
                    multiplier=multiplier,
                    timespan=timespan,
                    from_=from_date,
                    to=to_date,
                    limit=50000,
                ))
                if aggs:
                    bars = [
                        PriceBar(
                            timestamp=int(a.timestamp / 1000),
                            open=a.open,
                            high=a.high,
                            low=a.low,
                            close=a.close,
                            volume=int(a.volume),
                        )
                        for a in aggs
                    ]
                    return PriceHistory(ticker=ticker, bars=bars, period=period, source='polygon')
            except Exception as e:
                logger.debug(f"Polygon client historical error for {ticker}: {e}")

        # -- Fallback to direct REST --
        path = f'/v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from_date}/{to_date}'
        data = self._get(path, {'limit': 50000, 'sort': 'asc'})
        if data and data.get('results'):
            bars = []
            for bar in data['results']:
                bars.append(PriceBar(
                    timestamp=int(bar['t'] / 1000),
                    open=bar['o'],
                    high=bar['h'],
                    low=bar['l'],
                    close=bar['c'],
                    volume=int(bar.get('v', 0)),
                ))
            if bars:
                return PriceHistory(ticker=ticker, bars=bars, period=period, source='polygon')

        return None

    def search_ticker(self, query: str) -> List[TickerResult]:
        """Search for tickers matching *query*."""
        results: List[TickerResult] = []

        # -- Try official client --
        if self._client and HAS_POLYGON_LIB:
            try:
                tickers = list(self._client.list_tickers(search=query, limit=10, market='stocks'))
                for t in tickers:
                    type_map = {'CS': 'stock', 'ETF': 'etf', 'CRYPTO': 'crypto', 'INDEX': 'index'}
                    results.append(TickerResult(
                        ticker=getattr(t, 'ticker', ''),
                        name=getattr(t, 'name', ''),
                        exchange=getattr(t, 'primary_exchange', ''),
                        type=type_map.get(getattr(t, 'type', ''), 'stock'),
                        market=getattr(t, 'market', 'US'),
                    ))
                return results
            except Exception as e:
                logger.debug(f"Polygon client search error: {e}")

        # -- Fallback to REST --
        data = self._get('/v3/reference/tickers', {
            'search': query,
            'limit': 10,
            'market': 'stocks',
            'active': 'true',
        })
        if data and data.get('results'):
            type_map = {'CS': 'stock', 'ETF': 'etf', 'CRYPTO': 'crypto', 'INDEX': 'index'}
            for t in data['results']:
                results.append(TickerResult(
                    ticker=t.get('ticker', ''),
                    name=t.get('name', ''),
                    exchange=t.get('primary_exchange', ''),
                    type=type_map.get(t.get('type', ''), 'stock'),
                    market=t.get('market', 'US'),
                ))

        return results