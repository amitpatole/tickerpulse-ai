```python
"""
TickerPulse AI v3.0 - Performance Metrics API
Endpoints for tracking and displaying key performance metrics over time.
"""

import logging
import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

from backend.database import pooled_session
from backend.core.error_handlers import handle_api_errors, ValidationError

logger = logging.getLogger(__name__)

metrics_bp = Blueprint('metrics', __name__, url_prefix='/api/metrics')


def _days_param(default: int = 30) -> int:
    try:
        days = int(request.args.get('days', default))
        return max(1, min(days, 365))
    except (ValueError, TypeError):
        return default


@metrics_bp.route('/summary')
@handle_api_errors
def get_summary():
    """Overall performance summary: agent runs, costs, and job executions."""
    days = _days_param()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime('%Y-%m-%d %H:%M:%S')

    with pooled_session() as conn:
        agent_row = conn.execute(
            """
            SELECT
                COUNT(*) AS total_runs,
                SUM(CASE WHEN status IN ('success', 'completed') THEN 1 ELSE 0 END) AS success_runs,
                SUM(CASE WHEN status IN ('error', 'failed') THEN 1 ELSE 0 END) AS error_runs,
                AVG(CASE WHEN status IN ('success', 'completed') THEN duration_ms END) AS avg_duration_ms,
                SUM(estimated_cost) AS total_cost,
                SUM(tokens_input + tokens_output) AS total_tokens
            FROM agent_runs
            WHERE started_at >= ?
            """,
            (cutoff,),
        ).fetchone()

        job_row = conn.execute(
            """
            SELECT
                COUNT(*) AS total_executions,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_executions,
                AVG(CASE WHEN status = 'success' THEN duration_ms END) AS avg_duration_ms,
                SUM(cost) AS total_cost
            FROM job_history
            WHERE executed_at >= ?
            """,
            (cutoff,),
        ).fetchone()

        top_agents = conn.execute(
            """
            SELECT agent_name, SUM(estimated_cost) AS total_cost, COUNT(*) AS run_count
            FROM agent_runs
            WHERE started_at >= ?
            GROUP BY agent_name
            ORDER BY total_cost DESC
            LIMIT 5
            """,
            (cutoff,),
        ).fetchall()

        error_trend = conn.execute(
            """
            SELECT
                date(started_at) AS day,
                COUNT(*) AS total,
                SUM(CASE WHEN status IN ('error', 'failed') THEN 1 ELSE 0 END) AS errors
            FROM agent_runs
            WHERE date(started_at) >= date('now', '-7 days')
            GROUP BY day
            ORDER BY day
            """,
        ).fetchall()

    a = dict(agent_row) if agent_row else {}
    j = dict(job_row) if job_row else {}
    total_agent_runs = a.get('total_runs') or 0
    success_agent_runs = a.get('success_runs') or 0
    total_job_execs = j.get('total_executions') or 0
    success_job_execs = j.get('success_executions') or 0

    return jsonify({
        'period_days': days,
        'agents': {
            'total_runs': total_agent_runs,
            'success_runs': success_agent_runs,
            'error_runs': a.get('error_runs') or 0,
            'success_rate': round(success_agent_runs / total_agent_runs, 4) if total_agent_runs else 0.0,
            'avg_duration_ms': round(a.get('avg_duration_ms') or 0),
            'total_cost': round(a.get('total_cost') or 0.0, 6),
            'total_tokens': a.get('total_tokens') or 0,
        },
        'jobs': {
            'total_executions': total_job_execs,
            'success_executions': success_job_execs,
            'success_rate': round(success_job_execs / total_job_execs, 4) if total_job_execs else 0.0,
            'avg_duration_ms': round(j.get('avg_duration_ms') or 0),
            'total_cost': round(j.get('total_cost') or 0.0, 6),
        },
        'top_cost_agents': [
            {
                'agent_name': row['agent_name'],
                'total_cost': round(row['total_cost'] or 0.0, 6),
                'run_count': row['run_count'],
            }
            for row in top_agents
        ],
        'error_trend': [
            {
                'day': row['day'],
                'total': row['total'],
                'errors': row['errors'],
                'error_rate': round(row['errors'] / row['total'], 4) if row['total'] else 0.0,
            }
            for row in error_trend
        ],
    })


@metrics_bp.route('/agents')
@handle_api_errors
def get_agent_metrics():
    """Per-agent performance breakdown."""
    days = _days_param()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime('%Y-%m-%d %H:%M:%S')

    with pooled_session() as conn:
        rows = conn.execute(
            """
            SELECT
                agent_name,
                COUNT(*) AS total_runs,
                SUM(CASE WHEN status IN ('success', 'completed') THEN 1 ELSE 0 END) AS success_runs,
                SUM(CASE WHEN status IN ('error', 'failed') THEN 1 ELSE 0 END) AS error_runs,
                AVG(CASE WHEN status IN ('success', 'completed') THEN duration_ms END) AS avg_duration_ms,
                MAX(duration_ms) AS max_duration_ms,
                MIN(CASE WHEN status IN ('success', 'completed') THEN duration_ms END) AS min_duration_ms,
                SUM(estimated_cost) AS total_cost,
                AVG(estimated_cost) AS avg_cost_per_run,
                SUM(tokens_input) AS total_tokens_input,
                SUM(tokens_output) AS total_tokens_output,
                MAX(started_at) AS last_run_at
            FROM agent_runs
            WHERE started_at >= ?
            GROUP BY agent_name
            ORDER BY total_cost DESC
            """,
            (cutoff,),
        ).fetchall()

    return jsonify({
        'period_days': days,
        'agents': [
            {
                'agent_name': row['agent_name'],
                'total_runs': row['total_runs'],
                'success_runs': row['success_runs'] or 0,
                'error_runs': row['error_runs'] or 0,
                'success_rate': round(
                    (row['success_runs'] or 0) / row['total_runs'], 4
                ) if row['total_runs'] else 0.0,
                'avg_duration_ms': round(row['avg_duration_ms'] or 0),
                'max_duration_ms': row['max_duration_ms'] or 0,
                'min_duration_ms': row['min_duration_ms'] or 0,
                'total_cost': round(row['total_cost'] or 0.0, 6),
                'avg_cost_per_run': round(row['avg_cost_per_run'] or 0.0, 6),
                'total_tokens_input': row['total_tokens_input'] or 0,
                'total_tokens_output': row['total_tokens_output'] or 0,
                'last_run_at': row['last_run_at'],
            }
            for row in rows
        ],
    })


@metrics_bp.route('/system')
@handle_api_errors
def get_system_metrics():
    """System health snapshots and per-endpoint API latency aggregates."""
    days = _days_param(default=7)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime('%Y-%m-%d %H:%M:%S')
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime('%Y-%m-%d')

    with pooled_session() as conn:
        snapshot_rows = conn.execute(
            """
            SELECT cpu_pct, mem_pct, db_pool_active, db_pool_idle, recorded_at
            FROM perf_snapshots
            WHERE recorded_at >= ?
            ORDER BY recorded_at ASC
            """,
            (cutoff,),
        ).fetchall()

        endpoint_rows = conn.execute(
            """
            SELECT
                endpoint,
                method,
                status_class,
                SUM(call_count) AS call_count,
                AVG(p95_ms)     AS p95_ms,
                AVG(avg_ms)     AS avg_ms,
                MAX(log_date)   AS last_seen
            FROM api_request_log
            WHERE log_date >= ?
            GROUP BY endpoint, method, status_class
            ORDER BY call_count DESC
            LIMIT 50
            """,
            (cutoff_date,),
        ).fetchall()

    return jsonify({
        'period_days': days,
        'snapshots': [
            {
                'recorded_at': row['recorded_at'],
                'cpu_pct': round(row['cpu_pct'], 2),
                'mem_pct': round(row['mem_pct'], 2),
                'db_pool_active': row['db_pool_active'],
                'db_pool_idle': row['db_pool_idle'],
            }
            for row in snapshot_rows
        ],
        'endpoints': [
            {
                'endpoint': row['endpoint'],
                'method': row['method'],
                'status_class': row['status_class'],
                'call_count': row['call_count'] or 0,
                'p95_ms': round(row['p95_ms'] or 0.0, 2),
                'avg_ms': round(row['avg_ms'] or 0.0, 2),
                'last_seen': row['last_seen'],
            }
            for row in endpoint_rows
        ],
    })


@metrics_bp.route('/timeseries')
@handle_api_errors
def get_timeseries():
    """Daily time-series data for cost, run count, avg duration, token usage, or error rate."""
    days = _days_param()
    metric = request.args.get('metric', 'cost')
    if metric not in ('cost', 'runs', 'duration', 'tokens', 'error_rate'):
        raise ValidationError(
            'metric must be one of: cost, runs, duration, tokens, error_rate',
            error_code='INVALID_INPUT',
        )

    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime('%Y-%m-%d')

    with pooled_session() as conn:
        if metric == 'cost':
            rows = conn.execute(
                """
                SELECT date(started_at) AS day, agent_name, SUM(estimated_cost) AS value
                FROM agent_runs
                WHERE date(started_at) >= ?
                GROUP BY day, agent_name
                ORDER BY day
                """,
                (cutoff_date,),
            ).fetchall()
        elif metric == 'runs':
            rows = conn.execute(
                """
                SELECT date(started_at) AS day, agent_name, COUNT(*) AS value
                FROM agent_runs
                WHERE date(started_at) >= ?
                GROUP BY day, agent_name
                ORDER BY day
                """,
                (cutoff_date,),
            ).fetchall()
        elif metric == 'duration':
            # Fetch individual rows so we can compute p95 in Python.
            # SQLite has no native percentile function.
            raw = conn.execute(
                """
                SELECT date(started_at) AS day, agent_name, duration_ms
                FROM agent_runs
                WHERE date(started_at) >= ?
                  AND status IN ('success', 'completed')
                  AND duration_ms IS NOT NULL
                ORDER BY day, agent_name, duration_ms
                """,
                (cutoff_date,),
            ).fetchall()

            groups: dict[tuple[str, str], list[float]] = defaultdict(list)
            for r in raw:
                groups[(r['day'], r['agent_name'])].append(float(r['duration_ms']))

            duration_data = []
            for (day, agent_name), durations in sorted(groups.items()):
                avg_val = sum(durations) / len(durations)
                p95_idx = max(0, math.ceil(0.95 * len(durations)) - 1)
                duration_data.append({
                    'day': day,
                    'agent_name': agent_name,
                    'value': round(avg_val, 2),
                    'p95_duration_ms': round(durations[p95_idx]),
                })

            return jsonify({
                'metric': metric,
                'period_days': days,
                'data': duration_data,
            })
        elif metric == 'error_rate':
            # Query api_request_log for daily error rates per endpoint
            rows = conn.execute(
                """
                SELECT
                    log_date AS day,
                    endpoint,
                    SUM(CASE WHEN status_class IN ('4xx', '5xx') THEN call_count ELSE 0 END) AS errors,
                    SUM(call_count) AS total
                FROM api_request_log
                WHERE log_date >= ?
                GROUP BY log_date, endpoint
                ORDER BY log_date
                """,
                (cutoff_date,),
            ).fetchall()

            return jsonify({
                'metric': metric,
                'period_days': days,
                'data': [
                    {
                        'day': row['day'],
                        'agent_name': row['endpoint'],  # reuse field name for chart compat
                        'value': round(
                            (row['errors'] / row['total']) if row['total'] else 0.0, 4
                        ),
                    }
                    for row in rows
                ],
            })

        else:  # tokens
            rows = conn.execute(
                """
                SELECT date(started_at) AS day, agent_name,
                       SUM(tokens_input + tokens_output) AS value
                FROM agent_runs
                WHERE date(started_at) >= ?
                GROUP BY day, agent_name
                ORDER BY day
                """,
                (cutoff_date,),
            ).fetchall()

    return jsonify({
        'metric': metric,
        'period_days': days,
        'data': [
            {
                'day': row['day'],
                'agent_name': row['agent_name'],
                'value': round(row['value'] or 0.0, 6),
            }
            for row in rows
        ],
    })


@metrics_bp.route('/jobs')
@handle_api_errors
def get_job_metrics():
    """Scheduled job execution performance."""
    days = _days_param()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime('%Y-%m-%d %H:%M:%S')

    with pooled_session() as conn:
        rows = conn.execute(
            """
            SELECT
                job_id,
                job_name,
                COUNT(*) AS total_executions,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_executions,
                AVG(CASE WHEN status = 'success' THEN duration_ms END) AS avg_duration_ms,
                MAX(duration_ms) AS max_duration_ms,
                SUM(cost) AS total_cost,
                MAX(executed_at) AS last_executed_at
            FROM job_history
            WHERE executed_at >= ?
            GROUP BY job_id, job_name
            ORDER BY total_executions DESC
            """,
            (cutoff,),
        ).fetchall()

    return jsonify({
        'period_days': days,
        'jobs': [
            {
                'job_id': row['job_id'],
                'job_name': row['job_name'],
                'total_executions': row['total_executions'],
                'success_executions': row['success_executions'] or 0,
                'success_rate': round(
                    (row['success_executions'] or 0) / row['total_executions'], 4
                ) if row['total_executions'] else 0.0,
                'avg_duration_ms': round(row['avg_duration_ms'] or 0),
                'max_duration_ms': row['max_duration_ms'] or 0,
                'total_cost': round(row['total_cost'] or 0.0, 6),
                'last_executed_at': row['last_executed_at'],
            }
            for row in rows
        ],
    })
```