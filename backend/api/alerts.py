"""
TickerPulse AI v3.0 - Price Alerts API
Blueprint exposing CRUD endpoints for user-defined price alerts.
"""

import logging
import re

from flask import Blueprint, jsonify, request

from backend.core.alert_manager import (
    create_alert,
    get_alerts,
    delete_alert,
    toggle_alert,
    update_alert,
    update_alert_sound_type,
    fire_test_alert,
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

_CONDITION_LABELS = {
    'price_above': 'Price above',
    'price_below': 'Price below',
    'pct_change': 'Change \u00b1',
}


def _condition_to_severity(condition_type: str, threshold: float) -> str:
    """Map alert condition and threshold to a display severity level.

    Rules
    -----
    * ``pct_change`` with threshold >= 10 → ``critical``
    * ``pct_change`` with threshold >= 5  → ``warning``
    * Everything else                     → ``info``
    """
    if condition_type == 'pct_change' and threshold >= 10:
        return 'critical'
    if condition_type == 'pct_change' and threshold >= 5:
        return 'warning'
    return 'info'


def _enrich_alert(alert: dict) -> dict:
    """Add computed ``severity``, ``type``, and ``message`` fields to an alert dict.

    Mutates and returns the dict so call-sites can use it inline.
    """
    condition = alert.get('condition_type', '')
    threshold = float(alert.get('threshold', 0) or 0)
    ticker = alert.get('ticker', '')

    alert['severity'] = _condition_to_severity(condition, threshold)

    # ``type`` is the raw condition_type; the frontend prettifies it via
    # ``.replace(/_/g, ' ')`` for display.
    alert['type'] = condition

    # Compute a human-readable message for active (not-yet-triggered) alerts.
    # Triggered alerts already have their message set when the SSE fired.
    if not alert.get('message'):
        label = _CONDITION_LABELS.get(condition, condition)
        if condition == 'pct_change':
            alert['message'] = f"{ticker}: {label}{threshold:.1f}%"
        else:
            alert['message'] = f"{ticker}: {label} ${threshold:.2f}"

    return alert


@alerts_bp.route('/alerts', methods=['GET'])
def list_alerts():
    """Return all price alerts with computed severity.

    Returns:
        JSON array of price alert objects.
    """
    return jsonify([_enrich_alert(a) for a in get_alerts()])


@alerts_bp.route('/alerts', methods=['POST'])
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
        return jsonify({'error': 'Missing required field: ticker'}), 400
    if not _TICKER_RE.match(ticker):
        return jsonify({'error': 'ticker must be 1\u20135 uppercase letters'}), 400
    if condition_type not in _VALID_CONDITION_TYPES:
        return jsonify({
            'error': f"Invalid condition_type. Must be one of: {', '.join(sorted(_VALID_CONDITION_TYPES))}"
        }), 400

    try:
        threshold = float(threshold_raw)
    except (TypeError, ValueError):
        return jsonify({'error': 'threshold must be a valid number'}), 400

    if not (0 < threshold <= _THRESHOLD_MAX):
        return jsonify({'error': f'threshold must be > 0 and \u2264 {_THRESHOLD_MAX}'}), 400

    if condition_type == 'pct_change' and threshold > 100:
        return jsonify({'error': 'threshold for pct_change must be \u2264 100'}), 400

    if sound_type not in _VALID_SOUND_TYPES:
        return jsonify({
            'error': f"Invalid sound_type. Must be one of: {', '.join(sorted(_VALID_SOUND_TYPES))}"
        }), 400

    # Verify the ticker exists in the stocks table
    with db_session() as conn:
        row = conn.execute(
            'SELECT ticker FROM stocks WHERE ticker = ? AND active = 1', (ticker,)
        ).fetchone()
    if row is None:
        return jsonify({
            'error': f"Ticker '{ticker}' is not in the monitored stocks list. Add it first."
        }), 400

    alert = create_alert(ticker, condition_type, threshold, sound_type)
    return jsonify(_enrich_alert(alert)), 201


@alerts_bp.route('/alerts/<int:alert_id>', methods=['DELETE'])
def delete_alert_endpoint(alert_id: int):
    """Delete a price alert by ID.

    Returns:
        200 on success, 404 if the alert does not exist.
    """
    deleted = delete_alert(alert_id)
    if not deleted:
        return jsonify({'error': f'Alert {alert_id} not found'}), 404
    return jsonify({'success': True, 'id': alert_id})


@alerts_bp.route('/alerts/<int:alert_id>', methods=['PUT'])
def update_alert_endpoint(alert_id: int):
    """Edit an existing price alert's condition, threshold, and/or sound type.

    Request Body (JSON, all fields optional):
        condition_type (str)   : One of 'price_above', 'price_below', 'pct_change'.
        threshold      (float) : Numeric threshold value.
        sound_type     (str)   : One of 'default', 'chime', 'alarm', 'silent'.

    Returns:
        200 with the updated alert object, 400 on validation failure, 404 if not found.
    """
    data = request.get_json(silent=True) or {}

    condition_type = data.get('condition_type')
    threshold_raw = data.get('threshold')
    sound_type = data.get('sound_type')

    if condition_type is not None:
        if condition_type not in _VALID_CONDITION_TYPES:
            return jsonify({
                'error': f"Invalid condition_type. Must be one of: {', '.join(sorted(_VALID_CONDITION_TYPES))}"
            }), 400

    threshold: float | None = None
    if threshold_raw is not None:
        try:
            threshold = float(threshold_raw)
        except (TypeError, ValueError):
            return jsonify({'error': 'threshold must be a valid number'}), 400
        if not (0 < threshold <= _THRESHOLD_MAX):
            return jsonify({'error': f'threshold must be > 0 and \u2264 {_THRESHOLD_MAX}'}), 400
        effective_condition = condition_type or 'price_above'  # used only for pct_change guard
        if effective_condition == 'pct_change' and threshold > 100:
            return jsonify({'error': 'threshold for pct_change must be \u2264 100'}), 400

    if sound_type is not None and sound_type not in _VALID_SOUND_TYPES:
        return jsonify({
            'error': f"Invalid sound_type. Must be one of: {', '.join(sorted(_VALID_SOUND_TYPES))}"
        }), 400

    updated = update_alert(alert_id, condition_type=condition_type, threshold=threshold, sound_type=sound_type)
    if updated is None:
        return jsonify({'error': f'Alert {alert_id} not found'}), 404
    return jsonify(_enrich_alert(updated))


@alerts_bp.route('/alerts/<int:alert_id>/test', methods=['POST'])
def test_alert_endpoint(alert_id: int):
    """Fire a test notification for the given alert without evaluating its price condition.

    Useful for verifying that sound and desktop notification pipelines work.
    The alert record is not modified.

    Returns:
        200 with the alert object if found, 404 if the alert does not exist.
    """
    alert = fire_test_alert(alert_id)
    if alert is None:
        return jsonify({'error': f'Alert {alert_id} not found'}), 404
    return jsonify(_enrich_alert(alert))


@alerts_bp.route('/alerts/<int:alert_id>/toggle', methods=['PUT'])
def toggle_alert_endpoint(alert_id: int):
    """Toggle the enabled state of a price alert.

    Returns:
        200 with the updated alert, 404 if the alert does not exist.
    """
    updated = toggle_alert(alert_id)
    if updated is None:
        return jsonify({'error': f'Alert {alert_id} not found'}), 404
    return jsonify(_enrich_alert(updated))


@alerts_bp.route('/alerts/<int:alert_id>/sound', methods=['PUT'])
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
        return jsonify({'error': 'Missing required field: sound_type'}), 400
    if sound_type not in _VALID_SOUND_TYPES:
        return jsonify({
            'error': f"Invalid sound_type. Must be one of: {', '.join(sorted(_VALID_SOUND_TYPES))}"
        }), 400

    updated = update_alert_sound_type(alert_id, sound_type)
    if updated is None:
        return jsonify({'error': f'Alert {alert_id} not found'}), 404
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
            return jsonify({
                'error': f"Invalid sound_type. Must be one of: {', '.join(sorted(_VALID_SOUND_TYPES))}"
            }), 400

    if 'volume' in data:
        try:
            volume = int(data['volume'])
        except (TypeError, ValueError):
            return jsonify({'error': 'volume must be an integer'}), 400
        if not (0 <= volume <= 100):
            return jsonify({'error': 'volume must be between 0 and 100'}), 400

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
