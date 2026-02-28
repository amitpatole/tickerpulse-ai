"""
TickerPulse AI v3.0 - Stocks API Routes
Blueprint for stock management endpoints: list, add, remove, and search stocks.
"""

import math
import logging

from flask import Blueprint, jsonify, request

from backend.core.stock_manager import get_all_stocks, add_stock, remove_stock, search_stock_ticker
from backend.core.ai_analytics import StockAnalytics
from backend.core.error_handlers import (
    NotFoundError,
    ServiceUnavailableError,
    ValidationError,
    handle_api_errors,
)
from backend.database import db_session, pooled_session

logger = logging.getLogger(__name__)

stocks_bp = Blueprint('stocks', __name__, url_prefix='/api')


@stocks_bp.route('/stocks', methods=['GET'])
@handle_api_errors
def get_stocks():
    """Get all monitored stocks.

    Query Parameters:
        market (str, optional): Filter by market (e.g. 'US', 'India'). 'All' returns everything.

    Returns:
        JSON array of stock objects with ticker, name, market, added_at, active fields.
    """
    market = request.args.get('market', None)
    stocks = get_all_stocks()

    if market and market != 'All':
        stocks = [s for s in stocks if s.get('market') == market]

    return jsonify(stocks)


@stocks_bp.route('/stocks', methods=['POST'])
@handle_api_errors
def add_stock_endpoint():
    """Add a new stock to the monitored list.

    Request Body (JSON):
        ticker (str): Stock ticker symbol (e.g. 'AAPL', 'RELIANCE.NS')
        name (str, optional): Company name. Validated via Yahoo Finance if omitted.
        market (str, optional): Market identifier, defaults to 'US'

    Returns:
        JSON object with 'success' boolean and stock details.
        Returns 404 if ticker is not found on any exchange.
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        raise ValidationError('Request body must be valid JSON', error_code='INVALID_INPUT')

    if 'ticker' not in data:
        raise ValidationError('Missing required field: ticker', error_code='MISSING_FIELD')

    ticker = data['ticker'].strip().upper()
    name = data.get('name')

    if not name:
        results = search_stock_ticker(ticker)
        match = next((r for r in results if r['ticker'].upper() == ticker), None)
        if match:
            name = match.get('name', ticker)
        elif results:
            suggestions = [f"{r['ticker']} ({r['name']})" for r in results[:3]]
            raise NotFoundError(
                f"Ticker '{ticker}' not found. Did you mean: {', '.join(suggestions)}?"
            )
        else:
            raise NotFoundError(f"Ticker '{ticker}' not found on any exchange.")

    market = data.get('market', 'US')
    success = add_stock(ticker, name, market)
    return jsonify({'success': success, 'ticker': ticker, 'name': name, 'market': market})


@stocks_bp.route('/stocks/<ticker>', methods=['DELETE'])
@handle_api_errors
def remove_stock_endpoint(ticker):
    """Remove a stock from monitoring (soft delete).

    Path Parameters:
        ticker (str): Stock ticker symbol to remove.

    Returns:
        JSON object with 'success' boolean.
    """
    success = remove_stock(ticker)
    return jsonify({'success': success})


@stocks_bp.route('/stocks/prices', methods=['GET'])
@handle_api_errors
def get_bulk_prices():
    """Return current prices for multiple tickers in one database query.

    Query Parameters:
        tickers (str): Comma-separated list of ticker symbols (e.g. 'AAPL,MSFT,NVDA').

    Returns:
        JSON object keyed by ticker, each containing price, change, change_pct, ts.
        Tickers not found in the database are silently omitted.
        Returns 400 if tickers param is missing or empty.

    Example response:
        {
          "AAPL": {"price": 189.23, "change": 1.12, "change_pct": 0.60, "ts": "2026-02-28T14:00:00"},
          "MSFT": {"price": 415.10, "change": -0.50, "change_pct": -0.12, "ts": "2026-02-28T14:00:00"}
        }
    """
    tickers_param = request.args.get('tickers', '').strip()
    if not tickers_param:
        raise ValidationError(
            'Missing required parameter: tickers', error_code='MISSING_FIELD'
        )

    tickers = [t.strip().upper() for t in tickers_param.split(',') if t.strip()]
    if not tickers:
        raise ValidationError('No valid tickers provided', error_code='INVALID_INPUT')

    placeholders = ','.join('?' * len(tickers))
    with pooled_session() as conn:
        rows = conn.execute(
            f'SELECT ticker, current_price, price_change, price_change_pct, updated_at'
            f' FROM ai_ratings WHERE ticker IN ({placeholders})',
            tickers,
        ).fetchall()

    result = {}
    for row in rows:
        if row['current_price'] is None:
            continue
        result[row['ticker']] = {
            'price': row['current_price'],
            'change': row['price_change'],
            'change_pct': row['price_change_pct'],
            'ts': row['updated_at'],
        }

    return jsonify(result)


_TIMEFRAME_MAP = {
    '1D': ('1d', '5m'),
    '1W': ('5d', '15m'),
    '1M': ('1mo', '1d'),
    '3M': ('3mo', '1d'),
    '6M': ('6mo', '1d'),
    '1Y': ('1y', '1d'),
    '5Y': ('5y', '1wk'),
    'All': ('max', '1mo'),
}


def _fetch_candles(ticker: str, timeframe: str) -> list:
    """Fetch OHLCV candlestick data for a ticker and timeframe.

    Args:
        ticker: Stock ticker symbol (already normalized to uppercase).
        timeframe: One of the keys in _TIMEFRAME_MAP. Unknown keys default to 1M mapping.

    Returns:
        List of candle dicts with time, open, high, low, close, volume keys.
        NaN close prices are silently skipped.

    Raises:
        NotFoundError: If the ticker has no price history for the given timeframe.
        ServiceUnavailableError: If yfinance is not installed.
    """
    try:
        import yfinance as yf
    except ImportError:
        raise ServiceUnavailableError("yfinance is not installed")

    period, interval = _TIMEFRAME_MAP.get(timeframe, ('1mo', '1d'))

    tk = yf.Ticker(ticker)
    hist = tk.history(period=period, interval=interval)

    if hist.empty:
        raise NotFoundError(f"Ticker '{ticker}' not found or has no price history for {timeframe}")

    candles = []
    for ts, row in hist.iterrows():
        try:
            close = float(row['Close'])
            if math.isnan(close):
                continue
        except (TypeError, ValueError):
            continue
        candles.append({
            'time': int(ts.timestamp()),
            'open': round(float(row['Open']), 4),
            'high': round(float(row['High']), 4),
            'low': round(float(row['Low']), 4),
            'close': round(close, 4),
            'volume': int(row.get('Volume', 0) or 0),
        })

    if not candles:
        raise NotFoundError(f"Ticker '{ticker}' not found or has no price history for {timeframe}")

    return candles


@stocks_bp.route('/stocks/<ticker>/candles', methods=['GET'])
@handle_api_errors
def get_stock_candles(ticker):
    """Return OHLCV candlestick data for a single ticker and timeframe.

    Path Parameters:
        ticker (str): Stock ticker symbol (e.g. 'AAPL', 'RELIANCE.NS').

    Query Parameters:
        timeframe (str, optional): One of 1D, 1W, 1M, 3M, 6M, 1Y, 5Y, All. Default 1M.

    Returns:
        JSON array of candle objects. Returns 404 for unknown tickers.
    """
    ticker = ticker.upper().strip()
    timeframe = request.args.get('timeframe', '1M')
    candles = _fetch_candles(ticker, timeframe)
    return jsonify(candles)


@stocks_bp.route('/stocks/<ticker>/detail', methods=['GET'])
@handle_api_errors
def get_stock_detail(ticker):
    """Aggregate quote, candlestick data, technical indicators, and news for a single ticker.

    Path Parameters:
        ticker (str): Stock ticker symbol (e.g. 'AAPL', 'RELIANCE.NS').

    Query Parameters:
        timeframe (str, optional): One of 1D, 1W, 1M, 3M, 1Y. Default 1M.

    Returns:
        JSON with quote, candles, indicators, and news. Returns 404 for invalid tickers.
    """
    ticker = ticker.upper().strip()
    timeframe = request.args.get('timeframe', '1M')

    candles = _fetch_candles(ticker, timeframe)

    try:
        import yfinance as yf
        tk = yf.Ticker(ticker)

        fast_info = tk.fast_info
        last_price = getattr(fast_info, 'last_price', None)
        price = float(last_price) if last_price is not None else candles[-1]['close']
        prev_close_raw = getattr(fast_info, 'previous_close', None)
        prev_close = float(prev_close_raw) if prev_close_raw is not None else price
        change = price - prev_close
        change_pct = (change / prev_close * 100) if prev_close else 0.0
        market_cap = getattr(fast_info, 'market_cap', None)
        week_52_high = getattr(fast_info, 'fifty_two_week_high', None)
        week_52_low = getattr(fast_info, 'fifty_two_week_low', None)
        currency = getattr(fast_info, 'currency', 'USD') or 'USD'
        volume = int(getattr(fast_info, 'last_volume', 0) or 0)

        pe_ratio = None
        eps = None
        name = ticker
        try:
            info = tk.info
            pe_ratio = info.get('trailingPE')
            eps = info.get('trailingEps')
            name = info.get('shortName') or info.get('longName') or ticker
        except Exception:
            pass

        quote = {
            'price': round(price, 2),
            'change_pct': round(change_pct, 2),
            'volume': volume,
            'market_cap': market_cap,
            'week_52_high': week_52_high,
            'week_52_low': week_52_low,
            'pe_ratio': pe_ratio,
            'eps': eps,
            'name': name,
            'currency': currency,
        }

    except ImportError:
        raise ServiceUnavailableError("yfinance is not installed")

    analytics = StockAnalytics()
    indicators = analytics.get_technical_indicators(ticker)

    with db_session() as conn:
        news_rows = conn.execute(
            '''SELECT title, source, published_date, url, sentiment_label, sentiment_score
               FROM news WHERE ticker = ? ORDER BY created_at DESC LIMIT 10''',
            (ticker,),
        ).fetchall()

    news = [{
        'title': row['title'],
        'source': row['source'],
        'published_date': row['published_date'],
        'url': row['url'],
        'sentiment_label': row['sentiment_label'],
        'sentiment_score': row['sentiment_score'],
    } for row in news_rows]

    return jsonify({
        'quote': quote,
        'candles': candles,
        'indicators': indicators,
        'news': news,
    })


@stocks_bp.route('/stocks/search', methods=['GET'])
@handle_api_errors
def search_stocks():
    """Search for stock tickers via Yahoo Finance.

    Query Parameters:
        q (str): Search query string (company name or ticker fragment).

    Returns:
        JSON array of matching stocks with ticker, name, exchange, type fields.
        Returns empty array if query is empty.
    """
    query = request.args.get('q', '')
    if not query:
        return jsonify([])

    results = search_stock_ticker(query)
    return jsonify(results)
