"""
TickerPulse AI v3.0 - Price Alerts API
Blueprint exposing CRUD endpoints for user-defined price alerts.
"""

import logging
import re

from flask import Blueprint, jsonify, request

from backend.core.alert_manager import create_alert, get_alerts, delete_alert, toggle_alert, update_alert_sound_type
from backend.core.error_handlers import (
    NotFoundError,
    ValidationError,
    handle_api_errors,
)
from backend.core.settings_manager import get_setting, set_setting
from backend.database import db_session

logger = logging.getLogger(__name__)

alerts_bp = Blueprint('alerts', __name__, url_prefix='/api')

# Valid sound types for both global settings and per-alert overrides
_VALID_SOUND_TYPES = {'default', 'chime', 'alarm', 'silent'}

_SOUND_DEFAULTS = {
    'alert_sound_enabled': 'true',
    'alert_sound_type': 'chime',
    'alert_sound_volume': '70',
    'alert_mute_when_active': 'false',
}

_VALID_CONDITION_TYPES = {'price_above', 'price_below', 'pct_change'}

_TICKER_RE = re.compile(r'^[A-Z]{1,5}$')
_THRESHOLD_MAX = 1_000_000


@alerts_bp.route('/alerts', methods=['GET'])
def list_alerts():
    """Return all price alerts.

    Returns:
        JSON array of price alert objects.
    """
    return jsonify(get_alerts())


@alerts_bp.route('/alerts', methods=['POST'])
@handle_api_errors
def create_alert_endpoint():
    """Create a new price alert.

    Request Body (JSON):
        ticker         (str)   : Stock ticker — must exist in the stocks table.
        condition_type (str)   : One of 'price_above', 'price_below', 'pct_change'.
        threshold      (float) : Numeric threshold value.
        sound_type     (str)   : Optional. One of 'default', 'chime', 'alarm', 'silent'.

    Returns:
        201 with the created alert object, or 400 on validation failure.
    """
    data = request.get_json(silent=True) or {}

    ticker = str(data.get('ticker', '')).strip().upper()
    condition_type = str(data.get('condition_type', '')).strip()
    threshold_raw = data.get('threshold')
    sound_type = str(data.get('sound_type', 'default')).strip()

    # Validate required fields
    if not ticker:
        raise ValidationError('Missing required field: ticker', error_code='MISSING_FIELD')
    if not _TICKER_RE.match(ticker):
        raise ValidationError('ticker must be 1–5 uppercase letters')
    if condition_type not in _VALID_CONDITION_TYPES:
        raise ValidationError(
            f"Invalid condition_type. Must be one of: {', '.join(sorted(_VALID_CONDITION_TYPES))}"
        )

    try:
        threshold = float(threshold_raw)
    except (TypeError, ValueError):
        raise ValidationError('threshold must be a valid number')

    if not (0 < threshold <= _THRESHOLD_MAX):
        raise ValidationError(f'threshold must be > 0 and ≤ {_THRESHOLD_MAX}')

    if condition_type == 'pct_change' and threshold > 100:
        raise ValidationError('threshold for pct_change must be ≤ 100')

    if sound_type not in _VALID_SOUND_TYPES:
        raise ValidationError(
            f"Invalid sound_type. Must be one of: {', '.join(sorted(_VALID_SOUND_TYPES))}"
        )

    # Verify the ticker exists in the stocks table
    with db_session() as conn:
        row = conn.execute(
            'SELECT ticker FROM stocks WHERE ticker = ? AND active = 1', (ticker,)
        ).fetchone()
    if row is None:
        raise ValidationError(
            f"Ticker '{ticker}' is not in the monitored stocks list. Add it first."
        )

    alert = create_alert(ticker, condition_type, threshold, sound_type)
    return jsonify(alert), 201


@alerts_bp.route('/alerts/<int:alert_id>', methods=['DELETE'])
@handle_api_errors
def delete_alert_endpoint(alert_id: int):
    """Delete a price alert by ID.

    Returns:
        200 on success, 404 if the alert does not exist.
    """
    deleted = delete_alert(alert_id)
    if not deleted:
        raise NotFoundError(f'Alert {alert_id} not found', error_code='ALERT_NOT_FOUND')
    return jsonify({'success': True, 'id': alert_id})


