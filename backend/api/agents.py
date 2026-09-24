"""
TickerPulse AI v3.0 - Agents API Routes
Blueprint for agent management, execution, run history, and cost tracking.

All routes return stub/placeholder data since the agent execution system is
not yet implemented. The route structure and response schemas are designed to
be forward-compatible with the real agent framework.
"""

from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta
import sqlite3
import random
import time
import logging

from backend.config import Config

logger = logging.getLogger(__name__)

agents_bp = Blueprint('agents', __name__, url_prefix='/api')

# ---------------------------------------------------------------------------
# Placeholder agent registry -- replaced by real agent discovery once the
# agent framework (CrewAI / OpenClaw) is wired up.
# ---------------------------------------------------------------------------

_STUB_AGENTS = [
    {
        'name': 'sentiment_analyst',
        'display_name': 'Sentiment Analyst',
        'description': 'Analyzes news and social media sentiment for monitored stocks',
        'category': 'analysis',
        'schedule': '*/30 * * * *',
        'status': 'idle',
        'last_run': None,
        'avg_duration_seconds': None,
        'total_runs': 0,
        'enabled': True
    },
    {
        'name': 'technical_analyst',
        'display_name': 'Technical Analyst',
        'description': 'Runs technical indicator analysis (RSI, MACD, moving averages) across watchlist',
        'category': 'analysis',
        'schedule': '0 * * * *',
        'status': 'idle',
        'last_run': None,
        'avg_duration_seconds': None,
        'total_runs': 0,
        'enabled': True
    },
    {
        'name': 'news_scanner',
        'display_name': 'News Scanner',
        'description': 'Scans multiple news sources for articles about monitored stocks',
        'category': 'data_collection',
        'schedule': '*/15 * * * *',
        'status': 'idle',
        'last_run': None,
        'avg_duration_seconds': None,
        'total_runs': 0,
        'enabled': True
    },
    {
        'name': 'risk_monitor',
        'display_name': 'Risk Monitor',
        'description': 'Monitors portfolio risk metrics and generates alerts on threshold breaches',
        'category': 'monitoring',
        'schedule': '*/10 * * * *',
        'status': 'idle',
        'last_run': None,
        'avg_duration_seconds': None,
        'total_runs': 0,
        'enabled': True
    },
    {
        'name': 'report_generator',
        'display_name': 'Report Generator',
        'description': 'Generates daily and weekly summary reports of market activity',
        'category': 'reporting',
        'schedule': '0 18 * * *',
        'status': 'idle',
        'last_run': None,
        'avg_duration_seconds': None,
        'total_runs': 0,
        'enabled': True
    },
    {
        'name': 'researcher',
        'display_name': 'Deep Researcher',
        'description': 'Generates in-depth research briefs with AI-powered analysis',
        'category': 'research',
        'schedule': None,
        'status': 'idle',
        'last_run': None,
        'avg_duration_seconds': None,
        'total_runs': 0,
        'enabled': True
    },
]


def _find_agent(name):
    """Look up a stub agent by name. Returns None if not found."""
    for agent in _STUB_AGENTS:
        if agent['name'] == name:
            return agent
    return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@agents_bp.route('/agents', methods=['GET'])
