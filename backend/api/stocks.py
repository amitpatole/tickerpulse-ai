```python
"""
TickerPulse AI v3.0 - Stocks API Routes
Blueprint for stock management endpoints: list, add, remove, and search stocks.
"""

import math
import logging

from flask import Blueprint, jsonify, request

from backend.core.stock_manager import get_all_stocks, add_stock, remove_stock, search_stock_ticker
from backend.core.ai_analytics import StockAnalytics
from backend.core.error_handlers import NotFoundError, ServiceUnavailableError
from backend.database import get_db_connection

logger = logging.getLogger(__name__)

stocks_bp = Blueprint('stocks', __name__, url_prefix='/api')


@stocks_bp.route('/stocks', methods=['GET'])
def get_stocks():
    """Get all monitored stocks.

    Query Parameters:
        market (str, optional): Filter by market (e.g. 'US', 'India'). 'All' returns everything.

    Returns:
        JSON array of stock objects with ticker, name, market, added_at, active fields.
    """
    market = request.args.get('market', None)
    stocks = get_all_stocks()

    # Filter by market if specified
    if market and market != 'All':
        stocks = [s for s in stocks if s.get('market') == market]

    return jsonify(stocks)


@stocks_bp.route('/stocks', methods=['POST'])
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
    data = request.json
    if not data or 'ticker' not in data:
        return jsonify({'success': False, 'error': 'Missing required field: ticker'}), 400

    ticker = data['ticker'].strip().upper()
    name = data.get('name')

    # Validate ticker exists and look up name if not provided
    if not name:
        results = search_stock_ticker(ticker)
        # Check for an exact ticker match
        match = next((r for r in results if r['ticker'].upper() == ticker), None)
        if match:
            name = match.get('name', ticker)
        elif results:
            # No exact match — reject with suggestions
            suggestions = [f"{r['ticker']} ({r['name']})" for r in results[:3]]
            return jsonify({
                'success': False,
                'error': f"Ticker '{ticker}' not found. Did you mean: {', '.join(suggestions)}?"
            }), 404
        else:
            return jsonify({
                'success': False,
                'error': f"Ticker '{ticker}' not found on any exchange."
            }), 404

    market = data.get('market', 'US')
    success = add_stock(ticker, name, market)
    return jsonify({'success': success, 'ticker': ticker, 'name': name, 'market': market})


@stocks_bp.route('/stocks/<ticker>', methods=['DELETE'])
def remove_stock_endpoint(ticker):
    """Remove a stock from monitoring (soft delete).

    Path Parameters:
        ticker (str): Stock ticker symbol to remove.

    Returns:
        JSON object with 'success' boolean.
    """
    success = remove_stock(ticker)
    return jsonify({'success': success})


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

    try:
        candles = _fetch_candles(ticker, timeframe)
        return jsonify(candles)
    except NotFoundError as exc:
        return jsonify({'error': str(exc)}), 404
    except ServiceUnavailableError:
        logger.error("yfinance unavailable when fetching candles for %s", ticker)
        return jsonify({'error': 'data provider unavailable'}), 503
    except Exception as exc:
        logger.error("Error fetching candles for %s: %s", ticker, exc)
        return jsonify({'error': 'ticker not found'}), 404


@stocks_bp.route('/stocks/<ticker>/detail', methods=['GET'])
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

    try:
        candles = _fetch_candles(ticker, timeframe)
    except NotFoundError:
        return jsonify({'error': 'ticker not found'}), 404
    except ServiceUnavailableError:
        logger.error("yfinance is not installed")
        return jsonify({'error': 'data provider unavailable'}), 503
    except Exception as exc:
        logger.error("Error fetching stock detail for %s: %s", ticker, exc)
        return jsonify({'error': 'ticker not found'}), 404

    try:
        import yfinance as yf
        tk = yf.Ticker(ticker)

        # Fast quote fields
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

        # Extended info for P/E, EPS, and name (best-effort)
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
        logger.error("yfinance is not installed")
        return jsonify({'error': 'data provider unavailable'}), 503
    except Exception as exc:
        logger.error("Error fetching quote for %s: %s", ticker, exc)
        return jsonify({'error': 'ticker not found'}), 404

    # Technical indicators via ai_analytics
    analytics = StockAnalytics()
    indicators = analytics.get_technical_indicators(ticker)

    # Recent news from database
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        '''SELECT title, source, published_date, url, sentiment_label, sentiment_score
           FROM news WHERE ticker = ? ORDER BY created_at DESC LIMIT 10''',
        (ticker,)
    )
    news_rows = cursor.fetchall()
    conn.close()

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
```