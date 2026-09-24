"""
TickerPulse AI v3.0 - Central Configuration
All settings are driven by environment variables with sensible defaults.
"""

import sys
import os
from pathlib import Path


if getattr(sys, 'frozen', False):
    # PyInstaller bundle: resolve from executable location
    BASE_DIR = Path(sys.executable).parent.parent
else:
    BASE_DIR = Path(__file__).parent.parent  # tickerpulse-ai/


def _load_env_file(env_path: Path = BASE_DIR / '.env') -> None:
    """Load local .env settings without overriding explicit process env."""
    if not env_path.exists():
        return

    try:
        from dotenv import load_dotenv
        load_dotenv(dotenv_path=env_path, override=False)
    except ImportError:
        for line in env_path.read_text(encoding='utf-8').splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith('#') or '=' not in stripped:
                continue
            key, value = stripped.split('=', 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


_load_env_file()


class Config:
    """Application configuration with environment variable overrides."""

    # -------------------------------------------------------------------------
    # Base paths
    # -------------------------------------------------------------------------
    BASE_DIR = BASE_DIR
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
    IDEA_SWEEP_OUTPUT_DIR = os.getenv(
        'IDEA_SWEEP_OUTPUT_DIR',
        str(BASE_DIR / 'data' / 'idea_sweeps')
    )

    SCHEDULER_API_ENABLED = False  # Disabled -- we use our own scheduler_routes blueprint
    SCHEDULER_API_PREFIX = '/api/scheduler'

    # -------------------------------------------------------------------------
    # AI Providers (can also be configured via the Settings UI)
    # -------------------------------------------------------------------------
    ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY', '')
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')
    GOOGLE_AI_KEY = os.getenv('GOOGLE_AI_KEY', '')
    XAI_API_KEY = os.getenv('XAI_API_KEY', '')
    DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY', '')
    DEEPSEEK_BASE_URL = os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')
    DEEPSEEK_MODEL = os.getenv('DEEPSEEK_MODEL', 'deepseek-v4-flash')
    OPENCODE_API_KEY = os.getenv('OPENCODE_API_KEY', '')
    OPENCODE_BASE_URL = os.getenv('OPENCODE_BASE_URL', 'https://opencode.ai/zen/go/v1')
    OPENCODE_MODEL = os.getenv('OPENCODE_MODEL', 'deepseek-v4-flash')
    OPENCODE_FLASH_MODEL = os.getenv('OPENCODE_FLASH_MODEL', OPENCODE_MODEL)
    OPENCODE_PRO_MODEL = os.getenv('OPENCODE_PRO_MODEL', 'deepseek-v4-pro')
    OPENAI_COMPATIBLE_API_KEY = os.getenv('OPENAI_COMPATIBLE_API_KEY', '')
    OPENAI_COMPATIBLE_BASE_URL = os.getenv('OPENAI_COMPATIBLE_BASE_URL', '')
    OPENAI_COMPATIBLE_MODEL = os.getenv('OPENAI_COMPATIBLE_MODEL', '')
    DEFAULT_AI_PROVIDER = os.getenv('DEFAULT_AI_PROVIDER', '').strip().lower()

    # Default AI model per provider (used when no model is specified in DB)
    DEFAULT_MODELS = {
        'anthropic': 'claude-sonnet-4-20250514',
        'openai': 'gpt-4o',
        'google': 'gemini-2.0-flash',
        'xai': 'grok-3',
        'grok': 'grok-3',
        'deepseek': DEEPSEEK_MODEL,
        'opencode': OPENCODE_FLASH_MODEL,
        'openai_compatible': OPENAI_COMPATIBLE_MODEL,
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