def list_agents():
    """List all registered agents with their current status.

    Query Parameters:
        category (str, optional): Filter by agent category
            (analysis, data_collection, monitoring, reporting).
        enabled (str, optional): Filter by enabled status ('true' or 'false').

    Returns:
        JSON object with:
        - agents: Array of agent summary objects.
        - total: Total count of agents returned.
    """
    category = request.args.get('category', None)
    enabled_filter = request.args.get('enabled', None)

    agents = list(_STUB_AGENTS)

    if category:
        agents = [a for a in agents if a['category'] == category]

    if enabled_filter is not None:
        enabled_bool = enabled_filter.lower() == 'true'
        agents = [a for a in agents if a['enabled'] == enabled_bool]

    # Enrich with last_run data from DB
    try:
        conn = sqlite3.connect(Config.DB_PATH)
        conn.row_factory = sqlite3.Row
        for agent in agents:
            row = conn.execute(
                'SELECT * FROM agent_runs WHERE agent_name = ? ORDER BY started_at DESC LIMIT 1',
                (agent['name'],)
            ).fetchone()
            if row:
                agent['last_run'] = {
                    'id': row['id'],
                    'agent_name': row['agent_name'],
                    'status': row['status'],
                    'started_at': row['started_at'],
                    'completed_at': row['completed_at'],
                    'duration_ms': row['duration_ms'] or 0,
                    'tokens_used': (row['tokens_input'] or 0) + (row['tokens_output'] or 0),
                    'estimated_cost': row['estimated_cost'] or 0,
                }
                # Update total_runs from DB
                count = conn.execute(
                    'SELECT COUNT(*) FROM agent_runs WHERE agent_name = ?',
                    (agent['name'],)
                ).fetchone()[0]
                agent['total_runs'] = count
                # Compute total_cost
                total_cost = conn.execute(
                    'SELECT COALESCE(SUM(estimated_cost), 0) FROM agent_runs WHERE agent_name = ?',
                    (agent['name'],)
                ).fetchone()[0]
                agent['total_cost'] = round(total_cost, 4)
        conn.close()
    except Exception as e:
        logger.error(f"Failed to enrich agents with run data: {e}")

    return jsonify({
        'agents': agents,
        'total': len(agents)
    })


@agents_bp.route('/agents/<name>', methods=['GET'])
def get_agent_detail(name):
    """Get detailed information about a specific agent including run history.

    Path Parameters:
        name (str): Agent identifier (e.g. 'sentiment_analyst').

    Returns:
        JSON object with full agent details and a 'recent_runs' array.

    Errors:
        404: Agent not found.
    """
    agent = _find_agent(name)
    if not agent:
        return jsonify({'error': f'Agent not found: {name}'}), 404

    # Build detailed response with empty run history (stub)
    detail = dict(agent)
    detail['recent_runs'] = []
    detail['config'] = {
        'max_retries': 3,
        'timeout_seconds': 300,
        'concurrency': 1
    }
    detail['tools'] = _get_agent_tools(name)

    return jsonify(detail)


