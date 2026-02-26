"""
Scheduler REST API routes.

Provides endpoints for listing, inspecting, pausing, resuming, triggering,
and rescheduling jobs, as well as viewing job execution history.

Blueprint prefix: /api/scheduler
"""
import logging
from flask import Blueprint, jsonify, request

from backend.jobs._helpers import get_job_history
from backend.api.validators.scheduler_validators import validate_job_id, validate_trigger_args

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