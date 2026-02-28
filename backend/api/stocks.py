
"""
TickerPulse AI v3.0 - Stocks API Routes
Blueprint for stock management endpoints: list, add, remove, search, and bulk prices.
"""

import math
import logging
from datetime import datetime, timezone, timedelta

from flask import Blueprint, jsonify, request

from backend.core.stock_manager import get_all_stocks, add_stock, remove_stock, search_stock_ticker
from backend.core.ai_analytics import StockAnalytics
from backend.database import pooled_session
from backend.core.error_handlers import (
    handle_api_errors,
    ValidationError,
    NotFoundError,
    ServiceUnavailableError,
    DatabaseError,
)

logger = logging.getLogger(__name__)

stocks_bp = Blueprint('stocks', __name__, url_prefix='/api')

_FINANCIALS_CACHE_TTL_HOURS = 4


def _get_financials_from_cache(ticker: str):
    """Return cached financials dict for ticker if within TTL, else None."""
    try:
        with pooled_session() as conn:
            row = conn.execute(
                'SELECT * FROM financials_cache WHERE ticker = ?', (ticker,)
            ).fetchone()
        if not row or not row['fetched_at']:
            return None
        cache_time = datetime.fromisoformat(row['fetched_at'].replace('Z', '+00:00'))
        if cache_time.tzinfo is None:
            cache_time = cache_time.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - cache_time < timedelta(hours=_FINANCIALS_CACHE_TTL_HOURS):
            return dict(row)
    except Exception as e:
        logger.debug("financials_cache miss for %s: %s", ticker, e)
    return None


