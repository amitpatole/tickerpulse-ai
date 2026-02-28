"""
TickerPulse AI v3.0 - Activity Feed API
Unified timeline of agent runs, job executions, and errors with daily cost aggregation.
"""

import logging
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

from backend.database import pooled_session
from backend.core.error_handlers import handle_api_errors, ValidationError

logger = logging.getLogger(__name__)

activity_bp = Blueprint('activity', __name__, url_prefix='/api/activity')

_VALID_TYPES = frozenset({'agent', 'job', 'error', 'all'})


def _clamp_days(default: int = 7) -> int:
    try:
        days = int(request.args.get('days', default))
        return max(1, min(days, 30))
    except (ValueError, TypeError):
        return default


@activity_bp.route('/feed')
@handle_api_errors
def get_activity_feed():
    """Unified activity feed: agent runs, job executions, and errors.

    Query Parameters:
        days    int  1–30                (default 7)
        type    str  agent|job|error|all (default all)
        limit   int  1–100               (default 50)
        offset  int  >= 0                (default 0)

    Returns events sorted newest-first, daily cost aggregates, and period totals.
    """
    days = _clamp_days()
    event_type = request.args.get('type', 'all')
    if event_type not in _VALID_TYPES:
        raise ValidationError(
            f"type must be one of: {', '.join(sorted(_VALID_TYPES))}",
            error_code='INVALID_INPUT',
        )
    try:
        limit = int(request.args.get('limit', 50))
        limit = max(1, min(limit, 100))
    except (ValueError, TypeError):
        limit = 50
    try:
        offset = int(request.args.get('offset', 0))
        offset = max(0, offset)
    except (ValueError, TypeError):
        offset = 0

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime('%Y-%m-%d %H:%M:%S')
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime('%Y-%m-%d')

    all_events: list = []

    with pooled_session() as conn:
        if event_type in ('agent', 'all'):
            rows = conn.execute(
                """
                SELECT
                    id,
                    agent_name AS name,
                    CASE WHEN status = 'completed' THEN 'success'
                         WHEN status = 'failed'    THEN 'error'
                         ELSE status END AS status,
                    COALESCE(estimated_cost, 0.0) AS cost,
                    duration_ms,
                    started_at AS timestamp,
                    NULL AS summary
                FROM agent_runs
                WHERE started_at >= ?
                """,
                (cutoff,),
            ).fetchall()
            for row in rows:
                all_events.append({
                    'id': f'agent_{row["id"]}',
                    'type': 'agent',
                    'name': row['name'],
                    'status': row['status'],
                    'cost': float(row['cost'] or 0.0),
                    'duration_ms': row['duration_ms'],
                    'timestamp': row['timestamp'],
                    'summary': row['summary'],
                })

        if event_type in ('job', 'all'):
            rows = conn.execute(
                """
                SELECT
                    id,
                    job_name AS name,
                    CASE WHEN status = 'failed' THEN 'error'
                         ELSE status END AS status,
                    COALESCE(cost, 0.0) AS cost,
                    duration_ms,
                    executed_at AS timestamp,
                    result_summary AS summary
                FROM job_history
                WHERE executed_at >= ?
                """,
                (cutoff,),
            ).fetchall()
            for row in rows:
                all_events.append({
                    'id': f'job_{row["id"]}',
                    'type': 'job',
                    'name': row['name'],
                    'status': row['status'],
                    'cost': float(row['cost'] or 0.0),
                    'duration_ms': row['duration_ms'],
                    'timestamp': row['timestamp'],
                    'summary': row['summary'],
                })

        if event_type in ('error', 'all'):
            rows = conn.execute(
                """
                SELECT
                    id,
                    source AS name,
                    severity AS status,
                    created_at AS timestamp,
                    message AS summary
                FROM error_log
                WHERE created_at >= ?
                """,
                (cutoff,),
            ).fetchall()
            for row in rows:
                all_events.append({
                    'id': f'error_{row["id"]}',
                    'type': 'error',
                    'name': row['name'],
                    'status': row['status'],
                    'cost': 0.0,
                    'duration_ms': None,
                    'timestamp': row['timestamp'],
                    'summary': row['summary'],
                })

        # Daily cost aggregation — always from agent_runs + job_history
        daily_agent = conn.execute(
            """
            SELECT
                date(started_at) AS date,
                COALESCE(SUM(estimated_cost), 0.0) AS cost,
                COUNT(*) AS runs
            FROM agent_runs
            WHERE date(started_at) >= ?
            GROUP BY date(started_at)
            """,
            (cutoff_date,),
        ).fetchall()

        daily_job = conn.execute(
            """
            SELECT
                date(executed_at) AS date,
                COALESCE(SUM(cost), 0.0) AS cost,
                COUNT(*) AS runs
            FROM job_history
            WHERE date(executed_at) >= ?
            GROUP BY date(executed_at)
            """,
            (cutoff_date,),
        ).fetchall()

    # Sort all events newest-first
    all_events.sort(key=lambda e: e.get('timestamp') or '', reverse=True)

    # Compute totals over the full pre-pagination dataset
    total_runs = len(all_events)
    total_cost = sum(e['cost'] for e in all_events)
    error_count = sum(
        1 for e in all_events
        if e['status'] in ('error', 'failed', 'critical')
    )
    agent_job_events = [e for e in all_events if e['type'] in ('agent', 'job')]
    success_count = sum(
        1 for e in agent_job_events
        if e['status'] in ('success', 'completed')
    )
    success_rate = (
        round(success_count / len(agent_job_events), 4) if agent_job_events else 0.0
    )

    # Apply pagination
    page_events = all_events[offset: offset + limit]
    formatted_events = [
        {
            'id': e['id'],
            'type': e['type'],
            'name': e['name'],
            'status': e['status'],
            'cost': round(e['cost'], 6),
            'duration_ms': e['duration_ms'],
            'timestamp': e['timestamp'],
            'summary': e['summary'],
        }
        for e in page_events
    ]

    # Merge daily costs from agent + job runs
    daily_map: dict = {}
    for row in daily_agent:
        d = row['date']
        daily_map[d] = {
            'date': d,
            'total_cost': float(row['cost'] or 0.0),
            'run_count': row['runs'],
        }
    for row in daily_job:
        d = row['date']
        if d in daily_map:
            daily_map[d]['total_cost'] += float(row['cost'] or 0.0)
            daily_map[d]['run_count'] += row['runs']
        else:
            daily_map[d] = {
                'date': d,
                'total_cost': float(row['cost'] or 0.0),
                'run_count': row['runs'],
            }
    daily_costs = [
        {
            'date': d,
            'total_cost': round(v['total_cost'], 6),
            'run_count': v['run_count'],
        }
        for d, v in sorted(daily_map.items())
    ]

    return jsonify({
        'events': formatted_events,
        'daily_costs': daily_costs,
        'totals': {
            'cost': round(total_cost, 6),
            'runs': total_runs,
            'errors': error_count,
            'success_rate': success_rate,
        },
    })