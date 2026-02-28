"""
TickerPulse AI v3.0 - News API Routes
Blueprint for news articles, alerts, and statistics endpoints.
"""

from flask import Blueprint, jsonify, request
import html
import logging

from backend.database import pooled_session
from backend.core.error_handlers import handle_api_errors, ValidationError, NotFoundError

logger = logging.getLogger(__name__)

news_bp = Blueprint('news', __name__, url_prefix='/api')


def _parse_pagination(args):
    """Parse and validate page/page_size query parameters.

    Returns (page, page_size) on success.
    Raises ValidationError on invalid input.
    """
    try:
        page = int(args.get('page', 1))
        page_size = int(args.get('page_size', 25))
    except (ValueError, TypeError):
        raise ValidationError('page and page_size must be integers', error_code='INVALID_TYPE')

    if not (1 <= page_size <= 100):
        raise ValidationError(
            'page_size must be between 1 and 100',
            field_errors=[{'field': 'page_size', 'message': 'Must be between 1 and 100'}],
        )

    if page < 1:
        raise ValidationError(
            'page must be a positive integer',
            field_errors=[{'field': 'page', 'message': 'Must be a positive integer'}],
        )

    return page, page_size


def _serialize_article(article: object) -> dict:
    """Convert a sqlite3.Row news record to a JSON-safe dict."""
    return {
        'id': article['id'],
        'ticker': article['ticker'],
        'title': article['title'],
        'description': article['description'],
        'url': article['url'],
        'source': article['source'],
        'published_date': article['published_date'],
        'sentiment_score': article['sentiment_score'],
        'sentiment_label': article['sentiment_label'],
        'created_at': article['created_at'],
    }


@news_bp.route('/news', methods=['GET'])
@handle_api_errors
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
    page, page_size = _parse_pagination(request.args)

    offset = (page - 1) * page_size

    with pooled_session() as conn:
        if ticker:
            total = conn.execute(
                'SELECT COUNT(*) FROM news WHERE ticker = ?', (ticker,)
            ).fetchone()[0]
            news = conn.execute(
                'SELECT * FROM news WHERE ticker = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
                (ticker, page_size, offset)
            ).fetchall()
        else:
            total = conn.execute('SELECT COUNT(*) FROM news').fetchone()[0]
            news = conn.execute(
                'SELECT * FROM news ORDER BY created_at DESC LIMIT ? OFFSET ?',
                (page_size, offset)
            ).fetchall()

    return jsonify({
        'data': [_serialize_article(a) for a in news],
        'page': page,
        'page_size': page_size,
        'total': total,
        'has_next': (page * page_size) < total,
    })


@news_bp.route('/news/<int:article_id>', methods=['GET'])
@handle_api_errors
def get_news_article(article_id: int):
    """Fetch a single news article by ID.

    Used by the keyboard-navigation flow: when the user presses Enter on a
    focused feed item the frontend resolves the full record without needing to
    know which page it lives on.

    Path Parameters:
        article_id (int): Primary key of the news article.

    Returns:
        200 JSON article object, or 404 if not found.
    """
    with pooled_session() as conn:
        row = conn.execute(
            'SELECT * FROM news WHERE id = ?', (article_id,)
        ).fetchone()

    if row is None:
        logger.debug("news article %d not found", article_id)
        raise NotFoundError(f'Article {article_id} not found')

    return jsonify(_serialize_article(row))


@news_bp.route('/alerts', methods=['GET'])
@handle_api_errors
def get_alerts():
    """Get recent alerts (last 50).

    Returns:
        JSON array of alert objects joined with their associated news articles.
    """
    with pooled_session() as conn:
        alerts = conn.execute('''
            SELECT a.*, n.title, n.url, n.source, n.sentiment_score
            FROM alerts a
            LEFT JOIN news n ON a.news_id = n.id
            ORDER BY a.created_at DESC
            LIMIT 50
        ''').fetchall()

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
@handle_api_errors
def get_stats():
    """Get sentiment statistics for the last 24 hours.

    Query Parameters:
        market (str, optional): Filter by market. 'All' or omitted returns all markets.

    Returns:
        JSON object with 'stocks' array (per-ticker stats) and 'total_alerts_24h' count.
    """
    market = request.args.get('market', None)
    with pooled_session() as conn:
        if market and market != 'All':
            stats = conn.execute('''
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
            ''', (market,)).fetchall()
        else:
            stats = conn.execute('''
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
            ''').fetchall()

        alert_count = conn.execute(
            'SELECT COUNT(*) as count FROM alerts WHERE created_at > datetime("now", "-24 hours")'
        ).fetchone()['count']

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