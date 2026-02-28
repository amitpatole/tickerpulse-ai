"""
TickerPulse AI v3.0 - Database Connection Manager
Thread-safe SQLite helper with context-manager support and table initialisation.
"""

import sqlite3
import logging
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.config import Config

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Connection configuration helper
# ---------------------------------------------------------------------------

def _configure_connection(conn: sqlite3.Connection) -> sqlite3.Connection:
    """Apply standard PRAGMA settings to a SQLite connection.

    Called by both ``ConnectionPool._make_conn()`` and ``get_db_connection()``
    to ensure every connection in the application has consistent settings.

    Returns *conn* for convenient chaining.
    """
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute(f"PRAGMA busy_timeout={Config.DB_BUSY_TIMEOUT_MS}")
    conn.execute(f"PRAGMA cache_size={-Config.DB_CACHE_SIZE_KB}")
    return conn


# ---------------------------------------------------------------------------
# Connection pool
# ---------------------------------------------------------------------------

_pool: Optional["ConnectionPool"] = None
_pool_lock = threading.Lock()


class ConnectionPool:
    """Thread-safe pool of persistent SQLite connections.

    Connections are pre-created at initialisation and recycled across requests.
    Callers acquire a connection via ``acquire()``; if none is available the
    call blocks until one is returned or the timeout expires.
    """

    def __init__(self, db_path: str, size: int = 5, timeout: float = 10.0) -> None:
        self._db_path = db_path
        self._size = size
        self._timeout = timeout
        self._available: list = []
        self._in_use: int = 0
        self._lock = threading.Lock()
        self._condition = threading.Condition(self._lock)
        for _ in range(size):
            self._available.append(self._make_conn())

    def _make_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        return _configure_connection(conn)

    @contextmanager
    def acquire(self):
        """Yield a connection from the pool, blocking until one is available.

        Raises RuntimeError when no connection is available within *timeout* seconds.
        """
        start = time.monotonic()
        with self._condition:
            while not self._available:
                remaining = self._timeout - (time.monotonic() - start)
                if remaining <= 0:
                    raise RuntimeError(
                        f"DB pool exhausted: all {self._size} connections are in use"
                    )
                self._condition.wait(timeout=remaining)
            conn = self._available.pop()
            self._in_use += 1
        try:
            yield conn
        finally:
            with self._condition:
                self._available.append(conn)
                self._in_use -= 1
                self._condition.notify()

    def stats(self) -> Dict[str, Any]:
        """Return a snapshot of current pool utilisation.

        Returns ``{size, available, in_use, timeout_s}``.  Thread-safe.
        """
        with self._lock:
            available = len(self._available)
            in_use = self._in_use
        return {
            "size": self._size,
            "available": available,
            "in_use": in_use,
            "timeout_s": self._timeout,
        }

    def close_all(self) -> None:
        """Close every idle connection. Call once at process shutdown.

        In-flight connections (currently acquired) are left open; the OS will
        reclaim them when the process exits.  Safe to call multiple times.
        """
        with self._condition:
            closed = 0
            while self._available:
                conn = self._available.pop()
                try:
                    conn.close()
                    closed += 1
                except Exception as exc:
                    logger.debug("ConnectionPool.close_all: error closing connection: %s", exc)
            self._condition.notify_all()
        logger.info("ConnectionPool.close_all: closed %d connection(s)", closed)


def _get_pool() -> "ConnectionPool":
    """Return the process-wide ConnectionPool, creating it on first call."""
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = ConnectionPool(
                    db_path=Config.DB_PATH,
                    size=Config.DB_POOL_SIZE,
                    timeout=Config.DB_POOL_TIMEOUT,
                )
                logger.info(
                    "DB connection pool initialised: size=%d path=%s",
                    Config.DB_POOL_SIZE,
                    Config.DB_PATH,
                )
    return _pool


def get_pool() -> "ConnectionPool":
    """Public alias for the process-wide ConnectionPool.

    Use this from application startup code to pre-warm the pool and to obtain
    a handle for teardown (``get_pool().close_all()``).
    """
    return _get_pool()


# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------

