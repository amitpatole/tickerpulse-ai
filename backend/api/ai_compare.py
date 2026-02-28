"""
TickerPulse AI v3.0 - AI Multi-Model Comparison API

POST /api/ai/compare         — synchronous fan-out to multiple AI providers
GET  /api/ai/compare/history — recent comparison runs (ticker optional for global view)
"""

import json
import re
import time
import uuid
import logging
import threading
import concurrent.futures
from datetime import datetime

from flask import Blueprint, jsonify, request

from backend.database import db_session
from backend.core.ai_providers import AIProviderFactory
from backend.config import Config

logger = logging.getLogger(__name__)

ai_compare_bp = Blueprint('ai_compare', __name__, url_prefix='/api/ai')

_MAX_PROVIDERS = 4
_PROVIDER_TIMEOUT = 30   # seconds per individual provider call
_FANOUT_TIMEOUT = 35     # overall executor timeout (slightly above per-provider)
_DEFAULT_MAX_TOKENS = 600

_VALID_TEMPLATES = frozenset({'custom', 'bull_bear_thesis', 'risk_summary', 'price_target'})

_PROMPT_TEMPLATES = {
    'custom': """\
You are a financial analyst. Analyze {ticker} stock and provide a structured investment assessment.

Market Context:
- Current Price: ${price}
- RSI (14-period): {rsi}
- News Sentiment: {sentiment} (scale: -1.0 very negative to +1.0 very positive)
- Current AI Rating: {rating}

Based on this information and your knowledge of {ticker}, respond with ONLY a JSON object \
in this exact format (no other text, no markdown):
{{"rating": "BUY", "score": 75, "confidence": 80, "summary": "2-3 sentence analysis here."}}

Rules:
- rating must be exactly "BUY", "HOLD", or "SELL"
- score: integer 0-100 representing overall investment attractiveness
- confidence: integer 0-100 representing your confidence in this assessment
- summary: 2-3 plain-text sentences, no markdown formatting""",

    'bull_bear_thesis': """\
You are a financial analyst specializing in directional investment theses. Analyze {ticker} stock.

Market Context:
- Current Price: ${price}
- RSI (14-period): {rsi}
- News Sentiment: {sentiment} (scale: -1.0 very negative to +1.0 very positive)
- Current AI Rating: {rating}

Evaluate the strongest bull and bear arguments for {ticker}. Determine which thesis is more \
compelling given current market conditions and fundamentals.

Respond with ONLY a JSON object in this exact format (no other text, no markdown):
{{"rating": "BUY", "score": 75, "confidence": 80, "summary": "2-3 sentence directional thesis here."}}

Rules:
- rating: "BUY" (bull thesis prevails), "HOLD" (balanced), or "SELL" (bear thesis prevails)
- score: integer 0-100 representing overall investment attractiveness
- confidence: integer 0-100 representing your confidence in the directional call
- summary: 2-3 plain-text sentences stating the prevailing thesis, no markdown""",

    'risk_summary': """\
You are a risk analyst. Evaluate key risks for {ticker} stock.

Market Context:
- Current Price: ${price}
- RSI (14-period): {rsi}
- News Sentiment: {sentiment} (scale: -1.0 very negative to +1.0 very positive)
- Current AI Rating: {rating}

Identify and assess the most significant risk factors for {ticker}: regulatory, competitive, \
macroeconomic, and execution risks. Consider how these risks affect the investment outlook.

Respond with ONLY a JSON object in this exact format (no other text, no markdown):
{{"rating": "BUY", "score": 75, "confidence": 80, "summary": "2-3 sentence risk assessment here."}}

Rules:
- rating: "BUY" (risks manageable), "HOLD" (moderate risks), or "SELL" (risks are severe)
- score: integer 0-100 representing overall attractiveness after accounting for risks
- confidence: integer 0-100 representing your confidence in the risk assessment
- summary: 2-3 plain-text sentences naming key risks and their net impact, no markdown""",

    'price_target': """\
You are a valuation analyst. Estimate a 12-month price target for {ticker} stock.

Market Context:
- Current Price: ${price}
- RSI (14-period): {rsi}
- News Sentiment: {sentiment} (scale: -1.0 very negative to +1.0 very positive)
- Current AI Rating: {rating}

Apply multiple valuation approaches (P/E, DCF, EV/EBITDA, comparable analysis) appropriate \
for {ticker}. Derive a consensus 12-month price target range.

Respond with ONLY a JSON object in this exact format (no other text, no markdown):
{{"rating": "BUY", "score": 75, "confidence": 80, "summary": "2-3 sentence price target analysis here."}}

Rules:
- rating: "BUY" (target implies >10% upside), "HOLD" (-10% to +10%), or "SELL" (<-10% downside)
- score: integer 0-100 representing valuation attractiveness at current price
- confidence: integer 0-100 representing your confidence in the price target estimate
- summary: 2-3 plain-text sentences stating target range, key drivers, upside/downside, no markdown""",
}


