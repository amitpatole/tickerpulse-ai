"""
TickerPulse AI v3.0 - Sentiment API Routes
Blueprint for social/news sentiment badge endpoints.
"""

import logging

from flask import Blueprint, jsonify

from backend.core.sentiment_service import get_sentiment, invalidate_ticker
from backend.core.error_handlers import handle_api_errors

logger = logging.getLogger(__name__)

sentiment_bp = Blueprint('sentiment', __name__, url_prefix='/api')


@sentiment_bp.route('/stocks/<ticker>/sentiment', methods=['GET'])
@handle_api_errors
def get_stock_sentiment(ticker: str):
    """Return aggregated social/news sentiment for *ticker*.

    Path Parameters:
        ticker (str): Stock ticker symbol.

    Returns:
        200 with sentiment payload (score may be null when no signals exist).

    Response schema::

        {
          "ticker":       "AAPL",
          "label":        "bullish" | "bearish" | "neutral",
          "score":        0.72 | null,
          "signal_count": 43,
          "sources":      {"news": 38, "reddit": 5},
          "updated_at":   "2026-02-21T14:03:00Z",
          "stale":        false
        }
    """
    try:
        result = get_sentiment(ticker.upper())
        return jsonify(result)
    except Exception as exc:
        logger.error("Sentiment error for %s: %s", ticker, exc)
        return jsonify({
            'ticker': ticker.upper(),
            'label': 'neutral',
            'score': None,
            'signal_count': 0,
            'sources': {'news': 0, 'reddit': 0, 'stocktwits': 0},
            'trend': 'flat',
        }), 200