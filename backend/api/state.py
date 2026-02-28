"""
TickerPulse AI v3.0 - UI State API Routes
Exposes GET /api/state and PATCH /api/state for frontend state persistence.
"""

import logging

from flask import Blueprint, jsonify, request

from backend.core.state_manager import get_state_manager
from backend.core.error_handlers import handle_api_errors, ValidationError

logger = logging.getLogger(__name__)

state_bp = Blueprint('state', __name__, url_prefix='/api')


@state_bp.route('/state', methods=['GET'])
def get_state():
    """Retrieve all persisted UI state.

    Always returns 200. An empty dict is returned when no state has been saved.
    """
    try:
        all_state = get_state_manager().get_all_state()
        return jsonify({'success': True, 'state': all_state}), 200
    except Exception as exc:
        logger.error("GET /api/state failed: %s", exc)
        return jsonify({'success': False, 'error': str(exc)}), 500


@state_bp.route('/state', methods=['PATCH'])
def patch_state():
    """Update one or more UI state namespaces.

    Accepts a JSON body where each key maps to a dict value.
    Rejects empty bodies and non-dict values with 400.
    """
    body = request.get_json(silent=True)

    if not body:
        return jsonify({'success': False, 'error': 'Request body required'}), 400

    for key, value in body.items():
        if not isinstance(value, dict):
            return jsonify({
                'success': False,
                'error': f'State value must be dict, got {type(value).__name__}',
            }), 400

    try:
        manager = get_state_manager()
        for key, value in body.items():
            manager.set_state(key, value)
        return jsonify({'success': True, 'updated_keys': list(body.keys())}), 200
    except Exception as exc:
        logger.error("PATCH /api/state failed: %s", exc)
        return jsonify({'success': False, 'error': str(exc)}), 500