# ---------------------------------------------------------------------------
# Market context
# ---------------------------------------------------------------------------

def _get_market_context(ticker: str) -> dict:
    """Fetch latest market data for ticker from DB. Returns neutral defaults on failure."""
    ctx = {'price': 0.0, 'rsi': 50.0, 'sentiment_score': 0.0, 'rating': 'HOLD'}
    try:
        with db_session() as conn:
            row = conn.execute(
                "SELECT rsi, sentiment_score, rating "
                "FROM ai_ratings WHERE ticker = ? ORDER BY updated_at DESC LIMIT 1",
                (ticker,),
            ).fetchone()
            if row:
                ctx['rsi'] = float(row['rsi'] or 50.0)
                ctx['sentiment_score'] = float(row['sentiment_score'] or 0.0)
                ctx['rating'] = row['rating'] or 'HOLD'

            price_row = conn.execute(
                "SELECT current_price FROM stocks WHERE ticker = ? LIMIT 1",
                (ticker,),
            ).fetchone()
            if price_row and price_row['current_price']:
                ctx['price'] = float(price_row['current_price'])
    except Exception as exc:
        logger.debug("_get_market_context(%s): %s", ticker, exc)
    return ctx


def _build_prompt(ticker: str, ctx: dict, template: str = 'custom') -> str:
    tpl = _PROMPT_TEMPLATES.get(template, _PROMPT_TEMPLATES['custom'])
    price_str = f"{ctx['price']:.2f}" if ctx['price'] else 'N/A'
    return tpl.format(
        ticker=ticker,
        price=price_str,
        rsi=f"{ctx['rsi']:.1f}",
        sentiment=f"{ctx['sentiment_score']:.2f}",
        rating=ctx['rating'],
    )


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------

def _validate_parsed(data: dict) -> dict:
    """Validate and normalise parsed JSON. Raises ValueError on invalid data."""
    rating = str(data.get('rating', '')).upper()
    if rating not in ('BUY', 'HOLD', 'SELL'):
        raise ValueError(f"invalid rating: {rating!r}")
    return {
        'rating': rating,
        'score': max(0, min(100, int(data.get('score', 50)))),
        'confidence': max(0, min(100, int(data.get('confidence', 50)))),
        'summary': str(data.get('summary', '')).strip()[:1000],
    }


def _parse_response(text: str) -> dict | None:
    """Extract structured fields from AI response text. Returns None if unparseable."""
    if not text:
        return None

    # Direct JSON parse
    try:
        return _validate_parsed(json.loads(text.strip()))
    except (json.JSONDecodeError, ValueError):
        pass

    # Extract from ```json ... ``` code block
    block = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if block:
        try:
            return _validate_parsed(json.loads(block.group(1)))
        except (json.JSONDecodeError, ValueError):
            pass

    # Find first JSON object containing a "rating" key
    obj = re.search(r'\{[^{}]*"rating"[^{}]*\}', text, re.DOTALL)
    if obj:
        try:
            return _validate_parsed(json.loads(obj.group(0)))
        except (json.JSONDecodeError, ValueError):
            pass

    return None


# ---------------------------------------------------------------------------
# Provider fan-out
# ---------------------------------------------------------------------------

