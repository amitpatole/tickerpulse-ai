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
    """Return a new SQLite connection with Row factory enabled.

    Parameters
    ----------
    db_path : str, optional
        Override the default database path from Config.

    Notes
    -----
    * ``check_same_thread=False`` is required so Flask (and APScheduler)
      threads can share the connection safely.  SQLite itself serialises
      writes, so this is safe for the read-heavy workload of TickerPulse.
    """
    path = db_path or Config.DB_PATH
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')  # better concurrent-read perf
    conn.execute('PRAGMA foreign_keys=ON')
    return conn


@contextmanager
def db_session(db_path: str | None = None):
    """Context manager that yields a connection and auto-closes it.

    Usage::

        with db_session() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT ...')
            conn.commit()
    """
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

# Existing tables (carried over from stock_monitor.py / settings_manager.py)
_EXISTING_TABLES_SQL = [
    # --- news ---
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
    # --- alerts ---
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
    # --- monitor_status ---
    """
    CREATE TABLE IF NOT EXISTS monitor_status (
        id          INTEGER PRIMARY KEY,
        last_check  TIMESTAMP,
        status      TEXT,
        message     TEXT
    )
    """,
    # --- stocks ---
    """
    CREATE TABLE IF NOT EXISTS stocks (
        ticker   TEXT PRIMARY KEY,
        name     TEXT,
        market   TEXT DEFAULT 'US',
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        active   INTEGER DEFAULT 1
    )
    """,
    # --- settings ---
    """
    CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # --- ai_providers ---
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

# New v3.0 tables
_NEW_TABLES_SQL = [
    # --- agent_runs: tracks every AI agent execution ---
    """
    CREATE TABLE IF NOT EXISTS agent_runs (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_name      TEXT NOT NULL,
        framework       TEXT NOT NULL DEFAULT 'crewai',  -- 'crewai' | 'openclaw'
        status          TEXT NOT NULL DEFAULT 'pending',  -- pending | running | completed | failed
        input_data      TEXT,       -- JSON
        output_data     TEXT,       -- JSON
        tokens_input    INTEGER DEFAULT 0,
        tokens_output   INTEGER DEFAULT 0,
        estimated_cost  REAL    DEFAULT 0.0,
        duration_ms     INTEGER DEFAULT 0,
        error           TEXT,
        metadata        TEXT,       -- JSON
        started_at      TIMESTAMP,
        completed_at    TIMESTAMP,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # --- job_history: scheduler / cron job audit log ---
    """
    CREATE TABLE IF NOT EXISTS job_history (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id          TEXT NOT NULL,
        job_name        TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending',  -- pending | running | completed | failed
        result_summary  TEXT,       -- short human-readable outcome
        agent_name      TEXT,       -- NULL when job does not involve an agent
        duration_ms     INTEGER DEFAULT 0,
        cost            REAL    DEFAULT 0.0,
        executed_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # --- data_providers_config: market-data provider registry ---
    """
    CREATE TABLE IF NOT EXISTS data_providers_config (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_name         TEXT NOT NULL UNIQUE,
        api_key               TEXT DEFAULT '',
        is_active             INTEGER DEFAULT 1,
        is_primary            INTEGER DEFAULT 0,
        priority              INTEGER DEFAULT 100,  -- lower = higher priority (fallback order)
        rate_limit_remaining  INTEGER DEFAULT -1,    -- -1 = unknown / unlimited
        last_used             TIMESTAMP,
        created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # --- research_briefs: AI-generated research reports ---
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
    # --- ai_ratings: cached AI ratings for stocks ---
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
    # --- cost_tracking: per-call cost ledger ---
    """
    CREATE TABLE IF NOT EXISTS cost_tracking (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        date            TEXT NOT NULL,       -- YYYY-MM-DD
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
    # --- download_stats: aggregate repository download statistics ---
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
    # --- download_daily: daily breakdown of repository downloads ---
    """
    CREATE TABLE IF NOT EXISTS download_daily (
        repo_owner      TEXT NOT NULL,
        repo_name       TEXT NOT NULL,
        date            TEXT NOT NULL,       -- YYYY-MM-DD
        clones          INTEGER DEFAULT 0,
        unique_clones   INTEGER DEFAULT 0,
        PRIMARY KEY (repo_owner, repo_name, date)
    )
    """,
    # --- watchlists: named portfolio groups ---
    """
    CREATE TABLE IF NOT EXISTS watchlists (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # --- watchlist_stocks: junction table linking watchlists to tickers ---
    """
    CREATE TABLE IF NOT EXISTS watchlist_stocks (
        watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
        ticker       TEXT NOT NULL REFERENCES stocks(ticker),
        PRIMARY KEY (watchlist_id, ticker)
    )
    """,
    # --- price_alerts: user-defined price condition alerts ---
    """
    CREATE TABLE IF NOT EXISTS price_alerts (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker         TEXT NOT NULL,
        condition_type TEXT NOT NULL,
        threshold      REAL NOT NULL,
        enabled        INTEGER NOT NULL DEFAULT 1,
        triggered_at   TIMESTAMP,
        created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # --- sentiment_cache: aggregated social/news sentiment per ticker ---
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
    # --- earnings_events: upcoming earnings calendar cache ---
    """
    CREATE TABLE IF NOT EXISTS earnings_events (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker          TEXT NOT NULL,
        company         TEXT,
        earnings_date   TEXT NOT NULL,
        time_of_day     TEXT,
        eps_estimate    REAL,
        fiscal_quarter  TEXT,
        fetched_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ticker, earnings_date)
    )
    """,
]

# Useful indices for the new tables
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
    "CREATE INDEX IF NOT EXISTS idx_price_alerts_enabled   ON price_alerts (enabled, ticker)",
    "CREATE INDEX IF NOT EXISTS idx_sentiment_ticker       ON sentiment_cache (ticker)",
    "CREATE INDEX IF NOT EXISTS idx_earnings_date          ON earnings_events (earnings_date)",
    "CREATE INDEX IF NOT EXISTS idx_earnings_ticker        ON earnings_events (ticker)",
]


# ---------------------------------------------------------------------------
# Public initialisation function
# ---------------------------------------------------------------------------

def _migrate_agent_runs(cursor) -> None:
    """Migrate agent_runs from v3.0.0 schema (tokens_used) to v3.0.1 (tokens_input/tokens_output).

    Safe to call multiple times — silently skips if columns already exist.
    """
    # Check existing columns
    cols = {row[1] for row in cursor.execute("PRAGMA table_info(agent_runs)").fetchall()}
    if not cols:
        return  # table doesn't exist yet, CREATE TABLE will handle it

    migrations = []
    if 'tokens_input' not in cols:
        migrations.append("ALTER TABLE agent_runs ADD COLUMN tokens_input INTEGER DEFAULT 0")
    if 'tokens_output' not in cols:
        migrations.append("ALTER TABLE agent_runs ADD COLUMN tokens_output INTEGER DEFAULT 0")
    if 'error' not in cols:
        migrations.append("ALTER TABLE agent_runs ADD COLUMN error TEXT")
    if 'metadata' not in cols:
        migrations.append("ALTER TABLE agent_runs ADD COLUMN metadata TEXT")

    # Copy data from old tokens_used into tokens_input if migrating
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
