"""
TickerPulse AI v3.0 - Settings API Routes
Blueprint for AI provider settings, data provider settings, and agent framework configuration.
"""

from flask import Blueprint, jsonify, request
import logging

from backend.core.settings_manager import (
    get_all_ai_providers,
    add_ai_provider,
    set_active_provider,
    delete_ai_provider,
)
from backend.core.ai_providers import test_provider_connection
from backend.config import Config

logger = logging.getLogger(__name__)

settings_bp = Blueprint('settings', __name__, url_prefix='/api')

SUPPORTED_PROVIDERS = {
    'anthropic': {
        'display_name': 'Anthropic',
        'models': ['claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001', 'claude-opus-4-6'],
    },
    'openai': {
        'display_name': 'OpenAI',
        'models': ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini'],
    },
    'deepseek': {
        'display_name': 'DeepSeek',
        'models': ['deepseek-v4-flash', 'deepseek-v4-pro'],
    },
    'opencode': {
        'display_name': 'OpenCode',
        'models': ['deepseek-v4-flash', 'deepseek-v4-pro', 'kimi-k2.6', 'kimi-k2.5', 'glm-5.1', 'glm-5'],
    },
    'openai_compatible': {
        'display_name': 'OpenAI-Compatible',
        'models': ['provider/free-model'],
    },
    'google': {
        'display_name': 'Google AI',
        'models': ['gemini-2.5-flash', 'gemini-2.5-pro'],
    },
    'xai': {
        'display_name': 'xAI',
        'models': ['grok-4', 'grok-4-vision'],
    },
}


def _env_ai_provider(provider_name: str):
    """Return env-backed provider config for Settings without exposing keys."""
    provider_name = provider_name.lower()
    env_config = {
        'anthropic': (Config.ANTHROPIC_API_KEY, Config.DEFAULT_MODELS['anthropic']),
        'openai': (Config.OPENAI_API_KEY, Config.DEFAULT_MODELS['openai']),
        'google': (Config.GOOGLE_AI_KEY, Config.DEFAULT_MODELS['google']),
        'xai': (Config.XAI_API_KEY, Config.DEFAULT_MODELS['xai']),
        'deepseek': (Config.DEEPSEEK_API_KEY, Config.DEEPSEEK_MODEL),
        'opencode': (Config.OPENCODE_API_KEY, Config.OPENCODE_FLASH_MODEL),
        'openai_compatible': (
            Config.OPENAI_COMPATIBLE_API_KEY,
            Config.OPENAI_COMPATIBLE_MODEL,
        ),
    }
    api_key, model = env_config.get(provider_name, ('', ''))
    if not api_key:
        return None
    return {
        'provider_name': provider_name,
        'api_key': api_key,
        'model': model,
        'is_active': provider_name == _active_env_provider_name(),
    }


def _active_env_provider_name() -> str:
    if Config.DEFAULT_AI_PROVIDER:
        api_key = {
            'anthropic': Config.ANTHROPIC_API_KEY,
            'deepseek': Config.DEEPSEEK_API_KEY,
            'opencode': Config.OPENCODE_API_KEY,
            'openai_compatible': Config.OPENAI_COMPATIBLE_API_KEY,
            'openai': Config.OPENAI_API_KEY,
            'google': Config.GOOGLE_AI_KEY,
            'xai': Config.XAI_API_KEY,
        }.get(Config.DEFAULT_AI_PROVIDER, '')
        return Config.DEFAULT_AI_PROVIDER if api_key else ''

    for provider_name in (
        'anthropic',
        'opencode',
        'deepseek',
        'openai_compatible',
        'openai',
        'google',
        'xai',
    ):
        api_key = {
            'anthropic': Config.ANTHROPIC_API_KEY,
            'opencode': Config.OPENCODE_API_KEY,
            'deepseek': Config.DEEPSEEK_API_KEY,
            'openai_compatible': Config.OPENAI_COMPATIBLE_API_KEY,
            'openai': Config.OPENAI_API_KEY,
            'google': Config.GOOGLE_AI_KEY,
            'xai': Config.XAI_API_KEY,
        }[provider_name]
        if api_key:
            return provider_name
    return ''


# ---------------------------------------------------------------------------
# AI Provider endpoints (migrated from dashboard.py)
# ---------------------------------------------------------------------------

