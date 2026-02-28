from abc import ABC, abstractmethod
from collections import deque
from dataclasses import dataclass, field
from typing import Callable, List, Optional, Dict, Any, Tuple
from datetime import datetime
import logging
import threading
import time

logger = logging.getLogger(__name__)


@dataclass
class Quote:
    """Real-time or delayed stock quote"""
    ticker: str
    price: float
    open: float
    high: float
    low: float
    volume: int
    timestamp: datetime
    currency: str = 'USD'
    change: float = 0.0
    change_percent: float = 0.0
    source: str = ''


@dataclass
class PriceBar:
    """Single OHLCV bar"""
    timestamp: int  # Unix timestamp
    open: float
    high: float
    low: float
    close: float
    volume: int


@dataclass
class PriceHistory:
    """Historical price data"""
    ticker: str
    bars: List[PriceBar]
    period: str
    source: str = ''


@dataclass
class TickerResult:
    """Search result for ticker lookup"""
    ticker: str
    name: str
    exchange: str = ''
    type: str = 'stock'  # stock, etf, crypto, index
    market: str = 'US'


@dataclass
class ProviderInfo:
    """Metadata about a data provider"""
    name: str
    display_name: str
    tier: str  # 'free', 'freemium', 'premium'
    requires_key: bool
    supported_markets: List[str]
    has_realtime: bool
    rate_limit_per_minute: int
    description: str


class DataProvider(ABC):
    """Abstract base class for all stock data providers"""

    def __init__(self, api_key: str = ''):
        self.api_key = api_key
        self._request_count = 0
        self._last_request_time = None
        # Rate limit tracking (rolling 60-second window)
        self._rl_timestamps: deque = deque()
        self._rl_lock = threading.Lock()
        self._rl_last_level: int = 0  # last threshold bucket: 0, 70, 90, or 100

    # ------------------------------------------------------------------
    # Rate limit tracking
    # ------------------------------------------------------------------

    def _track_request(self) -> None:
        """Record a request in the rolling per-minute counter.

        Fires an SSE ``rate_limit_update`` event when crossing the 70%, 90%,
        or 100% thresholds (upward), or when dropping back below 70% (reset).
        Always flushes the latest counters to the DB.
        """
        now = time.time()
        with self._rl_lock:
            self._rl_timestamps.append(now)
            cutoff = now - 60.0
            while self._rl_timestamps and self._rl_timestamps[0] < cutoff:
                self._rl_timestamps.popleft()

            used = len(self._rl_timestamps)
            max_ = self._get_rl_max()
            reset_at = self._compute_reset_at()
            new_level = self._pct_level(used, max_)

            # Notify on upward crossings AND on reset (drop to 0)
            should_notify = new_level != self._rl_last_level and (
                new_level > self._rl_last_level or new_level == 0
            )
            self._rl_last_level = new_level

        if should_notify:
            self._fire_rate_limit_sse(used, max_, reset_at)
        self._flush_rate_limit_to_db(used, max_, reset_at)

    def _get_rl_max(self) -> int:
        try:
            return self.get_provider_info().rate_limit_per_minute
        except Exception:
            return -1

    def _compute_reset_at(self) -> Optional[str]:
        """Return ISO-8601 UTC timestamp when the oldest request exits the window."""
        if not self._rl_timestamps:
            return None
        reset_ts = self._rl_timestamps[0] + 60.0
        return datetime.utcfromtimestamp(reset_ts).isoformat() + 'Z'

    @staticmethod
    def _pct_level(used: int, max_: int) -> int:
        """Map usage percentage to threshold bucket (0, 70, 90, or 100)."""
        if max_ <= 0:
            return 0
        pct = used / max_ * 100
        if pct >= 100:
            return 100
        if pct >= 90:
            return 90
        if pct >= 70:
            return 70
        return 0

    def _fire_rate_limit_sse(self, used: int, max_: int, reset_at: Optional[str]) -> None:
        try:
            from backend.app import send_sse_event  # lazy to avoid circular import
            send_sse_event('rate_limit_update', {
                'provider_id': self.get_provider_info().name,
                'rate_limit_used': used,
                'rate_limit_max': max_,
                'reset_at': reset_at,
            })
        except Exception:
            pass

    def _flush_rate_limit_to_db(self, used: int, max_: int, reset_at: Optional[str]) -> None:
        try:
            from backend.database import pooled_session  # lazy to avoid circular import
            provider_name = self.get_provider_info().name
            with pooled_session() as conn:
                conn.execute(
                    "INSERT OR IGNORE INTO data_providers_config (provider_name) VALUES (?)",
                    (provider_name,),
                )
                conn.execute(
                    """UPDATE data_providers_config
                          SET rate_limit_used = ?, rate_limit_max = ?, reset_at = ?
                        WHERE provider_name = ?""",
                    (used, max_, reset_at, provider_name),
                )
        except Exception:
            pass

    def get_rate_limit_status(self) -> Tuple[int, int, Optional[str]]:
        """Return ``(rate_limit_used, rate_limit_max, reset_at)`` from in-memory state.

        Prunes expired timestamps before computing the count so callers always
        see an up-to-date view without waiting for the next tracked request.
        """
        now = time.time()
        with self._rl_lock:
            cutoff = now - 60.0
            while self._rl_timestamps and self._rl_timestamps[0] < cutoff:
                self._rl_timestamps.popleft()
            used = len(self._rl_timestamps)
            max_ = self._get_rl_max()
            reset_at = self._compute_reset_at()
        return used, max_, reset_at

    @abstractmethod
    def get_quote(self, ticker: str) -> Optional[Quote]:
        """Get current quote for a ticker"""
        pass

    @abstractmethod
    def get_historical(self, ticker: str, period: str = '1mo') -> Optional[PriceHistory]:
        """Get historical price data. Period: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y"""
        pass

    @abstractmethod
    def search_ticker(self, query: str) -> List[TickerResult]:
        """Search for tickers by name or symbol"""
        pass

    @abstractmethod
    def get_provider_info(self) -> ProviderInfo:
        """Return provider metadata"""
        pass

    def is_available(self) -> bool:
        """Check if provider is configured and accessible"""
        info = self.get_provider_info()
        if info.requires_key and not self.api_key:
            return False
        return True

    def test_connection(self) -> Dict[str, Any]:
        """Test if the provider connection works"""
        try:
            result = self.get_quote('AAPL')
            if result:
                return {'success': True, 'provider': self.get_provider_info().name, 'sample_price': result.price}
            return {'success': False, 'error': 'No data returned for AAPL'}
        except Exception as e:
            return {'success': False, 'error': str(e)}


