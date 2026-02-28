"""
TickerPulse AI v3.0 - Multi-Model Comparison API

Fan-out a user prompt to N configured LLM providers in parallel, persist
results in comparison_runs / comparison_results tables, and expose polling
endpoints so the frontend can render a side-by-side comparison panel.

Endpoints:
    POST /api/comparison/run          — start a run, returns run_id immediately
    GET  /api/comparison/run/<run_id> — poll status + results
    GET  /api/comparison/runs         — recent run history
"""

import time
import uuid
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from flask import Blueprint, jsonify, request

from backend.database import db_session
from backend.core.settings_manager import get_all_configured_providers

logger = logging.getLogger(__name__)

comparison_bp = Blueprint('comparison', __name__, url_prefix='/api/comparison')

_MAX_PROVIDERS = 8
_MAX_PROMPT_LEN = 2000
_DEFAULT_HISTORY_LIMIT = 10

# ---------------------------------------------------------------------------
# Static analysis templates
# ---------------------------------------------------------------------------

_ANALYSIS_TEMPLATES: list[dict[str, str]] = [
    {
        'id': 'bull_thesis',
        'name': 'Bull Thesis',
        'description': 'Key reasons to be bullish on this stock.',
        'prompt': (
            'Provide a concise bull thesis for {ticker}. Cover: '
            '(1) growth catalysts, (2) competitive moat, (3) valuation upside. '
            'Be specific and data-driven. Max 200 words.'
        ),
    },
    {
        'id': 'bear_thesis',
        'name': 'Bear Thesis',
        'description': 'Key risks and reasons to be cautious.',
        'prompt': (
            'Provide a concise bear thesis for {ticker}. Cover: '
            '(1) key risks, (2) competitive threats, (3) valuation concerns. '
            'Be specific. Max 200 words.'
        ),
    },
    {
        'id': 'risk_summary',
        'name': 'Risk Summary',
        'description': 'Principal risks an investor should monitor.',
        'prompt': (
            'Summarise the top 5 risks for {ticker} investors in order of severity. '
            'For each: name it, explain why it matters, and rate its likelihood '
            '(low / medium / high).'
        ),
    },
    {
        'id': 'price_target',
        'name': 'Price Target Rationale',
        'description': 'Estimate a 12-month price target with supporting reasoning.',
        'prompt': (
            'Provide a 12-month price target for {ticker} with rationale. Include: '
            '(1) current valuation metrics, (2) your target and basis (DCF / comps / other), '
            '(3) key assumptions and what would invalidate the target.'
        ),
    },
]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------



def _run_one_provider(
    provider_name: str,
    api_key: str,
    model: str,
    prompt: str,
    max_tokens: int = 800,
) -> dict[str, Any]:
    """Call a single AI provider with the prompt.

    Never raises — always returns a result dict with either a response or error.
    """
    start = time.monotonic()
    try:
        from backend.core.ai_providers import AIProviderFactory

        provider = AIProviderFactory.create_provider(
            provider_name, api_key, model if model else None
        )
        if not provider:
            return {
                'provider_name': provider_name,
                'model': model,
                'response': None,
                'tokens_used': 0,
                'latency_ms': 0,
                'error': 'Failed to initialize provider',
            }

        model_str = getattr(provider, 'model', model)
        text, tokens, error = provider.generate_analysis_with_usage(prompt, max_tokens=max_tokens)
        latency_ms = int((time.monotonic() - start) * 1000)

        if text is not None:
            return {
                'provider_name': provider_name,
                'model': model_str,
                'response': text,
                'tokens_used': tokens,
                'latency_ms': latency_ms,
                'error': None,
            }
        return {
            'provider_name': provider_name,
            'model': model_str,
            'response': None,
            'tokens_used': 0,
            'latency_ms': latency_ms,
            'error': error or 'No response generated',
        }
    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        return {
            'provider_name': provider_name,
            'model': model,
            'response': None,
            'tokens_used': 0,
            'latency_ms': latency_ms,
            'error': str(exc),
        }


