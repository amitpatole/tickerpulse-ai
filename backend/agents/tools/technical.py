"""
TickerPulse AI v3.0 - Technical Analyzer Tool (CrewAI Compatible)
Wraps ai_analytics.py calculations plus new indicators:
Bollinger Bands, ATR, VWAP, OBV, Stochastic Oscillator.
"""

import json
import logging
import math
from typing import Any, Dict, List, Optional, Type

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Try to import CrewAI BaseTool; fall back to a minimal shim
# ------------------------------------------------------------------
try:
    from crewai.tools import BaseTool as _CrewAIBaseTool
    from pydantic import BaseModel as _PydanticBaseModel, Field as _PydanticField

    CREWAI_AVAILABLE = True

    class TechnicalAnalyzerInput(_PydanticBaseModel):
        """Input schema for the Technical Analyzer tool."""
        ticker: str = _PydanticField(..., description="Stock ticker symbol (e.g. AAPL, TSLA)")
        period: str = _PydanticField(
            default="3mo",
            description="Historical data period: 1mo, 3mo, 6mo, 1y"
        )
        indicators: str = _PydanticField(
            default="all",
            description=(
                "Comma-separated list of indicators to compute, or 'all'. "
                "Options: rsi, macd, ma, ema, bollinger, atr, vwap, obv, stochastic"
            )
        )

except ImportError:
    CREWAI_AVAILABLE = False

    class _CrewAIBaseTool:  # type: ignore[no-redef]
        name: str = ""
        description: str = ""

        def _run(self, *args, **kwargs):
            raise NotImplementedError

    TechnicalAnalyzerInput = None  # type: ignore[assignment,misc]


# ------------------------------------------------------------------
# Lazy analytics singleton
# ------------------------------------------------------------------
_analytics_cache = None


def _get_analytics():
    """Return a cached StockAnalytics instance."""
    global _analytics_cache
    if _analytics_cache is not None:
        return _analytics_cache
    try:
        from backend.core.ai_analytics import StockAnalytics
        _analytics_cache = StockAnalytics()
        return _analytics_cache
    except ImportError:
        pass
    try:
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))
        from backend.core.ai_analytics import StockAnalytics
        _analytics_cache = StockAnalytics()
        return _analytics_cache
    except Exception as e:
        logger.error(f"Failed to create StockAnalytics: {e}")
    return None


# ------------------------------------------------------------------
# NEW indicator calculations (supplement ai_analytics.py)
# ------------------------------------------------------------------

def calculate_bollinger_bands(closes: List[float], period: int = 20, num_std: float = 2.0) -> Dict[str, Any]:
    """Calculate Bollinger Bands."""
    if len(closes) < period:
        return {"error": f"Need at least {period} data points, got {len(closes)}"}

    window = closes[-period:]
    sma = sum(window) / period
    variance = sum((p - sma) ** 2 for p in window) / period
    std_dev = math.sqrt(variance)

    upper = sma + (num_std * std_dev)
    lower = sma - (num_std * std_dev)
    current = closes[-1]

    # Percent B: where price is relative to bands (0 = lower, 1 = upper)
    band_width = upper - lower
    percent_b = (current - lower) / band_width if band_width > 0 else 0.5

    if current > upper:
        signal = "overbought"
    elif current < lower:
        signal = "oversold"
    elif percent_b > 0.8:
        signal = "upper_zone"
    elif percent_b < 0.2:
        signal = "lower_zone"
    else:
        signal = "neutral"

    return {
        "upper": round(upper, 4),
        "middle": round(sma, 4),
        "lower": round(lower, 4),
        "bandwidth": round(band_width / sma * 100, 4) if sma else 0,
        "percent_b": round(percent_b, 4),
        "signal": signal,
    }


