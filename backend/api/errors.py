"""
TickerPulse AI v3.0 - Frontend/Electron Error Ingestion API

POST /api/errors  — accept and persist error reports from clients.
GET  /api/errors  — query persisted error log entries (operator use).
"""

import json
import logging
import uuid

from flask import Blueprint, g, jsonify, request

from backend.database import db_session
from backend.core.error_handlers import (
    ApiError,
    DatabaseError,
    ValidationError,
    handle_api_errors,
)

logger = logging.getLogger(__name__)

errors_bp = Blueprint('errors', __name__, url_prefix='/api')

_VALID_ERROR_TYPES = frozenset({
    'unhandled_exception',
    'unhandled_rejection',
    'react_error',
})

_VALID_SOURCES = frozenset({'frontend', 'electron'})
_VALID_SEVERITIES = frozenset({'error', 'warning', 'critical'})

_MAX_PAYLOAD_BYTES = 65_536   # 64 KB hard cap
_MAX_QUERY_LIMIT = 500        # maximum rows returned by GET /api/errors
_MAX_SESSION_ID_LEN = 64      # session_id is truncated to this length


def _request_id() -> str:
    return getattr(g, 'request_id', str(uuid.uuid4()))


@errors_bp.route('/errors', methods=['POST'])
@handle_api_errors
def ingest_error():
    """Accept error reports from frontend and electron clients.

    Required body fields: type, message, timestamp.
    Optional fields: stack, source, session_id, severity, url, user_agent,
                     component_stack, context.

    Returns:
        201  {success: True, error_id, request_id}
        400  Validation failure.
        413  Payload exceeds 64 KB.
        500  Database write failure.
    """
    req_id = _request_id()

    # Reject oversized raw bodies before JSON parsing
    raw = request.get_data()
    if len(raw) > _MAX_PAYLOAD_BYTES:
        raise ApiError(
            f'Payload too large (max {_MAX_PAYLOAD_BYTES // 1024}KB)',
            error_code='PAYLOAD_TOO_LARGE',
            status_code=413,
        )

    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        raise ValidationError('Missing or invalid JSON body')

    # Validate required fields
    missing = [f for f in ('type', 'message', 'timestamp') if f not in data]
    if missing:
        raise ValidationError(f'Missing required fields: {", ".join(missing)}')

    # Validate error type enum
    error_type = data['type']
    if error_type not in _VALID_ERROR_TYPES:
        raise ValidationError(
            f"Invalid type '{error_type}'. "
            f"Must be one of: {', '.join(sorted(_VALID_ERROR_TYPES))}"
        )

    # Re-check payload size after JSON parsing (handles encoded payloads)
    if len(json.dumps(data)) > _MAX_PAYLOAD_BYTES:
        raise ApiError(
            f'Payload too large (max {_MAX_PAYLOAD_BYTES // 1024}KB)',
            error_code='PAYLOAD_TOO_LARGE',
            status_code=413,
        )

    # Resolve source — unknown sources fall back to 'frontend'
    source_raw = data.get('source', 'frontend')
    source = source_raw if source_raw in _VALID_SOURCES else 'frontend'

    # Build context JSON from supplemental metadata fields
    context_data: dict = {}
    for key in ('url', 'user_agent', 'timestamp', 'component_stack'):
        if key in data:
            context_data[key] = data[key]
    if isinstance(data.get('context'), dict):
        context_data.update(data['context'])
    context_json = json.dumps(context_data) if context_data else None

    # Resolve severity
    severity_raw = data.get('severity', 'error')
    severity = severity_raw if severity_raw in _VALID_SEVERITIES else 'error'

    # Sanitise session_id
    session_id_raw = data.get('session_id')
    if not isinstance(session_id_raw, str):
        session_id: str | None = None
    else:
        session_id = session_id_raw[:_MAX_SESSION_ID_LEN]

    error_id = f'err_{req_id}'

    try:
        with db_session() as conn:
            conn.execute(
                """
                INSERT INTO error_log
                    (source, error_code, message, stack,
                     request_id, context, severity, session_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    source,
                    error_type,
                    data['message'],
                    data.get('stack'),
                    req_id,
                    context_json,
                    severity,
                    session_id,
                ),
            )
    except Exception as exc:
        raise DatabaseError('Failed to store error report') from exc

    return jsonify({
        'success': True,
        'error_id': error_id,
        'request_id': req_id,
    }), 201


@errors_bp.route('/errors', methods=['GET'])
@handle_api_errors
def query_errors():
    """Query persisted error log entries.

    Query Parameters:
        source     (str, optional): Filter by source.
        severity   (str, optional): Filter by severity.
        since      (str, optional): ISO timestamp lower bound.
        session_id (str, optional): Filter by session ID.
        limit      (int, optional): Max rows; default 100, max 500.

    Returns:
        200 {success: True, errors: [...], count: int}
        500 on database failure.
    """
    try:
        limit = int(request.args.get('limit', 100))
    except (ValueError, TypeError):
        limit = 100
    limit = min(max(1, limit), _MAX_QUERY_LIMIT)

    conditions: list[str] = []
    params: list = []

    source = request.args.get('source')
    if source:
        conditions.append('source = ?')
        params.append(source)

    severity = request.args.get('severity')
    if severity:
        conditions.append('severity = ?')
        params.append(severity)

    since = request.args.get('since')
    if since:
        conditions.append('created_at >= ?')
        params.append(since)

    session_id = request.args.get('session_id')
    if session_id:
        conditions.append('session_id = ?')
        params.append(session_id)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ''
    sql = f"""
        SELECT id, source, error_code, message, stack,
               request_id, context, severity, session_id, created_at
        FROM error_log
        {where}
        ORDER BY created_at DESC
        LIMIT ?
    """
    params.append(limit)

    try:
        with db_session() as conn:
            rows = conn.execute(sql, params).fetchall()
        errors = [dict(row) for row in rows]
        return jsonify({'success': True, 'errors': errors, 'count': len(errors)})
    except Exception as exc:
        raise DatabaseError('Failed to query error log') from exc
