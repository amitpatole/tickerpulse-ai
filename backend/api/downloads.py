"""
StockPulse AI v3.0 - Downloads API Blueprint
Endpoints for repository download statistics.
"""

import logging
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request

from backend.database import pooled_session
from backend.core.error_handlers import handle_api_errors

logger = logging.getLogger(__name__)

bp = Blueprint('downloads', __name__, url_prefix='/api/downloads')


@bp.route('/stats', methods=['GET'])
@handle_api_errors
def get_download_stats():
    """Get aggregate download statistics.

    Query params:
        repo_owner (optional): Filter by repository owner (default: amitpatole)
        repo_name (optional): Filter by repository name (default: stockpulse-ai)
        limit (optional): Number of records to return (default: 10)

    Returns:
        JSON array of download statistics records
    """
    repo_owner = request.args.get('repo_owner', 'amitpatole')
    repo_name = request.args.get('repo_name', 'stockpulse-ai')
    limit = request.args.get('limit', 10, type=int)

    with pooled_session() as conn:
        rows = conn.execute(
            """
            SELECT
                id, repo_owner, repo_name, total_clones, unique_clones,
                period_start, period_end, recorded_at
            FROM download_stats
            WHERE repo_owner = ? AND repo_name = ?
            ORDER BY recorded_at DESC
            LIMIT ?
            """,
            (repo_owner, repo_name, limit)
        ).fetchall()

    stats = [
        {
            'id': row['id'],
            'repo_owner': row['repo_owner'],
            'repo_name': row['repo_name'],
            'total_clones': row['total_clones'],
            'unique_clones': row['unique_clones'],
            'period_start': row['period_start'],
            'period_end': row['period_end'],
            'recorded_at': row['recorded_at'],
        }
        for row in rows
    ]

    return jsonify({
        'success': True,
        'data': stats,
        'count': len(stats)
    })


@bp.route('/daily', methods=['GET'])
@handle_api_errors
def get_daily_downloads():
    """Get daily breakdown of downloads.

    Query params:
        repo_owner (optional): Filter by repository owner (default: amitpatole)
        repo_name (optional): Filter by repository name (default: stockpulse-ai)
        days (optional): Number of days to return (default: 30)

    Returns:
        JSON array of daily download records
    """
    repo_owner = request.args.get('repo_owner', 'amitpatole')
    repo_name = request.args.get('repo_name', 'stockpulse-ai')
    days = request.args.get('days', 30, type=int)

    cutoff_date = (datetime.utcnow() - timedelta(days=days)).strftime('%Y-%m-%d')

    with pooled_session() as conn:
        rows = conn.execute(
            """
            SELECT
                repo_owner, repo_name, date, clones, unique_clones
            FROM download_daily
            WHERE repo_owner = ? AND repo_name = ? AND date >= ?
            ORDER BY date DESC
            """,
            (repo_owner, repo_name, cutoff_date)
        ).fetchall()

    daily_stats = [
        {
            'repo_owner': row['repo_owner'],
            'repo_name': row['repo_name'],
            'date': row['date'],
            'clones': row['clones'],
            'unique_clones': row['unique_clones'],
        }
        for row in rows
    ]

    return jsonify({
        'success': True,
        'data': daily_stats,
        'count': len(daily_stats)
    })


@bp.route('/summary', methods=['GET'])
@handle_api_errors
def get_download_summary():
    """Get summary of download statistics.

    Query params:
        repo_owner (optional): Filter by repository owner (default: amitpatole)
        repo_name (optional): Filter by repository name (default: stockpulse-ai)

    Returns:
        JSON summary with latest stats, trends, and totals
    """
    repo_owner = request.args.get('repo_owner', 'amitpatole')
    repo_name = request.args.get('repo_name', 'stockpulse-ai')

    seven_days_ago = (datetime.utcnow() - timedelta(days=7)).strftime('%Y-%m-%d')
    with pooled_session() as conn:
        latest_row = conn.execute(
            """
            SELECT
                total_clones, unique_clones, period_start, period_end, recorded_at
            FROM download_stats
            WHERE repo_owner = ? AND repo_name = ?
            ORDER BY recorded_at DESC
            LIMIT 1
            """,
            (repo_owner, repo_name)
        ).fetchone()

        totals_row = conn.execute(
            """
            SELECT
                SUM(clones) as total_clones,
                SUM(unique_clones) as total_unique_clones,
                COUNT(*) as days_tracked,
                MIN(date) as first_date,
                MAX(date) as last_date
            FROM download_daily
            WHERE repo_owner = ? AND repo_name = ?
            """,
            (repo_owner, repo_name)
        ).fetchone()

        weekly_row = conn.execute(
            """
            SELECT
                SUM(clones) as weekly_clones,
                SUM(unique_clones) as weekly_unique_clones
            FROM download_daily
            WHERE repo_owner = ? AND repo_name = ? AND date >= ?
            """,
            (repo_owner, repo_name, seven_days_ago)
        ).fetchone()

    summary = {
        'repo': f"{repo_owner}/{repo_name}",
        'latest': None,
        'totals': None,
        'weekly': None,
    }

    if latest_row:
        summary['latest'] = {
            'total_clones': latest_row['total_clones'],
            'unique_clones': latest_row['unique_clones'],
            'period_start': latest_row['period_start'],
            'period_end': latest_row['period_end'],
            'recorded_at': latest_row['recorded_at'],
        }

    if totals_row and totals_row['total_clones']:
        summary['totals'] = {
            'total_clones': totals_row['total_clones'] or 0,
            'total_unique_clones': totals_row['total_unique_clones'] or 0,
            'days_tracked': totals_row['days_tracked'] or 0,
            'first_date': totals_row['first_date'],
            'last_date': totals_row['last_date'],
        }

    if weekly_row and weekly_row['weekly_clones']:
        summary['weekly'] = {
            'clones': weekly_row['weekly_clones'] or 0,
            'unique_clones': weekly_row['weekly_unique_clones'] or 0,
        }

    return jsonify({
        'success': True,
        'data': summary
    })
