"""
TickerPulse AI v3.0 - App State API

Persists UI/application state across restarts using the ui_state table via
StateManager.  Clients PATCH a partial state object; the server performs a
per-key upsert so unrelated namespaces are never clobbered.  Values explicitly
set to null remove their key.

Endpoints:
  GET  /api/app-state        → return all stored state as a flat dict
  PATCH /api/app-state       → upsert supplied keys, return {ok: true}
"""

import json
import logging

from flask import Blueprint, jsonify, request

from backend.core.state_manager import get_state_manager

logger = logging.getLogger(__name__)

app_state_bp = Blueprint('app_state', __name__, url_prefix='/api')

# Reject payloads larger than 16 KB per key to prevent DB bloat.
_MAX_VALUE_BYTES = 16_384


@app_state_bp.route('/app-state', methods=['GET'])
def get_app_state():
    """Return all persisted UI state.
    ---
    tags:
      - Settings
    summary: Get persisted application state
    description: >
      Returns the full UI state object. Always returns HTTP 200 — an empty
      object is returned when no state has been saved yet or on DB errors.
    responses:
      200:
        description: Current application state as a flat namespace dict.
        schema:
          type: object
          additionalProperties: true
    """
    try:
        state = get_state_manager().get_all_state()
        return jsonify(state)
    except Exception as exc:
        logger.error("get_app_state failed: %s", exc)
        return jsonify({})


@app_state_bp.route('/app-state', methods=['PATCH'])
def patch_app_state():
    """Upsert one or more state namespace keys.
    ---
    tags:
      - Settings
    summary: Update persisted application state
    description: >
      Each top-level key in the request body is treated as a state namespace.
      Its value must be a JSON object (dict).  Setting a key to null removes
      it.  Keys absent from the patch are left unchanged.
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          additionalProperties:
            type: object
    responses:
      200:
        description: State updated successfully.
        schema:
          type: object
          properties:
            ok:
              type: boolean
              example: true
      400:
        description: Invalid request body.
        schema:
          $ref: '#/definitions/Error'
      500:
        description: Database write error.
        schema:
          $ref: '#/definitions/Error'
    """
    patch = request.get_json(silent=True)
    if not isinstance(patch, dict):
        return jsonify({'error': 'Request body must be a JSON object'}), 400

    if not patch:
        return jsonify({'error': 'Request body must not be empty'}), 400

    manager = get_state_manager()
    errors: list[str] = []

    for key, value in patch.items():
        if value is None:
            # null → delete the namespace key
            try:
                manager.delete_state(key)
            except Exception as exc:
                logger.error("patch_app_state: delete failed for key %r: %s", key, exc)
                errors.append(key)
            continue

        if not isinstance(value, dict):
            return jsonify({
                'error': (
                    f"Value for key {key!r} must be a JSON object, "
                    f"got {type(value).__name__}"
                ),
            }), 400

        try:
            serialized = json.dumps(value)
        except (TypeError, ValueError) as exc:
            return jsonify({'error': f'Non-serializable value for key {key!r}: {exc}'}), 400

        if len(serialized.encode()) > _MAX_VALUE_BYTES:
            return jsonify({
                'error': (
                    f"Value for key {key!r} exceeds {_MAX_VALUE_BYTES} bytes"
                ),
            }), 400

        try:
            manager.set_state(key, value)
        except Exception as exc:
            logger.error("patch_app_state: write failed for key %r: %s", key, exc)
            errors.append(key)

    if errors:
        return jsonify({'error': f'Failed to save keys: {", ".join(errors)}'}), 500

    return jsonify({'ok': True})