@alerts_bp.route('/alerts/<int:alert_id>/toggle', methods=['PUT'])
@handle_api_errors
def toggle_alert_endpoint(alert_id: int):
    """Toggle the enabled state of a price alert.

    Returns:
        200 with the updated alert, 404 if the alert does not exist.
    """
    updated = toggle_alert(alert_id)
    if updated is None:
        raise NotFoundError(f'Alert {alert_id} not found', error_code='ALERT_NOT_FOUND')
    return jsonify(updated)


@alerts_bp.route('/alerts/<int:alert_id>/sound', methods=['PUT'])
@handle_api_errors
def update_alert_sound_endpoint(alert_id: int):
    """Update the per-alert sound type.

    Request Body (JSON):
        sound_type (str) : One of 'default', 'chime', 'alarm', 'silent'.

    Returns:
        200 with {id, sound_type}, 400 on bad input, 404 if alert not found.
    """
    data = request.get_json(silent=True) or {}
    sound_type = data.get('sound_type')

    if sound_type is None:
        raise ValidationError('Missing required field: sound_type', error_code='MISSING_FIELD')
    if sound_type not in _VALID_SOUND_TYPES:
        raise ValidationError(
            f"Invalid sound_type. Must be one of: {', '.join(sorted(_VALID_SOUND_TYPES))}"
        )

    updated = update_alert_sound_type(alert_id, sound_type)
    if updated is None:
        raise NotFoundError(f'Alert {alert_id} not found', error_code='ALERT_NOT_FOUND')
    return jsonify({'id': alert_id, 'sound_type': sound_type})


@alerts_bp.route('/alerts/sound-settings', methods=['GET'])
def get_sound_settings():
    """Return current alert sound settings.

    Returns:
        JSON with enabled, sound_type, volume, mute_when_active fields.
    """
    enabled = get_setting('alert_sound_enabled', _SOUND_DEFAULTS['alert_sound_enabled']) == 'true'
    sound_type = get_setting('alert_sound_type', _SOUND_DEFAULTS['alert_sound_type'])
    volume = int(get_setting('alert_sound_volume', _SOUND_DEFAULTS['alert_sound_volume']))
    mute_when_active = get_setting('alert_mute_when_active', _SOUND_DEFAULTS['alert_mute_when_active']) == 'true'
    return jsonify({
        'enabled': enabled,
        'sound_type': sound_type,
        'volume': volume,
        'mute_when_active': mute_when_active,
    })


@alerts_bp.route('/alerts/sound-settings', methods=['PUT'])
@handle_api_errors
def update_sound_settings():
    """Update alert sound settings (partial update supported).

    Request Body (JSON, all fields optional):
        enabled          (bool) : Whether alert sounds are enabled.
        sound_type       (str)  : One of 'default', 'chime', 'alarm', 'silent'.
        volume           (int)  : Volume from 0 to 100.
        mute_when_active (bool) : Whether to mute when tab is focused.

    Returns:
        200 with the updated settings, or 400 on validation failure.
    """
    data = request.get_json(silent=True) or {}

    if 'sound_type' in data:
        if data['sound_type'] not in _VALID_SOUND_TYPES:
            raise ValidationError(
                f"Invalid sound_type. Must be one of: {', '.join(sorted(_VALID_SOUND_TYPES))}"
            )

    if 'volume' in data:
        try:
            volume = int(data['volume'])
        except (TypeError, ValueError):
            raise ValidationError('volume must be an integer')
        if not (0 <= volume <= 100):
            raise ValidationError('volume must be between 0 and 100')

    if 'enabled' in data:
        set_setting('alert_sound_enabled', 'true' if data['enabled'] else 'false')
    if 'sound_type' in data:
        set_setting('alert_sound_type', data['sound_type'])
    if 'volume' in data:
        set_setting('alert_sound_volume', str(int(data['volume'])))
    if 'mute_when_active' in data:
        set_setting('alert_mute_when_active', 'true' if data['mute_when_active'] else 'false')

    enabled = get_setting('alert_sound_enabled', _SOUND_DEFAULTS['alert_sound_enabled']) == 'true'
    sound_type = get_setting('alert_sound_type', _SOUND_DEFAULTS['alert_sound_type'])
    volume_out = int(get_setting('alert_sound_volume', _SOUND_DEFAULTS['alert_sound_volume']))
    mute_when_active = get_setting('alert_mute_when_active', _SOUND_DEFAULTS['alert_mute_when_active']) == 'true'
    return jsonify({
        'enabled': enabled,
        'sound_type': sound_type,
        'volume': volume_out,
        'mute_when_active': mute_when_active,
    })