def calculate_atr(highs: List[float], lows: List[float], closes: List[float],
                  period: int = 14) -> Dict[str, Any]:
    """Calculate Average True Range (ATR)."""
    if len(closes) < period + 1:
        return {"error": f"Need at least {period + 1} data points"}

    true_ranges = []
    for i in range(1, len(closes)):
        h = highs[i] if highs[i] is not None else closes[i]
        l = lows[i] if lows[i] is not None else closes[i]
        prev_c = closes[i - 1]
        tr = max(h - l, abs(h - prev_c), abs(l - prev_c))
        true_ranges.append(tr)

    # Simple average of last `period` true ranges
    atr_val = sum(true_ranges[-period:]) / period
    current_price = closes[-1]
    atr_pct = (atr_val / current_price * 100) if current_price else 0

    if atr_pct > 4:
        volatility = "very_high"
    elif atr_pct > 2.5:
        volatility = "high"
    elif atr_pct > 1.5:
        volatility = "moderate"
    else:
        volatility = "low"

    return {
        "atr": round(atr_val, 4),
        "atr_percent": round(atr_pct, 4),
        "volatility": volatility,
    }


def calculate_vwap(closes: List[float], highs: List[float], lows: List[float],
                   volumes: List[int]) -> Dict[str, Any]:
    """Calculate Volume Weighted Average Price (VWAP)."""
    if not closes or not volumes:
        return {"error": "No data provided"}

    total_volume = 0
    cumulative_tp_volume = 0

    for i in range(len(closes)):
        c = closes[i]
        h = highs[i] if highs[i] is not None else c
        l = lows[i] if lows[i] is not None else c
        v = volumes[i] if volumes[i] is not None else 0

        if c is None or v == 0:
            continue

        typical_price = (h + l + c) / 3
        cumulative_tp_volume += typical_price * v
        total_volume += v

    vwap_val = cumulative_tp_volume / total_volume if total_volume > 0 else 0
    current = closes[-1] if closes[-1] is not None else 0

    signal = "bullish" if current > vwap_val else "bearish" if current < vwap_val else "neutral"

    return {
        "vwap": round(vwap_val, 4),
        "current_price": round(current, 4),
        "deviation_pct": round((current - vwap_val) / vwap_val * 100, 4) if vwap_val else 0,
        "signal": signal,
    }


def calculate_obv(closes: List[float], volumes: List[int]) -> Dict[str, Any]:
    """Calculate On-Balance Volume (OBV)."""
    if len(closes) < 2:
        return {"error": "Need at least 2 data points"}

    obv = 0
    obv_values = [0]

    for i in range(1, len(closes)):
        c = closes[i]
        prev_c = closes[i - 1]
        v = volumes[i] if volumes[i] is not None else 0

        if c is None or prev_c is None:
            obv_values.append(obv)
            continue

        if c > prev_c:
            obv += v
        elif c < prev_c:
            obv -= v
        # If equal, OBV stays the same

        obv_values.append(obv)

    # Determine trend from last 5 OBV values
    recent = obv_values[-5:] if len(obv_values) >= 5 else obv_values
    if len(recent) >= 2:
        if recent[-1] > recent[0]:
            trend = "accumulation"
        elif recent[-1] < recent[0]:
            trend = "distribution"
        else:
            trend = "neutral"
    else:
        trend = "neutral"

    return {
        "obv": obv,
        "obv_trend": trend,
    }


def calculate_stochastic(closes: List[float], highs: List[float], lows: List[float],
                         k_period: int = 14, d_period: int = 3) -> Dict[str, Any]:
    """Calculate Stochastic Oscillator (%K and %D)."""
    if len(closes) < k_period:
        return {"error": f"Need at least {k_period} data points"}

    # Filter None values for the window
    filtered_highs = [h for h in highs[-k_period:] if h is not None]
    filtered_lows = [l for l in lows[-k_period:] if l is not None]

    if not filtered_highs or not filtered_lows:
        return {"error": "Not enough valid high/low data"}

    highest_high = max(filtered_highs)
    lowest_low = min(filtered_lows)
    current_close = closes[-1]

    denom = highest_high - lowest_low
    percent_k = ((current_close - lowest_low) / denom * 100) if denom > 0 else 50.0

    # %D is a simple moving average of %K values
    # We compute approximate %K for the last d_period bars
    k_values = []
    for i in range(max(0, len(closes) - d_period), len(closes)):
        start = max(0, i - k_period + 1)
        window_h = [h for h in highs[start:i + 1] if h is not None]
        window_l = [l for l in lows[start:i + 1] if l is not None]
        if window_h and window_l:
            hh = max(window_h)
            ll = min(window_l)
            d = hh - ll
            k_val = ((closes[i] - ll) / d * 100) if d > 0 else 50.0
            k_values.append(k_val)

    percent_d = sum(k_values) / len(k_values) if k_values else percent_k

    if percent_k > 80:
        signal = "overbought"
    elif percent_k < 20:
        signal = "oversold"
    elif percent_k > percent_d:
        signal = "bullish_crossover"
    elif percent_k < percent_d:
        signal = "bearish_crossover"
    else:
        signal = "neutral"

    return {
        "percent_k": round(percent_k, 2),
        "percent_d": round(percent_d, 2),
        "signal": signal,
    }


