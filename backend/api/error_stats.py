```python
"""
TickerPulse AI v3.0 — Error log aggregate statistics endpoint.

Endpoint
--------
GET /api/errors/stats
    Returns aggregate error counts by severity, source, and top error codes
    over a configurable rolling time window.  Intended for operator dashboards
    and health monitors.
"""

import logging

from flask import Blueprint, g, jsonify, request

from backend.database import db_session

logger = logging.getLogger(__name__)

error_stats_bp = Blueprint('error_stats', __name__, url_prefix='/api')

_VALID_WINDOWS: dict[str, int] = {'1h': 1, '6h': 6, '24h': 24}
_VALID_SOURCES = frozenset({'frontend', 'backend', 'electron'})
_TOP_CODES_LIMIT = 10


@error_stats_bp.route('/errors/stats', methods=['GET'])
def get_error_stats():
    """Aggregate error log statistics over a rolling time window.

    ---
    tags:
      - System
    parameters:
      - in: query
        name: window
        type: string
        enum: [1h, 6h, 24h]
        default: 1h
        description: Rolling time window for aggregation
      - in: query
        name: source
        type: string
        description: Optional filter by source (frontend, backend, electron)
    responses:
      200:
        description: Aggregate error statistics
        schema:
          type: object
          properties:
            total:
              type: integer
            by_severity:
              type: object
            by_source:
              type: object
            top_codes:
              type: array
              items:
                type: object
                properties:
                  code:
                    type: string
                  count:
                    type: integer
      500:
        description: Database query failure
    """
    request_id: str = g.get('request_id', '-')

    window_param = request.args.get('window', '1h')
    if window_param not in _VALID_WINDOWS:
        window_param = '1h'
    hours = _VALID_WINDOWS[window_param]

    source_filter = request.args.get('source')
    if source_filter and source_filter not in _VALID_SOURCES:
        source_filter = None

    try:
        with db_session() as conn:
            # Build parameterised WHERE clause shared by all sub-queries
            conditions = [f"created_at >= datetime('now', ?)"]
            params: list = [f'-{hours} hours']

            if source_filter:
                conditions.append('source = ?')
                params.append(source_filter)

            where = 'WHERE ' + ' AND '.join(conditions)

            # Total count
            total: int = conn.execute(
                f'SELECT COUNT(*) FROM error_log {where}',
                params,
            ).fetchone()[0]

            # Counts by severity
            severity_rows = conn.execute(
                f'SELECT severity, COUNT(*) FROM error_log {where} GROUP BY severity',
                params,
            ).fetchall()
            by_severity: dict[str, int] = {'error': 0, 'warning': 0, 'critical': 0}
            for row in severity_rows:
                key = row[0] if row[0] in by_severity else 'error'
                by_severity[key] = row[1]

            # Counts by source
            source_rows = conn.execute(
                f'SELECT source, COUNT(*) FROM error_log {where} GROUP BY source',
                params,
            ).fetchall()
            by_source: dict[str, int] = {row[0]: row[1] for row in source_rows}

            # Top error codes (non-null only)
            where_codes = (
                'WHERE '
                + ' AND '.join(conditions + ['error_code IS NOT NULL'])
            )
            code_rows = conn.execute(
                f"""
                SELECT error_code, COUNT(*) as cnt
                FROM   error_log
                {where_codes}
                GROUP  BY error_code
                ORDER  BY cnt DESC
                LIMIT  ?
                """,
                params + [_TOP_CODES_LIMIT],
            ).fetchall()
            top_codes = [{'code': row[0], 'count': row[1]} for row in code_rows]

        return jsonify({
            'success': True,
            'window': window_param,
            'total': total,
            'by_severity': by_severity,
            'by_source': by_source,
            'top_codes': top_codes,
            'request_id': request_id,
        })

    except Exception as exc:
        logger.error(
            'error_stats query failed [%s]: %s',
            request_id, exc, exc_info=True,
        )
        return jsonify({
            'success': False,
            'error': 'Failed to query error statistics',
            'error_code': 'DATABASE_ERROR',
            'request_id': request_id,
        }), 500
```