def _get_api_key(provider: str) -> str:
    """Return API key for provider from Config env vars (primary) or DB (fallback)."""
    env_keys = {
        'anthropic': Config.ANTHROPIC_API_KEY,
        'openai': Config.OPENAI_API_KEY,
        'google': Config.GOOGLE_AI_KEY,
        'grok': Config.XAI_API_KEY,
        'xai': Config.XAI_API_KEY,
    }
    key = env_keys.get(provider.lower(), '')
    if key:
        return key

    try:
        with db_session() as conn:
            row = conn.execute(
                "SELECT api_key FROM ai_providers "
                "WHERE provider_name = ? AND api_key IS NOT NULL AND api_key != '' LIMIT 1",
                (provider,),
            ).fetchone()
            if row:
                return row['api_key']
    except Exception:
        pass
    return ''


def _call_one_provider(cfg: dict, prompt: str) -> dict:
    """Call a single AI provider and return a structured result dict."""
    provider_name = cfg.get('provider', '')
    model = cfg.get('model') or None
    start = time.monotonic()

    api_key = _get_api_key(provider_name)
    if not api_key:
        return {
            'provider': provider_name,
            'model': model or '',
            'error': f'No API key configured for {provider_name}',
            'duration_ms': 0,
        }

    try:
        provider = AIProviderFactory.create_provider(provider_name, api_key, model)
        if not provider:
            return {
                'provider': provider_name,
                'model': model or '',
                'error': f'Unknown provider: {provider_name}',
                'duration_ms': 0,
            }

        text, tokens_used = provider.generate_analysis(prompt, max_tokens=_DEFAULT_MAX_TOKENS)
        duration_ms = int((time.monotonic() - start) * 1000)

        if text.startswith('Error:'):
            return {
                'provider': provider_name,
                'model': model or '',
                'error': text[len('Error:'):].strip(),
                'duration_ms': duration_ms,
            }

        parsed = _parse_response(text)
        if parsed is None:
            return {
                'provider': provider_name,
                'model': model or '',
                'error': 'Could not parse structured response from model',
                'duration_ms': duration_ms,
            }

        return {
            'provider': provider_name,
            'model': model or '',
            'rating': parsed['rating'],
            'score': parsed['score'],
            'confidence': parsed['confidence'],
            'summary': parsed['summary'],
            'tokens_used': tokens_used,
            'duration_ms': duration_ms,
        }

    except Exception as exc:
        duration_ms = int((time.monotonic() - start) * 1000)
        logger.warning("Provider %s error: %s", provider_name, exc)
        return {
            'provider': provider_name,
            'model': model or '',
            'error': str(exc),
            'duration_ms': duration_ms,
        }


# ---------------------------------------------------------------------------
# DB persistence
# ---------------------------------------------------------------------------

def _persist_run(
    run_id: str,
    ticker: str,
    providers: list,
    results: list,
    template: str,
) -> None:
    """Save run and results to DB. Called in a daemon thread; errors are logged only."""
    try:
        created_at = datetime.utcnow().isoformat() + 'Z'
        with db_session() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO ai_comparison_runs "
                "(id, ticker, providers, created_at, template) "
                "VALUES (?, ?, ?, ?, ?)",
                (run_id, ticker, json.dumps(providers), created_at, template),
            )
            for r in results:
                conn.execute(
                    "INSERT INTO ai_comparison_results "
                    "(run_id, provider, model, rating, score, confidence, "
                    " summary, duration_ms, error, tokens_used) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        run_id,
                        r.get('provider'),
                        r.get('model'),
                        r.get('rating'),
                        r.get('score'),
                        r.get('confidence'),
                        r.get('summary'),
                        r.get('duration_ms'),
                        r.get('error'),
                        r.get('tokens_used'),
                    ),
                )
    except Exception as exc:
        logger.warning("_persist_run: %s", exc)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@ai_compare_bp.route('/compare', methods=['POST'])
