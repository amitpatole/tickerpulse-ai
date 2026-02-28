"""
TickerPulse AI v3.0 - Performance Comparison API
GET /api/stocks/compare — returns % return series normalized to 0% at period
start for up to 4 symbols, fetched in parallel via yfinance.
"""

import math
import logging
import concurrent.futures

from flask import Blueprint, jsonify, request

from backend.core.error_codes import ErrorCode
from backend.core.error_handlers import handle_api_errors, ValidationError

logger = logging.getLogger(__name__)

compare_bp = Blueprint('compare', __name__, url_prefix='/api/stocks')

_TIMEFRAME_MAP = {
    '1D': ('1d', '5m'),
    '1W': ('5d', '15m'),
    '1M': ('1mo', '1d'),
    '3M': ('3mo', '1d'),
    '6M': ('6mo', '1d'),
    '1Y': ('1y', '1d'),
    '5Y': ('5y', '1wk'),
}

_MAX_SYMBOLS = 5


def _fetch_series(symbol: str, period: str, interval: str) -> dict:
    """Fetch OHLCV for one symbol and return a normalized % return series.

    Returns a dict with keys:
        symbol (str): The ticker symbol.
        points (list | None): [{time, value}, ...] where value = (close/first_close - 1)*100.
        current_pct (float | None): Last value in points.
        error (str | None): Human-readable error when data is unavailable.
        error_code (str | None): Machine-readable error code when data is unavailable.
    """
    try:
        import yfinance as yf
        tk = yf.Ticker(symbol)
        hist = tk.history(period=period, interval=interval)

        if hist.empty:
            return {
                'symbol': symbol,
                'points': None,
                'current_pct': None,
                'error': 'No data for selected range',
                'error_code': ErrorCode.NOT_FOUND,
            }

        raw_closes = []
        for ts, row in hist.iterrows():
            try:
                close = float(row['Close'])
                if math.isnan(close):
                    continue
            except (TypeError, ValueError):
                continue
            raw_closes.append((int(ts.timestamp()), close))

        if not raw_closes:
            return {
                'symbol': symbol,
                'points': None,
                'current_pct': None,
                'error': 'No data for selected range',
                'error_code': ErrorCode.NOT_FOUND,
            }

        first_close = raw_closes[0][1]
        if first_close == 0:
            return {
                'symbol': symbol,
                'points': None,
                'current_pct': None,
                'error': 'No data for selected range',
                'error_code': ErrorCode.NOT_FOUND,
            }

        points = [
            {'time': ts, 'value': round((close / first_close - 1) * 100.0, 4)}
            for ts, close in raw_closes
        ]
        return {
            'symbol': symbol,
            'points': points,
            'current_pct': points[-1]['value'],
            'error': None,
            'error_code': None,
        }

    except ImportError:
        logger.error("yfinance is not installed")
        return {
            'symbol': symbol,
            'points': None,
            'current_pct': None,
            'error': 'Data provider unavailable',
            'error_code': ErrorCode.DATA_PROVIDER_UNAVAILABLE,
        }
    except Exception as exc:
        logger.warning("Failed to fetch %s: %s", symbol, exc)
        return {
            'symbol': symbol,
            'points': None,
            'current_pct': None,
            'error': 'No data for selected range',
            'error_code': ErrorCode.NOT_FOUND,
        }


@compare_bp.route('/compare', methods=['GET'])
@handle_api_errors
def compare_stocks():
    """Return % return series for up to 5 symbols, each rebased to 0% at period start.

    Query Parameters:
        symbols (str): Required. Comma-separated ticker symbols, max 5.
        timeframe (str): Optional. One of 1D, 1W, 1M, 3M, 6M, 1Y, 5Y. Default 1M.

    Returns:
        200 — JSON dict keyed by symbol. Each value is one of:
            { "points": [{"time": int, "value": float}, ...], "current_pct": float }
            { "error": "No data for selected range", "error_code": "NOT_FOUND" }
        400 — { "error": "...", "error_code": "..." } when symbols is missing or exceeds 5.
    """
    symbols_param = request.args.get('symbols', '').strip()
    if not symbols_param:
        raise ValidationError('symbols parameter is required', error_code='MISSING_FIELD')

    symbols = [s.strip().upper() for s in symbols_param.split(',') if s.strip()]
    if not symbols:
        raise ValidationError('symbols parameter is required', error_code='MISSING_FIELD')

    if len(symbols) > _MAX_SYMBOLS:
        raise ValidationError(
            f'Maximum {_MAX_SYMBOLS} symbols allowed',
            error_code='INVALID_INPUT',
        )

    timeframe = request.args.get('timeframe', '1M').strip()
    if timeframe not in _TIMEFRAME_MAP:
        raise ValidationError(
            f'Invalid timeframe. Must be one of: {", ".join(_TIMEFRAME_MAP)}',
            error_code='INVALID_INPUT',
        )

    period, interval = _TIMEFRAME_MAP[timeframe]

    # Fetch all symbols in parallel
    raw_results: dict[str, dict] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=_MAX_SYMBOLS) as executor:
        future_map = {
            executor.submit(_fetch_series, symbol, period, interval): symbol
            for symbol in symbols
        }
        for future in concurrent.futures.as_completed(future_map):
            result = future.result()
            raw_results[result['symbol']] = result

    # Build response dict keyed by symbol — include error_code in partial failures
    response: dict[str, dict] = {}
    for symbol in symbols:
        result = raw_results.get(symbol, {})
        if result.get('error') or not result.get('points'):
            response[symbol] = {
                'error': result.get('error', 'No data for selected range'),
                'error_code': result.get('error_code', ErrorCode.NOT_FOUND),
            }
        else:
            response[symbol] = {
                'points': result['points'],
                'current_pct': result['current_pct'],
            }

    return jsonify(response)
