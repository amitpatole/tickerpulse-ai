
"""
APScheduler configuration and management for TickerPulse AI.
Sets up job store (SQLite), job defaults, and exposes helpers.
"""
import logging
import threading
from datetime import datetime
from typing import Dict, List, Optional, Any

import pytz
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.executors.pool import ThreadPoolExecutor

from backend.config import Config

# Timezone alias map -- pytz on some systems does not ship the short
# ``US/Eastern`` aliases.  Map them to their canonical IANA names.
_TZ_ALIASES = {
    'US/Eastern': 'America/New_York',
    'US/Central': 'America/Chicago',
    'US/Mountain': 'America/Denver',
    'US/Pacific': 'America/Los_Angeles',
}


def _tz(name: str):
    """Return a pytz timezone, resolving common aliases."""
    try:
        return pytz.timezone(name)
    except pytz.exceptions.UnknownTimeZoneError:
        canonical = _TZ_ALIASES.get(name)
        if canonical:
            return pytz.timezone(canonical)
        raise

logger = logging.getLogger(__name__)


def _extract_trigger_args(trigger) -> dict:
    """Return structured trigger kwargs extracted from an APScheduler trigger.

    Inspects the trigger's own attributes rather than relying on the in-memory
    registry, so the returned data always reflects the live APScheduler state.
    Returns an empty dict for unknown trigger types or on any attribute error.
    """
    if trigger is None:
        return {}
    cls_name = type(trigger).__name__
    try:
        if cls_name == 'CronTrigger':
            return {f.name: str(f) for f in trigger.fields if not f.is_default}
        if cls_name == 'IntervalTrigger':
            return {'seconds': int(trigger.interval.total_seconds())}
    except AttributeError:
        pass
    return {}


