```python
"""
TickerPulse AI v3.0 - Central Configuration
All settings are driven by environment variables with sensible defaults.
"""

import os
import sys
from pathlib import Path


class Config:
    """Application configuration with environment variable overrides."""

    # -------------------------------------------------------------------------
    # Base paths
    # -------------------------------------------------------------------------
    if getattr(sys, 'frozen', False):
        # PyInstaller bundle: resolve from executable location
        BASE_DIR = Path(sys.executable).parent.parent
    else:
        BASE_DIR = Path(__file__).parent.parent  # tickerpulse-ai/
    DB_PATH = os.getenv('DB_PATH', str(BASE_DIR / 'stock_news.db'))

    # -------------------------------------------------------------------------
    # Flask
    # -------------------------------------------------------------------------
    SECRET_KEY = os.getenv('SECRET_KEY', 'tickerpulse-dev-key-change-in-prod')
    FLASK_PORT = int(os.getenv('FLASK_PORT', 5000))
    FLASK_DEBUG = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'

    # -------------------------------------------------------------------------
    # CORS
    # -------------------------------------------------------------------------
    CORS_ORIGINS = os.getenv(
        'CORS_ORIGINS',
        'http://localhost:3000,http://localhost:5000'
    ).split(',')

    # -------------------------------------------------------------------------
    # Market hours (24h format, timezone-aware)
    # -------------------------------------------------------------------------
    MARKET_TIMEZONE = os.getenv('MARKET_TIMEZONE', 'US/Eastern')

    US_MARKET_OPEN = '09:30'
    US_MARKET_CLOSE = '16:00'

    INDIA_MARKET_OPEN = '09:15'
    INDIA_MARKET_CLOSE = '15:30'
    INDIA_MARKET_TIMEZONE = 'Asia/Kolkata'

    # -------------------------------------------------------------------------
    # Monitoring / Scheduler
    # -------------------------------------------------------------------------
    CHECK_INTERVAL = int(os.getenv('CHECK_INTERVAL', 300))  # seconds (5 min)

    SCHEDULER_API_ENABLED = False
    SCHEDULER_API_PREFIX = '/api/scheduler'

    # -------------------------------------------------------------------------
    # AI Providers
    # -------------------------------------------------------------------------
    ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY', '')
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')
    GOOGLE_AI_KEY = os.getenv('GOOGLE_AI_KEY', '')
    XAI_API_KEY = os.getenv('XAI_API_KEY', '')

    DEFAULT_MODELS = {
        'anthropic': 'claude-sonnet-4-20250514',
        'openai': 'gpt-4o',
        'google': 'gemini-2.0-flash',
        'xai': 'grok-3',
    }

    # -------------------------------------------------------------------------
    # OpenClaw agent gateway
    # -------------------------------------------------------------------------
    OPENCLAW_GATEWAY_URL = os.getenv(
        'OPENCLAW_GATEWAY_URL', 'ws://127.0.0.1:18789'
    )
    OPENCLAW_WEBHOOK_TOKEN = os.getenv('OPENCLAW_WEBHOOK_TOKEN', '')
    OPENCLAW_ENABLED = os.getenv('OPENCLAW_ENABLED', 'false').lower() == 'true'

    # -------------------------------------------------------------------------
    # Data providers
    # -------------------------------------------------------------------------
    POLYGON_API_KEY = os.getenv('POLYGON_API_KEY', '')
    ALPHA_VANTAGE_KEY = os.getenv('ALPHA_VANTAGE_KEY', '')
    FINNHUB_API_KEY = os.getenv('FINNHUB_API_KEY', '')
    TWELVE_DATA_KEY = os.getenv('TWELVE_DATA_KEY', '')

    # -------------------------------------------------------------------------
    # Reddit
    # -------------------------------------------------------------------------
    REDDIT_CLIENT_ID = os.getenv('REDDIT_CLIENT_ID', '')
    REDDIT_CLIENT_SECRET = os.getenv('REDDIT_CLIENT_SECRET', '')

    # -------------------------------------------------------------------------
    # GitHub
    # -------------------------------------------------------------------------
    GITHUB_TOKEN = os.getenv('GITHUB_TOKEN', '')

    # -------------------------------------------------------------------------
    # Agent framework
    # -------------------------------------------------------------------------
    DEFAULT_AGENT_FRAMEWORK = os.getenv(
        'DEFAULT_AGENT_FRAMEWORK', 'crewai'
    )

    # -------------------------------------------------------------------------
    # Cost management
    # -------------------------------------------------------------------------
    MONTHLY_BUDGET_LIMIT = float(os.getenv('MONTHLY_BUDGET_LIMIT', 1500.0))
    DAILY_BUDGET_WARNING = float(os.getenv('DAILY_BUDGET_WARNING', 75.0))

    # -------------------------------------------------------------------------
    # Database connection pool
    # -------------------------------------------------------------------------
    # Number of SQLite connections kept alive in the process-wide pool.
    # Increase if you see "DB pool exhausted" errors under high concurrency.
    DB_POOL_SIZE: int = int(os.getenv('DB_POOL_SIZE', 5))
    # Seconds to wait for a free connection before raising RuntimeError.
    DB_POOL_TIMEOUT: float = float(os.getenv('DB_POOL_TIMEOUT', 10.0))
    # Milliseconds SQLite waits on a locked resource before returning SQLITE_BUSY.
    # Prevents spurious "database is locked" errors under concurrent writes.
    DB_BUSY_TIMEOUT_MS: int = int(os.getenv('DB_BUSY_TIMEOUT_MS', 5000))
    # SQLite page-cache size in KiB (stored as negative value per PRAGMA convention).
    # 2 MB default keeps hot tables in memory, reducing I/O on repeated reads.
    DB_CACHE_SIZE_KB: int = int(os.getenv('DB_CACHE_SIZE_KB', 8000))

    # -------------------------------------------------------------------------
    # Rate limiting
    # -------------------------------------------------------------------------
    RATE_LIMIT_DEFAULT = os.getenv('RATE_LIMIT_DEFAULT', '60/minute')
    RATE_LIMIT_AI = os.getenv('RATE_LIMIT_AI', '20/minute')
    RATE_LIMIT_DATA = os.getenv('RATE_LIMIT_DATA', '30/minute')

    # -------------------------------------------------------------------------
    # Logging
    # -------------------------------------------------------------------------
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    LOG_DIR = os.getenv('LOG_DIR', str(BASE_DIR / 'logs'))
    LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    LOG_MAX_BYTES = int(os.getenv('LOG_MAX_BYTES', 10_485_760))  # 10 MB
    LOG_BACKUP_COUNT = int(os.getenv('LOG_BACKUP_COUNT', 5))
    LOG_FORMAT_JSON: bool = (
        os.getenv('LOG_FORMAT_JSON', os.getenv('LOG_JSON', 'false')).lower() == 'true'
    )
    LOG_REQUEST_BODY: bool = os.getenv('LOG_REQUEST_BODY', 'false').lower() == 'true'

    # -------------------------------------------------------------------------
    # Swagger / OpenAPI
    # -------------------------------------------------------------------------
    SWAGGER_ENABLED: bool = os.getenv('SWAGGER_ENABLED', 'true').lower() == 'true'

    # -------------------------------------------------------------------------
    # Price refresh
    # -------------------------------------------------------------------------
    PRICE_REFRESH_INTERVAL_SECONDS: int = int(
        os.getenv('PRICE_REFRESH_INTERVAL_SECONDS', 30)
    )

    REFRESH_INTERVAL_DEFAULT_SEC: int = int(
        os.getenv('PRICE_REFRESH_INTERVAL_SECONDS', 30)
    )

    WS_MAX_SUBSCRIPTIONS_PER_CLIENT: int = int(
        os.getenv('WS_MAX_SUBSCRIPTIONS_PER_CLIENT', 50)
    )

    WS_PRICE_BROADCAST: bool = os.getenv('WS_PRICE_BROADCAST', 'true').lower() == 'true'

    # Number of parallel worker threads for the price refresh job.
    # Each worker calls _fetch_price() for one ticker; keep <= DB_POOL_SIZE
    # to avoid pool contention when persisting results.
    PRICE_REFRESH_WORKERS: int = int(os.getenv('PRICE_REFRESH_WORKERS', 10))
```