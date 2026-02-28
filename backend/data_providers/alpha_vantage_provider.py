"""
Alpha Vantage Data Provider for TickerPulse AI v3.0

Uses direct HTTP requests to the Alpha Vantage REST API.
Free tier: 25 calls/day.  Premium: starts at $49/mo for 75 calls/min.

API key required -- get a free key at https://www.alphavantage.co/support/#api-key
"""

import logging
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo

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

# Alpha Vantage intraday timestamps are in US/Eastern time
_AV_INTRADAY_TZ = ZoneInfo('US/Eastern')

# Map TickerPulse period strings to Alpha Vantage function + parameters
_PERIOD_CONFIG: Dict[str, Dict] = {
    '1d':  {'function': 'TIME_SERIES_INTRADAY', 'interval': '5min', 'outputsize': 'compact'},
    '5d':  {'function': 'TIME_SERIES_INTRADAY', 'interval': '15min', 'outputsize': 'full'},
    '1mo': {'function': 'TIME_SERIES_DAILY', 'outputsize': 'compact'},
    '3mo': {'function': 'TIME_SERIES_DAILY', 'outputsize': 'compact'},
    '6mo': {'function': 'TIME_SERIES_DAILY', 'outputsize': 'full'},
    '1y':  {'function': 'TIME_SERIES_WEEKLY'},
    '2y':  {'function': 'TIME_SERIES_WEEKLY'},
    '5y':  {'function': 'TIME_SERIES_MONTHLY'},
}

# How many calendar days of data each period should include at most
_PERIOD_DAYS: Dict[str, int] = {
    '1d': 1, '5d': 5, '1mo': 30, '3mo': 90, '6mo': 180,
    '1y': 365, '2y': 730, '5y': 1825,
}

# Alpha Vantage time-series key names vary by function
_SERIES_KEYS = {
    'TIME_SERIES_INTRADAY': lambda interval: f'Time Series ({interval})',
    'TIME_SERIES_DAILY': lambda _: 'Time Series (Daily)',
    'TIME_SERIES_WEEKLY': lambda _: 'Weekly Time Series',
    'TIME_SERIES_MONTHLY': lambda _: 'Monthly Time Series',
}


