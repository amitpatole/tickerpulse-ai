"""
TickerPulse AI v3.0 — Centralized logger factory.

Usage::

    from backend.core.logging_config import get_logger

    logger = get_logger(__name__)

The factory returns a standard ``logging.Logger`` instance.  If
``Config.LOG_FORMAT_JSON`` is enabled the root handler (set up by
``_setup_logging`` in ``app.py``) already emits JSON, so individual
loggers just need to be children of the root hierarchy — no extra
configuration is required per module.

The factory exists as a single call-site so that future concerns
(e.g. injecting a request-ID filter on every logger, or routing
specific namespaces to a separate handler) can be added in one place.
"""

import logging

from backend.config import Config


def get_logger(name: str) -> logging.Logger:
    """Return a logger for *name*, inheriting the root handler configuration.

    Parameters
    ----------
    name:
        Typically ``__name__`` of the calling module.  Creates a
        logger in the standard Python dotted-name hierarchy so log
        records propagate to the root logger configured by
        ``_setup_logging`` in ``app.py``.

    Returns
    -------
    logging.Logger
        A configured logger instance.  The effective log level is
        inherited from the root logger unless overridden via the
        ``LOG_LEVEL`` environment variable.
    """
    logger = logging.getLogger(name)

    # Only set level if not already configured (e.g. during tests that
    # call get_logger before the app is initialised).
    if not logger.level:
        log_level = getattr(logging, Config.LOG_LEVEL.upper(), logging.INFO)
        logger.setLevel(log_level)

    return logger