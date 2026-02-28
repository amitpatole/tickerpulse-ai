"""
Scheduler REST API routes.

Provides endpoints for listing, inspecting, pausing, resuming, triggering,
and rescheduling jobs, as well as viewing job execution history.

Blueprint prefix: /api/scheduler
"""
import json
import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from backend.database import pooled_session
from backend.jobs._helpers import get_job_history
from backend.api.validators.scheduler_validators import (
    validate_job_id,
    validate_trigger_args,
    validate_schedule_body,
)
from backend.core.error_handlers import (
    ConflictError,
    DatabaseError,
    ValidationError,
    SchedulerJobNotFoundError,
    SchedulerOperationError,
    ServiceUnavailableError,
    handle_api_errors,
)

logger = logging.getLogger(__name__)

scheduler_bp = Blueprint('scheduler_routes', __name__, url_prefix='/api/scheduler')


def _get_scheduler_manager():
    """Lazily import the module-level SchedulerManager singleton."""
    from backend.scheduler import scheduler_manager
    return scheduler_manager


# -----------------------------------------------------------------------
# Jobs listing
# -----------------------------------------------------------------------

@scheduler_bp.route('/jobs', methods=['GET'])
@handle_api_errors
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
    return jsonify({'jobs': jobs, 'total': len(jobs)})


@scheduler_bp.route('/jobs/<job_id>', methods=['GET'])
@handle_api_errors
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
        raise ValidationError(err)

    sm = _get_scheduler_manager()
    job = sm.get_job(job_id)
    if not job:
        raise SchedulerJobNotFoundError(f"Job not found: {job_id}")

    # Attach recent execution history and scheduler timezone
    job['recent_history'] = get_job_history(job_id=job_id, limit=10)
    job['timezone'] = sm.get_scheduler_timezone()
    return jsonify(job)


# -----------------------------------------------------------------------
# Job control
# -----------------------------------------------------------------------

@scheduler_bp.route('/jobs/<job_id>/pause', methods=['POST'])
@handle_api_errors
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
        description: Invalid job_id format.
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Job not found.
        schema:
          $ref: '#/definitions/Error'
      500:
        description: APScheduler operation failed.
        schema:
          $ref: '#/definitions/Error'
    """
    ok, err = validate_job_id(job_id)
    if not ok:
        raise ValidationError(err)

    sm = _get_scheduler_manager()
    sm.pause_job(job_id)
    return jsonify({'success': True, 'job_id': job_id, 'status': 'paused'})


@scheduler_bp.route('/jobs/<job_id>/resume', methods=['POST'])
@handle_api_errors
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
        description: Invalid job_id format.
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Job not found.
        schema:
          $ref: '#/definitions/Error'
      500:
        description: APScheduler operation failed.
        schema:
          $ref: '#/definitions/Error'
    """
    ok, err = validate_job_id(job_id)
    if not ok:
        raise ValidationError(err)

    sm = _get_scheduler_manager()
    sm.resume_job(job_id)
    return jsonify({'success': True, 'job_id': job_id, 'status': 'resumed'})


@scheduler_bp.route('/jobs/<job_id>/trigger', methods=['POST'])
@handle_api_errors
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
        description: Invalid job_id format.
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Job not found.
        schema:
          $ref: '#/definitions/Error'
      500:
        description: APScheduler operation failed.
        schema:
          $ref: '#/definitions/Error'
    """
    ok, err = validate_job_id(job_id)
    if not ok:
        raise ValidationError(err)

    sm = _get_scheduler_manager()
    sm.trigger_job(job_id)
    return jsonify({
        'success': True,
        'job_id': job_id,
        'message': f'Job {job_id} triggered for immediate execution.',
    })


@scheduler_bp.route('/jobs/<job_id>/schedule', methods=['PUT'])
@handle_api_errors
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
      404:
        description: Job not found.
        schema:
          $ref: '#/definitions/Error'
      500:
        description: APScheduler operation failed.
        schema:
          $ref: '#/definitions/Error'
    """
    ok, err = validate_job_id(job_id)
    if not ok:
        raise ValidationError(err)

    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict) or 'trigger' not in data:
        raise ValidationError('Request body must include "trigger" (cron or interval).')

    trigger = data.pop('trigger')
    valid_triggers = ('cron', 'interval', 'date')
    if trigger not in valid_triggers:
        raise ValidationError(
            f'Invalid trigger type: {trigger}. Must be one of: {", ".join(valid_triggers)}'
        )

    ok, err = validate_trigger_args(trigger, data)
    if not ok:
        raise ValidationError(err)

    sm = _get_scheduler_manager()
    sm.update_job_schedule(job_id, trigger, **data)
    return jsonify({
        'success': True,
        'job_id': job_id,
        'message': f'Schedule updated to trigger={trigger} with args={data}.',
    })