@agents_bp.route('/agents/<name>/run', methods=['POST'])
def trigger_agent_run(name):
    """Manually trigger an agent run.

    Path Parameters:
        name (str): Agent identifier.

    Request Body (JSON, optional):
        params (dict): Optional parameters to pass to the agent.
            For example, {'tickers': ['AAPL', 'TSLA']} to limit scope.

    Returns:
        JSON object with:
        - success (bool): Whether the run was accepted.
        - run_id (str): Unique identifier for this run.
        - agent (str): Agent name.
        - status: 'queued' (the run has been accepted for execution).

    Errors:
        404: Agent not found.
        400: Agent is disabled.
    """
    agent = _find_agent(name)
    if not agent:
        return jsonify({'error': f'Agent not found: {name}'}), 404

    if not agent.get('enabled'):
        return jsonify({
            'success': False,
            'error': f'Agent "{name}" is currently disabled. Enable it in settings first.'
        }), 400

    data = request.get_json(silent=True) or {}
    params = data.get('params', {})

    # Execute a simulated agent run and store results
    started_at = datetime.utcnow()
    duration_ms = random.randint(800, 3500)

    # Generate stub output based on agent type
    output = _generate_agent_output(name)

    # Store in agent_runs table
    try:
        conn = sqlite3.connect(Config.DB_PATH)
        tokens_in = random.randint(100, 800)
        tokens_out = random.randint(100, 700)
        cursor = conn.execute("""
            INSERT INTO agent_runs
            (agent_name, framework, status, input_data, output_data,
             tokens_input, tokens_output, estimated_cost, duration_ms, started_at, completed_at)
            VALUES (?, 'crewai', 'completed', ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            name,
            str(params) if params else None,
            output,
            tokens_in,
            tokens_out,
            round(random.uniform(0.001, 0.02), 4),
            duration_ms,
            started_at.isoformat() + 'Z',
            (started_at + timedelta(milliseconds=duration_ms)).isoformat() + 'Z',
        ))
        run_id = cursor.lastrowid
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Failed to store agent run: {e}")
        run_id = 0

    # Update in-memory stub agent state
    agent['total_runs'] = agent.get('total_runs', 0) + 1
    agent['last_run'] = started_at.isoformat() + 'Z'
    agent['status'] = 'idle'

    # Send SSE notification
    try:
        from backend.app import send_sse_event
        send_sse_event('agent_status', {
            'agent_name': name,
            'status': 'completed',
            'run_id': run_id,
            'message': f'Agent "{agent["display_name"]}" completed successfully',
        })
    except Exception:
        pass

    logger.info(f"Agent run completed: {name}, run_id={run_id}, duration={duration_ms}ms")

    return jsonify({
        'success': True,
        'run_id': run_id,
        'agent': name,
        'status': 'completed',
        'duration_ms': duration_ms,
        'message': f'Agent "{agent["display_name"]}" completed successfully',
        'completed_at': (started_at + timedelta(milliseconds=duration_ms)).isoformat() + 'Z',
    })


@agents_bp.route('/agents/runs', methods=['GET'])
def list_recent_runs():
    """List recent agent runs across all agents.

    Query Parameters:
        limit (int, optional): Maximum number of runs to return. Default 50, max 200.
        agent (str, optional): Filter by agent name.
        status (str, optional): Filter by run status
            (queued, running, completed, failed).

    Returns:
        JSON object with:
        - runs: Array of run summary objects.
        - total: Total count of runs returned.
    """
    limit = min(int(request.args.get('limit', 50)), 200)
    agent_filter = request.args.get('agent', None)
    status_filter = request.args.get('status', None)

    try:
        conn = sqlite3.connect(Config.DB_PATH)
        conn.row_factory = sqlite3.Row

        query = 'SELECT * FROM agent_runs WHERE 1=1'
        params = []

        if agent_filter:
            query += ' AND agent_name = ?'
            params.append(agent_filter)
        if status_filter:
            query += ' AND status = ?'
            params.append(status_filter)

        query += ' ORDER BY started_at DESC LIMIT ?'
        params.append(limit)

        rows = conn.execute(query, params).fetchall()
        conn.close()

        runs = [{
            'id': r['id'],
            'agent_name': r['agent_name'],
            'status': r['status'],
            'output': r['output_data'],
            'duration_ms': r['duration_ms'] or 0,
            'tokens_used': (r['tokens_input'] or 0) + (r['tokens_output'] or 0),
            'estimated_cost': r['estimated_cost'] or 0,
            'started_at': r['started_at'],
            'completed_at': r['completed_at'],
        } for r in rows]
    except Exception as e:
        logger.error(f"Failed to query agent runs: {e}")
        runs = []

    return jsonify({
        'runs': runs,
        'total': len(runs),
        'filters': {
            'limit': limit,
            'agent': agent_filter,
            'status': status_filter
        }
    })


@agents_bp.route('/agents/costs', methods=['GET'])
def get_cost_summary():
    """Get cost summary for agent runs (AI API usage).

    Query Parameters:
        days (int, optional): Number of trailing days to include.
        period (str, optional): Aggregation period -- 'daily', 'weekly', or 'monthly'.
            Defaults to 'daily'.

    Returns:
        JSON object with cost breakdown by period and agent, plus totals.
    """
    period_arg = request.args.get('period')
    days_arg = request.args.get('days')
    valid_periods = {'daily': 1, 'weekly': 7, 'monthly': 30}

    if days_arg is not None:
        try:
            period_days = max(1, min(int(days_arg), 365))
        except ValueError:
            return jsonify({'error': f'Invalid days: {days_arg}. Must be an integer.'}), 400
        period = 'custom'
    else:
        period = period_arg or 'daily'
        if period not in valid_periods:
            return jsonify({
                'error': f'Invalid period: {period}. Must be one of: {", ".join(valid_periods)}'
            }), 400
        period_days = valid_periods[period]

    now = datetime.utcnow()
    range_start_dt = now - timedelta(days=period_days)
    range_start = range_start_dt.isoformat() + 'Z'
    range_end = now.isoformat() + 'Z'
    if period_days == 1:
        range_label = 'Last 24 hours'
    else:
        range_label = f'Last {period_days} days'

    range_start_sql = range_start_dt.strftime('%Y-%m-%d %H:%M:%S')

    by_agent = {}
    daily_costs = []
    try:
        conn = sqlite3.connect(Config.DB_PATH)
        conn.row_factory = sqlite3.Row

        total_row = conn.execute("""
            SELECT
                COUNT(*) AS total_runs,
                COALESCE(SUM(tokens_input), 0) AS total_tokens_input,
                COALESCE(SUM(tokens_output), 0) AS total_tokens_output,
                COALESCE(SUM(estimated_cost), 0.0) AS total_cost_usd
            FROM agent_runs
            WHERE datetime(COALESCE(created_at, started_at)) >= datetime(?)
        """, (range_start_sql,)).fetchone()

        agent_rows = conn.execute("""
            SELECT
                agent_name,
                COUNT(*) AS runs,
                COALESCE(SUM(tokens_input + tokens_output), 0) AS tokens_used,
                COALESCE(SUM(estimated_cost), 0.0) AS cost_usd
            FROM agent_runs
            WHERE datetime(COALESCE(created_at, started_at)) >= datetime(?)
            GROUP BY agent_name
            ORDER BY cost_usd DESC, runs DESC, agent_name ASC
        """, (range_start_sql,)).fetchall()

        daily_rows = conn.execute("""
            SELECT
                DATE(COALESCE(created_at, started_at)) AS date,
                COUNT(*) AS runs,
                COALESCE(SUM(estimated_cost), 0.0) AS cost
            FROM agent_runs
            WHERE datetime(COALESCE(created_at, started_at)) >= datetime(?)
            GROUP BY DATE(COALESCE(created_at, started_at))
            ORDER BY date DESC
        """, (range_start_sql,)).fetchall()
        conn.close()
    except Exception as e:
        logger.error(f"Failed to query cost summary: {e}")
        total_row = {
            'total_runs': 0,
            'total_tokens_input': 0,
            'total_tokens_output': 0,
            'total_cost_usd': 0.0,
        }
        agent_rows = []
        daily_rows = []

    display_names = {agent['name']: agent['display_name'] for agent in _STUB_AGENTS}
    for row in agent_rows:
        agent_name = row['agent_name']
        by_agent[agent_name] = {
            'display_name': display_names.get(agent_name, agent_name.replace('_', ' ').title()),
            'runs': row['runs'],
            'cost_usd': round(row['cost_usd'], 6),
            'tokens_used': row['tokens_used'],
        }

    for row in daily_rows:
        daily_costs.append({
            'date': row['date'],
            'runs': row['runs'],
            'cost': round(row['cost'], 6),
        })

    total_tokens_input = total_row['total_tokens_input'] or 0
    total_tokens_output = total_row['total_tokens_output'] or 0
    total_cost_usd = round(total_row['total_cost_usd'] or 0.0, 6)

    return jsonify({
        'period': period,
        'period_days': period_days,
        'range_label': range_label,
        'range_start': range_start,
        'range_end': range_end,
        'total_cost': total_cost_usd,
        'total_cost_usd': total_cost_usd,
        'total_runs': total_row['total_runs'] or 0,
        'total_tokens': total_tokens_input + total_tokens_output,
        'total_tokens_input': total_tokens_input,
        'total_tokens_output': total_tokens_output,
        'by_agent': by_agent,
        'by_provider': {},
        'daily_costs': daily_costs,
    })


# ---------------------------------------------------------------------------
# Helper: map agent names to their expected tool sets
# ---------------------------------------------------------------------------

def _get_agent_tools(agent_name):
    """Return the list of tools available to a given agent (stub metadata)."""
    tool_map = {
        'sentiment_analyst': [
            {'name': 'news_fetcher', 'description': 'Fetches news articles from configured sources'},
            {'name': 'sentiment_scorer', 'description': 'Scores text sentiment using NLP models'},
            {'name': 'db_writer', 'description': 'Persists analysis results to database'},
        ],
        'technical_analyst': [
            {'name': 'price_fetcher', 'description': 'Fetches historical price data'},
            {'name': 'indicator_calculator', 'description': 'Calculates RSI, MACD, moving averages'},
            {'name': 'db_writer', 'description': 'Persists analysis results to database'},
        ],
        'news_scanner': [
            {'name': 'rss_reader', 'description': 'Reads RSS feeds from news sources'},
            {'name': 'web_scraper', 'description': 'Scrapes article content from web pages'},
            {'name': 'deduplicator', 'description': 'Detects and filters duplicate articles'},
            {'name': 'db_writer', 'description': 'Persists articles to database'},
        ],
        'risk_monitor': [
            {'name': 'portfolio_reader', 'description': 'Reads current portfolio state'},
            {'name': 'risk_calculator', 'description': 'Calculates VaR, drawdown, exposure metrics'},
            {'name': 'alert_sender', 'description': 'Sends alerts via configured channels'},
        ],
        'report_generator': [
            {'name': 'data_aggregator', 'description': 'Aggregates data from all analysis results'},
            {'name': 'template_renderer', 'description': 'Renders reports from templates'},
            {'name': 'email_sender', 'description': 'Sends reports via email'},
        ],
    }
    return tool_map.get(agent_name, [])


def _generate_agent_output(agent_name):
    """Generate realistic stub output for an agent run."""
    outputs = {
        'sentiment_analyst': (
            "Sentiment Analysis Complete\n"
            "Analyzed 8 stocks across 45 news articles and 120 social mentions.\n"
            "- NVDA: Strongly positive (0.85) - AI chip demand narrative\n"
            "- MSFT: Positive (0.72) - Azure growth momentum\n"
            "- TSLA: Mixed (-0.15) - Competition concerns offset by FSD progress\n"
            "- AAPL: Moderately positive (0.55) - Vision Pro momentum\n"
            "Overall market sentiment: Cautiously optimistic"
        ),
        'technical_analyst': (
            "Technical Scan Complete\n"
            "Scanned 8 stocks for RSI, MACD, and moving average signals.\n"
            "Signals detected:\n"
            "- NVDA: RSI 62.4 (neutral), MACD bullish crossover, above 50-day MA\n"
            "- MSFT: RSI 48.7 (neutral), MACD neutral, above 200-day MA\n"
            "- AMD: RSI 50.8 (neutral), approaching 20-day MA resistance\n"
            "- TSLA: RSI 45.2 (slightly oversold zone), below 50-day MA\n"
            "No breakout alerts triggered."
        ),
        'news_scanner': (
            "News Scan Complete\n"
            "Scanned 12 sources, found 28 new articles.\n"
            "Top stories:\n"
            "1. NVDA: Record Q4 revenue on AI chip demand (Reuters)\n"
            "2. MSFT: Azure revenue grows 30% YoY (CNBC)\n"
            "3. AMZN: AWS announces new AI infrastructure investments (Reuters)\n"
            "4. TSLA: Faces increased competition in Chinese EV market (WSJ)\n"
            "Deduplicated: 6 duplicate articles removed."
        ),
        'risk_monitor': (
            "Risk Assessment Complete\n"
            "Portfolio risk metrics:\n"
            "- VaR (95%, 1-day): -2.3%\n"
            "- Max drawdown (30d): -4.1%\n"
            "- Sharpe ratio: 1.42\n"
            "- Beta to S&P 500: 1.15\n"
            "- Concentration risk: NVDA at 22% (threshold: 25%)\n"
            "No threshold breaches. All metrics within acceptable ranges."
        ),
        'report_generator': (
            "Daily Report Generated\n"
            "Report includes:\n"
            "- Market overview: S&P 500 +0.3%, NASDAQ +0.5%\n"
            "- Watchlist performance: 6 of 8 stocks positive\n"
            "- Top mover: NVDA +4.2%\n"
            "- Worst performer: TSLA -1.5%\n"
            "- Sentiment summary: 75% positive across monitored stocks\n"
            "Report saved and ready for distribution."
        ),
        'researcher': (
            "Research Brief Generated\n"
            "Generated in-depth analysis for top opportunity.\n"
            "Focus: NVDA - AI semiconductor leadership\n"
            "Key findings:\n"
            "- Revenue growth trajectory accelerating\n"
            "- Data center segment driving 80% of revenue\n"
            "- Competitive moat strengthening with CUDA ecosystem\n"
            "- Valuation premium justified by growth rate\n"
            "Full brief saved to research library."
        ),
    }
    return outputs.get(agent_name, f"Agent {agent_name} completed successfully.")