class SchedulerManager:
    """Manages all scheduled jobs for TickerPulse AI."""

    def __init__(self, app=None):
        self.scheduler = None
        self.app = app
        self._job_registry: Dict[str, Dict[str, Any]] = {}  # name -> job metadata
        self._lock = threading.RLock()

    def init_app(self, app):
        """Initialize scheduler with Flask app."""
        self.app = app

        # Configure APScheduler
        jobstores = {
            'default': SQLAlchemyJobStore(url=f'sqlite:///{Config.DB_PATH}')
        }
        executors = {
            'default': ThreadPoolExecutor(max_workers=10)
        }
        job_defaults = {
            'coalesce': True,  # If job missed multiple times, only run once
            'max_instances': 1,
            'misfire_grace_time': 300,  # 5 min grace period
        }

        timezone = _tz(Config.MARKET_TIMEZONE)

        # Use app's scheduler if available (Flask-APScheduler), else create new
        if hasattr(app, 'scheduler') and app.scheduler:
            self.scheduler = app.scheduler.scheduler  # Get underlying APScheduler
        else:
            self.scheduler = BackgroundScheduler(
                jobstores=jobstores,
                executors=executors,
                job_defaults=job_defaults,
                timezone=timezone,
            )

    def register_job(self, job_id: str, func, trigger: str, name: str,
                     description: str, **trigger_args):
        """Register a scheduled job.

        Parameters
        ----------
        job_id : str
            Unique identifier for the job (e.g. ``morning_briefing``).
        func : callable
            The function to execute.
        trigger : str
            APScheduler trigger type: ``'cron'``, ``'interval'``, or ``'date'``.
        name : str
            Human-readable name shown in the UI.
        description : str
            Longer description of what the job does.
        **trigger_args
            Keyword arguments forwarded to the APScheduler trigger
            (e.g. ``hour=8, minute=30, day_of_week='mon-fri'``).
        """
        with self._lock:
            self._job_registry[job_id] = {
                'name': name,
                'description': description,
                'func': func,
                'trigger': trigger,
                'trigger_args': trigger_args,
                'enabled': True,
            }

    def start_all_jobs(self):
        """Add all registered jobs to scheduler and start."""
        with self._lock:
            registry_snapshot = list(self._job_registry.items())
        for job_id, meta in registry_snapshot:
            if meta['enabled']:
                try:
                    existing = self.scheduler.get_job(job_id)
                    if existing is not None:
                        # Job already persisted in the SQLite jobstore — its
                        # trigger is authoritative; skip add_job to avoid
                        # clobbering the persisted schedule.
                        logger.info("Job %s already persisted, skipping add_job", job_id)
                    else:
                        self.scheduler.add_job(
                            meta['func'],
                            meta['trigger'],
                            id=job_id,
                            name=meta['name'],
                            replace_existing=True,
                            **meta['trigger_args'],
                        )
                        logger.info("Scheduled job: %s (%s)", job_id, meta['name'])
                except Exception as exc:
                    logger.error("Failed to schedule job %s: %s", job_id, exc)

        if not self.scheduler.running:
            self.scheduler.start()
            logger.info("Scheduler started with %d active jobs",
                        len(self.scheduler.get_jobs()))

    def get_scheduler_timezone(self) -> str:
        """Return the IANA timezone name of the scheduler's configured timezone."""
        if self.scheduler:
            return str(self.scheduler.timezone)
        return Config.MARKET_TIMEZONE

    def get_all_jobs(self) -> List[Dict]:
        """List all jobs with their status."""
        jobs = []
        with self._lock:
            registry_snapshot = list(self._job_registry.items())
        for job_id, meta in registry_snapshot:
            sched_job = self.scheduler.get_job(job_id) if self.scheduler else None
            if sched_job:
                trigger_args = _extract_trigger_args(sched_job.trigger)
            else:
                trigger_args = meta['trigger_args']
            jobs.append({
                'id': job_id,
                'name': meta['name'],
                'description': meta['description'],
                'enabled': meta['enabled'],
                'next_run': sched_job.next_run_time.isoformat() if sched_job and sched_job.next_run_time else None,
                'trigger': str(sched_job.trigger) if sched_job else meta['trigger'],
                'trigger_args': trigger_args,
            })
        return jobs

    def get_job(self, job_id: str) -> Optional[Dict]:
        """Get details for a single job by ID."""
        with self._lock:
            meta = self._job_registry.get(job_id)
            if not meta:
                return None
            sched_job = self.scheduler.get_job(job_id) if self.scheduler else None
            if sched_job:
                trigger_args = _extract_trigger_args(sched_job.trigger)
            else:
                trigger_args = meta['trigger_args']
            return {
                'id': job_id,
                'name': meta['name'],
                'description': meta['description'],
                'enabled': meta['enabled'],
                'next_run': sched_job.next_run_time.isoformat() if sched_job and sched_job.next_run_time else None,
                'trigger': str(sched_job.trigger) if sched_job else meta['trigger'],
                'trigger_args': trigger_args,
            }

    def pause_job(self, job_id: str) -> bool:
        """Pause a job."""
        with self._lock:
            if job_id not in self._job_registry:
                logger.warning("Cannot pause unknown job: %s", job_id)
                return False
            try:
                if self.scheduler:
                    sched_job = self.scheduler.get_job(job_id)
                    if sched_job:
                        self.scheduler.pause_job(job_id)
                self._job_registry[job_id]['enabled'] = False
                logger.info("Paused job: %s", job_id)
                return True
            except Exception as exc:
                logger.error("Failed to pause job %s: %s", job_id, exc)
                return False

    def resume_job(self, job_id: str) -> bool:
        """Resume a paused job."""
        with self._lock:
            if job_id not in self._job_registry:
                logger.warning("Cannot resume unknown job: %s", job_id)
                return False
            try:
                if self.scheduler:
                    sched_job = self.scheduler.get_job(job_id)
                    if sched_job:
                        self.scheduler.resume_job(job_id)
                    else:
                        # Job was removed from scheduler while paused -- re-add it
                        meta = self._job_registry[job_id]
                        self.scheduler.add_job(
                            meta['func'],
                            meta['trigger'],
                            id=job_id,
                            name=meta['name'],
                            replace_existing=True,
                            **meta['trigger_args'],
                        )
                self._job_registry[job_id]['enabled'] = True
                logger.info("Resumed job: %s", job_id)
                return True
            except Exception as exc:
                logger.error("Failed to resume job %s: %s", job_id, exc)
                return False

    def trigger_job(self, job_id: str) -> bool:
        """Trigger immediate execution of a job."""
        with self._lock:
            if job_id not in self._job_registry:
                logger.warning("Cannot trigger unknown job: %s", job_id)
                return False
            try:
                meta = self._job_registry[job_id]
                # Add a one-shot job that runs immediately
                if self.scheduler:
                    self.scheduler.add_job(
                        meta['func'],
                        'date',
                        id=f'{job_id}_manual_{datetime.utcnow().strftime("%Y%m%d%H%M%S")}',
                        name=f'{meta["name"]} (manual)',
                        run_date=datetime.now(_tz(Config.MARKET_TIMEZONE)),
                        replace_existing=False,
                    )
                logger.info("Triggered immediate run of job: %s", job_id)
                return True
            except Exception as exc:
                logger.error("Failed to trigger job %s: %s", job_id, exc)
                return False

    def update_job_schedule(self, job_id: str, trigger: str, **trigger_args) -> bool:
        """Update a job's schedule.

        Parameters
        ----------
        job_id : str
            The job to reschedule.
        trigger : str
            New trigger type (``'cron'``, ``'interval'``).
        **trigger_args
            New trigger keyword arguments.
        """
        with self._lock:
            if job_id not in self._job_registry:
                logger.warning("Cannot update unknown job: %s", job_id)
                return False
            try:
                # Reschedule in APScheduler FIRST; only update registry on success
                if self.scheduler:
                    sched_job = self.scheduler.get_job(job_id)
                    if sched_job:
                        self.scheduler.reschedule_job(job_id, trigger=trigger, **trigger_args)
                    else:
                        # Re-add if not currently in scheduler
                        meta = self._job_registry[job_id]
                        self.scheduler.add_job(
                            meta['func'],
                            trigger,
                            id=job_id,
                            name=meta['name'],
                            replace_existing=True,
                            **trigger_args,
                        )
                # Update the registry only after APScheduler succeeds
                self._job_registry[job_id]['trigger'] = trigger
                self._job_registry[job_id]['trigger_args'] = trigger_args
                logger.info("Updated schedule for job %s: trigger=%s, args=%s",
                            job_id, trigger, trigger_args)
                return True
            except Exception as exc:
                logger.error("Failed to update job %s schedule: %s", job_id, exc)
                return False

    def reschedule_job(self, job_id: str, seconds: int) -> bool:
        """Set a new interval for a job, or pause it when seconds == 0.

        This is the high-level entry point used by the settings API.  It
        encapsulates the pause/reschedule logic so callers only need to pass
        the desired interval in seconds.

        Parameters
        ----------
        job_id : str
            The job to reschedule (e.g. ``'price_refresh'``).
        seconds : int
            New interval in seconds.  Pass ``0`` to pause the job (manual mode).

        Returns
        -------
        bool
            ``True`` on success, ``False`` if the job is unknown or an error
            occurs.
        """
        if seconds == 0:
            return self.pause_job(job_id)

        with self._lock:
            if job_id not in self._job_registry:
                logger.warning("Cannot reschedule unknown job: %s", job_id)
                return False
            try:
                if self.scheduler:
                    sched_job = self.scheduler.get_job(job_id)
                    if sched_job:
                        # APScheduler's reschedule_job updates the trigger and
                        # also unpauses the job if it was previously paused.
                        self.scheduler.reschedule_job(
                            job_id, trigger='interval', seconds=seconds
                        )
                    else:
                        meta = self._job_registry[job_id]
                        self.scheduler.add_job(
                            meta['func'],
                            'interval',
                            id=job_id,
                            name=meta['name'],
                            replace_existing=True,
                            seconds=seconds,
                        )
                self._job_registry[job_id]['trigger'] = 'interval'
                self._job_registry[job_id]['trigger_args'] = {'seconds': seconds}
                self._job_registry[job_id]['enabled'] = True
                logger.info("Rescheduled job %s to interval=%ds", job_id, seconds)
                return True
            except Exception as exc:
                logger.error("Failed to reschedule job %s: %s", job_id, exc)
                return False

    def is_market_hours(self, market: str = 'US') -> bool:
        """Check if currently within market hours.

        Parameters
        ----------
        market : str
            ``'US'`` or ``'India'``.

        Returns
        -------
        bool
            True if the current time is within market trading hours for the
            given market and it is a weekday.
        """
        if market.upper() == 'INDIA':
            tz = _tz(Config.INDIA_MARKET_TIMEZONE)
            open_str = Config.INDIA_MARKET_OPEN   # '09:15'
            close_str = Config.INDIA_MARKET_CLOSE  # '15:30'
        else:
            tz = _tz(Config.MARKET_TIMEZONE)
            open_str = Config.US_MARKET_OPEN   # '09:30'
            close_str = Config.US_MARKET_CLOSE  # '16:00'

        now = datetime.now(tz)

        # Markets are closed on weekends (Monday=0, Sunday=6)
        if now.weekday() >= 5:
            return False

        open_h, open_m = map(int, open_str.split(':'))
        close_h, close_m = map(int, close_str.split(':'))

        market_open = now.replace(hour=open_h, minute=open_m, second=0, microsecond=0)
        market_close = now.replace(hour=close_h, minute=close_m, second=0, microsecond=0)

        return market_open <= now <= market_close


# Module-level singleton -- populated by backend.jobs.register_all_jobs()
scheduler_manager = SchedulerManager()