def get_db_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Return a new SQLite connection with Row factory enabled.

    Deprecated: prefer ``pooled_session()`` or ``db_session()`` for automatic
    resource management.  Preserved for legacy callers.
    """
    path = db_path or Config.DB_PATH
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def pooled_session():
    """Acquire a pooled connection, auto-commit on success, rollback on error.

    Preferred entry point for all new database access.

    Usage::

        with pooled_session() as conn:
            conn.execute("UPDATE stocks SET active = 1 WHERE ticker = ?", (ticker,))
    """
    with _get_pool().acquire() as conn:
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


@contextmanager
def db_session(db_path: Optional[str] = None, immediate: bool = False):
    """Open a connection, auto-commit/rollback, and close.

    When *db_path* is ``None`` a pooled connection is used (preferred).
    When *db_path* is provided a dedicated connection is opened to that path
    and closed on exit (legacy path for ``ai_analytics.py``).

    *immediate=True* issues ``BEGIN IMMEDIATE`` before yielding, acquiring a
    write-lock upfront to prevent TOCTOU races in concurrent writes.
    """
    if db_path is not None:
        conn = get_db_connection(db_path)
        if immediate:
            conn.execute("BEGIN IMMEDIATE")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    else:
        with _get_pool().acquire() as conn:
            if immediate:
                conn.execute("BEGIN IMMEDIATE")
            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise


# ---------------------------------------------------------------------------
# Batch write helpers
# ---------------------------------------------------------------------------


def batch_insert(
    conn: sqlite3.Connection,
    table: str,
    rows: List[Dict[str, Any]],
    on_conflict: str = "IGNORE",
) -> int:
    """Insert multiple rows with a single ``executemany`` call.

    Parameters
    ----------
    conn:        Open connection from ``pooled_session`` / ``db_session``.
    table:       Target table name (use only trusted, static names).
    rows:        List of dicts; all dicts must have identical keys.
    on_conflict: ``'IGNORE'``, ``'REPLACE'``, or ``'ABORT'`` (default ``'IGNORE'``).

    Returns the cursor ``rowcount``.
    """
    if not rows:
        return 0
    cols = list(rows[0].keys())
    placeholders = ", ".join("?" * len(cols))
    sql = (
        f"INSERT OR {on_conflict.upper()} INTO {table} "
        f"({', '.join(cols)}) VALUES ({placeholders})"
    )
    params = [tuple(r[c] for c in cols) for r in rows]
    cursor = conn.executemany(sql, params)
    return cursor.rowcount


def batch_upsert(
    conn: sqlite3.Connection,
    table: str,
    rows: List[Dict[str, Any]],
    conflict_cols: List[str],
    update_cols: Optional[List[str]] = None,
) -> int:
    """Upsert multiple rows with a single ``executemany`` call.

    Generates ``INSERT … ON CONFLICT (conflict_cols) DO UPDATE SET …``.
    When *update_cols* is ``None``, all non-conflict columns are updated.

    Returns the cursor ``rowcount``.
    """
    if not rows:
        return 0
    all_cols = list(rows[0].keys())
    effective_update = update_cols or [c for c in all_cols if c not in conflict_cols]
    placeholders = ", ".join("?" * len(all_cols))
    conflict_str = ", ".join(conflict_cols)
    update_str = ", ".join(f"{c} = excluded.{c}" for c in effective_update)
    sql = (
        f"INSERT INTO {table} ({', '.join(all_cols)}) "
        f"VALUES ({placeholders}) "
        f"ON CONFLICT ({conflict_str}) DO UPDATE SET {update_str}"
    )
    params = [tuple(r[c] for c in all_cols) for r in rows]
    cursor = conn.executemany(sql, params)
    return cursor.rowcount


def batch_upsert_ai_ratings(
    conn: sqlite3.Connection,
    ratings: List[Dict[str, Any]],
) -> int:
    """Upsert AI rating rows into ``ai_ratings`` (conflict key: ``ticker``).

    All columns except ``ticker`` are updated on conflict.  Missing fields
    default to ``None``; ``updated_at`` defaults to the current UTC time.
    """
    if not ratings:
        return 0
    columns = [
        "ticker", "rating", "score", "confidence",
        "current_price", "price_change", "price_change_pct",
        "rsi", "sentiment_score", "sentiment_label",
        "technical_score", "fundamental_score",
        "analysis_summary", "updated_at",
    ]
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for r in ratings:
        row = {col: r.get(col) for col in columns}
        if row.get("updated_at") is None:
            row["updated_at"] = now
        rows.append(row)
    update_cols = [c for c in columns if c != "ticker"]
    return batch_upsert(conn, "ai_ratings", rows, ["ticker"], update_cols)


def batch_delete(
    conn: sqlite3.Connection,
    table: str,
    where_col: str,
    values: List[Any],
) -> int:
    """Delete rows where *where_col* matches any value in *values*.

    Parameters
    ----------
    conn:      Open connection from ``pooled_session`` / ``db_session``.
    table:     Target table name (trusted static strings only).
    where_col: Column to match against *values*.
    values:    Sequence of values to delete; empty sequence is a no-op.

    Returns the cursor ``rowcount``.
    """
    if not values:
        return 0
    placeholders = ", ".join("?" * len(values))
    sql = f"DELETE FROM {table} WHERE {where_col} IN ({placeholders})"
    cursor = conn.execute(sql, list(values))
    return cursor.rowcount


def batch_upsert_earnings(
    conn: sqlite3.Connection,
    events: List[Dict[str, Any]],
    fetched_at: Optional[str] = None,
) -> int:
    """Upsert earnings events, preserving existing ``*_actual`` values on NULL.

    Uses ``COALESCE`` so confirmed EPS / revenue actuals are never overwritten
    by a subsequent yfinance fetch that returns NULL for those fields.
    """
    if not events:
        return 0
    now = fetched_at or datetime.now(timezone.utc).isoformat()
    columns = [
        "ticker", "company", "earnings_date", "time_of_day",
        "eps_estimate", "eps_actual", "revenue_estimate", "revenue_actual",
        "fiscal_quarter", "fetched_at", "updated_at",
    ]
    rows = []
    for e in events:
        row = {col: e.get(col) for col in columns}
        row["fetched_at"] = now
        row["updated_at"] = now
        rows.append(row)
    placeholders = ", ".join("?" * len(columns))
    sql = f"""
        INSERT INTO earnings_events ({', '.join(columns)})
        VALUES ({placeholders})
        ON CONFLICT (ticker, earnings_date) DO UPDATE SET
            company          = COALESCE(excluded.company, earnings_events.company),
            time_of_day      = COALESCE(excluded.time_of_day, earnings_events.time_of_day),
            eps_estimate     = COALESCE(excluded.eps_estimate, earnings_events.eps_estimate),
            eps_actual       = COALESCE(excluded.eps_actual, earnings_events.eps_actual),
            revenue_estimate = COALESCE(excluded.revenue_estimate,
                                        earnings_events.revenue_estimate),
            revenue_actual   = COALESCE(excluded.revenue_actual, earnings_events.revenue_actual),
            fiscal_quarter   = COALESCE(excluded.fiscal_quarter, earnings_events.fiscal_quarter),
            fetched_at       = excluded.fetched_at,
            updated_at       = excluded.updated_at
    """
    params = [tuple(r[c] for c in columns) for r in rows]
    cursor = conn.executemany(sql, params)
    return cursor.rowcount


# ---------------------------------------------------------------------------
# Table definitions
# ---------------------------------------------------------------------------

_EXISTING_TABLES_SQL = [
    """
    CREATE TABLE IF NOT EXISTS news (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker          TEXT NOT NULL,
        title           TEXT NOT NULL,
        description     TEXT,
        url             TEXT UNIQUE,
        source          TEXT,
        published_date  TEXT,
        sentiment_score REAL,
        sentiment_label TEXT,
        engagement_score REAL DEFAULT 0,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS alerts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker      TEXT NOT NULL,
        news_id     INTEGER,
        alert_type  TEXT,
        message     TEXT,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (news_id) REFERENCES news (id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS monitor_status (
        id          INTEGER PRIMARY KEY,
        last_check  TIMESTAMP,
        status      TEXT,
        message     TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS stocks (
        ticker   TEXT PRIMARY KEY,
        name     TEXT,
        market   TEXT DEFAULT 'US',
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        active   INTEGER DEFAULT 1
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS ai_providers (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_name TEXT NOT NULL,
        api_key       TEXT NOT NULL,
        model         TEXT,
        is_active     INTEGER DEFAULT 0,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
]

_NEW_TABLES_SQL = [
    """
    CREATE TABLE IF NOT EXISTS agent_runs (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_name      TEXT NOT NULL,
        framework       TEXT NOT NULL DEFAULT 'crewai',
        status          TEXT NOT NULL DEFAULT 'pending',
        input_data      TEXT,
        output_data     TEXT,
        tokens_input    INTEGER DEFAULT 0,
        tokens_output   INTEGER DEFAULT 0,
        estimated_cost  REAL    DEFAULT 0.0,
        duration_ms     INTEGER DEFAULT 0,
        error           TEXT,
        metadata        TEXT,
        started_at      TIMESTAMP,
        completed_at    TIMESTAMP,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS job_history (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id          TEXT NOT NULL,
        job_name        TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending',
        result_summary  TEXT,
        agent_name      TEXT,
        duration_ms     INTEGER DEFAULT 0,
        cost            REAL    DEFAULT 0.0,
        executed_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS data_providers_config (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_name         TEXT NOT NULL UNIQUE,
        api_key               TEXT DEFAULT '',
        is_active             INTEGER DEFAULT 1,
        is_primary            INTEGER DEFAULT 0,
        priority              INTEGER DEFAULT 100,
        rate_limit_remaining  INTEGER DEFAULT -1,
        last_used             TIMESTAMP,
        created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS research_briefs (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker          TEXT NOT NULL,
        title           TEXT NOT NULL,
        content         TEXT NOT NULL,
        agent_name      TEXT NOT NULL DEFAULT 'researcher',
        model_used      TEXT,
        tokens_used     INTEGER DEFAULT 0,
        estimated_cost  REAL    DEFAULT 0.0,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # ai_ratings includes price columns; migration below handles existing DBs
    """
    CREATE TABLE IF NOT EXISTS ai_ratings (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker          TEXT NOT NULL UNIQUE,
        rating          TEXT NOT NULL DEFAULT 'HOLD',
        score           REAL NOT NULL DEFAULT 0,
        confidence      REAL NOT NULL DEFAULT 0,
        current_price   REAL,
        price_change    REAL,
        price_change_pct REAL,
        rsi             REAL,
        sentiment_score REAL,
        sentiment_label TEXT,
        technical_score REAL,
        fundamental_score REAL,
        summary         TEXT,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS cost_tracking (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        date            TEXT NOT NULL,
        agent_name      TEXT,
        provider_name   TEXT,
        model           TEXT,
        tokens_input    INTEGER DEFAULT 0,
        tokens_output   INTEGER DEFAULT 0,
        estimated_cost  REAL    DEFAULT 0.0,
        job_name        TEXT,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS download_stats (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_owner      TEXT NOT NULL,
        repo_name       TEXT NOT NULL,
        total_clones    INTEGER DEFAULT 0,
        unique_clones   INTEGER DEFAULT 0,
        period_start    TIMESTAMP,
        period_end      TIMESTAMP,
        recorded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS download_daily (
        repo_owner      TEXT NOT NULL,
        repo_name       TEXT NOT NULL,
        date            TEXT NOT NULL,
        clones          INTEGER DEFAULT 0,
        unique_clones   INTEGER DEFAULT 0,
        PRIMARY KEY (repo_owner, repo_name, date)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS watchlists (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS watchlist_stocks (
        watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
        ticker       TEXT NOT NULL REFERENCES stocks(ticker),
        sort_order   INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (watchlist_id, ticker)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS price_alerts (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker            TEXT NOT NULL,
        condition_type    TEXT NOT NULL,
        threshold         REAL NOT NULL,
        enabled           INTEGER NOT NULL DEFAULT 1,
        sound_type        TEXT NOT NULL DEFAULT 'default',
        triggered_at      TIMESTAMP,
        notification_sent INTEGER NOT NULL DEFAULT 0,
        fired_at          TEXT DEFAULT NULL,
        fire_count        INTEGER NOT NULL DEFAULT 0,
        created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS sentiment_cache (
        ticker          TEXT PRIMARY KEY,
        score           REAL NOT NULL,
        label           TEXT NOT NULL,
        signal_count    INTEGER NOT NULL,
        sources         TEXT NOT NULL,
        updated_at      TIMESTAMP NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS earnings_events (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker           TEXT NOT NULL,
        company          TEXT,
        earnings_date    TEXT NOT NULL,
        time_of_day      TEXT,
        eps_estimate     REAL,
        eps_actual       REAL,
        revenue_estimate REAL,
        revenue_actual   REAL,
        fiscal_quarter   TEXT,
        fetched_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at       TEXT DEFAULT (datetime('now')),
        UNIQUE(ticker, earnings_date)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS error_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        source     TEXT NOT NULL,
        error_code TEXT,
        message    TEXT NOT NULL,
        stack      TEXT,
        request_id TEXT,
        context    TEXT,
        severity   TEXT NOT NULL DEFAULT 'error',
        session_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS financials_cache (
        ticker         TEXT PRIMARY KEY,
        pe_ratio       REAL,
        eps            REAL,
        market_cap     REAL,
        dividend_yield REAL,
        beta           REAL,
        avg_volume     INTEGER,
        book_value     REAL,
        week_52_high   REAL,
        week_52_low    REAL,
        name           TEXT,
        fetched_at     TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS perf_snapshots (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        cpu_pct          REAL    NOT NULL,
        mem_pct          REAL    NOT NULL,
        db_pool_in_use   INTEGER NOT NULL,
        db_pool_idle     INTEGER NOT NULL,
        recorded_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS api_request_log (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint     TEXT    NOT NULL,
        method       TEXT    NOT NULL,
        status_class TEXT    NOT NULL,
        call_count   INTEGER NOT NULL DEFAULT 0,
        p95_ms       REAL,
        avg_ms       REAL,
        log_date     TEXT    NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS ui_state (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS comparison_runs (
        id         TEXT PRIMARY KEY,
        prompt     TEXT NOT NULL,
        ticker     TEXT,
        status     TEXT NOT NULL DEFAULT 'pending',
        template   TEXT NOT NULL DEFAULT 'custom',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS comparison_results (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id               TEXT NOT NULL REFERENCES comparison_runs(id) ON DELETE CASCADE,
        provider_name        TEXT NOT NULL,
        model                TEXT,
        response             TEXT,
        tokens_used          INTEGER NOT NULL DEFAULT 0,
        latency_ms           INTEGER NOT NULL DEFAULT 0,
        error                TEXT,
        extracted_rating     TEXT,
        extracted_score      REAL,
        extracted_confidence REAL,
        extracted_summary    TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS performance_metrics (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        source       TEXT NOT NULL,
        source_id    TEXT NOT NULL,
        metric_name  TEXT NOT NULL,
        metric_value REAL NOT NULL,
        tags         TEXT,
        recorded_at  TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS agent_schedules (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id       TEXT NOT NULL,
        label        TEXT NOT NULL,
        description  TEXT,
        trigger      TEXT NOT NULL,
        trigger_args TEXT NOT NULL DEFAULT '{}',
        enabled      INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS ai_comparison_runs (
        id         TEXT PRIMARY KEY,
        ticker     TEXT NOT NULL,
        providers  TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        template   TEXT NOT NULL DEFAULT 'custom'
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS ai_comparison_results (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id      TEXT NOT NULL REFERENCES ai_comparison_runs(id) ON DELETE CASCADE,
        provider    TEXT NOT NULL,
        model       TEXT,
        rating      TEXT,
        score       INTEGER,
        confidence  INTEGER,
        summary     TEXT,
        duration_ms INTEGER,
        error       TEXT,
        tokens_used INTEGER
    )
    """,
]

_INDEXES_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_agent_runs_status      ON agent_runs (status)",
    "CREATE INDEX IF NOT EXISTS idx_agent_runs_agent       ON agent_runs (agent_name)",
    "CREATE INDEX IF NOT EXISTS idx_agent_runs_started     ON agent_runs (started_at)",
    "CREATE INDEX IF NOT EXISTS idx_job_history_job_id     ON job_history (job_id)",
    "CREATE INDEX IF NOT EXISTS idx_job_history_executed   ON job_history (executed_at)",
    "CREATE INDEX IF NOT EXISTS idx_job_history_job_id_executed ON job_history (job_id, executed_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_cost_tracking_date     ON cost_tracking (date)",
    "CREATE INDEX IF NOT EXISTS idx_cost_tracking_agent    ON cost_tracking (agent_name)",
    "CREATE INDEX IF NOT EXISTS idx_ai_ratings_ticker       ON ai_ratings (ticker)",
    "CREATE INDEX IF NOT EXISTS idx_news_ticker            ON news (ticker)",
    "CREATE INDEX IF NOT EXISTS idx_news_created           ON news (created_at)",
    "CREATE INDEX IF NOT EXISTS idx_alerts_created         ON alerts (created_at)",
    "CREATE INDEX IF NOT EXISTS idx_download_stats_repo    ON download_stats (repo_owner, repo_name)",
    "CREATE INDEX IF NOT EXISTS idx_download_stats_date    ON download_stats (recorded_at)",
    "CREATE INDEX IF NOT EXISTS idx_download_daily_date    ON download_daily (date)",
    "CREATE INDEX IF NOT EXISTS idx_watchlist_stocks_wl    ON watchlist_stocks (watchlist_id)",
    "CREATE INDEX IF NOT EXISTS idx_watchlist_stocks_tk    ON watchlist_stocks (ticker)",
    "CREATE INDEX IF NOT EXISTS idx_watchlists_sort_order  ON watchlists (sort_order)",
    "CREATE INDEX IF NOT EXISTS idx_price_alerts_enabled   ON price_alerts (enabled, ticker)",
    "CREATE INDEX IF NOT EXISTS idx_sentiment_ticker       ON sentiment_cache (ticker)",
    "CREATE INDEX IF NOT EXISTS idx_earnings_date          ON earnings_events (earnings_date)",
    "CREATE INDEX IF NOT EXISTS idx_earnings_ticker        ON earnings_events (ticker)",
    "CREATE INDEX IF NOT EXISTS idx_error_log_created      ON error_log (created_at)",
    "CREATE INDEX IF NOT EXISTS idx_error_log_code         ON error_log (error_code)",
    "CREATE INDEX IF NOT EXISTS idx_error_log_source       ON error_log (source)",
    "CREATE INDEX IF NOT EXISTS idx_error_log_session      ON error_log (session_id)",
    "CREATE INDEX IF NOT EXISTS idx_ai_ratings_ticker_updated ON ai_ratings (ticker, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_financials_cache_fetched   ON financials_cache (fetched_at)",
    "CREATE INDEX IF NOT EXISTS idx_perf_snapshots_recorded_at ON perf_snapshots (recorded_at)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_api_log_endpoint_date ON api_request_log (endpoint, method, status_class, log_date)",
    "CREATE INDEX IF NOT EXISTS idx_ui_state_updated ON ui_state (updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_comparison_runs_created    ON comparison_runs (created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_comparison_results_run_id  ON comparison_results (run_id)",
    # Hot-path indexes added in v3.1
    "CREATE INDEX IF NOT EXISTS idx_agent_runs_started_at      ON agent_runs (started_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_earnings_events_date_ticker ON earnings_events (earnings_date, ticker)",
    "CREATE INDEX IF NOT EXISTS idx_api_request_log_ts          ON api_request_log (log_date DESC)",
    "CREATE INDEX IF NOT EXISTS idx_error_log_ts                ON error_log (created_at DESC)",
    # Composite indexes for hot-path reads added in v3.2
    "CREATE INDEX IF NOT EXISTS idx_news_ticker_created         ON news (ticker, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_agent_runs_name_started     ON agent_runs (agent_name, started_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_perf_metrics_source         ON performance_metrics (source, source_id, recorded_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_agent_schedules_job_id      ON agent_schedules (job_id)",
    "CREATE INDEX IF NOT EXISTS idx_agent_schedules_enabled     ON agent_schedules (enabled)",
    # Covering index for /api/metrics/agents hot path: WHERE started_at >= ? GROUP BY agent_name
    "CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_started    ON agent_runs (agent_name, started_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_ai_comparison_runs_ticker   ON ai_comparison_runs (ticker, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_ai_comparison_runs_created  ON ai_comparison_runs (created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_ai_comparison_results_run   ON ai_comparison_results (run_id)",
    # Composite index for source-filtered performance_metrics queries (v3.3)
    "CREATE INDEX IF NOT EXISTS idx_perf_metrics_source_time    ON performance_metrics (source, recorded_at DESC)",
    # Covering index for /api/metrics/timeseries?metric=duration (v3.4)
    # Eliminates full table scan when fetching (day, agent_name, duration_ms) for
    # p95 computation: status + started_at filter rows, agent_name+duration_ms are
    # read directly from the index leaf pages with no table lookup.
    "CREATE INDEX IF NOT EXISTS idx_agent_runs_duration_cov     ON agent_runs (status, started_at DESC, agent_name, duration_ms)",
    # Covering index for date-range + optional agent_name predicate pushdown (v3.5)
    "CREATE INDEX IF NOT EXISTS idx_agent_runs_date_agent       ON agent_runs (started_at, agent_name)",
]


# ---------------------------------------------------------------------------
# Public initialisation function
# ---------------------------------------------------------------------------

def _migrate_agent_runs(cursor) -> None:
    """Migrate agent_runs from v3.0.0 schema (tokens_used) to v3.0.1 (tokens_input/tokens_output)."""
    cols = {row[1] for row in cursor.execute("PRAGMA table_info(agent_runs)").fetchall()}
    if not cols:
        return

    migrations = []
    if 'tokens_input' not in cols:
        migrations.append("ALTER TABLE agent_runs ADD COLUMN tokens_input INTEGER DEFAULT 0")
    if 'tokens_output' not in cols:
        migrations.append("ALTER TABLE agent_runs ADD COLUMN tokens_output INTEGER DEFAULT 0")
    if 'error' not in cols:
        migrations.append("ALTER TABLE agent_runs ADD COLUMN error TEXT")
    if 'metadata' not in cols:
        migrations.append("ALTER TABLE agent_runs ADD COLUMN metadata TEXT")

    if 'tokens_used' in cols and 'tokens_input' not in cols:
        migrations.append("UPDATE agent_runs SET tokens_input = tokens_used WHERE tokens_used > 0")

    for sql in migrations:
        cursor.execute(sql)
        logger.info(f"Migration applied: {sql}")


def _migrate_news(cursor) -> None:
    """Add engagement_score column to news table if missing."""
    cols = {row[1] for row in cursor.execute("PRAGMA table_info(news)").fetchall()}
    if not cols:
        return
    if 'engagement_score' not in cols:
        cursor.execute("ALTER TABLE news ADD COLUMN engagement_score REAL DEFAULT 0")
        logger.info("Migration applied: added engagement_score to news table")


def _migrate_watchlist_stocks(cursor) -> None:
    """Add position column to watchlist_stocks if missing and initialise positions."""
    cols = {row[1] for row in cursor.execute("PRAGMA table_info(watchlist_stocks)").fetchall()}
    if not cols:
        return
    if 'position' not in cols:
        cursor.execute("ALTER TABLE watchlist_stocks ADD COLUMN position INTEGER NOT NULL DEFAULT 0")
        watchlist_ids = [row[0] for row in cursor.execute("SELECT id FROM watchlists").fetchall()]
        for wl_id in watchlist_ids:
            tickers = [
                row[0] for row in cursor.execute(
                    "SELECT ticker FROM watchlist_stocks WHERE watchlist_id = ? ORDER BY ticker ASC",
                    (wl_id,),
                ).fetchall()
            ]
            for pos, ticker in enumerate(tickers):
                cursor.execute(
                    "UPDATE watchlist_stocks SET position = ? WHERE watchlist_id = ? AND ticker = ?",
                    (pos, wl_id, ticker),
                )
        logger.info("Migration applied: added position column to watchlist_stocks")


def _migrate_data_providers_config(cursor) -> None:
    """Add rate limit tracking columns to data_providers_config if missing."""
    cols = {row[1] for row in cursor.execute("PRAGMA table_info(data_providers_config)").fetchall()}
    if not cols:
        return
    migrations = []
    if 'rate_limit_used' not in cols:
        migrations.append("ALTER TABLE data_providers_config ADD COLUMN rate_limit_used INTEGER DEFAULT 0")
    if 'rate_limit_max' not in cols:
        migrations.append("ALTER TABLE data_providers_config ADD COLUMN rate_limit_max INTEGER DEFAULT -1")
    if 'reset_at' not in cols:
        migrations.append("ALTER TABLE data_providers_config ADD COLUMN reset_at TIMESTAMP")
    for sql in migrations:
        cursor.execute(sql)
        logger.info(f"Migration applied: {sql}")


def _migrate_watchlists(cursor) -> None:
    """Add sort_order column to watchlists table if missing."""
    cols = {row[1] for row in cursor.execute("PRAGMA table_info(watchlists)").fetchall()}
    if not cols:
        return
    if 'sort_order' not in cols:
        cursor.execute(
            "ALTER TABLE watchlists ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"
        )
        logger.info("Migration applied: added sort_order to watchlists table")


def _migrate_price_alerts(cursor) -> None:
    """Add missing columns to price_alerts table."""
    cols = {row[1] for row in cursor.execute("PRAGMA table_info(price_alerts)").fetchall()}
    if not cols:
        return
    if 'notification_sent' not in cols:
        cursor.execute(
            "ALTER TABLE price_alerts ADD COLUMN notification_sent INTEGER NOT NULL DEFAULT 0"
        )
        logger.info("Migration applied: added notification_sent to price_alerts table")
    if 'fired_at' not in cols:
        cursor.execute(
            "ALTER TABLE price_alerts ADD COLUMN fired_at TEXT DEFAULT NULL"
        )
        logger.info("Migration applied: added fired_at to price_alerts table")
    if 'fire_count' not in cols:
        cursor.execute(
            "ALTER TABLE price_alerts ADD COLUMN fire_count INTEGER NOT NULL DEFAULT 0"
        )
        logger.info("Migration applied: added fire_count to price_alerts table")
    if 'sound_type' not in cols:
        cursor.execute(
            "ALTER TABLE price_alerts ADD COLUMN sound_type TEXT NOT NULL DEFAULT 'default'"
        )
        logger.info("Migration applied: added sound_type to price_alerts table")


def _migrate_error_log(cursor) -> None:
    """Add session_id column to error_log if missing (schema v3.1)."""
    cols = {row[1] for row in cursor.execute("PRAGMA table_info(error_log)").fetchall()}
    if not cols:
        return
    if 'session_id' not in cols:
        cursor.execute("ALTER TABLE error_log ADD COLUMN session_id TEXT")
        logger.info("Migration applied: added session_id to error_log table")


def _migrate_earnings_events(cursor) -> None:
    """Add eps_actual, revenue_estimate, revenue_actual, updated_at to earnings_events if missing."""
    cols = {row[1] for row in cursor.execute("PRAGMA table_info(earnings_events)").fetchall()}
    if not cols:
        return
    migrations = []
    if 'eps_actual' not in cols:
        migrations.append("ALTER TABLE earnings_events ADD COLUMN eps_actual REAL")
    if 'revenue_estimate' not in cols:
        migrations.append("ALTER TABLE earnings_events ADD COLUMN revenue_estimate REAL")
    if 'revenue_actual' not in cols:
        migrations.append("ALTER TABLE earnings_events ADD COLUMN revenue_actual REAL")
    if 'updated_at' not in cols:
        migrations.append(
            "ALTER TABLE earnings_events ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))"
        )
    for sql in migrations:
        cursor.execute(sql)
        logger.info(f"Migration applied: {sql}")


def _migrate_ai_ratings_price_columns(cursor) -> None:
    """Add live price columns to ai_ratings if missing.

    These three columns are written by the price_refresh job on every cycle.
    Existing rows keep NULL until the first price refresh runs.
    Score and confidence columns are never touched by this migration.
    """
    cols = {row[1] for row in cursor.execute("PRAGMA table_info(ai_ratings)").fetchall()}
    if not cols:
        return  # table doesn't exist yet; CREATE TABLE will handle it
    migrations = []
    if 'current_price' not in cols:
        migrations.append("ALTER TABLE ai_ratings ADD COLUMN current_price REAL")
    if 'price_change' not in cols:
        migrations.append("ALTER TABLE ai_ratings ADD COLUMN price_change REAL")
    if 'price_change_pct' not in cols:
        migrations.append("ALTER TABLE ai_ratings ADD COLUMN price_change_pct REAL")
    for sql in migrations:
        cursor.execute(sql)
        logger.info(f"Migration applied: {sql}")


def _migrate_comparison_runs(cursor) -> None:
    """Add template column to comparison_runs if missing (schema v3.3)."""
    cols = {row[1] for row in cursor.execute("PRAGMA table_info(comparison_runs)").fetchall()}
    if not cols:
        return
    if 'template' not in cols:
        cursor.execute(
            "ALTER TABLE comparison_runs ADD COLUMN template TEXT NOT NULL DEFAULT 'custom'"
        )
        logger.info("Migration applied: added template to comparison_runs table")


def _migrate_agent_schedules(cursor) -> None:
    """Remove UNIQUE constraint from agent_schedules.job_id (schema v3.5).

    SQLite does not support ALTER TABLE DROP CONSTRAINT, so the table must be
    recreated.  All existing rows are preserved.
    """
    row = cursor.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_schedules'"
    ).fetchone()
    if not row:
        return  # Table doesn't exist yet; CREATE TABLE IF NOT EXISTS handles it

    table_sql: str = row[0] or ''
    if 'UNIQUE' not in table_sql.upper():
        return  # Constraint already removed

    cursor.execute("ALTER TABLE agent_schedules RENAME TO _agent_schedules_old")
    cursor.execute("""
        CREATE TABLE agent_schedules (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id       TEXT NOT NULL,
            label        TEXT NOT NULL,
            description  TEXT,
            trigger      TEXT NOT NULL,
            trigger_args TEXT NOT NULL DEFAULT '{}',
            enabled      INTEGER NOT NULL DEFAULT 1,
            created_at   TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cursor.execute("INSERT INTO agent_schedules SELECT * FROM _agent_schedules_old")
    cursor.execute("DROP TABLE _agent_schedules_old")
    logger.info("Migration applied: removed UNIQUE constraint from agent_schedules.job_id")


def _migrate_comparison_results(cursor) -> None:
    """Add extracted structured-data columns to comparison_results if missing (schema v3.4)."""
    cols = {row[1] for row in cursor.execute("PRAGMA table_info(comparison_results)").fetchall()}
    if not cols:
        return
    migrations = []
    if 'extracted_rating' not in cols:
        migrations.append("ALTER TABLE comparison_results ADD COLUMN extracted_rating TEXT")
    if 'extracted_score' not in cols:
        migrations.append("ALTER TABLE comparison_results ADD COLUMN extracted_score REAL")
    if 'extracted_confidence' not in cols:
        migrations.append("ALTER TABLE comparison_results ADD COLUMN extracted_confidence REAL")
    if 'extracted_summary' not in cols:
        migrations.append("ALTER TABLE comparison_results ADD COLUMN extracted_summary TEXT")
    for sql in migrations:
        cursor.execute(sql)
        logger.info("Migration applied: %s", sql)


def _migrate_ai_comparison_tables(cursor) -> None:
    """Add tokens_used to ai_comparison_results and template to ai_comparison_runs (schema v3.7)."""
    cols_results = {row[1] for row in cursor.execute("PRAGMA table_info(ai_comparison_results)").fetchall()}
    if cols_results and 'tokens_used' not in cols_results:
        cursor.execute("ALTER TABLE ai_comparison_results ADD COLUMN tokens_used INTEGER")
        logger.info("Migration applied: added tokens_used to ai_comparison_results")

    cols_runs = {row[1] for row in cursor.execute("PRAGMA table_info(ai_comparison_runs)").fetchall()}
    if cols_runs and 'template' not in cols_runs:
        cursor.execute(
            "ALTER TABLE ai_comparison_runs ADD COLUMN template TEXT NOT NULL DEFAULT 'custom'"
        )
        logger.info("Migration applied: added template to ai_comparison_runs")


def _migrate_perf_snapshots(cursor) -> None:
    """Rename db_pool_active → db_pool_in_use in perf_snapshots (schema v3.6)."""
    cols = {row[1] for row in cursor.execute("PRAGMA table_info(perf_snapshots)").fetchall()}
    if not cols:
        return  # Table doesn't exist yet; CREATE TABLE handles it
    if 'db_pool_active' in cols and 'db_pool_in_use' not in cols:
        cursor.execute(
            "ALTER TABLE perf_snapshots RENAME COLUMN db_pool_active TO db_pool_in_use"
        )
        logger.info("Migration applied: renamed db_pool_active → db_pool_in_use in perf_snapshots")


def init_all_tables(db_path: str | None = None) -> None:
    """Create every table (existing + new v3.0) and apply indexes.

    Safe to call multiple times -- all statements use
    ``CREATE TABLE IF NOT EXISTS`` / ``CREATE INDEX IF NOT EXISTS``.

    When *db_path* is ``None`` a pooled connection is used (production path).
    When *db_path* is provided a dedicated connection is opened to that path
    (used by tests for full isolation).
    """
    try:
        with db_session(db_path=db_path) as conn:
            cursor = conn.cursor()

            for sql in _EXISTING_TABLES_SQL:
                cursor.execute(sql)

            # Migrate existing tables before CREATE TABLE (which is a no-op if table exists)
            _migrate_agent_runs(cursor)
            _migrate_news(cursor)
            _migrate_watchlist_stocks(cursor)
            _migrate_data_providers_config(cursor)
            _migrate_watchlists(cursor)
            _migrate_price_alerts(cursor)
            _migrate_ai_ratings_price_columns(cursor)
            _migrate_error_log(cursor)
            _migrate_earnings_events(cursor)
            _migrate_comparison_runs(cursor)
            _migrate_comparison_results(cursor)
            _migrate_agent_schedules(cursor)
            _migrate_ai_comparison_tables(cursor)

            for sql in _NEW_TABLES_SQL:
                cursor.execute(sql)

            for sql in _INDEXES_SQL:
                cursor.execute(sql)

            # Seed default watchlist idempotently
            cursor.execute("INSERT OR IGNORE INTO watchlists (id, name) VALUES (1, 'My Watchlist')")
            cursor.execute(
                "INSERT OR IGNORE INTO watchlist_stocks (watchlist_id, ticker) "
                "SELECT 1, ticker FROM stocks WHERE active = 1"
            )

            # Update query planner statistics for all tables
            conn.execute("ANALYZE")

        logger.info("All database tables and indexes initialised successfully")
    except Exception:
        logger.exception("Failed to initialise database tables")
        raise