def _save_financials_to_cache(ticker: str, data: dict) -> None:
    """Upsert financials data into financials_cache."""
    try:
        with pooled_session() as conn:
            conn.execute(
                '''INSERT INTO financials_cache
                   (ticker, pe_ratio, eps, market_cap, dividend_yield, beta, avg_volume,
                    book_value, week_52_high, week_52_low, name, fetched_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(ticker) DO UPDATE SET
                   pe_ratio=excluded.pe_ratio,
                   eps=excluded.eps,
                   market_cap=excluded.market_cap,
                   dividend_yield=excluded.dividend_yield,
                   beta=excluded.beta,
                   avg_volume=excluded.avg_volume,
                   book_value=excluded.book_value,
                   week_52_high=excluded.week_52_high,
                   week_52_low=excluded.week_52_low,
                   name=excluded.name,
                   fetched_at=excluded.fetched_at''',
                (
                    ticker,
                    data.get('pe_ratio'),
                    data.get('eps'),
                    data.get('market_cap'),
                    data.get('dividend_yield'),
                    data.get('beta'),
                    data.get('avg_volume'),
                    data.get('book_value'),
                    data.get('week_52_high'),
                    data.get('week_52_low'),
                    data.get('name'),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
    except Exception as e:
        logger.warning("Could not write financials cache for %s: %s", ticker, e)


@stocks_bp.route('/stocks', methods=['GET'])
def get_stocks():
    """Get all monitored stocks."""
    market = request.args.get('market', None)
    stocks = get_all_stocks()

    if market and market != 'All':
        stocks = [s for s in stocks if s.get('market') == market]

    return jsonify(stocks)


@stocks_bp.route('/stocks', methods=['POST'])
@handle_api_errors
def add_stock_endpoint():
    """Add a new stock to the monitored list."""
    data = request.json
    if not data or 'ticker' not in data:
        raise ValidationError(
            'Missing required field: ticker',
            error_code='MISSING_FIELD',
            field_errors=[{'field': 'ticker', 'message': 'Ticker is required'}],
        )

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
                f"Ticker '{ticker}' not found. Did you mean: {', '.join(suggestions)}?",
                error_code='TICKER_NOT_FOUND',
            )
        else:
            raise NotFoundError(
                f"Ticker '{ticker}' not found on any exchange.",
                error_code='TICKER_NOT_FOUND',
            )

    market = data.get('market', 'US')
    success = add_stock(ticker, name, market)
    return jsonify({'success': success, 'ticker': ticker, 'name': name, 'market': market})


@stocks_bp.route('/stocks/<ticker>', methods=['DELETE'])
def remove_stock_endpoint(ticker):
    """Remove a stock from monitoring (soft delete)."""
    success = remove_stock(ticker)
    return jsonify({'success': success})


@stocks_bp.route('/stocks/prices', methods=['GET'])
@handle_api_errors
def get_bulk_prices():
    """Get the most-recent cached prices for all active stocks.

    Reads from the ``ai_ratings`` table, which is updated by the
    ``price_refresh`` job on its configured schedule.  For continuous
    real-time streaming use the WebSocket endpoint at ``/api/ws/prices``.

    Returns:
        JSON object mapping ticker → {ticker, price, change, change_pct, timestamp}.
        Tickers with no cached price are omitted.
    """
    try:
        with pooled_session() as conn:
            rows = conn.execute(
                '''SELECT ar.ticker, ar.current_price, ar.price_change,
                          ar.price_change_pct, ar.updated_at
                   FROM ai_ratings ar
                   INNER JOIN stocks s ON s.ticker = ar.ticker
                   WHERE s.active = 1
                     AND ar.current_price IS NOT NULL'''
            ).fetchall()

        result = {}
        for row in rows:
            result[row['ticker']] = {
                'ticker': row['ticker'],
                'price': row['current_price'],
                'change': row['price_change'] or 0.0,
                'change_pct': row['price_change_pct'] or 0.0,
                'timestamp': row['updated_at'],
            }
        return jsonify(result)
    except Exception as e:
        logger.error("Error fetching bulk prices: %s", e)
        raise DatabaseError('Unable to retrieve price data')


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


@stocks_bp.route('/stocks/<ticker>/detail', methods=['GET'])
@handle_api_errors
def get_stock_detail(ticker):
    """Aggregate quote, candlestick data, technical indicators, and news for a single ticker."""
    ticker = ticker.upper().strip()
    timeframe = request.args.get('timeframe', '1M')
    period, interval = _TIMEFRAME_MAP.get(timeframe, ('1mo', '1d'))

    try:
        import yfinance as yf
        tk = yf.Ticker(ticker)
        hist = tk.history(period=period, interval=interval)

        if hist.empty:
            raise NotFoundError(f"Ticker '{ticker}' not found", error_code='TICKER_NOT_FOUND')

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
            raise NotFoundError(f"Ticker '{ticker}' not found", error_code='TICKER_NOT_FOUND')

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
        dividend_yield = None
        beta = None
        avg_volume = None
        book_value = None

        # Serve slow tk.info fields from cache (4-hour TTL)
        cached_fin = _get_financials_from_cache(ticker)
        if cached_fin is not None:
            pe_ratio = cached_fin.get('pe_ratio')
            eps = cached_fin.get('eps')
            name = cached_fin.get('name') or ticker
            dividend_yield = cached_fin.get('dividend_yield')
            beta = cached_fin.get('beta')
            avg_volume = cached_fin.get('avg_volume')
            book_value = cached_fin.get('book_value')
        else:
            try:
                info = tk.info
                pe_ratio = info.get('trailingPE')
                eps = info.get('trailingEps')
                name = info.get('shortName') or info.get('longName') or ticker
                raw_yield = info.get('dividendYield')
                if raw_yield is not None:
                    dividend_yield = round(float(raw_yield) * 100, 4)
                beta_raw = info.get('beta')
                if beta_raw is not None:
                    beta = round(float(beta_raw), 4)
                avg_vol_raw = info.get('averageVolume')
                if avg_vol_raw is not None:
                    avg_volume = int(avg_vol_raw)
                bv_raw = info.get('bookValue')
                if bv_raw is not None:
                    book_value = round(float(bv_raw), 4)
                _save_financials_to_cache(ticker, {
                    'pe_ratio': pe_ratio,
                    'eps': eps,
                    'name': name,
                    'market_cap': market_cap,
                    'dividend_yield': dividend_yield,
                    'beta': beta,
                    'avg_volume': avg_volume,
                    'book_value': book_value,
                    'week_52_high': week_52_high,
                    'week_52_low': week_52_low,
                })
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
            'dividend_yield': dividend_yield,
            'beta': beta,
            'avg_volume': avg_volume,
            'book_value': book_value,
            'name': name,
            'currency': currency,
        }

    except ImportError:
        logger.error("yfinance is not installed")
        raise ServiceUnavailableError(
            'Data provider unavailable',
            error_code='DATA_PROVIDER_UNAVAILABLE',
        )
    except (NotFoundError, ServiceUnavailableError):
        raise
    except Exception as e:
        logger.error("Error fetching stock detail for %s: %s", ticker, e)
        raise NotFoundError(f"Ticker '{ticker}' not found", error_code='TICKER_NOT_FOUND')

    indicators = None
    try:
        analytics = StockAnalytics()
        indicators = analytics.get_technical_indicators(ticker)
    except Exception as e:
        logger.warning("Could not compute technical indicators for %s: %s", ticker, e)

    news = []
    ai_rating = None
    try:
        with pooled_session() as conn:
            news_rows = conn.execute(
                '''SELECT title, source, published_date, url, sentiment_label, sentiment_score
                   FROM news WHERE ticker = ? ORDER BY created_at DESC LIMIT 10''',
                (ticker,)
            ).fetchall()
            ai_row = conn.execute(
                '''SELECT rating, score, confidence, technical_score, fundamental_score,
                          summary, sentiment_label, updated_at
                   FROM ai_ratings WHERE ticker = ?''',
                (ticker,)
            ).fetchone()
        news = [{
            'title': row['title'],
            'source': row['source'],
            'published_date': row['published_date'],
            'url': row['url'],
            'sentiment_label': row['sentiment_label'],
            'sentiment_score': row['sentiment_score'],
        } for row in news_rows]
        if ai_row:
            ai_rating = {
                'rating': ai_row['rating'],
                'score': ai_row['score'] or 0,
                'confidence': ai_row['confidence'] or 0,
                'technical_score': ai_row['technical_score'],
                'fundamental_score': ai_row['fundamental_score'],
                'summary': ai_row['summary'],
                'sentiment_label': ai_row['sentiment_label'],
                'updated_at': ai_row['updated_at'],
            }
    except Exception as e:
        logger.warning("Could not fetch DB data for %s: %s", ticker, e)

    return jsonify({
        'quote': quote,
        'candles': candles,
        'indicators': indicators,
        'news': news,
        'ai_rating': ai_rating,
    })


