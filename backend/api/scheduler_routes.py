```python
"""
Scheduler REST API routes.

Provides endpoints for listing, inspecting, pausing, resuming, triggering,
and rescheduling jobs, as well as viewing job execution history.

Blueprint prefix: /api/scheduler
"""
import json
import logging
import threading
from flask import Blueprint, jsonify, request

from backend.database import db_session
from backend.jobs._helpers import get_job_history
from backend.api.validators.scheduler_validators import validate_job_id, validate_trigger_args

logger = logging.getLogger(__name__)

scheduler_bp = Blueprint('scheduler_routes', __name__, url_prefix='/api/scheduler')

# Serialises the DB write + APScheduler sync for agent-schedule mutations.
#
# Without this lock two concurrent PUT /agent-schedules/<id> requests can both
# commit their UPDATE and then call _sync_to_scheduler in an arbitrary order,
# leaving APScheduler in a state that does not match the last DB commit (Race A).
# The lock also prevents read-modify-write races in the cross-validation path
# (Race B).  BEGIN IMMEDIATE in db_session adds a second layer of protection for
# multi-process deployments where a per-process lock is insufficient.
_schedule_write_lock = threading.Lock()


def _get_scheduler_manager():
    """Lazily import the module-level SchedulerManager singleton."""
    from backend.scheduler import scheduler_manager
    return scheduler_manager


# -----------------------------------------------------------------------
# Jobs listing
# -----------------------------------------------------------------------

@scheduler_bp.route('/jobs', methods=['GET'])
def list_jobs():
    """List all registered jobs with their current status.
    ---
    tags:
      - Scheduler
    summary: List all scheduled jobs
    responses:
      200:
        description: All registered jobs with status and schedule metadata.
        schema:
          type: object
          properties:
            jobs:
              type: array
              items:
                $ref: '#/definitions/SchedulerJob'
            total:
              type: integer
              example: 6
    """
    sm = _get_scheduler_manager()
    jobs = sm.get_all_jobs()
    tz = sm.get_scheduler_timezone()
    for job in jobs:
        job['timezone'] = tz

    # Enrich each job with last execution info from job_history
    try:
        import sqlite3
        from backend.config import Config
        conn = sqlite3.connect(Config.DB_PATH)
        conn.row_factory = sqlite3.Row
        for job in jobs:
            row = conn.execute(
                'SELECT executed_at, status FROM job_history'
                ' WHERE job_id = ? ORDER BY executed_at DESC LIMIT 1',
                (job['id'],),
            ).fetchone()
            if row:
                job['last_run'] = row['executed_at']
                job['last_run_status'] = row['status']
            else:
                job['last_run'] = None
                job['last_run_status'] = None
        conn.close()
    except Exception as exc:
        logger.warning("Failed to enrich jobs with last_run: %s", exc)
        for job in jobs:
            job.setdefault('last_run', None)
            job.setdefault('last_run_status', None)

    return jsonify({'jobs': jobs, 'total': len(jobs)})


@scheduler_bp.route('/jobs/<job_id>', methods=['GET'])
def get_job(job_id):
    """Get detailed information about a specific scheduled job.
    ---
    tags:
      - Scheduler
    summary: Get job details
    parameters:
      - name: job_id
        in: path
        type: string
        required: true
        description: Unique job identifier.
        example: news_monitor
    responses:
      200:
        description: Job details including recent execution history.
        schema:
          $ref: '#/definitions/SchedulerJob'
      400:
        description: Invalid job_id format.
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Job not found.
        schema:
          $ref: '#/definitions/Error'
    """
    ok, err = validate_job_id(job_id)
    if not ok:
        return jsonify({'success': False, 'error': err}), 400

    sm = _get_scheduler_manager()
    job = sm.get_job(job_id)
    if not job:
        return jsonify({'error': f'Job not found: {job_id}'}), 404

    # Attach recent execution history and scheduler timezone
    job['recent_history'] = get_job_history(job_id=job_id, limit=10)
    job['timezone'] = sm.get_scheduler_timezone()
    return jsonify(job)


# -----------------------------------------------------------------------
# Job control
# -----------------------------------------------------------------------

@scheduler_bp.route('/jobs/<job_id>/pause', methods=['POST'])
def pause_job(job_id):
    """Pause a scheduled job.
    ---
    tags:
      - Scheduler
    summary: Pause a scheduled job
    parameters:
      - name: job_id
        in: path
        type: string
        required: true
        description: Job identifier to pause.
        example: news_monitor
    responses:
      200:
        description: Job paused successfully.
        schema:
          $ref: '#/definitions/SuccessResponse'
      400:
        description: Invalid job_id or pause failed.
        schema:
          $ref: '#/definitions/Error'
    """
    ok, err = validate_job_id(job_id)
    if not ok:
        return jsonify({'success': False, 'error': err}), 400

    sm = _get_scheduler_manager()
    success = sm.pause_job(job_id)
    if success:
        return jsonify({'success': True, 'job_id': job_id, 'status': 'paused'})
    return jsonify({'success': False, 'error': f'Failed to pause job: {job_id}'}), 400


@scheduler_bp.route('/jobs/<job_id>/resume', methods=['POST'])
def resume_job(job_id):
    """Resume a paused scheduled job.
    ---
    tags:
      - Scheduler
    summary: Resume a paused job
    parameters:
      - name: job_id
        in: path
        type: string
        required: true
        description: Job identifier to resume.
        example: news_monitor
    responses:
      200:
        description: Job resumed successfully.
        schema:
          $ref: '#/definitions/SuccessResponse'
      400:
        description: Invalid job_id or resume failed.
        schema:
          $ref: '#/definitions/Error'
    """
    ok, err = validate_job_id(job_id)
    if not ok:
        return jsonify({'success': False, 'error': err}), 400

    sm = _get_scheduler_manager()
    success = sm.resume_job(job_id)
    if success:
        return jsonify({'success': True, 'job_id': job_id, 'status': 'resumed'})
    return jsonify({'success': False, 'error': f'Failed to resume job: {job_id}'}), 400


@scheduler_bp.route('/jobs/<job_id>/trigger', methods=['POST'])
def trigger_job(job_id):
    """Trigger immediate execution of a scheduled job.
    ---
    tags:
      - Scheduler
    summary: Trigger a job immediately
    parameters:
      - name: job_id
        in: path
        type: string
        required: true
        description: Job identifier to trigger.
        example: news_monitor
    responses:
      200:
        description: Job triggered for immediate execution.
        schema:
          $ref: '#/definitions/SuccessResponse'
      400:
        description: Invalid job_id or trigger failed.
        schema:
          $ref: '#/definitions/Error'
    """
    ok, err = validate_job_id(job_id)
    if not ok:
        return jsonify({'success': False, 'error': err}), 400

    sm = _get_scheduler_manager()
    success = sm.trigger_job(job_id)
    if success:
        return jsonify({
            'success': True,
            'job_id': job_id,
            'message': f'Job {job_id} triggered for immediate execution.',
        })
    return jsonify({'success': False, 'error': f'Failed to trigger job: {job_id}'}), 400


@scheduler_bp.route('/jobs/<job_id>/schedule', methods=['PUT'])
def update_schedule(job_id):
    """Update a job's schedule trigger.
    ---
    tags:
      - Scheduler
    summary: Reschedule a job
    consumes:
      - application/json
    parameters:
      - name: job_id
        in: path
        type: string
        required: true
        description: Job identifier to reschedule.
        example: news_monitor
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - trigger
          properties:
            trigger:
              type: string
              enum: [cron, interval, date]
              description: Trigger type.
              example: cron
            hour:
              type: integer
              description: Cron hour field (0–23).
            minute:
              type: integer
              description: Cron minute field (0–59).
            day_of_week:
              type: string
              description: Cron day_of_week field (e.g. 'mon-fri').
            minutes:
              type: integer
              description: Interval trigger — repeat every N minutes.
    responses:
      200:
        description: Schedule updated successfully.
        schema:
          $ref: '#/definitions/SuccessResponse'
      400:
        description: Invalid job_id, missing trigger, or invalid trigger arguments.
        schema:
          $ref: '#/definitions/Error'
    """
    ok, err = validate_job_id(job_id)
    if not ok:
        return jsonify({'success': False, 'error': err}), 400

    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict) or 'trigger' not in data:
        return jsonify({
            'success': False,
            'error': 'Request body must include "trigger" (cron or interval).',
        }), 400

    trigger = data.pop('trigger')
    valid_triggers = ('cron', 'interval', 'date')
    if trigger not in valid_triggers:
        return jsonify({
            'success': False,
            'error': f'Invalid trigger type: {trigger}. Must be one of: {", ".join(valid_triggers)}',
        }), 400

    ok, err = validate_trigger_args(trigger, data)
    if not ok:
        return jsonify({'success': False, 'error': err}), 400

    sm = _get_scheduler_manager()
    success = sm.update_job_schedule(job_id, trigger, **data)
    if success:
        return jsonify({
            'success': True,
            'job_id': job_id,
            'message': f'Schedule updated to trigger={trigger} with args={data}.',
        })
    return jsonify({'success': False, 'error': f'Failed to update schedule for: {job_id}'}), 400


# -----------------------------------------------------------------------
# Job history
# -----------------------------------------------------------------------

@scheduler_bp.route('/history', methods=['GET'])
def job_execution_history():
    """Get job execution history.
    ---
    tags:
      - Scheduler
    summary: Get job execution history
    description: >
      Returns past job execution records, optionally filtered by job ID.
      Results are ordered by most recent execution first.
    parameters:
      - in: query
        name: job_id
        type: string
        required: false
        description: Filter records to a specific job ID.
        example: news_monitor
      - in: query
        name: limit
        type: integer
        required: false
        default: 50
        description: Maximum number of records to return (capped at 200).
    responses:
      200:
        description: Execution history with applied filter metadata.
        schema:
          type: object
          properties:
            history:
              type: array
              items:
                type: object
                properties:
                  job_id:
                    type: string
                    example: news_monitor
                  status:
                    type: string
                    enum: [completed, failed, running]
                    example: completed
                  executed_at:
                    type: string
                    format: date-time
                  result_summary:
                    type: string
                    example: Processed 12 articles
            total:
              type: integer
              example: 50
            filters:
              type: object
              properties:
                job_id:
                  type: string
                limit:
                  type: integer
      400:
        description: Invalid limit parameter.
        schema:
          $ref: '#/definitions/Error'
    """
    job_id = request.args.get('job_id', None)
    raw_limit = request.args.get('limit', 50)
    try:
        limit = min(int(raw_limit), 200)
    except (ValueError, TypeError):
        return jsonify({'success': False, 'error': 'Invalid limit: must be an integer.'}), 400

    history = get_job_history(job_id=job_id, limit=limit)
    return jsonify({
        'history': history,
        'total': len(history),
        'filters': {
            'job_id': job_id,
            'limit': limit,
        },
    })


# -----------------------------------------------------------------------
# Known agents — registry listing
# -----------------------------------------------------------------------

@scheduler_bp.route('/agents', methods=['GET'])
def list_known_agents() -> tuple:
    """List all known agent job IDs from the APScheduler registry.
    ---
    tags:
      - Scheduler
    summary: List known agent names
    responses:
      200:
        description: All registered scheduler jobs usable as agent schedule targets.
        schema:
          type: object
          properties:
            agents:
              type: array
              items:
                type: object
                properties:
                  job_id:
                    type: string
                    example: morning_briefing
                  name:
                    type: string
                    example: Morning Briefing
                  description:
                    type: string
            total:
              type: integer
      500:
        description: Internal server error.
    """
    try:
        sm = _get_scheduler_manager()
        jobs = sm.get_all_jobs()
        agents = [
            {
                'job_id': job['id'],
                'name': job.get('name', job['id']),
                'description': job.get('description', '') or '',
            }
            for job in jobs
        ]
        return jsonify({'agents': agents, 'total': len(agents)})
    except Exception as exc:
        logger.exception("Failed to list known agents: %s", exc)
        return jsonify({'error': 'Internal server error'}), 500


# -----------------------------------------------------------------------
# Agent schedules — persisted CRUD
# -----------------------------------------------------------------------

def _row_to_schedule(row: object) -> dict:
    """Deserialise a DB row into a JSON-safe dict."""
    item = dict(row)  # type: ignore[arg-type]
    try:
        item['trigger_args'] = json.loads(item['trigger_args'])
    except (json.JSONDecodeError, TypeError):
        item['trigger_args'] = {}
    item['enabled'] = bool(item['enabled'])
    return item


def _sync_to_scheduler(job_id: str, trigger: str, trigger_args: dict) -> None:
    """Push a schedule change to the live APScheduler instance if the job exists."""
    try:
        sm = _get_scheduler_manager()
        if sm.get_job(job_id):
            sm.update_job_schedule(job_id, trigger, **trigger_args)
            logger.info("Synced persisted schedule to scheduler: job=%s trigger=%s", job_id, trigger)
    except Exception as exc:
        logger.warning("Could not sync schedule to scheduler for %s: %s", job_id, exc)


_SELECT_COLS = (
    'id, job_id, label, description, trigger, trigger_args, enabled, created_at, updated_at'
)


@scheduler_bp.route('/agent-schedules', methods=['GET'])
def list_agent_schedules() -> tuple:
    """List all persisted agent schedules.
    ---
    tags:
      - Scheduler
    summary: List agent schedules
    responses:
      200:
        description: All persisted agent schedules.
    """
    try:
        with db_session() as conn:
            rows = conn.execute(
                f'SELECT {_SELECT_COLS} FROM agent_schedules ORDER BY created_at DESC'
            ).fetchall()
        return jsonify({'schedules': [_row_to_schedule(r) for r in rows], 'total': len(rows)})
    except Exception as exc:
        logger.exception("Failed to list agent schedules: %s", exc)
        return jsonify({'error': 'Internal server error'}), 500


@scheduler_bp.route('/agent-schedules', methods=['POST'])
def create_agent_schedule() -> tuple:
    """Create a new agent schedule.
    ---
    tags:
      - Scheduler
    summary: Create agent schedule
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required: [job_id, label, trigger, trigger_args]
          properties:
            job_id:
              type: string
              example: morning_briefing
            label:
              type: string
              example: Morning Briefing (custom)
            description:
              type: string
            trigger:
              type: string
              enum: [cron, interval]
            trigger_args:
              type: object
    responses:
      201:
        description: Schedule created.
      400:
        description: Validation error.
      409:
        description: job_id already exists.
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({'error': 'Request body must be JSON.'}), 400

    job_id: str = str(data.get('job_id', '')).strip()
    label: str = str(data.get('label', '')).strip()
    if not job_id:
        return jsonify({'error': 'job_id is required.'}), 400
    if not label:
        return jsonify({'error': 'label is required.'}), 400

    ok, err = validate_job_id(job_id)
    if not ok:
        return jsonify({'error': err}), 400

    trigger: str = str(data.get('trigger', 'interval'))
    if trigger not in ('cron', 'interval'):
        return jsonify({'error': 'trigger must be "cron" or "interval".'}), 400

    trigger_args: object = data.get('trigger_args', {})
    if not isinstance(trigger_args, dict):
        return jsonify({'error': 'trigger_args must be an object.'}), 400

    ok, err = validate_trigger_args(trigger, trigger_args)
    if not ok:
        return jsonify({'error': err}), 400

    description: str | None = data.get('description') or None
    enabled: int = int(bool(data.get('enabled', True)))

    try:
        with _schedule_write_lock:
            with db_session(immediate=True) as conn:
                conn.execute(
                    'INSERT INTO agent_schedules'
                    ' (job_id, label, description, trigger, trigger_args, enabled)'
                    ' VALUES (?, ?, ?, ?, ?, ?)',
                    (job_id, label, description, trigger, json.dumps(trigger_args), enabled),
                )
                row = conn.execute(
                    f'SELECT {_SELECT_COLS} FROM agent_schedules WHERE job_id = ?', (job_id,)
                ).fetchone()
            item = _row_to_schedule(row)
            _sync_to_scheduler(job_id, trigger, trigger_args)
        return jsonify(item), 201
    except Exception as exc:
        if 'UNIQUE' in str(exc).upper():
            return jsonify({'error': f'Schedule with job_id "{job_id}" already exists.'}), 409
        logger.exception("Failed to create agent schedule: %s", exc)
        return jsonify({'error': 'Internal server error'}), 500


@scheduler_bp.route('/agent-schedules/<int:schedule_id>', methods=['PUT'])
def update_agent_schedule(schedule_id: int) -> tuple:
    """Update an existing agent schedule.
    ---
    tags:
      - Scheduler
    summary: Update agent schedule
    parameters:
      - name: schedule_id
        in: path
        type: integer
        required: true
    responses:
      200:
        description: Updated schedule.
      400:
        description: Validation error.
      404:
        description: Schedule not found.
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({'error': 'Request body must be JSON.'}), 400

    allowed: set[str] = {'label', 'description', 'trigger', 'trigger_args', 'enabled'}
    updates: dict = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return jsonify({'error': 'No valid fields to update.'}), 400

    if 'trigger' in updates and updates['trigger'] not in ('cron', 'interval'):
        return jsonify({'error': 'trigger must be "cron" or "interval".'}), 400

    if 'trigger_args' in updates:
        if not isinstance(updates['trigger_args'], dict):
            return jsonify({'error': 'trigger_args must be an object.'}), 400
        if 'trigger' in updates:
            ok, err = validate_trigger_args(updates['trigger'], updates['trigger_args'])
            if not ok:
                return jsonify({'error': err}), 400

    # Pre-compute which cases need the cross-validation DB read and whether
    # trigger_args needs to be JSON-serialised.  Both are resolved inside the
    # critical section below so that no other writer can change the row between
    # the validation read and the UPDATE (Race B).
    needs_cross_validation = 'trigger' in updates and 'trigger_args' not in updates
    trigger_args_provided = 'trigger_args' in updates

    if trigger_args_provided:
        updates['trigger_args'] = json.dumps(updates['trigger_args'])

    if 'enabled' in updates:
        updates['enabled'] = int(bool(updates['enabled']))

    set_clause = ', '.join(f'{k} = ?' for k in updates)
    sql_values = list(updates.values()) + [schedule_id]

    # --- Critical section -------------------------------------------------------
    # The threading lock serialises the entire validate → write → sync sequence
    # so that two concurrent requests cannot interleave their DB writes and
    # APScheduler syncs (Race A).  BEGIN IMMEDIATE inside db_session adds a
    # second layer of protection for multi-process deployments (e.g. gunicorn
    # sync workers) where a per-process lock is insufficient.
    with _schedule_write_lock:
        try:
            with db_session(immediate=True) as conn:
                # Cross-validate: trigger type changed but caller didn't supply new args.
                # Read current args inside the IMMEDIATE transaction to avoid TOCTOU.
                if needs_cross_validation:
                    existing = conn.execute(
                        'SELECT trigger_args FROM agent_schedules WHERE id = ?',
                        (schedule_id,),
                    ).fetchone()
                    if not existing:
                        return jsonify({'error': f'Schedule {schedule_id} not found.'}), 404
                    try:
                        current_args: dict = json.loads(existing['trigger_args'])
                    except (json.JSONDecodeError, TypeError):
                        current_args = {}
                    ok, err = validate_trigger_args(updates['trigger'], current_args)
                    if not ok:
                        return jsonify({
                            'error': (
                                f"Existing trigger_args are incompatible with "
                                f"trigger='{updates['trigger']}': {err} "
                                "Provide trigger_args alongside trigger."
                            ),
                        }), 400

                result = conn.execute(
                    f'UPDATE agent_schedules SET {set_clause}, updated_at = CURRENT_TIMESTAMP'
                    f' WHERE id = ?',
                    sql_values,
                )
                if result.rowcount == 0:
                    return jsonify({'error': f'Schedule {schedule_id} not found.'}), 404
                row = conn.execute(
                    f'SELECT {_SELECT_COLS} FROM agent_schedules WHERE id = ?', (schedule_id,)
                ).fetchone()
            item = _row_to_schedule(row)
            if 'trigger' in updates or trigger_args_provided:
                _sync_to_scheduler(item['job_id'], item['trigger'], item['trigger_args'])
            return jsonify(item)
        except Exception as exc:
            logger.exception("Failed to update agent schedule %s: %s", schedule_id, exc)
            return jsonify({'error': 'Internal server error'}), 500


@scheduler_bp.route('/agent-schedules/<int:schedule_id>', methods=['DELETE'])
def delete_agent_schedule(schedule_id: int) -> tuple:
    """Delete a persisted agent schedule.
    ---
    tags:
      - Scheduler
    summary: Delete agent schedule
    parameters:
      - name: schedule_id
        in: path
        type: integer
        required: true
    responses:
      200:
        description: Deleted successfully.
      404:
        description: Schedule not found.
    """
    try:
        with db_session() as conn:
            result = conn.execute(
                'DELETE FROM agent_schedules WHERE id = ?', (schedule_id,)
            )
        if result.rowcount == 0:
            return jsonify({'error': f'Schedule {schedule_id} not found.'}), 404
        return jsonify({'success': True, 'id': schedule_id})
    except Exception as exc:
        logger.exception("Failed to delete agent schedule %s: %s", schedule_id, exc)
        return jsonify({'error': 'Internal server error'}), 500


@scheduler_bp.route('/agent-schedules/<int:schedule_id>/trigger', methods=['POST'])
def trigger_agent_schedule(schedule_id: int) -> tuple:
    """Immediately trigger the job associated with an agent schedule.
    ---
    tags:
      - Scheduler
    summary: Trigger agent schedule job immediately
    parameters:
      - name: schedule_id
        in: path
        type: integer
        required: true
    responses:
      200:
        description: Job triggered successfully.
      400:
        description: Trigger failed.
      404:
        description: Schedule not found.
      500:
        description: Internal server error.
    """
    try:
        with db_session() as conn:
            row = conn.execute(
                'SELECT job_id FROM agent_schedules WHERE id = ?', (schedule_id,)
            ).fetchone()
    except Exception as exc:
        logger.exception("DB error looking up schedule %s: %s", schedule_id, exc)
        return jsonify({'error': 'Internal server error'}), 500

    if not row:
        return jsonify({'error': f'Schedule {schedule_id} not found.'}), 404

    job_id = row['job_id']
    sm = _get_scheduler_manager()
    success = sm.trigger_job(job_id)
    if success:
        return jsonify({
            'success': True,
            'schedule_id': schedule_id,
            'job_id': job_id,
            'message': f'Job {job_id} triggered for immediate execution.',
        })
    return jsonify({'success': False, 'error': f'Failed to trigger job: {job_id}'}), 400
```