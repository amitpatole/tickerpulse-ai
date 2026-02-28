"""
TickerPulse AI v3.0 - Chat API Routes
Blueprint for the AI chat endpoint that provides conversational stock analysis.
"""

from flask import Blueprint, jsonify, request
import logging

from backend.core.ai_analytics import StockAnalytics
from backend.core.ai_providers import AIProviderFactory
from backend.core.settings_manager import get_active_ai_provider
from backend.database import db_session
from backend.core.error_handlers import (
    handle_api_errors,
    ValidationError,
    ServiceUnavailableError,
)

logger = logging.getLogger(__name__)

chat_bp = Blueprint('chat', __name__, url_prefix='/api')


@chat_bp.route('/chat/ask', methods=['POST'])
@handle_api_errors
def ask_chat_endpoint():
    """Chat with AI about a specific stock.

    Builds a context-aware prompt using the stock's current AI rating and
    technical analysis, then sends it to the active AI provider for a
    conversational response.

    Request Body (JSON):
        ticker (str): Stock ticker symbol to discuss.
        question (str): User's question about the stock.
        thinking_level (str, optional): Response depth level.
            'quick' - Brief 1-2 sentence answer.
            'balanced' - Concise 2-4 sentence answer (default).
            'deep' - Thorough 4-6 sentence analysis.

    Returns:
        JSON object with:
        - success (bool): Whether the request succeeded.
        - answer (str): AI-generated response text.
        - ai_powered (bool): True if response came from an AI provider.
        - ticker (str): The stock ticker discussed.

    Errors:
        400: Missing ticker/question or no AI provider configured.
        503: AI provider initialization failure or generation error.
    """
    data = request.get_json(silent=True) or {}
    ticker = (data.get('ticker') or '').strip()
    question = (data.get('question') or '').strip()
    thinking_level = data.get('thinking_level', 'balanced')

    if not ticker or not question:
        raise ValidationError(
            'Missing ticker or question',
            error_code='MISSING_FIELD',
            field_errors=[
                *([{'field': 'ticker', 'message': 'Ticker is required'}] if not ticker else []),
                *([{'field': 'question', 'message': 'Question is required'}] if not question else []),
            ],
        )

    provider_config = get_active_ai_provider()
    if not provider_config:
        raise ValidationError(
            'No AI provider configured. Add an API key in Settings.',
            error_code='MISSING_FIELD',
        )

    # Get current stock analysis for context
    analytics = StockAnalytics()
    rating = analytics.calculate_ai_rating(ticker)

    # Define thinking level instructions
    thinking_instructions = {
        'quick': 'Provide a brief, direct answer (1-2 sentences) to the question.',
        'balanced': 'Provide a concise but comprehensive answer (2-4 sentences) that balances depth with clarity.',
        'deep': 'Provide a thorough, detailed analysis (4-6 sentences) that explores multiple perspectives and implications.'
    }
    thinking_instruction = thinking_instructions.get(thinking_level, thinking_instructions['balanced'])

    # Build context-aware prompt
    context = f"""You are a helpful stock analysis assistant. The user is asking about {ticker}.

Current Stock Analysis:
- Rating: {rating.get('rating', 'N/A')}
- Score: {rating.get('score', 'N/A')}/100
- Current Price: {rating.get('currency_symbol', '$')}{rating.get('current_price', 'N/A')}
- Technical Score: {rating.get('technical_score', 'N/A')}
- Sentiment Score: {rating.get('sentiment_score', 'N/A')}
- RSI: {rating.get('rsi', 'N/A')}
- Analysis: {rating.get('analysis_summary', 'No analysis available')}

User Question: {question}

RESPONSE STYLE: {thinking_instruction}
Focus on being informative and actionable."""

    # Create AI provider instance
    provider = AIProviderFactory.create_provider(
        provider_config['provider_name'],
        provider_config['api_key'],
        provider_config['model']
    )

    if not provider:
        raise ServiceUnavailableError('Failed to initialize AI provider')

    # Get AI response
    ai_answer = provider.generate_analysis(context, max_tokens=500)
    logger.info("Chat response generated for %s: %d characters", ticker, len(ai_answer or ''))

    if not ai_answer or ai_answer.startswith('Error:'):
        raise ServiceUnavailableError(ai_answer or 'Failed to generate response')

    return jsonify({
        'success': True,
        'answer': ai_answer,
        'ai_powered': True,
        'ticker': ticker
    })


@chat_bp.route('/chat/health', methods=['GET'])
@handle_api_errors
def chat_health_endpoint():
    """Health check for the chat subsystem.

    Verifies DB connectivity by querying the chat_sessions table.

    Returns:
        200 JSON {"status": "ok", "sessions_count": <int>} when healthy.
        503 JSON {"status": "error", "error": <str>} on DB failure.
    """
    try:
        with db_session() as conn:
            row = conn.execute("SELECT COUNT(*) AS cnt FROM chat_sessions").fetchone()
        return jsonify({'status': 'ok', 'sessions_count': row['cnt']})
    except Exception as exc:
        logger.warning("chat health check failed: %s", exc)
        raise ServiceUnavailableError(f'Chat subsystem unavailable: {exc}')