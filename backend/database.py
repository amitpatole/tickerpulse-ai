```python

"""
TickerPulse AI v3.0 - Database Connection Manager
Thread-safe SQLite helper with context-manager support and table initialisation.
"""

import sqlite3
import logging
from contextlib import contextmanager

from backend.config import Config

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------

def get_db_connection(db_path: str | None = None) -> sqlite3.Connection:
    """Return a new SQLite connection with Row factory enabled."""
    path = db_path or Config.DB_PATH
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    return conn


@contextmanager
def db_session(db_path: str | None = None):
    """Context manager that yields a connection and auto-closes it."""
    conn = get_db_connection(db_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


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
]

_INDEXES_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_agent_runs_status      ON agent_runs (status)",
    "CREATE INDEX IF NOT EXISTS idx_agent_runs_agent       ON agent_runs (agent_name)",
    "CREATE INDEX IF NOT EXISTS idx_agent_runs_started     ON agent_runs (started_at)",
    "CREATE INDEX IF NOT EXISTS idx_job_history_job_id     ON job_history (job_id)",
    "CREATE INDEX IF NOT EXISTS idx_job_history_executed   ON job_history (executed_at)",
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


def init_all_tables(db_path: str | None = None) -> None:
    """Create every table (existing + new v3.0) and apply indexes.

    Safe to call multiple times -- all statements use
    ``CREATE TABLE IF NOT EXISTS`` / ``CREATE INDEX IF NOT EXISTS``.
    """
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    try:
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

        conn.commit()
        logger.info("All database tables and indexes initialised successfully")
    except Exception:
        conn.rollback()
        logger.exception("Failed to initialise database tables")
        raise
    finally:
        conn.close()
```