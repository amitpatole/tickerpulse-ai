"""
TickerPulse AI v3.0 — App State API

GET  /api/app-state  — return all persisted UI state as a flat dict
PATCH /api/app-state — upsert or delete individual state keys
"""

import json
import logging

from flask import Blueprint, jsonify, request

logger = logging.getLogger(__name__)

app_state_bp = Blueprint("app_state", __name__)

_MAX_BODY_BYTES = 16 * 1024   # 16 KB total body guard
_MAX_VALUE_BYTES = 16 * 1024  # 16 KB per individual value


def get_state_manager():
    """Return a StateManager bound to the default database path."""
    from backend.core.state_manager import StateManager

    return StateManager()


# ---------------------------------------------------------------------------
# GET /api/app-state
# ---------------------------------------------------------------------------


@app_state_bp.route("/api/app-state", methods=["GET"])
def get_app_state():
    """Return all persisted UI state.

    Returns an empty dict on database error so the UI never hard-fails.
    ---
    tags:
      - System
    responses:
      200:
        description: Flat dict of all stored state keys → values.
        schema:
          type: object
    """
    try:
        manager = get_state_manager()
        state = manager.get_all_state()
        return jsonify(state), 200
    except Exception as exc:
        logger.warning("GET /api/app-state: failed to load state — %s", exc)
        return jsonify({}), 200


# ---------------------------------------------------------------------------
# PATCH /api/app-state
# ---------------------------------------------------------------------------


@app_state_bp.route("/api/app-state", methods=["PATCH"])
def patch_app_state():
    """Upsert or delete state keys.

    Request body must be a non-empty JSON object.  Each key/value pair is
    processed:

    - ``value = null``   → delete the key
    - ``value = <dict>`` → upsert (full overwrite) the key

    Values must be JSON objects (dicts) or null; primitive values (strings,
    integers, lists) are rejected with 400.  Each serialized value is capped
    at 16 KB.

    Returns ``{"ok": true}`` on success.
    ---
    tags:
      - System
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
    responses:
      200:
        description: State persisted successfully.
      400:
        description: Invalid request body.
      500:
        description: Failed to persist one or more state keys.
    """
    # Pre-parse total size guard (defense in depth — avoids parsing huge bodies)
    if request.content_length and request.content_length > _MAX_BODY_BYTES:
        return jsonify({"error": "Payload exceeds maximum allowed size (16 KB)"}), 400

    body = request.get_json(silent=True)

    if body is None:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    if not isinstance(body, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400

    if len(body) == 0:
        return jsonify({"error": "Request body must not be empty"}), 400

    # Post-parse total size guard (catches cases where content_length wasn't set)
    raw = request.get_data()
    if len(raw) > _MAX_BODY_BYTES:
        return jsonify({"error": "Payload exceeds maximum allowed size (16 KB)"}), 400

    # Per-value type and size validation
    for key, value in body.items():
        if value is None:
            continue  # null → delete; always valid

        if not isinstance(value, dict):
            return jsonify(
                {"error": f"Value for key '{key}' must be a JSON object or null"}
            ), 400

        try:
            serialized_size = len(json.dumps(value).encode())
        except (TypeError, ValueError):
            return jsonify(
                {"error": f"Value for key '{key}' could not be serialized"}
            ), 400

        if serialized_size > _MAX_VALUE_BYTES:
            return jsonify(
                {
                    "error": (
                        f"Value for key '{key}' exceeds maximum value size "
                        f"({serialized_size} bytes, limit is {_MAX_VALUE_BYTES} bytes)"
                    )
                }
            ), 400

    # Persist all keys — collect failures so we report them together
    manager = get_state_manager()
    failed_keys: list[str] = []

    for key, value in body.items():
        try:
            if value is None:
                manager.delete_state(key)
            else:
                manager.set_state(key, value)
        except Exception as exc:
            failed_keys.append(key)
            logger.error(
                "PATCH /api/app-state: failed to save key '%s' — %s", key, exc
            )

    if failed_keys:
        return jsonify(
            {"error": f"Failed to save keys: {', '.join(failed_keys)}"}
        ), 500

    return jsonify({"ok": True}), 200