def _as_finite_float(value: Any) -> Optional[float]:
    """Return a finite float for numeric provider values, otherwise None."""
    try:
        if value is None:
            return None
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _list_get(values: List[Any], index: int) -> Any:
    return values[index] if index < len(values) else None


def _sanitize_ohlcv(price_data: Dict[str, Any]) -> Dict[str, List[Any]]:
    """Align provider OHLCV arrays and drop bars without a valid close."""
    closes_raw = price_data.get('close', []) or []
    highs_raw = price_data.get('high', []) or []
    lows_raw = price_data.get('low', []) or []
    opens_raw = price_data.get('open', []) or []
    volumes_raw = price_data.get('volume', []) or []

    opens: List[float] = []
    highs: List[float] = []
    lows: List[float] = []
    closes: List[float] = []
    volumes: List[int] = []

    for idx, close_raw in enumerate(closes_raw):
        close = _as_finite_float(close_raw)
        if close is None:
            continue

        open_val = _as_finite_float(_list_get(opens_raw, idx)) or close
        high = _as_finite_float(_list_get(highs_raw, idx)) or close
        low = _as_finite_float(_list_get(lows_raw, idx)) or close
        volume = _as_finite_float(_list_get(volumes_raw, idx)) or 0.0

        if low > high:
            low, high = high, low

        opens.append(open_val)
        highs.append(high)
        lows.append(low)
        closes.append(close)
        volumes.append(max(0, int(volume)))

    return {
        "open": opens,
        "high": highs,
        "low": lows,
        "close": closes,
        "volume": volumes,
    }


