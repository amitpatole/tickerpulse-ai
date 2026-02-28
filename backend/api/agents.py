```python
"""
TickerPulse AI v3.0 - Agents API Routes
Blueprint for agent management, execution, run history, and cost tracking.

All routes delegate to the real AgentRegistry backed by the agent
implementations in backend/agents/.  Stubs and random data have been removed.

The six original frontend-visible stub agent IDs (sentiment_analyst,
technical_analyst, news_scanner, risk_monitor, report_generator, researcher)
are mapped to their canonical registry names via AGENT_ID_MAP so the UI
contract is preserved without breaking existing bookmarks or API consumers.
"""

import math
import sqlite3
import logging
from datetime import datetime, timedelta

from flask import Blueprint, current_app, jsonify, request

from backend.config import Config

logger = logging.getLogger(__name__)

agents_bp = Blueprint('agents', __name__, url_prefix='/api')

# ---------------------------------------------------------------------------
# Stub-to-real agent ID mapping
# The frontend uses the six original stub names from the old placeholder list.
# This map resolves them to canonical agent names in the AgentRegistry.
# Real agent names pass through unchanged so the map is the single source
# of truth for all name resolution.
# ---------------------------------------------------------------------------

AGENT_ID_MAP = {
    # legacy stub IDs → real registry name
    'sentiment_analyst': 'investigator',
    'technical_analyst': 'scanner',
    'news_scanner':      'scanner',
    'risk_monitor':      'regime',
    'report_generator':  'researcher',
    # real names (pass-through)
    'researcher':        'researcher',
    'download_tracker':  'download_tracker',
    'scanner':           'scanner',
    'investigator':      'investigator',
    'regime':            'regime',
}

# ---------------------------------------------------------------------------
# Static display metadata keyed by stub/frontend agent ID
# ---------------------------------------------------------------------------

_AGENT_METADATA = {
    'sentiment_analyst': {
        'display_name': 'Sentiment Analyst',
        'description': 'Analyzes news and social media sentiment for monitored stocks',
        'category': 'analysis',
        'schedule': '*/30 * * * *',
    },
    'technical_analyst': {
        'display_name': 'Technical Analyst',
        'description': (
            'Runs technical indicator analysis (RSI, MACD, moving averages) '
            'across watchlist stocks.'
        ),
        'category': 'analysis',
        'schedule': '0 * * * *',
    },
    'news_scanner': {
        'display_name': 'News Scanner',
        'description': 'Scans multiple news sources for articles about monitored stocks',
        'category': 'data_collection',
        'schedule': '*/15 * * * *',
    },
    'risk_monitor': {
        'display_name': 'Risk Monitor',
        'description': (
            'Classifies the current macro market regime and monitors portfolio risk '
            'using macro indicators.'
        ),
        'category': 'monitoring',
        'schedule': '*/10 * * * *',
    },
    'report_generator': {
        'display_name': 'Report Generator',
        'description': (
            'Generates in-depth research briefs with AI-powered analysis for '
            'top opportunities and monitored stocks.'
        ),
        'category': 'reporting',
        'schedule': '0 18 * * *',
    },
    'researcher': {
        'display_name': 'Deep Researcher',
        'description': (
            'Generates in-depth research briefs with AI-powered analysis for '
            'top opportunities and monitored stocks.'
        ),
        'category': 'research',
        'schedule': None,
    },
    'download_tracker': {
        'display_name': 'Download Tracker',
        'description': (
            'Tracks GitHub repository download and star metrics for tech '
            'stock research and developer adoption signals.'
        ),
        'category': 'data_collection',
        'schedule': '0 */6 * * *',
    },
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_registry():
    """Retrieve the AgentRegistry from the app extension store."""
    try:
        return current_app.extensions.get('agent_registry')
    except RuntimeError:
        # Outside Flask app context — create via singleton getter
        from backend.agents import get_registry
        return get_registry()


def _format_agent(stub_name: str, agent_obj) -> dict:
    """Build an agent summary dict using the stub/frontend name and real agent object."""
    meta = _AGENT_METADATA.get(stub_name, {})
    status = 'idle'
    enabled = True
    model = ''
    tags = []
    if agent_obj is not None:
        raw_status = agent_obj.status
        status = raw_status.value if hasattr(raw_status, 'value') else str(raw_status)
        enabled = agent_obj.config.enabled
        model = agent_obj.config.model
        tags = agent_obj.config.tags or []
    return {
        'name': stub_name,
        'display_name': meta.get('display_name', stub_name.replace('_', ' ').title()),
        'description': meta.get('description', ''),
        'category': meta.get('category', 'analysis'),
        'schedule': meta.get('schedule'),
        'status': status,
        'enabled': enabled,
        'model': model,
        'tags': tags,
        'total_runs': 0,
        'last_run': None,
        'total_cost': 0.0,
    }



# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@agents_bp.route('/agents', methods=['GET'])
def list_agents():
    """List all registered agents with their current status.

    Query Parameters:
        category (str, optional): Filter by agent category.
        enabled (str, optional): Filter by enabled status ('true' or 'false').

    Returns:
        JSON object with:
        - agents: Array of agent summary objects.
        - total: Total count of agents returned.
    """
    category = request.args.get('category')
    enabled_filter = request.args.get('enabled')

    registry = _get_registry()

    # Build the response list from _AGENT_METADATA stub IDs.
    # Each stub is resolved to a real agent via AGENT_ID_MAP.
    agents = []
    for stub_id in _AGENT_METADATA:
        real_name = AGENT_ID_MAP.get(stub_id, stub_id)
        agent_obj = registry.get(real_name) if registry else None
        agents.append(_format_agent(stub_id, agent_obj))

    if category:
        agents = [a for a in agents if a['category'] == category]

    if enabled_filter is not None:
        enabled_bool = enabled_filter.lower() == 'true'
        agents = [a for a in agents if a['enabled'] == enabled_bool]

    # Enrich each agent with live run stats from DB
    try:
        conn = sqlite3.connect(Config.DB_PATH)
        conn.row_factory = sqlite3.Row
        for agent in agents:
            real_name = AGENT_ID_MAP.get(agent['name'], agent['name'])
            row = conn.execute(
                'SELECT * FROM agent_runs WHERE agent_name = ? ORDER BY started_at DESC LIMIT 1',
                (real_name,)
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
            count = conn.execute(
                'SELECT COUNT(*) FROM agent_runs WHERE agent_name = ?',
                (real_name,)
            ).fetchone()[0]
            agent['total_runs'] = count
            total_cost = conn.execute(
                'SELECT COALESCE(SUM(estimated_cost), 0) FROM agent_runs WHERE agent_name = ?',
                (real_name,)
            ).fetchone()[0]
            agent['total_cost'] = round(total_cost, 4)
        conn.close()
    except Exception as e:
        logger.error("Failed to enrich agents with run data: %s", e)

    return jsonify({'agents': agents, 'total': len(agents)})


@agents_bp.route('/agents/<name>', methods=['GET'])
def get_agent_detail(name):
    """Get detailed information about a specific agent including run history.

    Path Parameters:
        name (str): Agent identifier — may be a stub alias or real registry name.

    Returns:
        JSON object with full agent details and a 'recent_runs' array.

    Errors:
        404: Agent not found.
        503: Registry not initialised.
    """
    registry = _get_registry()
    if registry is None:
        return jsonify({'error': 'Agent registry not initialised'}), 503

    real_name = AGENT_ID_MAP.get(name)
    if real_name is None:
        return jsonify({'error': f'Agent not found: {name}'}), 404

    agent_obj = registry.get(real_name)
    if agent_obj is None:
        return jsonify({'error': f'Agent not found: {name}'}), 404

    detail = _format_agent(name, agent_obj)

    # Recent runs from DB (keyed by real agent name)
    try:
        conn = sqlite3.connect(Config.DB_PATH)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            'SELECT * FROM agent_runs WHERE agent_name = ? ORDER BY started_at DESC LIMIT 10',
            (real_name,)
        ).fetchall()
        conn.close()
        detail['recent_runs'] = [{
            'id': r['id'],
            'status': r['status'],
            'started_at': r['started_at'],
            'completed_at': r['completed_at'],
            'duration_ms': r['duration_ms'] or 0,
            'tokens_used': (r['tokens_input'] or 0) + (r['tokens_output'] or 0),
            'estimated_cost': r['estimated_cost'] or 0,
            'framework': r['framework'],
        } for r in rows]
    except Exception as e:
        logger.error("Failed to fetch recent runs for %s: %s", name, e)
        detail['recent_runs'] = []

    detail['config'] = {
        'model': agent_obj.config.model,
        'max_tokens': agent_obj.config.max_tokens,
        'temperature': agent_obj.config.temperature,
        'provider': agent_obj.config.provider,
    }
    detail['tools'] = _get_agent_tools(real_name)

    return jsonify(detail)


@agents_bp.route('/agents/<name>/run', methods=['POST'])
def trigger_agent_run(name):
    """Manually trigger an agent run.

    Path Parameters:
        name (str): Agent identifier — may be a stub alias or real registry name.

    Request Body (JSON, optional):
        params (dict): Optional parameters passed to the agent.

    Returns:
        JSON object with:
        - success (bool): Whether the run succeeded.
        - run_id (int): DB rowid of the persisted run record.
        - agent (str): The requested agent identifier (stub name preserved).
        - status: 'completed' on success, 'error' on failure.
        - framework, tokens_input, tokens_output, estimated_cost, duration_ms.

    Errors:
        404: Agent not found.
        400: Agent is disabled.
        503: Registry not initialised.
    """
    registry = _get_registry()
    if registry is None:
        return jsonify({'error': 'Agent registry not initialised'}), 503

    real_name = AGENT_ID_MAP.get(name)
    if real_name is None:
        return jsonify({'error': f'Agent not found: {name}'}), 404

    agent_obj = registry.get(real_name)
    if agent_obj is None:
        return jsonify({'error': f'Agent not found: {name}'}), 404

    if not agent_obj.config.enabled:
        return jsonify({
            'success': False,
            'error': f'Agent "{name}" is currently disabled. Enable it in settings first.'
        }), 400

    data = request.get_json(silent=True) or {}
    params = data.get('params', {})

    # OpenClaw path: try first when the gateway is configured and reachable.
    # Persists the result directly then returns early so the native path is
    # skipped and no double-write occurs.
    if Config.OPENCLAW_ENABLED:
        try:
            from backend.agents.openclaw_engine import OpenClawBridge
            bridge = OpenClawBridge()
            if bridge.is_available():
                logger.info("Dispatching %s via OpenClaw", real_name)
                result = bridge.run_task(
                    agent_name=real_name,
                    task_description=f"Run {real_name} agent",
                    inputs=params or {},
                )
                run_id = registry._persist_result(result, params)
                success = result.status == 'success'
                logger.info(
                    "Agent run finished (OpenClaw): %s (real=%s), run_id=%s, status=%s, duration=%dms",
                    name, real_name, run_id, result.status, result.duration_ms,
                )
                return jsonify({
                    'success': success,
                    'run_id': run_id,
                    'agent': name,
                    'status': 'completed' if success else result.status,
                    'framework': result.framework,
                    'message': (
                        f'Agent "{name}" completed successfully'
                        if success
                        else f'Agent "{name}" failed: {result.error}'
                    ),
                    'tokens_input': result.tokens_input,
                    'tokens_output': result.tokens_output,
                    'estimated_cost': result.estimated_cost,
                    'duration_ms': result.duration_ms,
                    'started_at': result.started_at,
                    'completed_at': result.completed_at,
                    'error': result.error,
                })
        except Exception as e:
            logger.warning(
                "OpenClaw dispatch failed for %s, falling back to native: %s",
                real_name, e,
            )

    # Native path: registry.run_agent() calls agent.run() and persists the
    # result in a single operation — exactly one row written to agent_runs.
    result, run_id = registry.run_agent(real_name, params)
    if result is None:
        return jsonify({'error': f'Agent {real_name} execution failed internally'}), 500
    success = result.status == 'success'

    logger.info(
        "Agent run finished: %s (real=%s), run_id=%s, status=%s, duration=%dms",
        name, real_name, run_id, result.status, result.duration_ms,
    )

    return jsonify({
        'success': success,
        'run_id': run_id,
        'agent': name,
        'status': 'completed' if success else result.status,
        'framework': result.framework,
        'message': (
            f'Agent "{name}" completed successfully'
            if success
            else f'Agent "{name}" failed: {result.error}'
        ),
        'tokens_input': result.tokens_input,
        'tokens_output': result.tokens_output,
        'estimated_cost': result.estimated_cost,
        'duration_ms': result.duration_ms,
        'started_at': result.started_at,
        'completed_at': result.completed_at,
        'error': result.error,
    })


@agents_bp.route('/agents/runs', methods=['GET'])
def list_recent_runs():
    """List recent agent runs across all agents with cursor-based pagination.

    Query Parameters:
        limit (int, optional): Number of runs per page. Default 50, max 200.
        page (int, optional): 1-based page number. Default 1.
        agent (str, optional): Filter by agent name (stub aliases accepted).
        status (str, optional): Filter by run status (running, success, error).

    Returns:
        JSON object with:
        - runs: Array of run summary objects for the requested page.
        - total: Total count of matching runs in the database.
        - page: Current 1-based page number.
        - pages: Total number of pages.
        - has_next: Whether a subsequent page exists.
        - has_prev: Whether a previous page exists.
        - filters: Echo of the active filter/pagination parameters.
    """
    raw_limit = request.args.get('limit', '50')
    try:
        limit = int(raw_limit)
    except ValueError:
        return jsonify({'error': 'limit must be a positive integer'}), 400
    if limit <= 0:
        return jsonify({'error': 'limit must be a positive integer'}), 400
    limit = min(limit, 200)

    raw_page = request.args.get('page', '1')
    try:
        page = int(raw_page)
    except ValueError:
        return jsonify({'error': 'page must be a positive integer'}), 400
    if page <= 0:
        return jsonify({'error': 'page must be a positive integer'}), 400

    # Correct 1-based offset: page 1 → offset 0, page 2 → offset limit, …
    offset = (page - 1) * limit

    agent_filter = request.args.get('agent')

    _VALID_STATUSES = {'running', 'success', 'error'}
    status_filter = request.args.get('status')
    if status_filter and status_filter not in _VALID_STATUSES:
        return jsonify({
            'error': f"Invalid status. Must be one of: {', '.join(sorted(_VALID_STATUSES))}"
        }), 400

    runs = []
    total = 0
    try:
        conn = sqlite3.connect(Config.DB_PATH)
        conn.row_factory = sqlite3.Row

        where = 'WHERE 1=1'
        filter_params: list = []

        if agent_filter:
            # Resolve stub alias → real name; fall back to the value as-is
            real_name = AGENT_ID_MAP.get(agent_filter, agent_filter)
            where += ' AND agent_name = ?'
            filter_params.append(real_name)
        if status_filter:
            where += ' AND status = ?'
            filter_params.append(status_filter)

        # True total count so pagination metadata is accurate regardless of limit
        total = conn.execute(
            f'SELECT COUNT(*) FROM agent_runs {where}',
            filter_params,
        ).fetchone()[0]

        rows = conn.execute(
            f'SELECT * FROM agent_runs {where} ORDER BY started_at DESC LIMIT ? OFFSET ?',
            filter_params + [limit, offset],
        ).fetchall()
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
            'framework': r['framework'],
        } for r in rows]
    except Exception as e:
        logger.error("Failed to query agent runs: %s", e)

    pages = math.ceil(total / limit) if total > 0 else 1

    return jsonify({
        'runs': runs,
        'total': total,
        'page': page,
        'pages': pages,
        'has_next': page < pages,
        'has_prev': page > 1,
        'filters': {
            'limit': limit,
            'agent': agent_filter,
            'status': status_filter,
        },
    })


@agents_bp.route('/agents/costs', methods=['GET'])
def get_cost_summary():
    """Get cost summary for agent runs (AI API usage).

    Query Parameters:
        period (str, optional): Aggregation period -- 'daily', 'weekly', or 'monthly'.
            Defaults to 'daily'.

    Returns:
        JSON object with cost breakdown by period and agent, plus totals.
        by_agent is keyed by stub/frontend agent IDs (all stubs included, zeros
        if no runs yet).
    """
    period = request.args.get('period', 'daily')
    valid_periods = ['daily', 'weekly', 'monthly']

    if period not in valid_periods:
        return jsonify({
            'error': f'Invalid period: {period}. Must be one of: {", ".join(valid_periods)}'
        }), 400

    period_days = {'daily': 1, 'weekly': 7, 'monthly': 30}[period]
    range_labels = {'daily': 'Last 24 hours', 'weekly': 'Last 7 days', 'monthly': 'Last 30 days'}

    now = datetime.utcnow()
    range_start = (now - timedelta(days=period_days)).isoformat() + 'Z'

    # Helper to build an empty by_agent dict (all stubs with zero values)
    def _empty_by_agent():
        return {
            stub_id: {
                'display_name': meta.get('display_name', stub_id.replace('_', ' ').title()),
                'runs': 0,
                'cost_usd': 0.0,
                'tokens_used': 0,
            }
            for stub_id, meta in _AGENT_METADATA.items()
        }

    registry = _get_registry()
    if registry is None:
        return jsonify({
            'period': period,
            'range_label': range_labels[period],
            'range_start': range_start,
            'range_end': now.isoformat() + 'Z',
            'total_cost_usd': 0.0,
            'total_runs': 0,
            'total_tokens': 0,
            'by_agent': _empty_by_agent(),
            'by_provider': {},
        })

    summary = registry.get_cost_summary(days=period_days)

    # Index DB summary by real agent name
    real_costs = {}
    for row in summary.get('by_agent', []):
        real_costs[row['agent_name']] = {
            'runs': row['runs'],
            'cost': row['cost'],
            'tokens': row['tokens'],
        }

    # Build by_agent keyed by stub IDs; all stubs present even with zero runs
    by_agent = {}
    for stub_id, meta in _AGENT_METADATA.items():
        real_name = AGENT_ID_MAP.get(stub_id, stub_id)
        rc = real_costs.get(real_name, {'runs': 0, 'cost': 0.0, 'tokens': 0})
        by_agent[stub_id] = {
            'display_name': meta.get('display_name', stub_id.replace('_', ' ').title()),
            'runs': rc['runs'],
            'cost_usd': round(rc['cost'], 6),
            'tokens_used': rc['tokens'],
        }

    return jsonify({
        'period': period,
        'range_label': range_labels[period],
        'range_start': range_start,
        'range_end': now.isoformat() + 'Z',
        'total_cost_usd': summary.get('total_cost', 0.0),
        'total_runs': summary.get('total_runs', 0),
        'total_tokens': (
            summary.get('total_tokens_input', 0) + summary.get('total_tokens_output', 0)
        ),
        'by_agent': by_agent,
        'by_provider': {},  # future: aggregate by model provider
        'by_day': summary.get('by_day', []),
    })


# ---------------------------------------------------------------------------
# Agent tool metadata (informational, used by GET /api/agents/<name>)
# ---------------------------------------------------------------------------

def _get_agent_tools(agent_name: str) -> list:
    """Return the list of tools available to a given agent (by real registry name)."""
    tool_map = {
        'scanner': [
            {'name': 'stock_data_fetcher', 'description': 'Fetches historical OHLCV price data'},
            {'name': 'technical_analyzer', 'description': 'Computes RSI, MACD, MA, Bollinger Bands, Stochastic'},
            {'name': 'news_fetcher', 'description': 'Fetches recent news for sentiment context'},
        ],
        'researcher': [
            {'name': 'stock_data_fetcher', 'description': 'Fetches historical OHLCV price data'},
            {'name': 'news_fetcher', 'description': 'Fetches news articles for research'},
            {'name': 'technical_analyzer', 'description': 'Provides technical analysis context'},
        ],
        'regime': [
            {'name': 'stock_data_fetcher', 'description': 'Fetches macro index price data'},
            {'name': 'technical_analyzer', 'description': 'Computes trend and momentum indicators'},
        ],
        'investigator': [
            {'name': 'reddit_scanner', 'description': 'Scans Reddit for stock mentions and sentiment'},
            {'name': 'news_fetcher', 'description': 'Cross-references news with social signals'},
        ],
        'download_tracker': [
            {'name': 'github_api', 'description': 'Fetches repository download and star metrics'},
        ],
    }
    return tool_map.get(agent_name, [])
```