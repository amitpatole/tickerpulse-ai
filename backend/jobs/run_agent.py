"""
Generic agent job runner for custom agent schedules.

Maps job_id strings stored in ``agent_schedules`` to their callable job
functions.  Called by APScheduler when a custom schedule fires.
"""

import logging
from typing import Callable, Dict, List

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Known agents available for custom scheduling
# ---------------------------------------------------------------------------

KNOWN_AGENTS: List[Dict[str, str]] = [
    {
        'job_id': 'morning_briefing',
        'name': 'Morning Briefing',
        'description': 'Pre-market summary with overnight moves and regime assessment.',
    },
    {
        'job_id': 'technical_monitor',
        'name': 'Technical Monitor',
        'description': 'RSI/MACD/MA signals with breakout alerts.',
    },
    {
        'job_id': 'reddit_scanner',
        'name': 'Reddit Scanner',
        'description': 'Trending ticker mentions from Reddit.',
    },
    {
        'job_id': 'daily_summary',
        'name': 'Daily Summary',
        'description': 'End-of-day digest with closing prices and sentiment.',
    },
    {
        'job_id': 'weekly_review',
        'name': 'Weekly Review',
        'description': 'Comprehensive weekly portfolio review.',
    },
    {
        'job_id': 'regime_check',
        'name': 'Regime Check',
        'description': 'Quick market health pulse (bull/bear/neutral/volatile).',
    },
    {
        'job_id': 'download_tracker',
        'name': 'Download Tracker',
        'description': 'GitHub repository download statistics.',
    },
]


def _build_registry() -> Dict[str, Callable]:
    """Build the job_id → callable map lazily to avoid import-time circularity."""
    from backend.jobs.morning_briefing import run_morning_briefing
    from backend.jobs.technical_monitor import run_technical_monitor
    from backend.jobs.reddit_scanner import run_reddit_scan
    from backend.jobs.daily_summary import run_daily_summary
    from backend.jobs.weekly_review import run_weekly_review
    from backend.jobs.regime_check import run_regime_check
    from backend.jobs.download_tracker import run_download_tracker
    return {
        'morning_briefing': run_morning_briefing,
        'technical_monitor': run_technical_monitor,
        'reddit_scanner': run_reddit_scan,
        'daily_summary': run_daily_summary,
        'weekly_review': run_weekly_review,
        'regime_check': run_regime_check,
        'download_tracker': run_download_tracker,
    }


def run_agent_job(job_id: str) -> None:
    """Execute the job function for *job_id*.

    Called by APScheduler when a custom schedule fires.  Logs and swallows
    any exception so the scheduler thread is not disrupted.
    """
    registry = _build_registry()
    func = registry.get(job_id)
    if func is None:
        logger.error("Custom schedule: unknown job_id=%r — skipping", job_id)
        return
    logger.info("Custom schedule firing job_id=%r", job_id)
    try:
        func()
    except Exception as exc:
        logger.error(
            "Custom schedule job_id=%r raised an exception: %s",
            job_id, exc, exc_info=True,
        )
