```python
"""
TickerPulse AI v3.0 - Price Alerts API
CRUD endpoints for price alerts and per-alert sound type overrides.
"""

import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from backend.core.error_handlers import (
    DatabaseError,
    NotFoundError,
    ValidationError,
    handle_api_errors,
)
from backend.database import pooled_session

logger = logging.getLogger(__name__)

alerts_bp = Blueprint('alerts', __name__, url_prefix='/api')

_VALID_CONDITION_TYPES = frozenset({'price_above', 'price_below'})
_VALID_SOUND_TYPES = frozenset({'default', 'chime', 'alarm', 'silent'})


def _row_to_dict(row) -> dict:
    d = dict(row)
    d['enabled'] = bool(d.get('enabled', 1))
    return d


# ---------------------------------------------------------------------------
# List / create alerts
# ---------------------------------------------------------------------------

@alerts_bp.route('/alerts', methods=['GET'])
@handle_api_errors
def list_alerts():
    """Return all price alerts ordered newest-first."""
    try:
        with pooled_session() as conn:
            rows = conn.execute(
                'SELECT * FROM price_alerts ORDER BY created_at DESC'
            ).fetchall()
        return jsonify({'alerts': [_row_to_dict(r) for r in rows]})
    except Exception as exc:
        logger.error('list_alerts: DB error: %s', exc)
        raise DatabaseError('Failed to fetch alerts') from exc


@alerts_bp.route('/alerts', methods=['POST'])
@handle_api_errors
def create_alert():
    """Create a new price alert."""
    data = request.get_json(silent=True) or {}

    ticker = (data.get('ticker') or '').upper().strip()
    if not ticker:
        raise ValidationError(
            'ticker is required',
            field_errors=[{'field': 'ticker', 'message': 'Required'}],
        )

    condition_type = data.get('condition_type') or data.get('condition', '')
    if condition_type not in _VALID_CONDITION_TYPES:
        raise ValidationError(
            f'condition_type must be one of: {", ".join(sorted(_VALID_CONDITION_TYPES))}',
            field_errors=[{
                'field': 'condition_type',
                'message': f'Must be one of: {", ".join(sorted(_VALID_CONDITION_TYPES))}',
            }],
        )

    threshold = data.get('threshold')
    if threshold is None or not isinstance(threshold, (int, float)):
        raise ValidationError(
            'threshold must be a positive number',
            field_errors=[{'field': 'threshold', 'message': 'Must be a positive number'}],
        )
    if threshold <= 0:
        raise ValidationError(
            'threshold must be greater than 0',
            field_errors=[{'field': 'threshold', 'message': 'Must be greater than 0'}],
        )

    sound_type = data.get('sound_type', 'default')
    if sound_type not in _VALID_SOUND_TYPES:
        raise ValidationError(
            f'sound_type must be one of: {", ".join(sorted(_VALID_SOUND_TYPES))}',
            field_errors=[{
                'field': 'sound_type',
                'message': f'Must be one of: {", ".join(sorted(_VALID_SOUND_TYPES))}',
            }],
        )

    try:
        with pooled_session() as conn:
            cursor = conn.execute(
                '''INSERT INTO price_alerts (ticker, condition_type, threshold, sound_type, enabled)
                   VALUES (?, ?, ?, ?, 1)''',
                (ticker, condition_type, float(threshold), sound_type),
            )
            alert_id = cursor.lastrowid
            row = conn.execute(
                'SELECT * FROM price_alerts WHERE id = ?', (alert_id,)
            ).fetchone()
    except Exception as exc:
        logger.error('create_alert: DB error: %s', exc)
        raise DatabaseError('Failed to create alert') from exc

    return jsonify(_row_to_dict(row)), 201


# ---------------------------------------------------------------------------
# Single-alert read / update / delete
# ---------------------------------------------------------------------------

@alerts_bp.route('/alerts/<int:alert_id>', methods=['GET'])
@handle_api_errors
def get_alert(alert_id: int):
    """Return a single price alert by ID."""
    try:
        with pooled_session() as conn:
            row = conn.execute(
                'SELECT * FROM price_alerts WHERE id = ?', (alert_id,)
            ).fetchone()
    except Exception as exc:
        logger.error('get_alert: DB error: %s', exc)
        raise DatabaseError('Failed to fetch alert') from exc

    if not row:
        raise NotFoundError(f'Alert {alert_id} not found')
    return jsonify(_row_to_dict(row))


@alerts_bp.route('/alerts/<int:alert_id>', methods=['PATCH'])
@handle_api_errors
def update_alert(alert_id: int):
    """Partially update a price alert (enabled, threshold, sound_type, triggered_at)."""
    data = request.get_json(silent=True) or {}

    fields: list[str] = []
    values: list = []

    if 'enabled' in data:
        fields.append('enabled = ?')
        values.append(1 if data['enabled'] else 0)

    if 'sound_type' in data:
        sound_type = data['sound_type']
        if sound_type not in _VALID_SOUND_TYPES:
            raise ValidationError(
                f'sound_type must be one of: {", ".join(sorted(_VALID_SOUND_TYPES))}'
            )
        fields.append('sound_type = ?')
        values.append(sound_type)

    if 'threshold' in data:
        threshold = data['threshold']
        if not isinstance(threshold, (int, float)) or threshold <= 0:
            raise ValidationError('threshold must be a positive number')
        fields.append('threshold = ?')
        values.append(float(threshold))

    if 'triggered_at' in data:
        fields.append('triggered_at = ?')
        values.append(data['triggered_at'])

    try:
        with pooled_session() as conn:
            row = conn.execute(
                'SELECT id FROM price_alerts WHERE id = ?', (alert_id,)
            ).fetchone()
            if not row:
                raise NotFoundError(f'Alert {alert_id} not found')

            if fields:
                values.append(alert_id)
                conn.execute(
                    f'UPDATE price_alerts SET {", ".join(fields)} WHERE id = ?',
                    values,
                )

            updated = conn.execute(
                'SELECT * FROM price_alerts WHERE id = ?', (alert_id,)
            ).fetchone()
    except NotFoundError:
        raise
    except Exception as exc:
        logger.error('update_alert: DB error: %s', exc)
        raise DatabaseError('Failed to update alert') from exc

    return jsonify(_row_to_dict(updated))


@alerts_bp.route('/alerts/<int:alert_id>', methods=['DELETE'])
@handle_api_errors
def delete_alert(alert_id: int):
    """Delete a price alert by ID."""
    try:
        with pooled_session() as conn:
            row = conn.execute(
                'SELECT id FROM price_alerts WHERE id = ?', (alert_id,)
            ).fetchone()
            if not row:
                raise NotFoundError(f'Alert {alert_id} not found')
            conn.execute('DELETE FROM price_alerts WHERE id = ?', (alert_id,))
    except NotFoundError:
        raise
    except Exception as exc:
        logger.error('delete_alert: DB error: %s', exc)
        raise DatabaseError('Failed to delete alert') from exc

    return jsonify({'success': True})


# ---------------------------------------------------------------------------
# Per-alert sound type override
# ---------------------------------------------------------------------------

@alerts_bp.route('/alerts/<int:alert_id>/sound', methods=['PUT'])
@handle_api_errors
def update_alert_sound(alert_id: int):
    """Override the sound type for a single price alert.

    Request body: ``{"sound_type": "chime"}``

    Valid sound types: ``default``, ``chime``, ``alarm``, ``silent``.
    Returns the updated alert row on success.
    """
    data = request.get_json(silent=True) or {}
    sound_type = data.get('sound_type')

    if not sound_type or sound_type not in _VALID_SOUND_TYPES:
        raise ValidationError(
            f'sound_type must be one of: {", ".join(sorted(_VALID_SOUND_TYPES))}',
            error_code='VALIDATION_ERROR',
        )

    try:
        with pooled_session() as conn:
            row = conn.execute(
                'SELECT id FROM price_alerts WHERE id = ?', (alert_id,)
            ).fetchone()
            if not row:
                raise NotFoundError(f'Alert {alert_id} not found')
            conn.execute(
                'UPDATE price_alerts SET sound_type = ? WHERE id = ?',
                (sound_type, alert_id),
            )
            updated = conn.execute(
                'SELECT * FROM price_alerts WHERE id = ?', (alert_id,)
            ).fetchone()
    except NotFoundError:
        raise
    except Exception as exc:
        logger.error('update_alert_sound: DB error: %s', exc)
        raise DatabaseError('Failed to update alert sound') from exc

    return jsonify(_row_to_dict(updated))
```