# ------------------------------------------------------------------
# The Tool
# ------------------------------------------------------------------
class TechnicalAnalyzer(_CrewAIBaseTool):
    """CrewAI-compatible tool that computes technical indicators for a
    given stock ticker: RSI, MACD, EMA, MA, Bollinger Bands, ATR,
    VWAP, OBV, and Stochastic Oscillator."""

    name: str = "Technical Analyzer"
    description: str = (
        "Computes technical analysis indicators for a stock ticker. "
        "Available indicators: RSI, MACD, EMA, Moving Averages, "
        "Bollinger Bands, ATR, VWAP, OBV, Stochastic Oscillator. "
        "Provide a ticker, period, and comma-separated list of indicators (or 'all')."
    )

    if CREWAI_AVAILABLE and TechnicalAnalyzerInput is not None:
        args_schema: Type = TechnicalAnalyzerInput  # type: ignore[assignment]

    def _run(self, ticker: str, period: str = "3mo", indicators: str = "all", **kwargs) -> str:
        """Execute the tool -- called by CrewAI or directly."""
        ticker = ticker.strip().upper()
        return self._analyze(ticker, period, indicators)

    # ---- public helpers (usable outside CrewAI) -----------------------

    def analyze_ticker(self, ticker: str, period: str = "3mo",
                       indicators: str = "all") -> Dict[str, Any]:
        """Return a dict with computed technical indicators."""
        return json.loads(self._analyze(ticker.strip().upper(), period, indicators))

    # ---- internals ----------------------------------------------------

    def _analyze(self, ticker: str, period: str, indicators: str) -> str:
        analytics = _get_analytics()
        if analytics is None:
            return json.dumps({"error": "StockAnalytics not available"})

        # Fetch price data via the analytics module
        price_data = analytics.get_stock_price_data(ticker, period)
        if not price_data or not price_data.get('close'):
            return json.dumps({"error": f"No price data available for {ticker} ({period})"})

        sanitized = _sanitize_ohlcv(price_data)
        closes = sanitized["close"]
        highs = sanitized["high"]
        lows = sanitized["low"]
        volumes = sanitized["volume"]

        if len(closes) < 5:
            return json.dumps({"error": f"Insufficient price data for {ticker}: only {len(closes)} bars"})

        # Decide which indicators to compute
        requested = set()
        if indicators.strip().lower() == "all":
            requested = {"rsi", "macd", "ma", "ema", "bollinger", "atr", "vwap", "obv", "stochastic"}
        else:
            for ind in indicators.split(","):
                requested.add(ind.strip().lower())

        result: Dict[str, Any] = {
            "ticker": ticker,
            "period": period,
            "data_points": len(closes),
            "current_price": closes[-1],
            "indicators": {},
        }

        # RSI (via existing analytics)
        if "rsi" in requested:
            rsi = analytics.calculate_rsi(closes)
            if rsi > 70:
                rsi_signal = "overbought"
            elif rsi < 30:
                rsi_signal = "oversold"
            elif 40 <= rsi <= 60:
                rsi_signal = "neutral"
            else:
                rsi_signal = "moderate"
            result["indicators"]["rsi"] = {
                "value": round(rsi, 2),
                "signal": rsi_signal,
            }

        # MACD (via existing analytics)
        if "macd" in requested:
            macd_val, signal_val, trend = analytics.calculate_macd(closes)
            result["indicators"]["macd"] = {
                "macd": round(macd_val, 4),
                "signal": round(signal_val, 4),
                "histogram": round(macd_val - signal_val, 4),
                "trend": trend,
            }

        # Moving Averages (via existing analytics)
        if "ma" in requested:
            mas = analytics.calculate_moving_averages(closes)
            result["indicators"]["moving_averages"] = mas

        # EMA (via existing analytics)
        if "ema" in requested:
            emas = {}
            for ema_period in [9, 12, 21, 26, 50]:
                ema_val = analytics.calculate_ema(closes, ema_period)
                emas[f"ema_{ema_period}"] = {
                    "value": round(ema_val, 4),
                    "signal": "bullish" if closes[-1] > ema_val else "bearish",
                }
            result["indicators"]["ema"] = emas

        # Bollinger Bands (NEW)
        if "bollinger" in requested:
            result["indicators"]["bollinger_bands"] = calculate_bollinger_bands(closes)

        # ATR (NEW)
        if "atr" in requested:
            result["indicators"]["atr"] = calculate_atr(highs, lows, closes)

        # VWAP (NEW)
        if "vwap" in requested:
            result["indicators"]["vwap"] = calculate_vwap(
                closes, highs, lows, volumes
            )

        # OBV (NEW)
        if "obv" in requested:
            result["indicators"]["obv"] = calculate_obv(closes, volumes)

        # Stochastic Oscillator (NEW)
        if "stochastic" in requested:
            result["indicators"]["stochastic"] = calculate_stochastic(
                closes, highs, lows
            )

        # Overall summary signal
        signals = []
        for ind_name, ind_data in result["indicators"].items():
            if isinstance(ind_data, dict):
                sig = ind_data.get("signal") or ind_data.get("trend")
                if sig:
                    signals.append(sig)

        bullish_count = sum(1 for s in signals if s in ("bullish", "oversold", "accumulation", "bullish_crossover", "lower_zone"))
        bearish_count = sum(1 for s in signals if s in ("bearish", "overbought", "distribution", "bearish_crossover", "upper_zone"))

        if bullish_count > bearish_count + 1:
            overall = "bullish"
        elif bearish_count > bullish_count + 1:
            overall = "bearish"
        else:
            overall = "neutral"

        result["overall_signal"] = overall
        result["bullish_indicators"] = bullish_count
        result["bearish_indicators"] = bearish_count

        return json.dumps(result)