@stocks_bp.route('/stocks/search', methods=['GET'])
def search_stocks():
    """Search for stock tickers via Yahoo Finance."""
    query = request.args.get('q', '')
    if not query:
        return jsonify([])

    results = search_stock_ticker(query)
    return jsonify(results)


_VOLUME_PROFILE_MAX_BUCKETS = 200
_VOLUME_PROFILE_DEFAULT_BUCKETS = 36


@stocks_bp.route('/stocks/<ticker>/volume-profile', methods=['GET'])
@handle_api_errors
def get_volume_profile(ticker: str):
    """Return a volume profile for *ticker* over a given timeframe.

    Volume is distributed proportionally across equal-width price buckets
    based on each candle's [low, high] range.  Also returns Value Area
    metrics (POC, VAH, VAL at the 70 % threshold).

    Query params:
        timeframe (str): Any key from the shared timeframe map (default '1M').
        buckets   (int): Price bucket count, 2–200 (default 36).

    Returns:
        200 JSON::

            {
              "ticker":     "AAPL",
              "timeframe":  "1M",
              "buckets": [
                {"price_low": 180.0, "price_high": 181.5,
                 "volume": 12345678, "pct": 4.2},
                ...
              ],
              "value_area": {
                "poc": 182.75,
                "poc_volume": 25000000,
                "vah": 185.0,
                "val": 180.0
              }
            }
    """
    ticker = ticker.upper().strip()

    timeframe = request.args.get('timeframe', '1M')
    if timeframe not in _TIMEFRAME_MAP:
        raise ValidationError(
            f"Unknown timeframe '{timeframe}'. "
            f"Valid options: {', '.join(_TIMEFRAME_MAP)}",
            error_code='INVALID_TIMEFRAME',
        )

    raw_buckets = request.args.get('buckets', str(_VOLUME_PROFILE_DEFAULT_BUCKETS))
    try:
        n_buckets = int(raw_buckets)
    except ValueError:
        raise ValidationError(
            "'buckets' must be an integer",
            error_code='INVALID_PARAM',
        )
    n_buckets = max(2, min(_VOLUME_PROFILE_MAX_BUCKETS, n_buckets))

    period, interval = _TIMEFRAME_MAP[timeframe]

    try:
        import yfinance as yf
        tk = yf.Ticker(ticker)
        hist = tk.history(period=period, interval=interval)
    except ImportError:
        raise ServiceUnavailableError(
            'Data provider unavailable',
            error_code='DATA_PROVIDER_UNAVAILABLE',
        )
    except Exception as e:
        logger.error("yfinance error fetching volume profile for %s: %s", ticker, e)
        raise NotFoundError(f"Ticker '{ticker}' not found", error_code='TICKER_NOT_FOUND')

    if hist.empty:
        raise NotFoundError(f"Ticker '{ticker}' not found", error_code='TICKER_NOT_FOUND')

    candles = []
    for _, row in hist.iterrows():
        try:
            close = float(row['Close'])
            if math.isnan(close):
                continue
        except (TypeError, ValueError):
            continue
        candles.append({
            'open': float(row['Open']),
            'high': float(row['High']),
            'low': float(row['Low']),
            'close': close,
            'volume': int(row.get('Volume', 0) or 0),
        })

    if not candles:
        raise NotFoundError(
            f"No price data available for '{ticker}'",
            error_code='TICKER_NOT_FOUND',
        )

    profile = StockAnalytics.calculate_volume_profile(candles, buckets=n_buckets)

    return jsonify({
        'ticker': ticker,
        'timeframe': timeframe,
        **profile,
    })