def run_comparison():
    """Fan out a stock analysis to multiple AI providers simultaneously.

    Body (JSON):
        ticker    (str, required)        — stock ticker symbol
        providers (list[obj], required)  — each must have "provider" key; "model" is optional
        template  (str, optional)        — one of: custom, bull_bear_thesis, risk_summary,
                                           price_target (defaults to "custom")

    Returns 200 with:
        run_id, ticker, template, market_context {price, rsi, sentiment_score},
        results [{provider, model, rating?, score?, confidence?, summary?,
                  tokens_used?, duration_ms, error?}]
    """
    body = request.get_json(silent=True) or {}

    ticker = (body.get('ticker') or '').strip().upper()
    if not ticker:
        return jsonify({'error': 'ticker is required'}), 400

    providers = body.get('providers')
    if not isinstance(providers, list) or not providers:
        return jsonify({'error': 'providers must be a non-empty array'}), 400
    if len(providers) > _MAX_PROVIDERS:
        return jsonify({'error': f'at most {_MAX_PROVIDERS} providers per request'}), 400
    for p in providers:
        if not isinstance(p, dict) or not p.get('provider'):
            return jsonify({'error': 'each provider entry must have a "provider" field'}), 400

    template = (body.get('template') or 'custom').strip()
    if template not in _VALID_TEMPLATES:
        template = 'custom'

    ctx = _get_market_context(ticker)
    prompt = _build_prompt(ticker, ctx, template)
    run_id = str(uuid.uuid4())

    results: list[dict] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(providers)) as executor:
        future_to_cfg = {executor.submit(_call_one_provider, p, prompt): p for p in providers}
        try:
            for future in concurrent.futures.as_completed(future_to_cfg, timeout=_FANOUT_TIMEOUT):
                try:
                    results.append(future.result())
                except Exception as exc:
                    cfg = future_to_cfg[future]
                    results.append({
                        'provider': cfg.get('provider', ''),
                        'model': cfg.get('model', ''),
                        'error': str(exc),
                        'duration_ms': 0,
                    })
        except concurrent.futures.TimeoutError:
            for future, cfg in future_to_cfg.items():
                if not future.done():
                    future.cancel()
                    results.append({
                        'provider': cfg.get('provider', ''),
                        'model': cfg.get('model', ''),
                        'error': 'Request timed out',
                        'duration_ms': _FANOUT_TIMEOUT * 1000,
                    })

    # Restore input order
    order = {p['provider']: i for i, p in enumerate(providers)}
    results.sort(key=lambda r: order.get(r['provider'], 999))

    threading.Thread(
        target=_persist_run,
        args=(run_id, ticker, providers, results, template),
        daemon=True,
    ).start()

    return jsonify({
        'run_id': run_id,
        'ticker': ticker,
        'template': template,
        'market_context': {
            'price': ctx['price'],
            'rsi': ctx['rsi'],
            'sentiment_score': ctx['sentiment_score'],
        },
        'results': results,
    })


@ai_compare_bp.route('/compare/history', methods=['GET'])
def comparison_history():
    """Return recent comparison runs.

    Query params:
        ticker (str, optional) — filter by ticker; omit for global history
        limit  (int, optional, default 20, max 100)
    """
    ticker = (request.args.get('ticker') or '').strip().upper() or None

    try:
        limit = int(request.args.get('limit', 20))
    except (ValueError, TypeError):
        return jsonify({'error': 'limit must be an integer'}), 400
    limit = max(1, min(limit, 100))

    try:
        with db_session() as conn:
            if ticker:
                run_rows = conn.execute(
                    "SELECT id, ticker, created_at FROM ai_comparison_runs "
                    "WHERE ticker = ? ORDER BY created_at DESC LIMIT ?",
                    (ticker, limit),
                ).fetchall()
            else:
                run_rows = conn.execute(
                    "SELECT id, ticker, created_at FROM ai_comparison_runs "
                    "ORDER BY created_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()

            runs = []
            for run in run_rows:
                result_rows = conn.execute(
                    "SELECT provider, model, rating, score, confidence, summary, "
                    "duration_ms, error, tokens_used "
                    "FROM ai_comparison_results WHERE run_id = ? ORDER BY id",
                    (run['id'],),
                ).fetchall()
                runs.append({
                    'run_id': run['id'],
                    'ticker': run['ticker'],
                    'created_at': run['created_at'],
                    'results': [dict(r) for r in result_rows],
                })
    except Exception as exc:
        logger.error("comparison_history: %s", exc)
        return jsonify({'error': 'Failed to fetch history'}), 500

    response: dict = {'runs': runs}
    if ticker:
        response['ticker'] = ticker
    return jsonify(response)