class DataProviderRegistry:
    """Registry and fallback chain for data providers"""

    def __init__(self):
        self._providers: Dict[str, DataProvider] = {}
        self._fallback_order: List[str] = []
        self._primary: Optional[str] = None
        self.on_fallback: Optional[Callable[[str, str, str], None]] = None

    def register(self, name: str, provider: DataProvider):
        self._providers[name] = provider
        if name not in self._fallback_order:
            self._fallback_order.append(name)

    def set_primary(self, name: str):
        if name in self._providers:
            self._primary = name

    def set_fallback_order(self, order: List[str]):
        self._fallback_order = [n for n in order if n in self._providers]

    def get_provider(self, name: str) -> Optional[DataProvider]:
        return self._providers.get(name)

    def get_primary(self) -> Optional[DataProvider]:
        if self._primary:
            return self._providers.get(self._primary)
        # Return first available
        for name in self._fallback_order:
            provider = self._providers[name]
            if provider.is_available():
                return provider
        return None

    def get_quote(self, ticker: str) -> Optional[Quote]:
        """Get quote with automatic fallback"""
        providers_to_try = []
        if self._primary and self._primary in self._providers:
            providers_to_try.append(self._primary)
        providers_to_try.extend([n for n in self._fallback_order if n != self._primary])

        failed_from: Optional[str] = None
        failed_reason: str = 'exception'

        for name in providers_to_try:
            provider = self._providers[name]
            if not provider.is_available():
                continue
            try:
                result = provider.get_quote(ticker)
                if result:
                    if failed_from is not None and self.on_fallback is not None:
                        self.on_fallback(failed_from, name, failed_reason)
                    return result
                else:
                    if failed_from is None:
                        failed_from = name
                        failed_reason = 'no_data'
            except Exception as e:
                logger.warning(f"Provider {name} failed for {ticker}: {e}")
                if failed_from is None:
                    failed_from = name
                    failed_reason = 'exception'
                continue
        return None

    def get_historical(self, ticker: str, period: str = '1mo') -> Optional[PriceHistory]:
        """Get historical data with automatic fallback"""
        providers_to_try = []
        if self._primary and self._primary in self._providers:
            providers_to_try.append(self._primary)
        providers_to_try.extend([n for n in self._fallback_order if n != self._primary])

        failed_from: Optional[str] = None
        failed_reason: str = 'exception'

        for name in providers_to_try:
            provider = self._providers[name]
            if not provider.is_available():
                continue
            try:
                result = provider.get_historical(ticker, period)
                if result and result.bars:
                    if failed_from is not None and self.on_fallback is not None:
                        self.on_fallback(failed_from, name, failed_reason)
                    return result
                else:
                    if failed_from is None:
                        failed_from = name
                        failed_reason = 'no_data'
            except Exception as e:
                logger.warning(f"Provider {name} failed historical for {ticker}: {e}")
                if failed_from is None:
                    failed_from = name
                    failed_reason = 'exception'
                continue
        return None

    def search_ticker(self, query: str) -> List[TickerResult]:
        """Search tickers using primary provider"""
        provider = self.get_primary()
        if provider:
            try:
                return provider.search_ticker(query)
            except Exception as e:
                logger.warning(f"Ticker search failed: {e}")
        return []

    def list_providers(self) -> List[Dict[str, Any]]:
        """List all registered providers with status"""
        result = []
        for name, provider in self._providers.items():
            info = provider.get_provider_info()
            result.append({
                'name': info.name,
                'display_name': info.display_name,
                'tier': info.tier,
                'is_available': provider.is_available(),
                'is_primary': name == self._primary,
                'has_realtime': info.has_realtime,
                'supported_markets': info.supported_markets,
                'rate_limit_per_minute': info.rate_limit_per_minute,
                'description': info.description,
            })
        return result
