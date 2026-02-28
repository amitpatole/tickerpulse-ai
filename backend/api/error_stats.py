"""
TickerPulse AI v3.0 - Error Statistics API

GET /api/errors/stats — aggregate error counts grouped by severity, source,
and error code over a configurable time window.
"""

import logging

from flask import Blueprint, g, jsonify, request

from backend.database import db_session
from backend.core.error_handlers import DatabaseError, handle_api_errors

logger = logging.getLogger(__name__)

error_stats_bp = Blueprint('error_stats', __name__, url_prefix='/api/errors')

_WINDOW_HOURS: dict[str, int] = {'1h': 1, '6h': 6, '24h': 24}
_DEFAULT_WINDOW = '1h'
_VALID_SOURCES = frozenset({'frontend', 'backend', 'electron'})


def _request_id() -> str:
    return getattr(g, 'request_id', '-')


@error_stats_bp.route('/stats', methods=['GET'])
@handle_api_errors
def get_error_stats():
    """Return aggregate error statistics over a time window.

    Query Parameters:
        window (str, optional): '1h', '6h', or '24h'. Defaults to '1h'.
            Invalid values silently fall back to '1h'.
        source (str, optional): Filter by source. Invalid values are ignored.

    Returns:
        200 {
            success, window, total,
            by_severity: {error, warning, critical},
            by_source:   {<source>: count, ...},
            top_codes:   [{code, count}, ...],
            request_id,
        }
        500 on database failure.
    """
    req_id = _request_id()

    window = request.args.get('window', _DEFAULT_WINDOW)
    if window not in _WINDOW_HOURS:
        window = _DEFAULT_WINDOW
    hours = _WINDOW_HOURS[window]

    source_filter = request.args.get('source')
    if source_filter and source_filter not in _VALID_SOURCES:
        source_filter = None  # silently ignore unknown sources

    # Build shared WHERE clause (applied to all 4 queries)
    where_parts = [f"created_at >= datetime('now', '-{hours} hours')"]
    base_params: list = []
    if source_filter:
        where_parts.append('source = ?')
        base_params.append(source_filter)
    where = 'WHERE ' + ' AND '.join(where_parts)

    try:
        with db_session() as conn:
            # 1. Total count
            total = conn.execute(
                f'SELECT COUNT(*) FROM error_log {where}',
                base_params,
            ).fetchone()[0] or 0

            # 2. By severity
            sev_rows = conn.execute(
                f'SELECT severity, COUNT(*) FROM error_log {where} GROUP BY severity',
                base_params,
            ).fetchall()
            by_severity = {'error': 0, 'warning': 0, 'critical': 0}
            for row in sev_rows:
                key = row[0]
                if key in by_severity:
                    by_severity[key] = row[1]

            # 3. By source
            src_rows = conn.execute(
                f'SELECT source, COUNT(*) FROM error_log {where} GROUP BY source',
                base_params,
            ).fetchall()
            by_source = {row[0]: row[1] for row in src_rows}

            # 4. Top error codes (descending by count)
            code_rows = conn.execute(
                f"""
                SELECT error_code, COUNT(*) AS cnt
                FROM error_log {where}
                GROUP BY error_code
                ORDER BY cnt DESC
                LIMIT 10
                """,
                base_params,
            ).fetchall()
            top_codes = [{'code': row[0], 'count': row[1]} for row in code_rows]

        return jsonify({
            'success': True,
            'window': window,
            'total': total,
            'by_severity': by_severity,
            'by_source': by_source,
            'top_codes': top_codes,
            'request_id': req_id,
        })

    except Exception as exc:
        raise DatabaseError('Failed to query error statistics') from exc
