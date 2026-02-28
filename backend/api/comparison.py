"""
TickerPulse AI v3.0 - Multi-Model Comparison API

POST /api/comparison/run        — fan out a prompt to selected AI providers
GET  /api/comparison/run/<id>   — poll run status and retrieve results
GET  /api/comparison/runs       — list recent runs (newest first)
"""

import time
import uuid
import logging
import threading
import concurrent.futures
from datetime import datetime

from flask import Blueprint, jsonify, request

from backend.database import db_session
from backend.core.ai_providers import AIProviderFactory
from backend.core.ai_analytics import parse_structured_response

logger = logging.getLogger(__name__)

comparison_bp = Blueprint('comparison', __name__, url_prefix='/api/comparison')

_MAX_PROMPT_LEN = 2000
_DEFAULT_MAX_TOKENS = 500
_VALID_TEMPLATES = frozenset({'custom', 'bull_bear_thesis', 'risk_summary', 'price_target'})
_MAX_RUNS_LIMIT = 100
_DEFAULT_RUNS_LIMIT = 20

_DEFAULT_STOCK_PROMPT_TEMPLATE = (
    "Analyze {ticker} stock. Respond ONLY with a JSON object — no other text: "
    '{{"rating": "BUY", "score": 72, "confidence": 65, "summary": "2-3 sentence analysis."}} '
    "rating must be BUY, HOLD, or SELL; score and confidence are 0-100 integers."
)


# ---------------------------------------------------------------------------
# Template expansion
# ---------------------------------------------------------------------------

_TEMPLATE_PREFIXES = {
    'bull_bear_thesis': (
        "You are a financial analyst. Analyze the following stock and provide a structured "
        "bull/bear thesis with clear arguments for and against investment.\n\n"
        "{context}"
        "Analysis request: {prompt}"
    ),
    'risk_summary': (
        "You are a financial risk analyst. Provide a concise risk summary for this stock, "
        "covering market risk, fundamental risk, and technical risk factors.\n\n"
        "{context}"
        "Analysis request: {prompt}"
    ),
    'price_target': (
        "You are a financial analyst. Provide a 12-month price target rationale for this stock, "
        "including key assumptions, growth catalysts, and valuation methodology.\n\n"
        "{context}"
        "Analysis request: {prompt}"
    ),
}


def _get_stock_context(ticker: str) -> str:
    """Fetch latest cached rating data for a ticker to prepend as context."""
    if not ticker:
        return ''
    try:
        with db_session() as conn:
            row = conn.execute(
                "SELECT rating, score, rsi, sentiment_score, summary "
                "FROM ai_ratings WHERE ticker = ? ORDER BY updated_at DESC LIMIT 1",
                (ticker,),
            ).fetchone()
        if row:
            parts = [f"Ticker: {ticker}"]
            if row['rating']:
                parts.append(f"Current Rating: {row['rating']} (Score: {row['score']}/10)")
            if row['rsi'] is not None:
                parts.append(f"RSI: {row['rsi']}")
            if row['sentiment_score'] is not None:
                parts.append(f"Sentiment Score: {row['sentiment_score']}")
            if row['summary']:
                parts.append(f"Latest Analysis: {row['summary']}")
            return '\n'.join(parts) + '\n\n'
    except Exception:
        pass
    return f"Ticker: {ticker}\n\n"


def _expand_template(template: str, prompt: str, ticker: str) -> str:
    """Return a fully expanded prompt string for the given template."""
    if template == 'custom' or template not in _TEMPLATE_PREFIXES:
        return prompt
    context = _get_stock_context(ticker)
    return _TEMPLATE_PREFIXES[template].format(context=context, prompt=prompt)


# ---------------------------------------------------------------------------
# Provider fan-out
# ---------------------------------------------------------------------------

def _call_provider(prov: dict, prompt: str) -> tuple:
    """Call one AI provider. Returns (text, tokens_used, latency_ms, error)."""
    start = time.monotonic()
    try:
        provider = AIProviderFactory.create_provider(
            prov['provider_name'], prov['api_key'], prov.get('model')
        )
        if not provider:
            return ('', 0, int((time.monotonic() - start) * 1000),
                    f"Unknown provider: {prov['provider_name']}")

        text = provider.generate_analysis(prompt, max_tokens=_DEFAULT_MAX_TOKENS)
        latency_ms = int((time.monotonic() - start) * 1000)
        if text.startswith('Error:'):
            return '', 0, latency_ms, text
        return text, 0, latency_ms, None
    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.warning("Provider %s error: %s", prov.get('provider_name'), exc)
        return '', 0, latency_ms, str(exc)


