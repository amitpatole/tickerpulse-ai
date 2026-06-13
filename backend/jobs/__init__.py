"""
Job definitions for TickerPulse AI scheduler.

Each module in this package defines a single scheduled job. The
``register_all_jobs`` function wires them all into a ``SchedulerManager``
with the correct cron / interval triggers.
"""
from backend.jobs.morning_briefing import run_morning_briefing
from backend.jobs.technical_monitor import run_technical_monitor
from backend.jobs.reddit_scanner import run_reddit_scan
from backend.jobs.daily_summary import run_daily_summary
from backend.jobs.weekly_review import run_weekly_review
from backend.jobs.regime_check import run_regime_check
from backend.jobs.download_tracker import run_download_tracker
from backend.jobs.daily_idea_sweep import run_daily_idea_sweep


def register_all_jobs(scheduler_manager) -> None:
    """Register every scheduled job with the given SchedulerManager.

    Parameters
    ----------
    scheduler_manager : backend.scheduler.SchedulerManager
        The manager instance that will hold the job registry and ultimately
        schedule them via APScheduler.
    """

    # ---- Morning Briefing: 8:30 AM ET, weekdays ----
    scheduler_manager.register_job(
        job_id='morning_briefing',
        func=run_morning_briefing,
        trigger='cron',
        name='Morning Briefing',
        description=(
            'Pre-market summary with overnight moves, pre-market movers, '
            'and market regime assessment. Runs Scanner + Regime agents.'
        ),
        hour=8,
        minute=30,
        day_of_week='mon-fri',
    )

    # ---- Technical Monitor: Every 15 min during market hours ----
    scheduler_manager.register_job(
        job_id='technical_monitor',
        func=run_technical_monitor,
        trigger='interval',
        name='Technical Monitor',
        description=(
            'RSI/MACD/MA signals for the watchlist with breakout alerts. '
            'Runs every 15 minutes; skips when market is closed.'
        ),
        minutes=15,
    )

    # ---- Reddit Scanner: Every 60 min during market hours ----
    scheduler_manager.register_job(
        job_id='reddit_scanner',
        func=run_reddit_scan,
        trigger='interval',
        name='Reddit Scanner',
        description=(
            'Scans Reddit (WSB, stocks, investing, etc.) for trending '
            'ticker mentions and unusual activity. Runs hourly during '
            'market hours.'
        ),
        minutes=60,
    )

    # ---- Daily Summary: 4:30 PM ET, weekdays ----
    scheduler_manager.register_job(
        job_id='daily_summary',
        func=run_daily_summary,
        trigger='cron',
        name='Daily Summary',
        description=(
            'End-of-day digest with closing prices, regime assessment, '
            'sentiment summary, and job execution recap. Runs all agents.'
        ),
        hour=16,
        minute=30,
        day_of_week='mon-fri',
    )

    # ---- Daily Idea Sweep: 7:00 AM in configured market timezone, weekdays ----
    scheduler_manager.register_job(
        job_id='daily_idea_sweep',
        func=run_daily_idea_sweep,
        trigger='cron',
        name='Daily Idea Sweep',
        description=(
            'Lightweight idea generator that runs the market sweep, X watchlist, '
            'technical scanner, and news fetcher, then writes latest.json for '
            'downstream workflow tools.'
        ),
        hour=7,
        minute=0,
        day_of_week='mon-fri',
    )

    # ---- Weekly Review: Sunday 8:00 PM ET ----
    scheduler_manager.register_job(
        job_id='weekly_review',
        func=run_weekly_review,
        trigger='cron',
        name='Weekly Review',
        description=(
            'Comprehensive weekly portfolio review with 5-day performance, '
            'sector analysis, regime trends, and cost tracking.'
        ),
        day_of_week='sun',
        hour=20,
        minute=0,
    )

    # ---- Regime Check: Every 2 hours during market hours ----
    scheduler_manager.register_job(
        job_id='regime_check',
        func=run_regime_check,
        trigger='interval',
        name='Regime Check',
        description=(
            'Quick market health pulse check. Classifies current regime '
            '(bull/bear/neutral/volatile). Runs every 2 hours; skips '
            'when market is closed.'
        ),
        hours=2,
    )

    # ---- Download Tracker: 9:00 AM ET daily ----
    scheduler_manager.register_job(
        job_id='download_tracker',
        func=run_download_tracker,
        trigger='cron',
        name='Download Tracker',
        description=(
            'Tracks GitHub repository download statistics (clones) via '
            'GitHub API. Monitors unique and total downloads over time.'
        ),
        hour=9,
        minute=0,
    )


__all__ = [
    'register_all_jobs',
    'run_morning_briefing',
    'run_technical_monitor',
    'run_reddit_scan',
    'run_daily_summary',
    'run_weekly_review',
    'run_regime_check',
    'run_download_tracker',
    'run_daily_idea_sweep',
]
