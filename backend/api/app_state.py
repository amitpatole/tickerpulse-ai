"""
TickerPulse AI v3.0 — App State API

GET  /api/app-state  — return all persisted UI state as a flat dict
PATCH /api/app-state — upsert or delete individual state keys
"""

import json
import logging

from flask import Blueprint, jsonify, request

from backend.core.error_handlers import (
    DatabaseError,
    ValidationError,
    handle_api_errors,
)

logger = logging.getLogger(__name__)

app_state_bp = Blueprint("app_state", __name__)

_MAX_BODY_BYTES = 16 * 1024   # 16 KB total body guard
_MAX_VALUE_BYTES = 16 * 1024  # 16 KB per individual value


def get_state_manager():
    """Return a StateManager bound to the default database path."""
    from backend.core.state_manager import StateManager

    return StateManager()


@app_state_bp.route("/api/app-state", methods=["GET"])
def get_app_state():
    """Return all persisted UI state.

    Returns an empty dict on database error so the UI never hard-fails.
    """
    try:
        manager = get_state_manager()
        state = manager.get_all_state()
        return jsonify(state), 200
    except Exception as exc:
        logger.warning("GET /api/app-state: failed to load state — %s", exc)
        return jsonify({}), 200


@app_state_bp.route("/api/app-state", methods=["PATCH"])
@handle_api_errors
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
    """
    # Pre-parse total size guard
    if request.content_length and request.content_length > _MAX_BODY_BYTES:
        raise ValidationError(
            "Payload exceeds maximum allowed size (16 KB)",
            error_code="PAYLOAD_TOO_LARGE",
            status_code=413,
        )

    body = request.get_json(silent=True)

    if body is None:
        raise ValidationError("Request body must be valid JSON")

    if not isinstance(body, dict):
        raise ValidationError("Request body must be a JSON object")

    if len(body) == 0:
        raise ValidationError("Request body must not be empty")

    # Post-parse total size guard (catches cases where content_length wasn't set)
    raw = request.get_data()
    if len(raw) > _MAX_BODY_BYTES:
        raise ValidationError(
            "Payload exceeds maximum allowed size (16 KB)",
            error_code="PAYLOAD_TOO_LARGE",
            status_code=413,
        )

    # Per-value type and size validation
    for key, value in body.items():
        if value is None:
            continue  # null → delete; always valid

        if not isinstance(value, dict):
            raise ValidationError(
                f"Value for key '{key}' must be a JSON object or null"
            )

        try:
            serialized_size = len(json.dumps(value).encode())
        except (TypeError, ValueError):
            raise ValidationError(f"Value for key '{key}' could not be serialized")

        if serialized_size > _MAX_VALUE_BYTES:
            raise ValidationError(
                f"Value for key '{key}' exceeds maximum value size "
                f"({serialized_size} bytes, limit is {_MAX_VALUE_BYTES} bytes)",
                error_code="PAYLOAD_TOO_LARGE",
            )

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
        raise DatabaseError(f"Failed to save keys: {', '.join(failed_keys)}")

    return jsonify({"ok": True}), 200
