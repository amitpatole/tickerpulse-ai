"""
TickerPulse AI v3.0 - Performance Metrics Snapshot Job

Runs every 5 minutes to:
  1. Capture a system health snapshot (CPU %, memory %, DB pool utilisation).
  2. Flush the in-memory API latency buffer to api_request_log.
  3. Prune perf_snapshots rows older than 90 days.
  4. Prune ui_state rows not updated in the last 90 days.
"""

import logging
from datetime import datetime, timezone

from backend.database import get_pool, pooled_session
from backend.jobs._helpers import flush_buffered_job_history, job_timer

logger = logging.getLogger(__name__)

JOB_ID = 'metrics_snapshot'
JOB_NAME = 'Metrics Snapshot'


def _get_system_stats() -> tuple:
    """Return (cpu_pct, mem_pct); falls back to (0.0, 0.0) if psutil is absent."""
    try:
        import psutil  # type: ignore[import]
        cpu = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory().percent
        return cpu, mem
    except ImportError:
        logger.debug("psutil not installed; CPU/memory stats unavailable")
        return 0.0, 0.0


def run_metrics_snapshot() -> None:
    """Capture system metrics and flush API latency data to the database."""
    with job_timer(JOB_ID, JOB_NAME) as ctx:
        # Flush buffered job history before acquiring a pool connection so that
        # the batch INSERT uses the same connection slot we're about to hold.
        flushed = flush_buffered_job_history()
        if flushed:
            logger.debug("metrics_snapshot: flushed %d job history record(s)", flushed)

        now_iso = datetime.now(timezone.utc).isoformat()

        cpu_pct, mem_pct = _get_system_stats()

        pool_stats = get_pool().stats()
        db_pool_active = pool_stats['in_use']
        db_pool_idle = pool_stats['available']

        if pool_stats['in_use'] >= pool_stats['size']:
            logger.warning(
                "DB pool saturated: all %d connections in use. "
                "Consider increasing DB_POOL_SIZE (currently %d).",
                pool_stats['size'],
                pool_stats['size'],
            )

        # Flush in-memory latency buffer → api_request_log
        try:
            from backend.core.latency_buffer import flush as flush_latencies
            latency_rows = flush_latencies()
        except Exception as exc:
            logger.debug("latency_buffer flush skipped: %s", exc)
            latency_rows = []

        with pooled_session() as conn:
            # Write system health snapshot
            conn.execute(
                """
                INSERT INTO perf_snapshots
                    (cpu_pct, mem_pct, db_pool_in_use, db_pool_idle, recorded_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (cpu_pct, mem_pct, db_pool_active, db_pool_idle, now_iso),
            )

            # Flush API latency aggregates — accumulate counts across 5-min intervals
            for row in latency_rows:
                conn.execute(
                    """
                    INSERT INTO api_request_log
                        (endpoint, method, status_class, call_count, p95_ms, avg_ms, log_date)
                    VALUES (:endpoint, :method, :status_class, :call_count, :p95_ms, :avg_ms, :log_date)
                    ON CONFLICT(endpoint, method, status_class, log_date) DO UPDATE SET
                        call_count = api_request_log.call_count + excluded.call_count,
                        p95_ms     = excluded.p95_ms,
                        avg_ms     = excluded.avg_ms
                    """,
                    row,
                )

            # Prune snapshots older than 90 days
            conn.execute(
                "DELETE FROM perf_snapshots WHERE recorded_at < datetime('now', '-90 days')"
            )

            # Prune api_request_log: 30-day window + hard cap at 10 000 rows
            conn.execute(
                "DELETE FROM api_request_log WHERE log_date < date('now', '-30 days')"
            )
            conn.execute(
                """
                DELETE FROM api_request_log WHERE id IN (
                    SELECT id FROM api_request_log
                    ORDER BY log_date DESC, id DESC
                    LIMIT -1 OFFSET 10000
                )
                """
            )

            # Prune stale ui_state entries not updated in the last 90 days
            conn.execute(
                "DELETE FROM ui_state WHERE updated_at < datetime('now', '-90 days')"
            )

        ctx['result_summary'] = (
            f"cpu={cpu_pct:.1f}%, mem={mem_pct:.1f}%, "
            f"pool_active={db_pool_active}/{db_pool_active + db_pool_idle}, "
            f"api_log_rows={len(latency_rows)}"
        )