"""
Shared helpers for all scheduled jobs.
Provides consistent logging, timing, DB persistence, and SSE notification.
"""
import json
import logging
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.config import Config
from backend.database import pooled_session

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory job history buffer
# ---------------------------------------------------------------------------
# save_job_history() appends records here; flush_buffered_job_history() drains
# them in a single batch INSERT every time the metrics_snapshot job fires.
# This cuts per-job-run connection churn to zero while preserving all history.

_JOB_HISTORY_BUFFER: List[Dict[str, Any]] = []
_BUFFER_LOCK = threading.Lock()


def _get_agent_registry():
    """Lazily import and return the AgentRegistry singleton.

    This avoids circular imports -- jobs are registered at module level but
    the agent registry may not yet be fully populated.
    """
    from backend.agents.base import AgentRegistry
    return AgentRegistry(db_path=Config.DB_PATH)


def _send_sse(event_type: str, data: dict) -> None:
    """Send an SSE event, handling import errors gracefully."""
    try:
        from backend.app import send_sse_event
        send_sse_event(event_type, data)
    except Exception as exc:
        logger.debug("SSE send failed (may be normal during testing): %s", exc)


def _get_watchlist() -> list:
    """Return the list of active stock tickers from the database."""
    try:
        with pooled_session() as conn:
            rows = conn.execute(
                "SELECT ticker, name, market FROM stocks WHERE active = 1"
            ).fetchall()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("Failed to load watchlist: %s", exc)
        return []


def save_job_history(job_id: str, job_name: str, status: str,
                     result_summary: str, agent_name: Optional[str],
                     duration_ms: int, cost: float = 0.0) -> None:
    """Buffer a job execution record for batch insertion.

    Records are held in memory and flushed to the database by
    ``flush_buffered_job_history()``, which is called on a schedule from the
    metrics_snapshot job.  This eliminates per-job-run connection churn.
    """
    record: Dict[str, Any] = {
        'job_id': job_id,
        'job_name': job_name,
        'status': status,
        'result_summary': (result_summary or '')[:5000],
        'agent_name': agent_name,
        'duration_ms': duration_ms,
        'cost': cost,
        'executed_at': datetime.utcnow().isoformat(),
    }
    with _BUFFER_LOCK:
        _JOB_HISTORY_BUFFER.append(record)