# -----------------------------------------------------------------------
# Job history
# -----------------------------------------------------------------------

@scheduler_bp.route('/history', methods=['GET'])
@handle_api_errors
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
        raise ValidationError('Invalid limit: must be an integer.')

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
# Known agents
# -----------------------------------------------------------------------

@scheduler_bp.route('/agents', methods=['GET'])
@handle_api_errors
def list_known_agents():
    """Return the list of agent job IDs available for custom scheduling.
    ---
    tags:
      - Scheduler
    summary: List schedulable agents
    responses:
      200:
        description: Known agents that can be used in custom schedules.
    """
    sm = _get_scheduler_manager()
    jobs = sm.get_all_jobs()
    agents = [
        {
            'job_id': j.get('id', j.get('job_id', '')),
            'name': j.get('name', ''),
            'description': j.get('description', ''),
        }
        for j in jobs
    ]
    return jsonify({'agents': agents, 'total': len(agents)})


# -----------------------------------------------------------------------
# Agent schedule CRUD
# -----------------------------------------------------------------------

def _row_to_schedule(row) -> dict:
    """Convert an ``agent_schedules`` sqlite3.Row to a JSON-serialisable dict."""
    d = dict(row)
    try:
        d['trigger_args'] = json.loads(d.get('trigger_args') or '{}')
    except (ValueError, TypeError):
        d['trigger_args'] = {}
    d['enabled'] = bool(d.get('enabled', 1))
    return d


@scheduler_bp.route('/agent-schedules', methods=['GET'])
@handle_api_errors
def list_agent_schedules():
    """List all custom agent schedules.
    ---
    tags:
      - Scheduler
    summary: List custom agent schedules
    responses:
      200:
        description: All saved custom agent schedules.
      500:
        description: Database error.
    """
    try:
        with pooled_session() as conn:
            rows = conn.execute(
                "SELECT id, job_id, label, description, trigger, trigger_args, "
                "enabled, created_at, updated_at "
                "FROM agent_schedules ORDER BY created_at DESC"
            ).fetchall()
        schedules = [_row_to_schedule(r) for r in rows]
        return jsonify({'schedules': schedules, 'total': len(schedules)})
    except Exception as exc:
        logger.error("Failed to list agent schedules: %s", exc)
        raise DatabaseError("Database error.") from exc


@scheduler_bp.route('/agent-schedules', methods=['POST'])
@handle_api_errors
def create_agent_schedule():
    """Create a new custom agent schedule.
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
            label:
              type: string
            description:
              type: string
            trigger:
              type: string
              enum: [cron, interval]
            trigger_args:
              type: object
            enabled:
              type: boolean
    responses:
      201:
        description: Schedule created.
      400:
        description: Validation error.
      500:
        description: Database error.
    """
    data = request.get_json(silent=True) or {}
    ok, err = validate_schedule_body(data, require_all=True)
    if not ok:
        raise ValidationError(err)

    enabled = bool(data.get('enabled', True))
    trigger_args_json = json.dumps(data['trigger_args'])
    now = datetime.now(timezone.utc).isoformat()

    try:
        with pooled_session() as conn:
            existing = conn.execute(
                "SELECT id FROM agent_schedules WHERE job_id = ?", (data['job_id'],)
            ).fetchone()
            if existing:
                raise ConflictError(
                    f"A schedule for job_id '{data['job_id']}' already exists."
                )

            cursor = conn.execute(
                "INSERT INTO agent_schedules "
                "(job_id, label, description, trigger, trigger_args, enabled, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    data['job_id'],
                    data['label'].strip(),
                    data.get('description') or None,
                    data['trigger'],
                    trigger_args_json,
                    1 if enabled else 0,
                    now,
                    now,
                ),
            )
            schedule_id = cursor.lastrowid
            row = conn.execute(
                "SELECT id, job_id, label, description, trigger, trigger_args, "
                "enabled, created_at, updated_at FROM agent_schedules WHERE id = ?",
                (schedule_id,),
            ).fetchone()

        schedule = _row_to_schedule(row)

        sm = _get_scheduler_manager()
        if sm.get_job(data['job_id']):
            sm.update_job_schedule(data['job_id'], data['trigger'], **data['trigger_args'])

        return jsonify(schedule), 201
    except ConflictError:
        raise
    except Exception as exc:
        logger.error("Failed to create agent schedule: %s", exc)
        raise DatabaseError("Database error.") from exc


