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

    # US market hours
    US_MARKET_OPEN = '09:30'
    US_MARKET_CLOSE = '16:00'

    # India market hours (IST / Asia/Kolkata)
    INDIA_MARKET_OPEN = '09:15'
    INDIA_MARKET_CLOSE = '15:30'
    INDIA_MARKET_TIMEZONE = 'Asia/Kolkata'

    # -------------------------------------------------------------------------
    # Monitoring / Scheduler
    # -------------------------------------------------------------------------
    CHECK_INTERVAL = int(os.getenv('CHECK_INTERVAL', 300))  # seconds (5 min)

    SCHEDULER_API_ENABLED = False  # Disabled -- we use our own scheduler_routes blueprint
    SCHEDULER_API_PREFIX = '/api/scheduler'

    # -------------------------------------------------------------------------
    # AI Providers (can also be configured via the Settings UI)
    # -------------------------------------------------------------------------
    ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY', '')
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')
    GOOGLE_AI_KEY = os.getenv('GOOGLE_AI_KEY', '')
    XAI_API_KEY = os.getenv('XAI_API_KEY', '')

    # Default AI model per provider (used when no model is specified in DB)
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
    # Reddit (optional, for PRAW social-media monitoring)
    # -------------------------------------------------------------------------
    REDDIT_CLIENT_ID = os.getenv('REDDIT_CLIENT_ID', '')
    REDDIT_CLIENT_SECRET = os.getenv('REDDIT_CLIENT_SECRET', '')

    # -------------------------------------------------------------------------
    # GitHub (for repository analytics)
    # -------------------------------------------------------------------------
    GITHUB_TOKEN = os.getenv('GITHUB_TOKEN', '')

    # -------------------------------------------------------------------------
    # Agent framework
    # -------------------------------------------------------------------------
    DEFAULT_AGENT_FRAMEWORK = os.getenv(
        'DEFAULT_AGENT_FRAMEWORK', 'crewai'
    )  # 'crewai' or 'openclaw'

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
    # Emit structured JSON logs instead of plaintext (set LOG_FORMAT_JSON=true).
    # Accepts LOG_JSON as a legacy alias so existing deployments keep working.
    LOG_FORMAT_JSON: bool = (
        os.getenv('LOG_FORMAT_JSON', os.getenv('LOG_JSON', 'false')).lower() == 'true'
    )
    # Log the request body on POST/PUT requests (disabled by default — may
    # contain sensitive data).
    LOG_REQUEST_BODY: bool = os.getenv('LOG_REQUEST_BODY', 'false').lower() == 'true'

    # -------------------------------------------------------------------------
    # Swagger / OpenAPI
    # -------------------------------------------------------------------------
    SWAGGER_ENABLED: bool = os.getenv('SWAGGER_ENABLED', 'true').lower() == 'true'

    # -------------------------------------------------------------------------
    # Price refresh (real-time WebSocket updates)
    # -------------------------------------------------------------------------
    # Default polling interval in seconds used when no DB override is stored.
    # 0 means manual mode (auto-refresh disabled).
    # The value is persisted to the settings table via PUT /api/settings/refresh-interval
    # so users can change it at runtime without restarting the server.
    PRICE_REFRESH_INTERVAL_SECONDS: int = int(
        os.getenv('PRICE_REFRESH_INTERVAL_SECONDS', 30)
    )

    # Canonical alias referenced by the settings endpoint and scheduler when
    # computing the effective default.  Mirrors PRICE_REFRESH_INTERVAL_SECONDS.
    REFRESH_INTERVAL_DEFAULT_SEC: int = int(
        os.getenv('PRICE_REFRESH_INTERVAL_SECONDS', 30)
    )

    # Maximum number of tickers a single WebSocket client may subscribe to.
    # Protects against accidental (or malicious) subscription flooding.
    WS_MAX_SUBSCRIPTIONS_PER_CLIENT: int = int(
        os.getenv('WS_MAX_SUBSCRIPTIONS_PER_CLIENT', 50)
    )

    # When True (default), the price_refresh job fans out a ``price_batch``
    # WebSocket message to every subscribed client after each fetch cycle.
    # Set WS_PRICE_BROADCAST=false to disable WS broadcasting without stopping
    # the SSE price_update feed.
    WS_PRICE_BROADCAST: bool = os.getenv('WS_PRICE_BROADCAST', 'true').lower() == 'true'