def _execute_run(run_id: str, prompt: str, ticker: str, template: str,
                 provider_ids: list, provider_names: list) -> None:
    """Background worker: fan out to providers and persist results."""
    try:
        with db_session() as conn:
            rows = conn.execute(
                "SELECT id, provider_name, api_key, model FROM ai_providers "
                "WHERE api_key IS NOT NULL AND api_key != ''"
            ).fetchall()

        candidates = [dict(r) for r in rows]
        if provider_ids:
            candidates = [p for p in candidates if p['id'] in provider_ids]
        elif provider_names:
            names_lower = {n.lower() for n in provider_names}
            candidates = [p for p in candidates if p['provider_name'].lower() in names_lower]

        if not candidates:
            with db_session() as conn:
                conn.execute(
                    "UPDATE comparison_runs SET status = 'error' WHERE id = ?",
                    (run_id,),
                )
            logger.warning("Comparison run %s: no matching providers found", run_id)
            return

        expanded = _expand_template(template, prompt, ticker)

        with concurrent.futures.ThreadPoolExecutor(max_workers=len(candidates)) as executor:
            future_to_prov = {
                executor.submit(_call_provider, prov, expanded): prov
                for prov in candidates
            }
            for future in concurrent.futures.as_completed(future_to_prov, timeout=120):
                prov = future_to_prov[future]
                try:
                    text, tokens, latency_ms, error = future.result()
                except Exception as exc:
                    text, tokens, latency_ms, error = '', 0, 0, str(exc)

                parsed = parse_structured_response(text) if text else None

                with db_session() as conn:
                    conn.execute(
                        "INSERT INTO comparison_results "
                        "(run_id, provider_name, model, response, tokens_used, latency_ms, error,"
                        " extracted_rating, extracted_score, extracted_confidence, extracted_summary)"
                        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            run_id,
                            prov['provider_name'],
                            prov.get('model'),
                            text or None,
                            tokens,
                            latency_ms,
                            error,
                            parsed['rating'] if parsed else None,
                            parsed['score'] if parsed else None,
                            parsed['confidence'] if parsed else None,
                            parsed['summary'] if parsed else None,
                        ),
                    )

        with db_session() as conn:
            conn.execute(
                "UPDATE comparison_runs SET status = 'complete' WHERE id = ?",
                (run_id,),
            )

    except Exception as exc:
        logger.error("Comparison run %s failed unexpectedly: %s", run_id, exc)
        try:
            with db_session() as conn:
                conn.execute(
                    "UPDATE comparison_runs SET status = 'error' WHERE id = ?",
                    (run_id,),
                )
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@comparison_bp.route('/run', methods=['POST'])
def create_run():
    """Start a new multi-model comparison run.

    Body (JSON):
        prompt         (str, optional if ticker given) — analysis prompt
        ticker         (str, optional)                 — stock ticker for context / template
        provider_ids   (list[int], optional)           — DB IDs of providers to use
        provider_names (list[str], optional)           — provider names to filter (e.g. ['anthropic'])
        template       (str, optional)                 — custom|bull_bear_thesis|risk_summary|price_target

    Returns 202 with {id, status, created_at}.
    Poll GET /api/comparison/run/<id> for results.
    """
    body = request.get_json(silent=True) or {}

    ticker = (body.get('ticker') or '').strip().upper() or None
    prompt = (body.get('prompt') or '').strip()
    if not prompt:
        if ticker:
            prompt = _DEFAULT_STOCK_PROMPT_TEMPLATE.format(ticker=ticker)
        else:
            return jsonify({'error': 'prompt is required when ticker is not provided'}), 400

    if len(prompt) > _MAX_PROMPT_LEN:
        return jsonify({'error': f'prompt must be {_MAX_PROMPT_LEN} characters or fewer'}), 400

    template = body.get('template', 'custom')
    if template not in _VALID_TEMPLATES:
        return jsonify({'error': f'template must be one of: {", ".join(sorted(_VALID_TEMPLATES))}'}), 400

    provider_ids = body.get('provider_ids')
    if provider_ids is not None:
        if not isinstance(provider_ids, list):
            return jsonify({'error': 'provider_ids must be an array'}), 400
        try:
            provider_ids = [int(p) for p in provider_ids]
        except (ValueError, TypeError):
            return jsonify({'error': 'provider_ids must be an array of integers'}), 400

    provider_names = body.get('provider_names')
    if provider_names is not None:
        if not isinstance(provider_names, list):
            return jsonify({'error': 'provider_names must be an array'}), 400
        provider_names = [str(n) for n in provider_names]

    run_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat() + 'Z'

    with db_session() as conn:
        conn.execute(
            "INSERT INTO comparison_runs (id, prompt, ticker, status, template, created_at) "
            "VALUES (?, ?, ?, 'pending', ?, ?)",
            (run_id, prompt, ticker, template, created_at),
        )

    thread = threading.Thread(
        target=_execute_run,
        args=(run_id, prompt, ticker or '', template, provider_ids or [], provider_names or []),
        daemon=True,
    )
    thread.start()

    return jsonify({'id': run_id, 'status': 'pending', 'created_at': created_at}), 202


