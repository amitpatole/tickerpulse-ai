"""
TickerPulse AI v3.0 - Analysis API Routes
Blueprint for AI ratings and chart data endpoints.
"""

from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta, timezone
import math
import logging

from backend.core.ai_analytics import StockAnalytics
from backend.core.error_codes import ErrorCode
from backend.database import pooled_session
from backend.core.error_handlers import handle_api_errors, ValidationError, NotFoundError

logger = logging.getLogger(__name__)

analysis_bp = Blueprint('analysis', __name__, url_prefix='/api')

AI_RATINGS_CACHE_TTL_SECONDS = 300  # 5 minutes, configurable


def _parse_pagination(args):
    """Parse and validate page/page_size query parameters.

    Returns (page, page_size, error_response). On success, error_response is None.
    On validation failure, page and page_size are None and error_response is a
    (response, status_code) tuple ready to return from a Flask view.
    """
    try:
        page = int(args.get('page', 1))
        page_size = int(args.get('page_size', 25))
    except (ValueError, TypeError):
        return None, None, (jsonify({'error': 'page and page_size must be integers', 'error_code': 'INVALID_INPUT'}), 400)

    if page < 1:
        return None, None, (jsonify({'error': 'page must be a positive integer', 'error_code': 'INVALID_INPUT'}), 400)

    if not (1 <= page_size <= 100):
        return None, None, (jsonify({'error': 'page_size must be between 1 and 100', 'error_code': 'INVALID_INPUT'}), 400)

    return page, page_size, None


def _get_cached_ratings():
    """Try to read pre-computed ratings from ai_ratings table."""
    try:
        cutoff = datetime.utcnow() - timedelta(seconds=AI_RATINGS_CACHE_TTL_SECONDS)
        with pooled_session() as conn:
            rows = conn.execute("""
                SELECT * FROM ai_ratings
                WHERE updated_at >= ?
                ORDER BY ticker
            """, (cutoff.isoformat(),)).fetchall()
        if rows:
            return [
                {
                    'ticker': r['ticker'],
                    'rating': r['rating'],
                    'score': r['score'] or 0,
                    'confidence': r['confidence'] or 0,
                    'current_price': r['current_price'] or 0,
                    'price_change': r['price_change'] or 0,
                    'price_change_pct': r['price_change_pct'] or 0,
                    'rsi': r['rsi'] or 0,
                    'sentiment_score': r['sentiment_score'] or 0,
                    'sentiment_label': r['sentiment_label'] or 'neutral',
                    'technical_score': r['technical_score'] or 0,
                    'fundamental_score': r['fundamental_score'] or 0,
                    'updated_at': r['updated_at'],
                }
                for r in rows
            ]
    except Exception as e:
        logger.debug(f"No cached ratings: {e}")
    return None


@analysis_bp.route('/ai/ratings', methods=['GET'])
@handle_api_errors
def get_ai_ratings():
    """Get AI ratings for all active stocks.

    Serves cached ratings from ai_ratings table, then computes live ratings
    for any active stocks that are missing from the cache.

    Query Parameters:
        watchlist_id (int, optional): When provided, restrict results to stocks
            belonging to the specified watchlist group.
    """
    analytics = StockAnalytics()
    watchlist_id = request.args.get('watchlist_id', type=int)

    # Get active stock tickers, optionally scoped to a watchlist
    try:
        with pooled_session() as conn:
            if watchlist_id is not None:
                rows = conn.execute(
                    """
                    SELECT DISTINCT s.ticker
                    FROM stocks s
                    JOIN watchlist_stocks ws ON ws.ticker = s.ticker
                    WHERE s.active = 1 AND ws.watchlist_id = ?
                    """,
                    (watchlist_id,),
                ).fetchall()
            else:
                rows = conn.execute("SELECT ticker FROM stocks WHERE active = 1").fetchall()
        active_tickers = {row['ticker'] for row in rows}
    except Exception as e:
        logger.error("Failed to load active tickers from DB: %s", e)
        return jsonify({
            'ratings': [],
            'degraded': True,
            'error_code': ErrorCode.DATABASE_ERROR,
            'message': 'Unable to retrieve active stock list',
        }), 503

    # Try cached ratings
    cached = _get_cached_ratings()
    cached_map = {}
    if cached:
        cached_map = {r['ticker']: r for r in cached}

    # Find active stocks missing from cache
    missing = active_tickers - set(cached_map.keys())

    # Compute live ratings for missing stocks
    for ticker in missing:
        try:
            rating = analytics.calculate_ai_rating(ticker)
            cached_map[ticker] = rating
        except Exception as e:
            logger.error(f"Error calculating rating for {ticker}: {e}")
            cached_map[ticker] = {
                'ticker': ticker,
                'rating': 'ERROR',
                'score': 0,
                'confidence': 0,
                'error_code': ErrorCode.PROVIDER_ERROR,
                'message': str(e),
            }

    # Return only active stocks, sorted by score DESC (best-rated first)
    results = [cached_map[t] for t in active_tickers if t in cached_map]
    results.sort(key=lambda r: r.get('score', 0), reverse=True)
    return jsonify({'ratings': results, 'degraded': False, 'error_code': None})