def get_job_history(job_id: Optional[str] = None, limit: int = 50) -> list:
    """Retrieve recent job execution history from the database.

    Raises
    ------
    DatabaseError
        When the underlying DB query fails.  Callers in API request context
        are expected to let this propagate to ``@handle_api_errors``.
    """
    try:
        with pooled_session() as conn:
            if job_id:
                rows = conn.execute(
                    "SELECT * FROM job_history WHERE job_id = ? ORDER BY executed_at DESC LIMIT ?",
                    (job_id, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM job_history ORDER BY executed_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("Failed to get job_history: %s", exc)
        from backend.core.error_handlers import DatabaseError
        raise DatabaseError("Failed to retrieve job history.") from exc


def flush_job_history_buffer(records: List[Dict[str, Any]]) -> None:
    """Batch-insert multiple job history records using a single pooled connection.

    Acquires exactly one connection for N records instead of one per record,
    avoiding per-record connection churn when flushing accumulated buffers.

    Parameters
    ----------
    records:
        Sequence of dicts with keys matching ``job_history`` columns:
        ``job_id``, ``job_name``, ``status``, ``result_summary``,
        ``agent_name``, ``duration_ms``, ``cost``, ``executed_at``.
        Missing optional keys default to sensible values.
    """
    if not records:
        return
    rows = [
        (
            r['job_id'],
            r['job_name'],
            r['status'],
            (r.get('result_summary') or '')[:5000],
            r.get('agent_name'),
            r['duration_ms'],
            r.get('cost', 0.0),
            r.get('executed_at', datetime.utcnow().isoformat()),
        )
        for r in records
    ]
    try:
        with pooled_session() as conn:
            conn.executemany(
                """INSERT INTO job_history
                   (job_id, job_name, status, result_summary, agent_name,
                    duration_ms, cost, executed_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                rows,
            )
    except Exception as exc:
        logger.error(
            "Failed to flush job_history buffer (%d records): %s", len(records), exc
        )


def flush_buffered_job_history() -> int:
    """Drain the in-memory buffer and batch-insert all pending records.

    Intended to be called on a schedule (e.g. from the metrics_snapshot job)
    rather than after every individual job run.  Thread-safe: the buffer is
    swapped out under the lock so new records can accumulate immediately while
    the batch INSERT is in progress.

    Returns the number of records flushed.
    """
    with _BUFFER_LOCK:
        if not _JOB_HISTORY_BUFFER:
            return 0
        records = _JOB_HISTORY_BUFFER.copy()
        _JOB_HISTORY_BUFFER.clear()

    flush_job_history_buffer(records)
    logger.debug("flush_buffered_job_history: wrote %d record(s) to DB", len(records))
    return len(records)


def save_performance_metrics(
    source: str,
    source_id: str,
    metrics: List[Tuple[str, Any]],
    tags: Optional[Dict[str, Any]] = None,
) -> None:
    """Batch-insert performance metrics into the performance_metrics table.

    Parameters
    ----------
    source:    Category of emitter — ``'job'`` or ``'api'``.
    source_id: Job ID or endpoint path identifying the specific emitter.
    metrics:   Sequence of ``(metric_name, metric_value)`` pairs.
    tags:      Optional dict of metadata stored as JSON (e.g. status, agent_name).
               ``None`` is stored as NULL.
    """
    tags_json = json.dumps(tags) if tags is not None else None
    now_iso = datetime.now(timezone.utc).isoformat()
    rows = [
        (source, source_id, name, float(value), tags_json, now_iso)
        for name, value in metrics
    ]
    try:
        with pooled_session() as conn:
            conn.executemany(
                "INSERT INTO performance_metrics "
                "(source, source_id, metric_name, metric_value, tags, recorded_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                rows,
            )
    except Exception as exc:
        logger.error("Failed to save performance_metrics for %s/%s: %s", source, source_id, exc)


@contextmanager
def job_timer(job_id: str, job_name: str):
    """Context manager that times a job, logs results, saves history, and sends SSE.

    Usage::

        with job_timer('morning_briefing', 'Morning Briefing') as ctx:
            ctx['agent_name'] = 'scanner'
            # ... do work ...
            ctx['result_summary'] = 'Scanned 25 stocks, 3 alerts'
            ctx['cost'] = 0.02

    If the body raises, status is set to ``'error'`` automatically.
    """
    ctx: Dict[str, Any] = {
        'result_summary': '',
        'agent_name': None,
        'cost': 0.0,
        'status': 'success',
    }
    start = time.time()
    logger.info("[JOB START] %s (%s)", job_id, job_name)

    try:
        yield ctx
    except Exception as exc:
        ctx['status'] = 'error'
        ctx['result_summary'] = f'Error: {exc}'
        logger.error("[JOB ERROR] %s: %s", job_id, exc, exc_info=True)
    finally:
        duration_ms = int((time.time() - start) * 1000)
        save_job_history(
            job_id=job_id,
            job_name=job_name,
            status=ctx['status'],
            result_summary=ctx['result_summary'],
            agent_name=ctx['agent_name'],
            duration_ms=duration_ms,
            cost=ctx['cost'],
        )
        save_performance_metrics(
            source='job',
            source_id=job_id,
            metrics=[
                ('duration_ms', duration_ms),
                ('cost_usd', ctx['cost']),
                ('success', 1.0 if ctx['status'] == 'success' else 0.0),
            ],
            tags={
                'job_name': job_name,
                'status': ctx['status'],
                'agent_name': ctx['agent_name'],
            },
        )
        logger.info("[JOB END] %s -- status=%s, duration=%dms",
                     job_id, ctx['status'], duration_ms)

        # Notify connected UIs via SSE
        _send_sse('job_completed', {
            'job_id': job_id,
            'job_name': job_name,
            'status': ctx['status'],
            'result_summary': ctx['result_summary'],
            'duration_ms': duration_ms,
            'completed_at': datetime.utcnow().isoformat() + 'Z',
        })
