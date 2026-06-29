"""
TickerPulse AI v3.0 - Chat API Routes
Blueprint for the AI chat endpoint that provides conversational stock analysis.
"""

from flask import Blueprint, jsonify, request
import logging

from backend.core.ai_analytics import StockAnalytics
from backend.core.ai_providers import AIProviderFactory
from backend.core.settings_manager import get_active_ai_provider

logger = logging.getLogger(__name__)

chat_bp = Blueprint('chat', __name__, url_prefix='/api')


def _get_chat_provider_config(thinking_level: str = 'balanced'):
    """Return DB-backed provider config, falling back to .env-backed config."""
    provider_config = get_active_ai_provider()
    if provider_config:
        return provider_config

    try:
        from backend.api.settings import _active_env_provider_name, _env_ai_provider
        provider_name = _active_env_provider_name()
        if provider_name:
            provider_config = _env_ai_provider(provider_name)
            if provider_config and provider_name == 'opencode':
                from backend.config import Config
                provider_config = dict(provider_config)
                provider_config['model'] = (
                    Config.OPENCODE_FLASH_MODEL
                    if thinking_level == 'quick'
                    else Config.OPENCODE_PRO_MODEL
                )
            return provider_config
    except Exception as exc:
        logger.debug("Could not resolve env-backed chat provider: %s", exc)

    return None


@chat_bp.route('/chat/ask', methods=['POST'])
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
        500: AI provider initialization failure or generation error.
    """
    data = request.json
    ticker = data.get('ticker')
    question = data.get('question')
    thinking_level = data.get('thinking_level', 'balanced')

    if not ticker or not question:
        return jsonify({'success': False, 'error': 'Missing ticker or question'}), 400

    try:
        # Get active AI provider
        provider_config = _get_chat_provider_config(thinking_level)
        if not provider_config:
            return jsonify({'success': False, 'error': 'No AI provider configured'}), 400

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
            return jsonify({'success': False, 'error': 'Failed to initialize AI provider'}), 500

        # Get AI response
        try:
            ai_answer = provider.generate_analysis(context, max_tokens=500)
            logger.info(f"Chat response generated for {ticker}: {len(ai_answer)} characters")

            if ai_answer and not ai_answer.startswith('Error:'):
                return jsonify({
                    'success': True,
                    'answer': ai_answer,
                    'ai_powered': True,
                    'ticker': ticker
                })
            else:
                error_msg = ai_answer if ai_answer else 'Failed to generate response'
                return jsonify({
                    'success': False,
                    'error': error_msg
                }), 500
        except Exception as e:
            logger.error(f"Error calling AI provider: {e}")
            return jsonify({'success': False, 'error': f'AI Provider Error: {str(e)}'}), 500

    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}")
        return jsonify({'success': False, 'error': f'Server Error: {str(e)}'}), 500