@scheduler_bp.route('/agent-schedules/<int:schedule_id>', methods=['PUT'])
@handle_api_errors
def update_agent_schedule(schedule_id: int):
    """Update an existing custom agent schedule.
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
        description: Schedule updated.
      400:
        description: Validation error.
      404:
        description: Schedule not found.
      500:
        description: Database error.
    """
    data = request.get_json(silent=True) or {}
    ok, err = validate_schedule_body(data, require_all=False)
    if not ok:
        raise ValidationError(err)

    try:
        with pooled_session() as conn:
            row = conn.execute(
                "SELECT id, job_id, label, description, trigger, trigger_args, enabled "
                "FROM agent_schedules WHERE id = ?",
                (schedule_id,),
            ).fetchone()
            if not row:
                raise SchedulerJobNotFoundError(f"Schedule {schedule_id} not found.")

            existing = _row_to_schedule(row)

            # Merge incoming fields onto the existing record
            new_job_id = data.get('job_id', existing['job_id'])
            new_label = data.get('label', existing['label'])
            if isinstance(new_label, str):
                new_label = new_label.strip()
            new_description = data.get('description', existing['description'])
            new_trigger = data.get('trigger', existing['trigger'])
            new_trigger_args = data.get('trigger_args', existing['trigger_args'])
            new_enabled = data.get('enabled', existing['enabled'])
            now = datetime.now(timezone.utc).isoformat()

            conn.execute(
                "UPDATE agent_schedules SET job_id=?, label=?, description=?, "
                "trigger=?, trigger_args=?, enabled=?, updated_at=? WHERE id=?",
                (
                    new_job_id,
                    new_label,
                    new_description,
                    new_trigger,
                    json.dumps(new_trigger_args),
                    1 if new_enabled else 0,
                    now,
                    schedule_id,
                ),
            )
            updated_row = conn.execute(
                "SELECT id, job_id, label, description, trigger, trigger_args, "
                "enabled, created_at, updated_at FROM agent_schedules WHERE id = ?",
                (schedule_id,),
            ).fetchone()

        schedule = _row_to_schedule(updated_row)

        sm = _get_scheduler_manager()
        sm.register_custom_schedule(
            schedule_id=schedule_id,
            job_id=new_job_id,
            label=new_label,
            trigger=new_trigger,
            trigger_args=new_trigger_args,
            enabled=bool(new_enabled),
        )

        return jsonify(schedule)
    except (SchedulerJobNotFoundError, ValidationError):
        raise
    except Exception as exc:
        logger.error("Failed to update agent schedule %d: %s", schedule_id, exc)
        raise DatabaseError("Database error.") from exc


@scheduler_bp.route('/agent-schedules/<int:schedule_id>', methods=['DELETE'])
@handle_api_errors
def delete_agent_schedule(schedule_id: int):
    """Delete a custom agent schedule.
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
        description: Schedule deleted.
      404:
        description: Schedule not found.
      500:
        description: Database error.
    """
    try:
        with pooled_session() as conn:
            row = conn.execute(
                "SELECT id FROM agent_schedules WHERE id = ?", (schedule_id,)
            ).fetchone()
            if not row:
                raise SchedulerJobNotFoundError(f"Schedule {schedule_id} not found.")
            conn.execute("DELETE FROM agent_schedules WHERE id = ?", (schedule_id,))

        sm = _get_scheduler_manager()
        sm.remove_custom_schedule(schedule_id)

        return jsonify({'success': True, 'id': schedule_id})
    except SchedulerJobNotFoundError:
        raise
    except Exception as exc:
        logger.error("Failed to delete agent schedule %d: %s", schedule_id, exc)
        raise DatabaseError("Database error.") from exc


@scheduler_bp.route('/agent-schedules/<int:schedule_id>/trigger', methods=['POST'])
@handle_api_errors
def trigger_agent_schedule(schedule_id: int):
    """Trigger immediate execution of a custom agent schedule.
    ---
    tags:
      - Scheduler
    summary: Trigger custom agent schedule immediately
    parameters:
      - name: schedule_id
        in: path
        type: integer
        required: true
    responses:
      200:
        description: Schedule triggered.
      404:
        description: Schedule not found.
      503:
        description: Scheduler is not running.
      500:
        description: APScheduler operation failed.
    """
    try:
        with pooled_session() as conn:
            row = conn.execute(
                "SELECT id, job_id, label FROM agent_schedules WHERE id = ?",
                (schedule_id,),
            ).fetchone()
            if not row:
                raise SchedulerJobNotFoundError(f"Schedule {schedule_id} not found.")
            job_id = row['job_id']
            label = row['label']
    except (SchedulerJobNotFoundError, ValidationError):
        raise
    except Exception as exc:
        logger.error("Failed to fetch agent schedule %d: %s", schedule_id, exc)
        raise DatabaseError("Database error.") from exc

    sm = _get_scheduler_manager()

    if not sm.scheduler:
        raise ServiceUnavailableError("Scheduler is not running.")

    ok = sm.trigger_job(job_id)
    if not ok:
        return jsonify({'success': False, 'job_id': job_id, 'schedule_id': schedule_id}), 400

    return jsonify({'success': True, 'job_id': job_id, 'schedule_id': schedule_id})