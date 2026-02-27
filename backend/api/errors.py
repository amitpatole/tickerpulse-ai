"""
TickerPulse AI v3.0 — Frontend error ingestion API.

Blueprint for accepting client-side error reports and persisting them
to the ``error_log`` table for monitoring and debugging.

Endpoints
---------
POST /api/errors
    Ingest a single error report from the frontend.  Validates required
    fields, rejects oversized payloads (>64 KB), and writes to DB.

GET /api/errors
    Query persisted errors with optional filters (source, severity, since).
    Admin-facing; intended for internal dashboards / debugging tooling.
"""

import json
import logging

from flask import Blueprint, g, jsonify, request

from backend.database import db_session

logger = logging.getLogger(__name__)

errors_bp = Blueprint('errors', __name__, url_prefix='/api')

_VALID_ERROR_TYPES = frozenset({
    'unhandled_exception',
    'unhandled_rejection',
    'react_error',
})
_MAX_PAYLOAD_BYTES = 65_536  # 64 KB
_MAX_QUERY_LIMIT = 500


# ---------------------------------------------------------------------------
# POST /api/errors — ingest a single error report
# ---------------------------------------------------------------------------

@errors_bp.route('/errors', methods=['POST'])
def ingest_error():
    """Accept an error report from the frontend and persist it.

    ---
    tags:
      - System
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - type
            - message
            - timestamp
          properties:
            type:
              type: string
              enum: [unhandled_exception, unhandled_rejection, react_error]
            message:
              type: string
            stack:
              type: string
            component_stack:
              type: string
            url:
              type: string
            user_agent:
              type: string
            timestamp:
              type: string
              format: date-time
    responses:
      201:
        description: Error accepted and persisted
      400:
        description: Missing required fields or invalid type
      413:
        description: Payload too large (>64 KB)
      500:
        description: Persistence failure
    """
    request_id: str = g.get('request_id', '-')

    data = request.get_json(silent=True)
    if not data:
        return jsonify({
            'success': False,
            'error': 'Missing or invalid JSON body',
            'request_id': request_id,
        }), 400

    # --- Required-field validation -------------------------------------------
    required = {'type', 'message', 'timestamp'}
    missing = required - set(data.keys())
    if missing:
        return jsonify({
            'success': False,
            'error': f'Missing required fields: {", ".join(sorted(missing))}',
            'request_id': request_id,
        }), 400

    # --- Type enum validation -------------------------------------------------
    if data['type'] not in _VALID_ERROR_TYPES:
        return jsonify({
            'success': False,
            'error': (
                f'Invalid type {data["type"]!r}. '
                f'Must be one of: {sorted(_VALID_ERROR_TYPES)}'
            ),
            'request_id': request_id,
        }), 400

    # --- Size guard ----------------------------------------------------------
    payload_size = len(json.dumps(data).encode('utf-8'))
    if payload_size > _MAX_PAYLOAD_BYTES:
        return jsonify({
            'success': False,
            'error': 'Payload too large (max 64KB)',
            'request_id': request_id,
        }), 413

    # --- Persist to error_log ------------------------------------------------
    error_id = f'err_{request_id}'
    context_blob = json.dumps({
        'url': data.get('url'),
        'user_agent': data.get('user_agent'),
        'component_stack': data.get('component_stack'),
    })

    try:
        with db_session() as conn:
            conn.execute(
                """
                INSERT INTO error_log
                    (source, error_code, message, stack, request_id, context, severity)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    'frontend',
                    data['type'],
                    data['message'],
                    data.get('stack'),
                    request_id,
                    context_blob,
                    'error',
                ),
            )
    except Exception as exc:
        logger.error(
            "error_log insert failed [%s]: %s",
            request_id, exc, exc_info=True,
        )

    logger.info(
        "Frontend error ingested [%s]: type=%s message=%.120s",
        request_id, data['type'], data['message'],
    )

    return jsonify({
        'success': True,
        'error_id': error_id,
        'request_id': request_id,
    }), 201


# ---------------------------------------------------------------------------
# GET /api/errors — query persisted error log
# ---------------------------------------------------------------------------

@errors_bp.route('/errors', methods=['GET'])
def list_errors():
    """Query the error log with optional filters.

    ---
    tags:
      - System
    parameters:
      - in: query
        name: source
        type: string
        description: Filter by source (frontend, backend, electron)
      - in: query
        name: severity
        type: string
        description: Filter by severity (warning, error, critical)
      - in: query
        name: since
        type: string
        description: ISO-8601 datetime lower bound (e.g. 2026-01-01T00:00:00)
      - in: query
        name: limit
        type: integer
        default: 100
        description: Maximum rows to return (hard cap 500)
    responses:
      200:
        description: List of error log entries
      500:
        description: Database query failure
    """
    request_id: str = g.get('request_id', '-')

    source = request.args.get('source')
    severity = request.args.get('severity')
    since = request.args.get('since')
    try:
        limit = min(int(request.args.get('limit', 100)), _MAX_QUERY_LIMIT)
    except (TypeError, ValueError):
        limit = 100

    conditions: list[str] = []
    params: list = []

    if source:
        conditions.append('source = ?')
        params.append(source)
    if severity:
        conditions.append('severity = ?')
        params.append(severity)
    if since:
        conditions.append('created_at >= ?')
        params.append(since)

    where_clause = ('WHERE ' + ' AND '.join(conditions)) if conditions else ''

    try:
        with db_session() as conn:
            rows = conn.execute(
                f"""
                SELECT id, source, error_code, message, stack,
                       request_id, context, severity, created_at
                FROM   error_log
                {where_clause}
                ORDER  BY created_at DESC
                LIMIT  ?
                """,
                [*params, limit],
            ).fetchall()

        errors = [dict(row) for row in rows]
        return jsonify({
            'success': True,
            'errors': errors,
            'count': len(errors),
            'request_id': request_id,
        })

    except Exception as exc:
        logger.error(
            "error_log query failed [%s]: %s",
            request_id, exc, exc_info=True,
        )
        return jsonify({
            'success': False,
            'error': 'Failed to query error log',
            'error_code': 'DATABASE_ERROR',
            'request_id': request_id,
        }), 500