def _execute_comparison_run(
    run_id: str,
    prompt: str,
    providers_to_run: list[dict[str, Any]],
) -> None:
    """Background worker: fan-out to all providers and persist results.

    Runs in a daemon thread.  Sets status='running', then fans out via a
    ThreadPoolExecutor, inserts all results, and sets status='complete'.
    On any unexpected failure marks the run as 'failed'.
    """
    try:
        with db_session() as conn:
            conn.execute(
                "UPDATE comparison_runs SET status='running' WHERE id=?",
                (run_id,),
            )

        results: list[dict[str, Any]] = []
        max_workers = min(len(providers_to_run), _MAX_PROVIDERS)
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {
                pool.submit(
                    _run_one_provider,
                    p['provider_name'],
                    p['api_key'],
                    p['model'],
                    prompt,
                ): p['provider_name']
                for p in providers_to_run
            }
            for fut in as_completed(futures):
                results.append(fut.result())

        with db_session() as conn:
            for r in results:
                conn.execute(
                    """INSERT INTO comparison_results
                           (run_id, provider_name, model, response, tokens_used, latency_ms, error)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        run_id,
                        r['provider_name'],
                        r['model'],
                        r['response'],
                        r['tokens_used'],
                        r['latency_ms'],
                        r['error'],
                    ),
                )
            conn.execute(
                "UPDATE comparison_runs SET status='complete' WHERE id=?",
                (run_id,),
            )

        logger.info(
            "Comparison run %s complete: %d provider(s)", run_id, len(results)
        )

    except Exception as exc:
        logger.exception("Comparison run %s failed: %s", run_id, exc)
        try:
            with db_session() as conn:
                conn.execute(
                    "UPDATE comparison_runs SET status='failed' WHERE id=?",
                    (run_id,),
                )
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@comparison_bp.route('/run', methods=['POST'])
def start_comparison_run():
    """Start a multi-model comparison run.

    Fans out the prompt to each requested (or all) configured AI providers in
    parallel via a background daemon thread.  Returns immediately with the run
    ID so the client can begin polling.

    Request Body (JSON):
        prompt (str): The analysis prompt (max 2000 chars).
        ticker (str, optional): Ticker symbol; live market data will be
            prepended to the prompt when provided.
        provider_ids (list[str], optional): Provider names to include.
            Defaults to all configured providers when omitted.

    Returns:
        202 JSON { run_id, status: "pending" }

    Errors:
        400: Missing or oversized prompt, or no providers configured/matched.
        500: Database write failure.
    """
    body = request.json or {}
    prompt = (body.get('prompt') or '').strip()
    ticker = (body.get('ticker') or '').strip().upper() or None
    requested = body.get('provider_ids')

    if not prompt:
        return jsonify({'success': False, 'error': 'prompt is required'}), 400
    if len(prompt) > _MAX_PROMPT_LEN:
        return jsonify({
            'success': False,
            'error': f'Prompt too long (max {_MAX_PROMPT_LEN} chars)',
        }), 400

    all_providers = get_all_configured_providers()
    if not all_providers:
        return jsonify({'success': False, 'error': 'No AI providers configured'}), 400

    if isinstance(requested, list) and requested:
        requested_set = {p.lower() for p in requested}
        providers_to_run = [
            p for p in all_providers if p['provider_name'].lower() in requested_set
        ]
    else:
        providers_to_run = all_providers

    if not providers_to_run:
        return jsonify({
            'success': False,
            'error': 'None of the requested providers are configured',
        }), 400

    # Optionally inject live stock context before the user prompt
    full_prompt = prompt
    if ticker:
        try:
            from backend.api.chat import _get_stock_context
            ctx = _get_stock_context([ticker])
            if ctx:
                full_prompt = f"Live market data:\n{ctx}\n\n{prompt}"
        except Exception as exc:
            logger.debug("Stock context injection skipped for %s: %s", ticker, exc)

    run_id = str(uuid.uuid4())
    try:
        with db_session() as conn:
            conn.execute(
                "INSERT INTO comparison_runs (id, prompt, ticker, status) VALUES (?, ?, ?, 'pending')",
                (run_id, prompt, ticker),
            )
    except Exception as exc:
        logger.exception("Failed to create comparison run: %s", exc)
        return jsonify({'success': False, 'error': 'Failed to create comparison run'}), 500

    thread = threading.Thread(
        target=_execute_comparison_run,
        args=(run_id, full_prompt, providers_to_run),
        daemon=True,
    )
    thread.start()

    logger.info(
        "Comparison run %s started: %d provider(s), prompt=%d chars",
        run_id, len(providers_to_run), len(prompt),
    )
    return jsonify({'run_id': run_id, 'status': 'pending'}), 202


@comparison_bp.route('/run/<run_id>', methods=['GET'])
def get_comparison_run(run_id: str):
    """Poll the status and collected results of a comparison run.

    Returns:
        JSON {
            run_id, prompt, ticker, status, created_at,
            results: [{ provider_name, model, response, tokens_used, latency_ms, error }]
        }

    Errors:
        404: Run not found.
        500: Database read failure.
    """
    try:
        with db_session() as conn:
            run_row = conn.execute(
                """SELECT id, prompt, ticker, status, created_at
                   FROM comparison_runs WHERE id=?""",
                (run_id,),
            ).fetchone()

            if not run_row:
                return jsonify({'success': False, 'error': 'Run not found'}), 404

            result_rows = conn.execute(
                """SELECT provider_name, model, response, tokens_used, latency_ms, error
                   FROM comparison_results WHERE run_id=? ORDER BY id ASC""",
                (run_id,),
            ).fetchall()

        results = [
            {
                'provider_name': r['provider_name'],
                'model': r['model'],
                'response': r['response'],
                'tokens_used': r['tokens_used'],
                'latency_ms': r['latency_ms'],
                'error': r['error'],
            }
            for r in result_rows
        ]

        return jsonify({
            'run_id': run_row['id'],
            'prompt': run_row['prompt'],
            'ticker': run_row['ticker'],
            'status': run_row['status'],
            'created_at': run_row['created_at'],
            'results': results,
        })

    except Exception as exc:
        logger.exception("Error fetching comparison run %s: %s", run_id, exc)
        return jsonify({'success': False, 'error': 'Failed to fetch run'}), 500


@comparison_bp.route('/providers', methods=['GET'])
def list_comparison_providers():
    """List all configured AI providers available for a comparison run.

    Returns provider names and models only — API keys are never exposed.

    Returns:
        JSON { providers: [{ provider_name, model }] }
    """
    all_providers = get_all_configured_providers()
    return jsonify({
        'providers': [
            {'provider_name': p['provider_name'], 'model': p['model'] or ''}
            for p in all_providers
        ]
    })


@comparison_bp.route('/templates', methods=['GET'])
def list_analysis_templates():
    """Return the built-in analysis prompt templates.

    When a ticker symbol is supplied via the ``ticker`` query parameter the
    ``{ticker}`` placeholder in each prompt is substituted so the frontend
    can display a ready-to-use prompt string.

    Query Parameters:
        ticker (str, optional): Ticker to substitute into prompts.

    Returns:
        JSON { templates: [{ id, name, description, prompt }] }
    """
    ticker = (request.args.get('ticker') or '').strip().upper() or None

    templates = []
    for t in _ANALYSIS_TEMPLATES:
        prompt = t['prompt'].replace('{ticker}', ticker) if ticker else t['prompt']
        templates.append({
            'id': t['id'],
            'name': t['name'],
            'description': t['description'],
            'prompt': prompt,
        })

    return jsonify({'templates': templates})


@comparison_bp.route('/runs', methods=['GET'])
def list_comparison_runs():
    """List recent comparison runs in reverse chronological order.

    Query Parameters:
        limit (int): Max results to return (capped at 50, default 10).

    Returns:
        JSON { runs: [{ run_id, prompt, ticker, status, created_at }] }
    """
    try:
        limit = min(int(request.args.get('limit', _DEFAULT_HISTORY_LIMIT)), 50)
    except (ValueError, TypeError):
        limit = _DEFAULT_HISTORY_LIMIT

    try:
        with db_session() as conn:
            rows = conn.execute(
                """SELECT id, prompt, ticker, status, created_at
                   FROM comparison_runs
                   ORDER BY created_at DESC
                   LIMIT ?""",
                (limit,),
            ).fetchall()

        runs = [
            {
                'run_id': r['id'],
                'prompt': r['prompt'],
                'ticker': r['ticker'],
                'status': r['status'],
                'created_at': r['created_at'],
            }
            for r in rows
        ]
        return jsonify({'runs': runs})

    except Exception as exc:
        logger.exception("Error listing comparison runs: %s", exc)
        return jsonify({'runs': []})