@analysis_bp.route('/ai/rating/<ticker>', methods=['GET'])
@handle_api_errors
def get_ai_rating(ticker):
    """Get AI rating for a specific stock."""
    # Try cached first
    try:
        with pooled_session() as conn:
            row = conn.execute("SELECT * FROM ai_ratings WHERE ticker = ?", (ticker.upper(),)).fetchone()
        if row:
            return jsonify(dict(row))
    except Exception as e:
        logger.warning("DB cache lookup failed for %s, falling back to live calculation: %s", ticker, e)
    # Fall back to live calculation — cache miss; annotate response so clients
    # can surface a degraded-state warning chip.
    try:
        analytics = StockAnalytics()
        rating = analytics.calculate_ai_rating(ticker)
        return jsonify({**rating, 'degraded': True, 'degraded_reason': 'cache_miss'})
    except Exception as e:
        logger.error("Failed to compute live AI rating for %s: %s", ticker, e)
        return jsonify({
            'error': f'Unable to compute rating for {ticker}',
            'error_code': ErrorCode.PROVIDER_ERROR,
        }), 502


@analysis_bp.route('/chart/<ticker>', methods=['GET'])
@handle_api_errors
def get_chart_data(ticker):
    """Get historical price data for chart rendering.

    Path Parameters:
        ticker (str): Stock ticker symbol.

    Query Parameters:
        period (str, optional): Time period for data. Defaults to '1mo'.
            Accepted values: '1d', '5d', '1mo', '3mo', '6mo', '1y', '5y', 'max'.
        page (int, optional): Page number, 1-based. Defaults to 1.
        page_size (int, optional): Items per page, 1–100. Defaults to 25.

    Returns:
        JSON object with:
        - ticker: Stock symbol
        - period: Requested period
        - data: Array of OHLCV data points for the requested page
        - page: Current page number
        - page_size: Items per page
        - total: Total number of data points across all pages
        - total_pages: Total number of pages
        - has_prev: True if a previous page exists
        - has_next: True if a subsequent page exists
        - currency_symbol: '$' or currency symbol based on market
        - stats: Summary statistics computed from the full dataset
          (current_price, open_price, high_price, low_price, price_change,
          price_change_percent, total_volume)

    Errors:
        400: Invalid page or page_size parameter, or page exceeds total_pages.
        404: No data available or no valid data points.
    """
    period = request.args.get('period', '1mo')
    page, page_size, err = _parse_pagination(request.args)
    if err:
        return err

    analytics = StockAnalytics()
    price_data = analytics.get_stock_price_data(ticker, period)

    if not price_data or not price_data.get('close'):
        raise NotFoundError('No data available', error_code='NOT_FOUND')

    # Filter out None values and prepare data
    timestamps = price_data.get('timestamps', [])
    closes = price_data.get('close', [])
    opens = price_data.get('open', [])
    highs = price_data.get('high', [])
    lows = price_data.get('low', [])
    volumes = price_data.get('volume', [])

    # Create clean data points
    data_points = []
    for i in range(len(timestamps)):
        if closes[i] is not None:
            data_points.append({
                'timestamp': timestamps[i],
                'date': datetime.utcfromtimestamp(timestamps[i]).strftime('%Y-%m-%d'),
                'open': opens[i],
                'high': highs[i],
                'low': lows[i],
                'close': closes[i],
                'volume': volumes[i]
            })

    if not data_points:
        raise NotFoundError('No valid data points', error_code='NOT_FOUND')

    # Calculate price change and stats across the full dataset
    first_price = data_points[0]['close']
    last_price = data_points[-1]['close']
    price_change = last_price - first_price
    price_change_percent = (price_change / first_price) * 100 if first_price else 0

    total = len(data_points)
    total_pages = math.ceil(total / page_size)

    # Out-of-bounds validation: page must not exceed total_pages
    if page > total_pages:
        raise ValidationError(
            f'page {page} exceeds total_pages {total_pages}',
            error_code='INVALID_INPUT',
        )

    # Slice data for the requested page (1-based: offset = (page-1) * page_size)
    offset = (page - 1) * page_size
    page_data = data_points[offset:offset + page_size]

    # Determine currency
    is_indian = '.NS' in ticker.upper() or '.BO' in ticker.upper()
    currency_symbol = '\u20b9' if is_indian else '$'

    return jsonify({
        'ticker': ticker,
        'period': period,
        'data': page_data,
        'page': page,
        'page_size': page_size,
        'total': total,
        'total_pages': total_pages,
        'has_prev': page > 1,
        'has_next': (page * page_size) < total,
        'currency_symbol': currency_symbol,
        'stats': {
            'current_price': last_price,
            'open_price': first_price,
            'high_price': max([p['high'] for p in data_points if p['high']]),
            'low_price': min([p['low'] for p in data_points if p['low']]),
            'price_change': price_change,
            'price_change_percent': price_change_percent,
            'total_volume': sum([p['volume'] for p in data_points if p['volume']])
        }
    })
