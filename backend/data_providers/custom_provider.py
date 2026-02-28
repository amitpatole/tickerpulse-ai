"""
Custom Data Provider Template for TickerPulse AI v3.0

Copy this file and rename it to create your own data provider.
For example: ``my_broker_provider.py``

Steps to create a custom provider:
  1. Copy this file to a new name (e.g. ``my_broker_provider.py``).
  2. Rename the class ``CustomProvider`` to something descriptive.
  3. Implement all four required methods:
     - get_quote()       -- return a Quote for a single ticker
     - get_historical()  -- return PriceHistory (list of PriceBars)
     - search_ticker()   -- return a list of TickerResult matches
     - get_provider_info() -- return a ProviderInfo with your provider metadata
  4. Register your provider in ``__init__.py``'s ``create_registry()`` function
     (see comments there for an example).

You can test your provider standalone by running this file:
    python -m backend.data_providers.custom_provider
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional

from .base import (
    DataProvider,
    PriceBar,
    PriceHistory,
    ProviderInfo,
    Quote,
    TickerResult,
)

logger = logging.getLogger(__name__)


class CustomProvider(DataProvider):
    """
    Template data provider -- replace with your own data source.

    Your data source could be:
      - A paid broker API (Interactive Brokers, TD Ameritrade, Alpaca, etc.)
      - A CSV/Parquet file on disk
      - A local database with historical data
      - A proprietary internal service
      - Anything that can return OHLCV data
    """

    def __init__(self, api_key: str = ''):
        super().__init__(api_key)
        # ---------------------------------------------------------------
        # TODO: Set up your HTTP session, database connection, file path,
        #       or whatever your data source needs.
        # ---------------------------------------------------------------
        # Example:
        # self.session = requests.Session()
        # self.session.headers['Authorization'] = f'Bearer {self.api_key}'
        # self._base_url = 'https://api.mybroker.com/v1'

    # ------------------------------------------------------------------
    # Provider metadata  (REQUIRED)
    # ------------------------------------------------------------------

    def get_provider_info(self) -> ProviderInfo:
        """Return metadata describing this provider.

        Update every field below to match your data source.
        """
        return ProviderInfo(
            name='custom',                          # unique short name (no spaces)
            display_name='My Custom Provider',      # human-friendly name for the UI
            tier='premium',                         # 'free', 'freemium', or 'premium'
            requires_key=True,                      # set False if no API key is needed
            supported_markets=['US'],               # e.g. ['US', 'IN', 'UK', 'EU']
            has_realtime=False,                     # True if data is real-time
            rate_limit_per_minute=60,               # max requests per minute
            description='Template custom provider. Copy and modify this file '
                        'to integrate your own data source.',
        )

    # ------------------------------------------------------------------
    # get_quote  (REQUIRED)
    # ------------------------------------------------------------------

    def get_quote(self, ticker: str) -> Optional[Quote]:
        """Return the latest quote for *ticker*.

        Must return a Quote dataclass or None if the ticker is not found.
        """
        # ---------------------------------------------------------------
        # TODO: Replace the example below with a real API call / query.
        # ---------------------------------------------------------------
        #
        # Example skeleton:
        #
        # resp = self.session.get(f'{self._base_url}/quote/{ticker}')
        # if resp.status_code != 200:
        #     return None
        # data = resp.json()
        # return Quote(
        #     ticker=ticker,
        #     price=data['last'],
        #     open=data['open'],
        #     high=data['high'],
        #     low=data['low'],
        #     volume=data['volume'],
        #     # Always pass tz=timezone.utc so the timestamp is locale-independent.
        #     # If your API returns Unix seconds: datetime.fromtimestamp(data['ts'], tz=timezone.utc)
        #     # If your API returns Unix milliseconds: datetime.fromtimestamp(data['ts'] / 1000, tz=timezone.utc)
        #     timestamp=datetime.fromtimestamp(data['timestamp'], tz=timezone.utc),
        #     currency='USD',
        #     change=data.get('change', 0.0),
        #     change_percent=data.get('change_pct', 0.0),
        #     source='custom',
        # )

        logger.warning("CustomProvider.get_quote() is not implemented -- "
                        "copy custom_provider.py and add your logic.")
        return None

    # ------------------------------------------------------------------
    # get_historical  (REQUIRED)
    # ------------------------------------------------------------------

    def get_historical(self, ticker: str, period: str = '1mo') -> Optional[PriceHistory]:
        """Return historical OHLCV bars for *ticker* over *period*.

        ``period`` is one of: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y.
        Return a PriceHistory containing a list of PriceBar objects.
        """
        # ---------------------------------------------------------------
        # TODO: Fetch historical bars from your data source.
        # ---------------------------------------------------------------
        #
        # Example skeleton:
        #
        # resp = self.session.get(
        #     f'{self._base_url}/history/{ticker}',
        #     params={'period': period},
        # )
        # if resp.status_code != 200:
        #     return None
        # data = resp.json()
        #
        # bars = []
        # for candle in data['candles']:
        #     bars.append(PriceBar(
        #         timestamp=candle['t'],       # Unix timestamp (seconds)
        #         open=candle['o'],
        #         high=candle['h'],
        #         low=candle['l'],
        #         close=candle['c'],
        #         volume=candle['v'],
        #     ))
        #
        # return PriceHistory(
        #     ticker=ticker,
        #     bars=bars,
        #     period=period,
        #     source='custom',
        # )

        logger.warning("CustomProvider.get_historical() is not implemented -- "
                        "copy custom_provider.py and add your logic.")
        return None

    # ------------------------------------------------------------------
    # search_ticker  (REQUIRED)
    # ------------------------------------------------------------------

    def search_ticker(self, query: str) -> List[TickerResult]:
        """Search for tickers matching *query*.

        Return a list of TickerResult objects (at most ~10 results).
        """
        # ---------------------------------------------------------------
        # TODO: Implement ticker search against your data source.
        # ---------------------------------------------------------------
        #
        # Example skeleton:
        #
        # resp = self.session.get(
        #     f'{self._base_url}/search',
        #     params={'q': query, 'limit': 10},
        # )
        # if resp.status_code != 200:
        #     return []
        # data = resp.json()
        #
        # results = []
        # for item in data['results']:
        #     results.append(TickerResult(
        #         ticker=item['symbol'],
        #         name=item['name'],
        #         exchange=item.get('exchange', ''),
        #         type='stock',               # 'stock', 'etf', 'crypto', 'index'
        #         market=item.get('market', 'US'),
        #     ))
        # return results

        logger.warning("CustomProvider.search_ticker() is not implemented -- "
                        "copy custom_provider.py and add your logic.")
        return []


# ----------------------------------------------------------------------
# Standalone test
# ----------------------------------------------------------------------
if __name__ == '__main__':
    provider = CustomProvider(api_key='your-key-here')
    info = provider.get_provider_info()
    print(f"Provider: {info.display_name}")
    print(f"Available: {provider.is_available()}")
    print(f"Test connection: {provider.test_connection()}")