class AlphaVantageProvider(DataProvider):
    """Alpha Vantage stock data provider (REST API)."""

    def __init__(self, api_key: str = ''):
        super().__init__(api_key)
        self._base_url = 'https://www.alphavantage.co/query'
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
            name='alpha_vantage',
            display_name='Alpha Vantage',
            tier='freemium',
            requires_key=True,
            supported_markets=['US', 'UK', 'EU', 'IN', 'JP', 'CA', 'AU'],
            has_realtime=False,
            rate_limit_per_minute=5,   # free: 25/day (~0.4/min); premium: 75/min
            description='Stock data from Alpha Vantage. Free tier allows 25 API calls '
                        'per day. Premium plans start at $49/mo for 75 calls/min and '
                        'include intraday, forex, crypto, and fundamental data.',
        )

    # ------------------------------------------------------------------
    # Internal HTTP helper
    # ------------------------------------------------------------------

    def _get(self, params: dict) -> Optional[dict]:
        """Issue a GET request to Alpha Vantage."""
        params['apikey'] = self.api_key
        try:
            resp = self.session.get(self._base_url, params=params, timeout=15)
            self._request_count += 1
            self._last_request_time = datetime.now(timezone.utc)
            self._track_request()
            if resp.status_code == 200:
                data = resp.json()
                # Alpha Vantage returns an error message inside the JSON on
                # rate-limit or invalid key.
                if 'Error Message' in data:
                    logger.warning(f"Alpha Vantage error: {data['Error Message']}")
                    return None
                if 'Note' in data:
                    logger.warning(f"Alpha Vantage rate-limit note: {data['Note']}")
                    return None
                if 'Information' in data:
                    logger.warning(f"Alpha Vantage info: {data['Information']}")
                    return None
                return data
            else:
                logger.debug(f"Alpha Vantage HTTP {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            logger.warning(f"Alpha Vantage request error: {e}")
        return None

    # ------------------------------------------------------------------
    # DataProvider interface
    # ------------------------------------------------------------------

    def get_quote(self, ticker: str) -> Optional[Quote]:
        """Get the latest quote for *ticker* via the GLOBAL_QUOTE endpoint."""
        ticker = ticker.upper()
        data = self._get({'function': 'GLOBAL_QUOTE', 'symbol': ticker})
        if not data:
            return None

        gq = data.get('Global Quote', {})
        if not gq or '05. price' not in gq:
            return None

        try:
            price = float(gq.get('05. price', 0))
            open_ = float(gq.get('02. open', price))
            high = float(gq.get('03. high', price))
            low = float(gq.get('04. low', price))
            volume = int(gq.get('06. volume', 0))
            prev_close = float(gq.get('08. previous close', price))
            change = float(gq.get('09. change', 0))
            change_pct_str = gq.get('10. change percent', '0%').replace('%', '')
            change_pct = float(change_pct_str)
            latest_day = gq.get('07. latest trading day', '')

            # Default to current UTC time; override with the trading day date if present.
            # Alpha Vantage's "latest trading day" is a date string (YYYY-MM-DD) with no
            # time component — treat it as UTC midnight so it is locale-independent.
            ts: datetime = datetime.now(timezone.utc)
            if latest_day:
                try:
                    ts = datetime.strptime(latest_day, '%Y-%m-%d').replace(tzinfo=timezone.utc)
                except ValueError:
                    pass

            return Quote(
                ticker=ticker,
                price=price,
                open=open_,
                high=high,
                low=low,
                volume=volume,
                timestamp=ts,
                currency='USD',
                change=round(change, 4),
                change_percent=round(change_pct, 4),
                source='alpha_vantage',
            )
        except (ValueError, KeyError, TypeError) as e:
            logger.warning(f"Alpha Vantage quote parse error for {ticker}: {e}")
            return None

    def get_historical(self, ticker: str, period: str = '1mo') -> Optional[PriceHistory]:
        """Return OHLCV bars for *ticker* over *period*."""
        ticker = ticker.upper()
        config = _PERIOD_CONFIG.get(period, _PERIOD_CONFIG['1mo'])
        max_days = _PERIOD_DAYS.get(period, 30)

        params: Dict[str, str] = {
            'function': config['function'],
            'symbol': ticker,
        }
        if 'interval' in config:
            params['interval'] = config['interval']
        if 'outputsize' in config:
            params['outputsize'] = config['outputsize']

        data = self._get(params)
        if not data:
            return None

        # Determine the correct series key
        interval_val = config.get('interval', '')
        series_key_fn = _SERIES_KEYS.get(config['function'])
        if not series_key_fn:
            return None
        series_key = series_key_fn(interval_val)

        series = data.get(series_key, {})
        if not series:
            # Try common alternate key names
            for key in data.keys():
                if 'Time Series' in key or 'time series' in key.lower():
                    series = data[key]
                    break
            if not series:
                return None

        # Parse bars -- Alpha Vantage returns newest first.
        # Use UTC-based cutoff so the window is server-locale independent.
        cutoff = datetime.now(timezone.utc).timestamp() - (max_days * 86400)
        is_intraday = config['function'] == 'TIME_SERIES_INTRADAY'
        bars = []
        for date_str, values in sorted(series.items()):
            try:
                if is_intraday:
                    # Intraday format: "2024-01-15 09:35:00" in US/Eastern time
                    ts_dt = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S').replace(
                        tzinfo=_AV_INTRADAY_TZ
                    )
                else:
                    # Daily/weekly/monthly: date-only string — treat as UTC midnight
                    ts_dt = datetime.strptime(date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)

                ts_unix = int(ts_dt.timestamp())
                if ts_unix < cutoff:
                    continue

                bars.append(PriceBar(
                    timestamp=ts_unix,
                    open=float(values.get('1. open', 0)),
                    high=float(values.get('2. high', 0)),
                    low=float(values.get('3. low', 0)),
                    close=float(values.get('4. close', 0)),
                    volume=int(values.get('5. volume', 0)),
                ))
            except (ValueError, KeyError, TypeError) as e:
                logger.debug(f"Skipping bar {date_str}: {e}")
                continue

        if bars:
            return PriceHistory(ticker=ticker, bars=bars, period=period, source='alpha_vantage')
        return None

    def search_ticker(self, query: str) -> List[TickerResult]:
        """Search for tickers matching *query* via the SYMBOL_SEARCH endpoint."""
        results: List[TickerResult] = []
        data = self._get({'function': 'SYMBOL_SEARCH', 'keywords': query})
        if not data:
            return results

        matches = data.get('bestMatches', [])
        type_map = {
            'Equity': 'stock',
            'ETF': 'etf',
            'Crypto': 'crypto',
            'Index': 'index',
            'Mutual Fund': 'etf',
        }

        for match in matches[:10]:
            ticker = match.get('1. symbol', '')
            name = match.get('2. name', '')
            asset_type = match.get('3. type', 'Equity')
            region = match.get('4. region', 'United States')
            exchange = match.get('8. currency', '')  # AV puts currency here sometimes

            # Map region to market code
            region_map = {
                'United States': 'US',
                'United Kingdom': 'UK',
                'India': 'IN',
                'Germany': 'EU',
                'Japan': 'JP',
                'Canada': 'CA',
                'Australia': 'AU',
            }
            market = region_map.get(region, 'US')

            results.append(TickerResult(
                ticker=ticker,
                name=name,
                exchange=exchange,
                type=type_map.get(asset_type, 'stock'),
                market=market,
            ))

        return results