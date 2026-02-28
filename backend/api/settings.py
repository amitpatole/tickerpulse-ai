```python
"""
TickerPulse AI v3.0 - Settings API Routes
Blueprint for AI provider settings, data provider settings, and agent framework configuration.
"""

import json
import sqlite3
import logging

from flask import Blueprint, jsonify, request

from backend.core.error_codes import ErrorCode
from backend.api.validators.provider_validators import (
    validate_add_provider_request,
    validate_test_provider_request,
)
from backend.core.settings_manager import (
    get_all_ai_providers,
    add_ai_provider,
    set_active_provider,
    delete_ai_provider,
    get_setting,
    set_setting,
)
from backend.core.ai_providers import test_provider_connection
from backend.config import Config

logger = logging.getLogger(__name__)

settings_bp = Blueprint('settings', __name__, url_prefix='/api')


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

    return page, page_size, None


# ---------------------------------------------------------------------------
# AI Provider endpoints (migrated from dashboard.py)
# ---------------------------------------------------------------------------

@settings_bp.route('/settings/ai-providers', methods=['GET'])
def get_ai_providers_endpoint():
    """Get all supported AI providers with configuration status.
    ---
    tags:
      - Settings
    summary: List all AI providers
    description: >
      Returns all supported AI providers merged with DB configuration.
      API keys are never exposed in the response.
    parameters:
      - in: query
        name: page
        type: integer
        default: 1
        description: Page number (1-based).
      - in: query
        name: page_size
        type: integer
        default: 25
        description: Results per page (1-100).
    responses:
      200:
        description: Paginated list of AI providers.
        schema:
          type: object
          properties:
            data:
              type: array
              items:
                type: object
                properties:
                  name:
                    type: string
                  display_name:
                    type: string
                  configured:
                    type: boolean
                  is_active:
                    type: boolean
                  status:
                    type: string
                    enum: [active, configured, unconfigured]
                  models:
                    type: array
                    items:
                      type: string
                  default_model:
                    type: string
            page:
              type: integer
            page_size:
              type: integer
            total:
              type: integer
            total_pages:
              type: integer
      400:
        description: Invalid pagination parameters.
        schema:
          $ref: '#/definitions/Error'
    """
    page, page_size, err = _parse_pagination(request.args)
    if err:
        return err

    # All supported providers with their available models
    SUPPORTED_PROVIDERS = {
        'anthropic': {
            'display_name': 'Anthropic',
            'models': ['claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001', 'claude-opus-4-6'],
        },
        'openai': {
            'display_name': 'OpenAI',
            'models': ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini'],
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

    try:
        # Get configured providers from DB
        configured_rows = get_all_ai_providers()
        configured_map = {row['provider_name']: row for row in configured_rows}

        # Build full result list by merging SUPPORTED_PROVIDERS with DB rows
        result = []
        for provider_id, info in SUPPORTED_PROVIDERS.items():
            db_row = configured_map.get(provider_id)
            result.append({
                'name': provider_id,
                'display_name': info['display_name'],
                'configured': db_row is not None,
                'models': info['models'],
                'default_model': db_row['model'] if db_row else info['models'][0],
                'is_active': bool(db_row['is_active']) if db_row else False,
                'status': 'active' if db_row and db_row['is_active'] else ('configured' if db_row else 'unconfigured'),
                'id': db_row['id'] if db_row else None,
            })

        total = len(result)
        total_pages = max(1, (total + page_size - 1) // page_size)

        if page > total_pages:
            return jsonify({'error': f'page {page} exceeds total_pages {total_pages}'}), 400

        offset = (page - 1) * page_size
        page_data = result[offset:offset + page_size]

        return jsonify({
            'data': page_data,
            'page': page,
            'page_size': page_size,
            'total': total,
            'total_pages': total_pages,
            'has_next': (page * page_size) < total,
            'has_prev': page > 1,
        })
    except Exception as e:
        logger.error(f"Error fetching AI providers: {e}")
        return jsonify({'data': [], 'page': page, 'page_size': page_size, 'total': 0, 'total_pages': 1, 'has_next': False, 'has_prev': False})


@settings_bp.route('/settings/ai-provider', methods=['POST'])
def add_ai_provider_endpoint():
    """Add or update an AI provider configuration.
    ---
    tags:
      - Settings
    summary: Add or update an AI provider
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - provider
            - api_key
          properties:
            provider:
              type: string
              enum: [openai, anthropic, google, xai]
              example: anthropic
            api_key:
              type: string
              example: sk-ant-...
            model:
              type: string
              description: Model name. Falls back to provider default when omitted.
              example: claude-sonnet-4-5-20250929
    responses:
      200:
        description: Provider saved.
        schema:
          $ref: '#/definitions/SuccessResponse'
      400:
        description: Missing required fields.
        schema:
          $ref: '#/definitions/Error'
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
    ---
    tags:
      - Settings
    summary: Set active AI provider
    parameters:
      - in: path
        name: provider_id
        type: integer
        required: true
        description: ID of the provider to activate.
    responses:
      200:
        description: Provider activated.
        schema:
          $ref: '#/definitions/SuccessResponse'
    """
    success = set_active_provider(provider_id)
    return jsonify({'success': success})


@settings_bp.route('/settings/ai-provider/<int:provider_id>', methods=['DELETE'])
def delete_ai_provider_endpoint(provider_id):
    """Delete an AI provider configuration.
    ---
    tags:
      - Settings
    summary: Delete an AI provider
    parameters:
      - in: path
        name: provider_id
        type: integer
        required: true
        description: ID of the provider to delete.
    responses:
      200:
        description: Provider deleted.
        schema:
          $ref: '#/definitions/SuccessResponse'
    """
    success = delete_ai_provider(provider_id)
    return jsonify({'success': success})


@settings_bp.route('/settings/ai-provider/<provider_name>/test', methods=['POST'])
def test_stored_ai_provider(provider_name):
    """Test an AI provider connection using the stored API key.
    ---
    tags:
      - Settings
    summary: Test a stored AI provider connection
    parameters:
      - in: path
        name: provider_name
        type: string
        required: true
        description: Provider identifier (e.g. 'anthropic').
    responses:
      200:
        description: Test result.
        schema:
          $ref: '#/definitions/SuccessResponse'
      500:
        description: Internal error during test.
        schema:
          $ref: '#/definitions/Error'
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
        return jsonify({
            'success': False,
            'error': f'Provider "{provider_name}" is not configured. Add an API key first.'
        })

    # Get the full provider record (with API key) from DB
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
        logger.exception(f"Error testing provider {provider_name}: {e}")
        return jsonify({'success': False, 'error': 'An internal error occurred'}), 500


@settings_bp.route('/settings/test-ai', methods=['POST'])
def test_ai_provider_endpoint():
    """Test an AI provider connection with a simple prompt.
    ---
    tags:
      - Settings
    summary: Test an AI provider with a new API key
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - provider
            - api_key
          properties:
            provider:
              type: string
              example: openai
            api_key:
              type: string
              example: sk-...
            model:
              type: string
              example: gpt-4o
    responses:
      200:
        description: Test result.
        schema:
          $ref: '#/definitions/SuccessResponse'
      400:
        description: Missing required fields.
        schema:
          $ref: '#/definitions/Error'
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
    ---
    tags:
      - Settings
    summary: List data providers
    description: Returns stub data for built-in data providers with their status.
    responses:
      200:
        description: Array of data provider objects.
        schema:
          type: array
          items:
            type: object
            properties:
              id:
                type: string
              name:
                type: string
              type:
                type: string
              status:
                type: string
                enum: [active, unconfigured]
              is_default:
                type: boolean
              requires_api_key:
                type: boolean
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
    ---
    tags:
      - Settings
    summary: Add or update a data provider
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - provider_id
          properties:
            provider_id:
              type: string
              example: alpha_vantage
            api_key:
              type: string
            config:
              type: object
              description: Provider-specific configuration key-value pairs.
    responses:
      200:
        description: Provider configuration saved.
        schema:
          $ref: '#/definitions/SuccessResponse'
      400:
        description: Missing or invalid request body.
        schema:
          $ref: '#/definitions/Error'
    """
    data = request.json
    if not data:
        return jsonify({'success': False, 'error': 'Missing required field: provider_id'}), 400

    ok, err = validate_add_provider_request(data)
    if not ok:
        return jsonify({'success': False, 'error': err}), 400

    # Stub implementation
    logger.info(f"Data provider configuration received for: {data.get('provider_id')}")
    return jsonify({
        'success': True,
        'message': 'Data provider configuration saved (stub implementation)'
    })


@settings_bp.route('/settings/data-provider/test', methods=['POST'])
def test_data_provider():
    """Test a data provider connection.
    ---
    tags:
      - Settings
    summary: Test a data provider connection
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - provider_id
          properties:
            provider_id:
              type: string
              description: Provider identifier to test.
              example: yahoo_finance
            api_key:
              type: string
              description: API key to test with (optional for providers that don't require one).
    responses:
      200:
        description: Connection test result.
        schema:
          type: object
          properties:
            success:
              type: boolean
              example: true
            provider:
              type: string
              example: Yahoo Finance
            message:
              type: string
              example: Connection successful
      400:
        description: Missing or invalid request body.
        schema:
          $ref: '#/definitions/Error'
    """
    data = request.json
    if not data:
        return jsonify({'success': False, 'error': 'Missing required field: provider_id'}), 400

    ok, err = validate_test_provider_request(data)
    if not ok:
        return jsonify({'success': False, 'error': err}), 400

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
    ---
    tags:
      - Settings
    summary: Get agent framework configuration
    responses:
      200:
        description: Current and available agent framework details.
        schema:
          type: object
          properties:
            current_framework:
              type: string
              enum: [crewai, openclaw]
              example: crewai
            available_frameworks:
              type: array
              items:
                type: object
                properties:
                  id:
                    type: string
                  name:
                    type: string
                  description:
                    type: string
                  status:
                    type: string
                    enum: [available, unavailable]
            is_configured:
              type: boolean
              example: false
            message:
              type: string
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
    ---
    tags:
      - Settings
    summary: Set active agent framework
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - framework
          properties:
            framework:
              type: string
              enum: [crewai, openclaw]
              description: Framework identifier to activate.
              example: crewai
    responses:
      200:
        description: Framework activated.
        schema:
          type: object
          properties:
            success:
              type: boolean
              example: true
            framework:
              type: string
              example: crewai
            message:
              type: string
      400:
        description: Missing or invalid framework identifier.
        schema:
          $ref: '#/definitions/Error'
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


# ---------------------------------------------------------------------------
# Price Refresh Interval endpoints
# ---------------------------------------------------------------------------

@settings_bp.route('/settings/refresh-interval', methods=['GET'])
def get_refresh_interval():
    """Get the current price refresh interval.
    ---
    tags:
      - Settings
    summary: Get price refresh interval
    description: >
      Returns the configured price refresh interval in seconds.
      Source is 'db' when a value has been saved, 'default' when falling
      back to the application default.
    responses:
      200:
        description: Current interval configuration.
        schema:
          type: object
          properties:
            interval:
              type: integer
              description: Interval in seconds. 0 means manual mode (no auto-refresh).
            source:
              type: string
              enum: [db, default]
              description: Whether the value came from the database or config default.
    """
    try:
        conn = sqlite3.connect(Config.DB_PATH)
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT value FROM settings WHERE key = 'price_refresh_interval'"
        ).fetchone()
        conn.close()
        if row:
            return jsonify({'interval': int(row['value']), 'source': 'db'})
    except Exception as e:
        logger.error("Error reading refresh interval from DB: %s", e)

    return jsonify({'interval': Config.REFRESH_INTERVAL_DEFAULT_SEC, 'source': 'default'})


@settings_bp.route('/settings/refresh-interval', methods=['PUT'])
def set_refresh_interval():
    """Update the price refresh interval.
    ---
    tags:
      - Settings
    summary: Set price refresh interval
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - interval
          properties:
            interval:
              type: integer
              description: >
                Interval in seconds. Use 0 for manual mode (disables auto-refresh).
                When non-zero, must be between 10 and 300 seconds.
    responses:
      200:
        description: Interval updated successfully.
        schema:
          type: object
          properties:
            success:
              type: boolean
            interval:
              type: integer
      400:
        description: Missing or invalid interval value.
        schema:
          $ref: '#/definitions/Error'
      500:
        description: Database write error.
        schema:
          $ref: '#/definitions/Error'
    """
    from backend.scheduler import scheduler_manager

    data = request.json
    if not data or 'interval' not in data:
        return jsonify({'success': False, 'error': 'Missing required field: interval'}), 400

    interval = data['interval']

    if not isinstance(interval, int):
        return jsonify({
            'error': 'interval must be an integer',
            'code': ErrorCode.INVALID_TYPE,
        }), 400

    if interval != 0 and (interval < 10 or interval > 300):
        return jsonify({
            'error': 'interval must be 0 (manual mode) or between 10 and 300 seconds',
            'code': ErrorCode.INVALID_TYPE,
        }), 400

    try:
        conn = sqlite3.connect(Config.DB_PATH)
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value, updated_at) "
            "VALUES ('price_refresh_interval', ?, CURRENT_TIMESTAMP)",
            (str(interval),),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error("Error writing refresh interval to DB: %s", e)
        return jsonify({'success': False, 'error': 'Database error'}), 500

    # Reschedule the live job; non-fatal if scheduler is not yet running
    try:
        scheduler_manager.reschedule_job('price_refresh', seconds=interval)
    except Exception as e:
        logger.warning("Could not reschedule price_refresh job: %s", e)

    return jsonify({'success': True, 'interval': interval})


# ---------------------------------------------------------------------------
# UI Preferences endpoints
# Stores a JSON blob under the 'ui_preferences' key in the settings table.
# Only an explicit allowlist of keys is accepted to prevent arbitrary storage.
# ---------------------------------------------------------------------------

_UI_PREF_ALLOWED_KEYS: frozenset[str] = frozenset({
    'sidebar_collapsed',
    'selected_market',
    'selected_watchlist_id',
    'dashboard_layout',
    'color_scheme',
})

_UI_PREF_DEFAULTS: dict = {
    'sidebar_collapsed': False,
    'selected_market': 'All',
    'selected_watchlist_id': None,
    'dashboard_layout': None,
    'color_scheme': 'system',
}


@settings_bp.route('/settings/ui-prefs', methods=['GET'])
def get_ui_prefs():
    """Return all persisted UI preference values merged with defaults.
    ---
    tags:
      - Settings
    summary: Get UI preferences
    description: >
      Returns a JSON object of UI preferences stored in the settings table.
      Any key not yet saved returns its default value.
    responses:
      200:
        description: UI preferences.
        schema:
          type: object
          properties:
            sidebar_collapsed:
              type: boolean
              example: false
            selected_market:
              type: string
              example: All
            selected_watchlist_id:
              type: integer
              nullable: true
              example: null
    """
    try:
        raw = get_setting('ui_preferences')
        stored: dict = json.loads(raw) if raw else {}
        prefs = {
            **_UI_PREF_DEFAULTS,
            **{k: v for k, v in stored.items() if k in _UI_PREF_ALLOWED_KEYS},
        }
        return jsonify(prefs)
    except Exception as e:
        logger.error("Error reading ui_preferences: %s", e)
        return jsonify(_UI_PREF_DEFAULTS)


@settings_bp.route('/settings/ui-prefs', methods=['PUT'])
def update_ui_prefs():
    """Patch one or more UI preferences.
    ---
    tags:
      - Settings
    summary: Update UI preferences
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          properties:
            sidebar_collapsed:
              type: boolean
            selected_market:
              type: string
            selected_watchlist_id:
              type: integer
              nullable: true
    responses:
      200:
        description: Updated preferences.
      400:
        description: Unknown preference keys in request body.
        schema:
          $ref: '#/definitions/Error'
      500:
        description: Database write error.
        schema:
          $ref: '#/definitions/Error'
    """
    data = request.get_json(silent=True) or {}

    unknown = set(data.keys()) - _UI_PREF_ALLOWED_KEYS
    if unknown:
        return jsonify({
            'error': f'Unknown preference keys: {", ".join(sorted(unknown))}',
        }), 400

    try:
        raw = get_setting('ui_preferences')
        current: dict = json.loads(raw) if raw else {}
        current.update({k: v for k, v in data.items() if k in _UI_PREF_ALLOWED_KEYS})
        set_setting('ui_preferences', json.dumps(current))
        prefs = {
            **_UI_PREF_DEFAULTS,
            **{k: v for k, v in current.items() if k in _UI_PREF_ALLOWED_KEYS},
        }
        return jsonify(prefs)
    except Exception as e:
        logger.error("Error updating ui_preferences: %s", e)
        return jsonify({'error': 'Database error'}), 500


# ---------------------------------------------------------------------------
# Alert Sound Settings
# Global notification sound configuration for price alerts.
# Stored as individual keys in the settings KV table.
# ---------------------------------------------------------------------------

_VALID_ALERT_SOUND_TYPES = frozenset({'chime', 'alarm', 'silent'})

_ALERT_SOUND_DEFAULTS: dict = {
    'enabled': True,
    'sound_type': 'chime',
    'volume': 70,
    'mute_when_active': False,
}


def _read_alert_sound_settings() -> dict:
    """Read alert sound settings from KV store, merging with defaults."""
    enabled_raw = get_setting('alert_sound_enabled')
    sound_type = get_setting('alert_sound_type') or _ALERT_SOUND_DEFAULTS['sound_type']
    volume_raw = get_setting('alert_sound_volume')
    mute_raw = get_setting('alert_mute_when_active')

    enabled = (
        enabled_raw.lower() == 'true'
        if enabled_raw is not None
        else _ALERT_SOUND_DEFAULTS['enabled']
    )
    volume = int(volume_raw) if volume_raw is not None else _ALERT_SOUND_DEFAULTS['volume']
    mute_when_active = (
        mute_raw.lower() == 'true'
        if mute_raw is not None
        else _ALERT_SOUND_DEFAULTS['mute_when_active']
    )

    return {
        'enabled': enabled,
        'sound_type': sound_type,
        'volume': volume,
        'mute_when_active': mute_when_active,
    }


@settings_bp.route('/settings/alert-sound', methods=['GET'])
def get_alert_sound_settings():
    """Return global alert notification sound settings.

    Returns the current sound configuration including enabled state, sound type,
    volume level (0-100), and mute-when-active preference.  Falls back to defaults
    for any key not yet persisted.
    """
    try:
        return jsonify(_read_alert_sound_settings())
    except Exception as e:
        logger.error("Error reading alert sound settings: %s", e)
        return jsonify(_ALERT_SOUND_DEFAULTS)


@settings_bp.route('/settings/alert-sound', methods=['PATCH'])
def update_alert_sound_settings():
    """Patch global alert notification sound settings.

    Accepts a partial object — only keys present in the body are updated.
    Unrecognised keys are silently ignored.

    Valid ``sound_type`` values: ``chime``, ``alarm``, ``silent``.
    ``volume`` must be an integer in [0, 100].
    """
    data = request.get_json(silent=True) or {}

    if 'sound_type' in data:
        sound_type = data['sound_type']
        if sound_type not in _VALID_ALERT_SOUND_TYPES:
            return jsonify({
                'error': (
                    f'sound_type must be one of: {", ".join(sorted(_VALID_ALERT_SOUND_TYPES))}'
                ),
                'error_code': 'VALIDATION_ERROR',
            }), 400

    if 'volume' in data:
        volume = data['volume']
        if not isinstance(volume, (int, float)) or not (0 <= volume <= 100):
            return jsonify({
                'error': 'volume must be a number between 0 and 100',
                'error_code': 'VALIDATION_ERROR',
            }), 400

    try:
        if 'enabled' in data:
            set_setting('alert_sound_enabled', str(bool(data['enabled'])).lower())
        if 'sound_type' in data:
            set_setting('alert_sound_type', data['sound_type'])
        if 'volume' in data:
            set_setting('alert_sound_volume', str(int(data['volume'])))
        if 'mute_when_active' in data:
            set_setting('alert_mute_when_active', str(bool(data['mute_when_active'])).lower())

        return jsonify(_read_alert_sound_settings())
    except Exception as e:
        logger.error("Error updating alert sound settings: %s", e)
        return jsonify({'error': 'Database error'}), 500
```