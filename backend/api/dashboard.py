"""
TickerPulse AI v3.0 - Dashboard Summary API
Aggregated endpoint returning KPI counts in a single response to eliminate
waterfall requests on page load.
"""

import json
import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify, current_app

from backend.database import get_db_connection

logger = logging.getLogger(__name__)

dashboard_bp = Blueprint('dashboard', __name__, url_prefix='/api/dashboard')


@dashboard_bp.route('/summary', methods=['GET'])
def get_dashboard_summary():
    """Return aggregated KPI counts for the dashboard in a single call.
    ---
    tags:
      - System
    responses:
      200:
        description: Dashboard KPI summary including stock counts, alert count, market regime, and agent status.
        schema:
          type: object
          properties:
            stock_count:
              type: integer
              description: Total number of stocks in the stocks table.
              example: 12
            active_stock_count:
              type: integer
              description: Number of active (non-deleted) stocks.
              example: 10
            active_alert_count:
              type: integer
              description: Number of alerts triggered in the last 24 hours.
              example: 3
            market_regime:
              type: string
              description: Last assessed market regime from the regime check job.
              example: Normal
            agent_status:
              type: object
              properties:
                total:
                  type: integer
                  example: 4
                running:
                  type: integer
                  example: 1
                idle:
                  type: integer
                  example: 3
                error:
                  type: integer
                  example: 0
            timestamp:
              type: string
              format: date-time
    """
    result = {
        'stock_count': 0,
        'active_stock_count': 0,
        'active_alert_count': 0,
        'market_regime': 'Normal',
        'agent_status': {'total': 0, 'running': 0, 'idle': 0, 'error': 0},
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }

    conn = get_db_connection()
    try:
        # Stock counts
        row = conn.execute(
            "SELECT COUNT(*) AS total,"
            " SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active"
            " FROM stocks"
        ).fetchone()
        if row:
            result['stock_count'] = int(row['total'] or 0)
            result['active_stock_count'] = int(row['active'] or 0)

        # Active alerts in the last 24 hours
        alert_row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM alerts"
            " WHERE created_at >= datetime('now', '-1 day')"
        ).fetchone()
        if alert_row:
            result['active_alert_count'] = int(alert_row['cnt'] or 0)

        # Market regime from most recent completed regime check job
        regime_row = conn.execute(
            "SELECT result_summary FROM job_history"
            " WHERE job_id = 'regime_check' AND status = 'completed'"
            " ORDER BY executed_at DESC LIMIT 1"
        ).fetchone()
        if regime_row and regime_row['result_summary']:
            try:
                summary = json.loads(regime_row['result_summary'])
                regime = summary.get('regime')
                if regime and isinstance(regime, str):
                    result['market_regime'] = regime
            except (json.JSONDecodeError, TypeError, AttributeError):
                pass

    except Exception as exc:
        logger.warning("get_dashboard_summary: DB query failed: %s", exc)
    finally:
        conn.close()

    # Agent status from the in-process registry (best-effort)
    try:
        registry = current_app.extensions.get('agent_registry')
        if registry:
            agents = registry.list_agents()
            counts = {'total': len(agents), 'running': 0, 'idle': 0, 'error': 0}
            for agent in agents:
                status = agent.get('status', 'idle')
                if status == 'running':
                    counts['running'] += 1
                elif status == 'error':
                    counts['error'] += 1
                else:
                    counts['idle'] += 1
            result['agent_status'] = counts
    except Exception as exc:
        logger.warning("get_dashboard_summary: agent registry read failed: %s", exc)

    return jsonify(result)
