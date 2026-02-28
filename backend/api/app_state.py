```python
"""
TickerPulse AI v3.0 - App State API
GET/PATCH /api/app-state endpoints for persisting UI state across restarts.
"""

import json
import logging
from typing import Optional

from flask import Blueprint, jsonify, request

from backend.core.state_manager import StateManager

logger = logging.getLogger(__name__)

app_state_bp = Blueprint('app_state', __name__, url_prefix='/api')

# Maximum allowed serialized size per value (16 KB)
_MAX_VALUE_BYTES = 16_384

_state_manager: Optional[StateManager] = None


def get_state_manager() -> StateManager:
    """Return the process-wide StateManager (lazy singleton)."""
    global _state_manager
    if _state_manager is None:
        _state_manager = StateManager()
    return _state_manager


@app_state_bp.route('/app-state', methods=['GET'])
def get_app_state():
    """Return all persisted UI state as a flat key→value dict.

    Returns ``{}`` on any error so the frontend degrades gracefully.
    """
    try:
        state = get_state_manager().get_all_state()
        return jsonify(state)
    except Exception as exc:
        logger.warning("GET /api/app-state: failed to load state: %s", exc)
        return jsonify({})


@app_state_bp.route('/app-state', methods=['PATCH'])
def patch_app_state():
    """Persist one or more UI state keys."""
    if not request.is_json:
        return jsonify({'error': 'Request body must be JSON'}), 400

    body = request.get_json(silent=True)

    if body is None:
        return jsonify({'error': 'Request body must be JSON'}), 400

    if not isinstance(body, dict):
        return jsonify({'error': 'Request body must be a JSON object'}), 400

    if len(body) == 0:
        return jsonify({'error': 'Request body must not be empty'}), 400

    for key, value in body.items():
        if value is None:
            continue
        if not isinstance(value, dict):
            return jsonify({
                'error': f"Value for '{key}' must be a JSON object or null, got {type(value).__name__}"
            }), 400
        try:
            serialized = json.dumps(value)
        except (TypeError, ValueError) as exc:
            return jsonify({'error': f"Value for '{key}' is not JSON serializable: {exc}"}), 400
        if len(serialized.encode()) > _MAX_VALUE_BYTES:
            return jsonify({
                'error': f"Value for '{key}' exceeds maximum size of {_MAX_VALUE_BYTES} bytes"
            }), 400

    manager = get_state_manager()
    failed_keys: list = []

    for key, value in body.items():
        try:
            if value is None:
                manager.delete_state(key)
            else:
                manager.set_state(key, value)
        except Exception as exc:
            logger.error("PATCH /api/app-state: failed to save key '%s': %s", key, exc)
            failed_keys.append(key)

    if failed_keys:
        return jsonify({'error': f"Failed to save keys: {', '.join(failed_keys)}"}), 500

    return jsonify({'ok': True})
```