@settings_bp.route('/settings/ai-providers', methods=['GET'])
def get_ai_providers_endpoint():
    """Get all supported AI providers with configuration status.

    Returns:
        JSON array of provider objects with name, display_name, configured,
        models list, and default_model. API keys are never exposed.
    """
    # Get configured providers from DB
    configured_rows = get_all_ai_providers()
    configured_map = {row['provider_name']: row for row in configured_rows}

    # Build response with all providers
    result = []
    for provider_id, info in SUPPORTED_PROVIDERS.items():
        db_row = configured_map.get(provider_id) or _env_ai_provider(provider_id)
        result.append({
            'name': provider_id,
            'display_name': info['display_name'],
            'configured': db_row is not None,
            'models': info['models'],
            'default_model': db_row['model'] if db_row else info['models'][0],
            'is_active': bool(db_row['is_active']) if db_row else False,
            'status': 'active' if db_row and db_row['is_active'] else ('configured' if db_row else 'unconfigured'),
        })

    return jsonify(result)


@settings_bp.route('/settings/ai-provider', methods=['POST'])
def add_ai_provider_endpoint():
    """Add or update an AI provider configuration.

    Request Body (JSON):
        provider (str): Provider identifier ('openai', 'anthropic', 'google', 'grok').
        api_key (str): API key for the provider.
        model (str, optional): Model name to use. Falls back to provider default.

    Returns:
        JSON object with 'success' boolean.
    """
    data = request.json
    if not data or 'provider' not in data or 'api_key' not in data:
        return jsonify({'success': False, 'error': 'Missing required fields: provider, api_key'}), 400

    success = add_ai_provider(
        data['provider'],
        data['api_key'],
        data.get('model'),
        set_active=True
    )
    return jsonify({'success': success})


@settings_bp.route('/settings/ai-provider/<int:provider_id>/activate', methods=['POST'])
def activate_ai_provider_endpoint(provider_id):
    """Activate an AI provider by id (deactivates all others).

    Path Parameters:
        provider_id (int): ID of the provider to activate.

    Returns:
        JSON object with 'success' boolean.
    """
    success = set_active_provider(provider_id)
    return jsonify({'success': success})


@settings_bp.route('/settings/ai-provider/<int:provider_id>', methods=['DELETE'])
def delete_ai_provider_endpoint(provider_id):
    """Delete an AI provider configuration.

    Path Parameters:
        provider_id (int): ID of the provider to delete.

    Returns:
        JSON object with 'success' boolean.
    """
    success = delete_ai_provider(provider_id)
    return jsonify({'success': success})


@settings_bp.route('/settings/ai-provider/<provider_name>/test', methods=['POST'])
def test_stored_ai_provider(provider_name):
    """Test an AI provider connection using the stored API key.

    Path Parameters:
        provider_name (str): Provider identifier (e.g. 'anthropic').

    Returns:
        JSON object with 'success' boolean and provider info.
    """
    from backend.core.settings_manager import get_active_ai_provider, get_all_ai_providers

    # Find the stored provider
    providers = get_all_ai_providers()
    stored = None
    for p in providers:
        if p['provider_name'] == provider_name:
            stored = p
            break

    if not stored:
        env_provider = _env_ai_provider(provider_name)
        if not env_provider:
            return jsonify({
                'success': False,
                'error': f'Provider "{provider_name}" is not configured. Add an API key first.'
            })
        result = test_provider_connection(
            provider_name,
            env_provider['api_key'],
            env_provider['model'],
        )
        return jsonify(result)

    # Get the full provider record (with API key) from DB
    import sqlite3
    from backend.config import Config
    try:
        conn = sqlite3.connect(Config.DB_PATH)
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            'SELECT api_key, model FROM ai_providers WHERE provider_name = ?',
            (provider_name,)
        ).fetchone()
        conn.close()

        if not row:
            return jsonify({'success': False, 'error': 'Provider not found in database'})

        result = test_provider_connection(provider_name, row['api_key'], row['model'])
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error testing provider {provider_name}: {e}")
        return jsonify({'success': False, 'error': str(e)})


@settings_bp.route('/settings/test-ai', methods=['POST'])
def test_ai_provider_endpoint():
    """Test an AI provider connection with a simple prompt.

    Request Body (JSON):
        provider (str): Provider identifier.
        api_key (str): API key to test.
        model (str, optional): Model name to test.

    Returns:
        JSON object with 'success' boolean and 'provider' name on success,
        or 'error' message on failure.
    """
    data = request.json
    if not data or 'provider' not in data or 'api_key' not in data:
        return jsonify({'success': False, 'error': 'Missing required fields: provider, api_key'}), 400

    result = test_provider_connection(
        data['provider'],
        data['api_key'],
        data.get('model')
    )
    return jsonify(result)


# ---------------------------------------------------------------------------
# Data Provider endpoints (stub -- data provider system not yet implemented)
# ---------------------------------------------------------------------------

