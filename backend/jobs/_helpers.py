"""
Shared helpers for all scheduled jobs.
Provides consistent logging, timing, DB persistence, and SSE notification.
"""
import json
import logging
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Dict, Optional

from backend.config import Config

logger = logging.getLogger(__name__)


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
        conn = sqlite3.connect(Config.DB_PATH)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT ticker, name, market FROM stocks WHERE active = 1"
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("Failed to load watchlist: %s", exc)
        return []


def save_job_history(job_id: str, job_name: str, status: str,
                     result_summary: str, agent_name: Optional[str],
                     duration_ms: int, cost: float = 0.0) -> None:
    """Persist a job execution record to the job_history table."""
    try:
        conn = sqlite3.connect(Config.DB_PATH)
        conn.execute(
            """INSERT INTO job_history
               (job_id, job_name, status, result_summary, agent_name,
                duration_ms, cost, executed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                job_id,
                job_name,
                status,
                (result_summary or '')[:5000],  # cap length
                agent_name,
                duration_ms,
                cost,
                datetime.utcnow().isoformat(),
            ),
        )
        conn.commit()
        conn.close()
    except Exception as exc:
        logger.error("Failed to save job_history for %s: %s", job_id, exc)


def get_job_history(job_id: Optional[str] = None, limit: int = 50) -> list:
    """Retrieve recent job execution history from the database."""
    try:
        conn = sqlite3.connect(Config.DB_PATH)
        conn.row_factory = sqlite3.Row
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
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("Failed to get job_history: %s", exc)
        return []


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
