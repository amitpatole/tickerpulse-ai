"""
TickerPulse AI v3.0 — Shared Flask extension instances.

Import extension objects from here to avoid circular imports between
the application factory (app.py) and individual blueprints that need
to reference the same extension instance.
"""

import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rate limiter (flask-limiter)
# ---------------------------------------------------------------------------
try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address

    limiter = Limiter(key_func=get_remote_address)
    logger.debug("flask-limiter loaded; call limiter.init_app(app) in create_app()")
except ImportError:
    logger.warning(
        "flask-limiter is not installed — rate limiting disabled. "
        "Install with: pip install flask-limiter>=3.5.0"
    )
    limiter = None  # type: ignore[assignment]