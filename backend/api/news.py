"""
TickerPulse AI v3.0 - News API Routes
Blueprint for news articles, alerts, and statistics endpoints.
"""

from flask import Blueprint, jsonify, request
import html
import logging

from backend.database import get_db_connection

logger = logging.getLogger(__name__)

news_bp = Blueprint('news', __name__, url_prefix='/api')


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
        return None, None, (jsonify({'error': 'page and page_size must be integers'}), 400)

    if not (1 <= page_size <= 100):
        return None, None, (jsonify({'error': 'page_size must be between 1 and 100'}), 400)

    if page < 1:
        return None, None, (jsonify({'error': 'page must be a positive integer'}), 400)

    return page, page_size, None


@news_bp.route('/news', methods=['GET'])
def get_news():
    """Get recent news articles with optional ticker filter.

    Query Parameters:
        ticker (str, optional): Filter articles by stock ticker.
        page (int, optional): Page number, 1-based. Default 1.
        page_size (int, optional): Results per page, 1-100. Default 25.

    Returns:
        JSON envelope with data array and pagination metadata.
    """
    ticker = request.args.get('ticker', None)
    page, page_size, err = _parse_pagination(request.args)
    if err:
        return err

    offset = (page - 1) * page_size

    conn = get_db_connection()
    try:
        conn.execute('BEGIN DEFERRED')
        cursor = conn.cursor()

        if ticker:
            cursor.execute('SELECT COUNT(*) FROM news WHERE ticker = ?', (ticker,))
            total = cursor.fetchone()[0]
            cursor.execute(
                'SELECT * FROM news WHERE ticker = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
                (ticker, page_size, offset)
            )
        else:
            cursor.execute('SELECT COUNT(*) FROM news')
            total = cursor.fetchone()[0]
            cursor.execute(
                'SELECT * FROM news ORDER BY created_at DESC LIMIT ? OFFSET ?',
                (page_size, offset)
            )

        news = cursor.fetchall()
    finally:
        conn.close()

    return jsonify({
        'data': [{
            'id': article['id'],
            'ticker': article['ticker'],
            'title': article['title'],
            'description': article['description'],
            'url': article['url'],
            'source': article['source'],
            'published_date': article['published_date'],
            'sentiment_score': article['sentiment_score'],
            'sentiment_label': article['sentiment_label'],
            'created_at': article['created_at']
        } for article in news],
        'page': page,
        'page_size': page_size,
        'total': total,
        'has_next': (page * page_size) < total,
    })


@news_bp.route('/alerts', methods=['GET'])
def get_alerts():
    """Get recent alerts (last 50).

    Returns:
        JSON array of alert objects joined with their associated news articles.
    """
    conn = get_db_connection()
    try:
        cursor = conn.cursor()

        cursor.execute('''
            SELECT a.*, n.title, n.url, n.source, n.sentiment_score
            FROM alerts a
            LEFT JOIN news n ON a.news_id = n.id
            ORDER BY a.created_at DESC
            LIMIT 50
        ''')

        alerts = cursor.fetchall()
    finally:
        conn.close()

    return jsonify([{
        'id': alert['id'],
        'ticker': html.escape(alert['ticker'] or ''),
        'alert_type': html.escape(alert['alert_type'] or ''),
        'message': html.escape(alert['message'] or ''),
        'created_at': alert['created_at'],
        'title': html.escape(alert['title']) if alert['title'] else None,
        'url': alert['url'],
        'source': html.escape(alert['source']) if alert['source'] else None,
        'sentiment_score': alert['sentiment_score']
    } for alert in alerts])


@news_bp.route('/stats', methods=['GET'])
def get_stats():
    """Get sentiment statistics for the last 24 hours.

    Query Parameters:
        market (str, optional): Filter by market. 'All' or omitted returns all markets.

    Returns:
        JSON object with 'stocks' array (per-ticker stats) and 'total_alerts_24h' count.
    """
    market = request.args.get('market', None)
    conn = get_db_connection()
    try:
        conn.execute('BEGIN DEFERRED')
        cursor = conn.cursor()

        # Get stats for each stock with market filter
        if market and market != 'All':
            cursor.execute('''
                SELECT
                    n.ticker,
                    COUNT(*) as total_articles,
                    SUM(CASE WHEN n.sentiment_label = 'positive' THEN 1 ELSE 0 END) as positive_count,
                    SUM(CASE WHEN n.sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative_count,
                    SUM(CASE WHEN n.sentiment_label = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
                    AVG(n.sentiment_score) as avg_sentiment
                FROM news n
                INNER JOIN stocks s ON n.ticker = s.ticker
                WHERE n.created_at > datetime('now', '-24 hours')
                    AND s.market = ?
                GROUP BY n.ticker
            ''', (market,))
        else:
            cursor.execute('''
                SELECT
                    ticker,
                    COUNT(*) as total_articles,
                    SUM(CASE WHEN sentiment_label = 'positive' THEN 1 ELSE 0 END) as positive_count,
                    SUM(CASE WHEN sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative_count,
                    SUM(CASE WHEN sentiment_label = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
                    AVG(sentiment_score) as avg_sentiment
                FROM news
                WHERE created_at > datetime('now', '-24 hours')
                GROUP BY ticker
            ''')

        stats = cursor.fetchall()

        # Get total alerts count — same snapshot as the stats query above
        cursor.execute('SELECT COUNT(*) as count FROM alerts WHERE created_at > datetime("now", "-24 hours")')
        alert_count = cursor.fetchone()['count']
    finally:
        conn.close()

    return jsonify({
        'stocks': [{
            'ticker': stat['ticker'],
            'total_articles': stat['total_articles'],
            'positive_count': stat['positive_count'],
            'negative_count': stat['negative_count'],
            'neutral_count': stat['neutral_count'],
            'avg_sentiment': round(stat['avg_sentiment'], 2) if stat['avg_sentiment'] else 0
        } for stat in stats],
        'total_alerts_24h': alert_count
    })