@settings_bp.route('/settings/data-providers', methods=['GET'])
def get_data_providers():
    """List all configured data providers.

    Returns placeholder data until the data provider subsystem is implemented.

    Returns:
        JSON array of data provider objects with id, name, type, status, and
        configuration details.
    """
    # Stub: return built-in providers with default status
    providers = [
        {
            'id': 'yahoo_finance',
            'name': 'Yahoo Finance',
            'type': 'market_data',
            'status': 'active',
            'is_default': True,
            'requires_api_key': False,
            'config': {}
        },
        {
            'id': 'alpha_vantage',
            'name': 'Alpha Vantage',
            'type': 'market_data',
            'status': 'unconfigured',
            'is_default': False,
            'requires_api_key': True,
            'config': {}
        },
        {
            'id': 'finnhub',
            'name': 'Finnhub',
            'type': 'market_data',
            'status': 'unconfigured',
            'is_default': False,
            'requires_api_key': True,
            'config': {}
        },
        {
            'id': 'newsapi',
            'name': 'NewsAPI',
            'type': 'news',
            'status': 'unconfigured',
            'is_default': False,
            'requires_api_key': True,
            'config': {}
        },
    ]
    return jsonify(providers)


@settings_bp.route('/settings/data-provider', methods=['POST'])
def add_data_provider():
    """Add or update a data provider configuration.

    Request Body (JSON):
        provider_id (str): Provider identifier (e.g. 'alpha_vantage').
        api_key (str): API key for the provider.
        config (dict, optional): Additional provider-specific configuration.

    Returns:
        JSON object with 'success' boolean.
    """
    data = request.json
    if not data or 'provider_id' not in data:
        return jsonify({'success': False, 'error': 'Missing required field: provider_id'}), 400

    # Stub implementation
    logger.info(f"Data provider configuration received for: {data.get('provider_id')}")
    return jsonify({
        'success': True,
        'message': 'Data provider configuration saved (stub implementation)'
    })


@settings_bp.route('/settings/data-provider/test', methods=['POST'])
def test_data_provider():
    """Test a data provider connection.

    Request Body (JSON):
        provider_id (str): Provider identifier to test.
        api_key (str, optional): API key to test with.

    Returns:
        JSON object with 'success' boolean and optional 'error' message.
    """
    data = request.json
    if not data or 'provider_id' not in data:
        return jsonify({'success': False, 'error': 'Missing required field: provider_id'}), 400

    provider_id = data['provider_id']

    # Stub: Yahoo Finance always succeeds; others need real implementation
    if provider_id == 'yahoo_finance':
        return jsonify({
            'success': True,
            'provider': 'Yahoo Finance',
            'message': 'Connection successful'
        })

    # For other providers, return stub response
    logger.info(f"Data provider test requested for: {provider_id}")
    return jsonify({
        'success': False,
        'error': f'Data provider "{provider_id}" test not yet implemented'
    })


# ---------------------------------------------------------------------------
# Agent Framework endpoints (stub -- framework selection not yet implemented)
# ---------------------------------------------------------------------------

@settings_bp.route('/settings/agent-framework', methods=['GET'])
def get_agent_framework():
    """Get the current agent framework configuration.

    Returns:
        JSON object with current framework name, available frameworks,
        and status information.
    """
    return jsonify({
        'current_framework': 'crewai',
        'available_frameworks': [
            {
                'id': 'crewai',
                'name': 'CrewAI',
                'description': 'Multi-agent orchestration framework with role-based agents',
                'status': 'available',
                'version': None
            },
            {
                'id': 'openclaw',
                'name': 'OpenClaw',
                'description': 'Lightweight agent framework with tool-use focus',
                'status': 'available',
                'version': None
            }
        ],
        'is_configured': False,
        'message': 'Agent framework selection is not yet fully implemented'
    })


@settings_bp.route('/settings/agent-framework', methods=['POST'])
def set_agent_framework():
    """Set the active agent framework.

    Request Body (JSON):
        framework (str): Framework identifier ('crewai' or 'openclaw').

    Returns:
        JSON object with 'success' boolean and the activated framework name.
    """
    data = request.json
    if not data or 'framework' not in data:
        return jsonify({'success': False, 'error': 'Missing required field: framework'}), 400

    framework = data['framework']
    valid_frameworks = ['crewai', 'openclaw']

    if framework not in valid_frameworks:
        return jsonify({
            'success': False,
            'error': f'Invalid framework: {framework}. Must be one of: {", ".join(valid_frameworks)}'
        }), 400

    # Stub implementation
    logger.info(f"Agent framework set to: {framework}")
    return jsonify({
        'success': True,
        'framework': framework,
        'message': f'Agent framework set to {framework} (stub implementation)'
    })