@comparison_bp.route('/run/<run_id>', methods=['GET'])
def get_run(run_id: str):
    """Return run metadata and results.

    Results include extracted structured fields (rating, score, confidence, summary).
    While status is 'pending' results may be partial — providers finish at different times.
    """
    with db_session() as conn:
        run_row = conn.execute(
            "SELECT id, ticker, status, template, created_at "
            "FROM comparison_runs WHERE id = ?",
            (run_id,),
        ).fetchone()

        if not run_row:
            return jsonify({'error': 'Run not found'}), 404

        result_rows = conn.execute(
            "SELECT provider_name, model, tokens_used, latency_ms, error,"
            " extracted_rating, extracted_score, extracted_confidence, extracted_summary "
            "FROM comparison_results WHERE run_id = ? ORDER BY id",
            (run_id,),
        ).fetchall()

    results = [
        {
            'provider': r['provider_name'],
            'model': r['model'],
            'rating': r['extracted_rating'],
            'score': r['extracted_score'],
            'confidence': r['extracted_confidence'],
            'summary': r['extracted_summary'],
            'tokens_used': r['tokens_used'],
            'duration_ms': r['latency_ms'],
            'error': r['error'],
        }
        for r in result_rows
    ]

    return jsonify({
        'id': run_row['id'],
        'ticker': run_row['ticker'],
        'status': run_row['status'],
        'template': run_row['template'],
        'created_at': run_row['created_at'],
        'results': results,
    })


@comparison_bp.route('/runs', methods=['GET'])
def list_runs():
    """Return recent comparison runs with their results.

    Query params:
        ticker (str, optional)  — filter by ticker symbol
        limit  (int, 1-100, default 20)
    """
    try:
        limit = int(request.args.get('limit', _DEFAULT_RUNS_LIMIT))
    except (ValueError, TypeError):
        return jsonify({'error': 'limit must be an integer'}), 400

    limit = max(1, min(limit, _MAX_RUNS_LIMIT))
    ticker = (request.args.get('ticker') or '').strip().upper() or None

    with db_session() as conn:
        if ticker:
            run_rows = conn.execute(
                "SELECT id, ticker, status, template, created_at "
                "FROM comparison_runs WHERE ticker = ? ORDER BY created_at DESC LIMIT ?",
                (ticker, limit),
            ).fetchall()
        else:
            run_rows = conn.execute(
                "SELECT id, ticker, status, template, created_at "
                "FROM comparison_runs ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()

        runs = []
        for run in run_rows:
            result_rows = conn.execute(
                "SELECT provider_name, model, latency_ms, error,"
                " extracted_rating, extracted_score, extracted_confidence, extracted_summary "
                "FROM comparison_results WHERE run_id = ? ORDER BY id",
                (run['id'],),
            ).fetchall()
            runs.append({
                'id': run['id'],
                'ticker': run['ticker'],
                'status': run['status'],
                'template': run['template'],
                'created_at': run['created_at'],
                'results': [
                    {
                        'provider': r['provider_name'],
                        'model': r['model'],
                        'rating': r['extracted_rating'],
                        'score': r['extracted_score'],
                        'confidence': r['extracted_confidence'],
                        'summary': r['extracted_summary'],
                        'duration_ms': r['latency_ms'],
                        'error': r['error'],
                    }
                    for r in result_rows
                ],
            })

    return jsonify({'runs': runs})
