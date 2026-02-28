"""
TickerPulse AI v3.0 - Research API Routes
Blueprint for AI-generated research briefs.
"""

import re
import json
import sqlite3
import random
import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, Response

from backend.config import Config
from backend.utils.export_briefs import build_zip, build_csv, build_pdf, build_markdown, build_json
from backend.core.error_handlers import (
    handle_api_errors,
    ValidationError,
    NotFoundError,
    DatabaseError,
    ServiceUnavailableError,
)

try:
    from fpdf import FPDF as _FPDF  # noqa: F401
    FPDF_AVAILABLE = True
except ImportError:
    FPDF_AVAILABLE = False

logger = logging.getLogger(__name__)

research_bp = Blueprint('research', __name__, url_prefix='/api')


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_pagination(args):
    """Parse and validate page/page_size query parameters.

    Supports the legacy ``limit`` parameter (treated as ``page_size``).
    Returns (page, page_size) on success.
    Raises ValidationError on invalid input.
    """
    try:
        page = int(args.get('page', 1))
        if 'limit' in args and 'page_size' not in args:
            logger.warning(
                "Query param 'limit' is deprecated for /api/research/briefs; "
                "use 'page_size' instead."
            )
            page_size = int(args.get('limit'))
        else:
            page_size = int(args.get('page_size', 25))
    except (ValueError, TypeError):
        raise ValidationError(
            'page and page_size must be integers',
            error_code='INVALID_TYPE',
        )

    if not (1 <= page_size <= 100):
        raise ValidationError(
            'page_size must be between 1 and 100',
            field_errors=[{'field': 'page_size', 'message': 'Must be between 1 and 100'}],
        )

    return page, page_size


def _extract_summary(content: str) -> str | None:
    """Extract executive summary text from brief markdown content.

    Looks for ## Executive Summary or ## Overview sections and returns
    the first paragraph, stripped of markdown formatting, capped at 500 chars.
    """
    if not content:
        return None
    match = re.search(
        r'##\s+(?:Executive\s+Summary|Overview)\s*\n+(.*?)(?=\n##|\Z)',
        content,
        re.IGNORECASE | re.DOTALL,
    )
    if not match:
        return None
    text = match.group(1).strip()
    # Strip markdown formatting
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    text = re.sub(r'`(.+?)`', r'\1', text)
    # Take first paragraph only
    first_para = text.split('\n\n')[0].strip()
    # Collapse whitespace
    first_para = re.sub(r'\s+', ' ', first_para)
    return first_para[:500] if first_para else None


def _get_key_metrics(conn, ticker: str) -> dict | None:
    """Fetch live key metrics from ai_ratings for a ticker."""
    if not ticker:
        return None
    try:
        row = conn.execute(
            """SELECT current_price, price_change_pct, rsi, sentiment_score,
                      sentiment_label, rating, score, technical_score,
                      fundamental_score
               FROM ai_ratings WHERE ticker = ?""",
            (ticker,),
        ).fetchone()
        if not row:
            return None
        return {
            'price': row['current_price'],
            'change_pct': row['price_change_pct'],
            'rsi': row['rsi'],
            'sentiment_score': row['sentiment_score'],
            'sentiment_label': row['sentiment_label'],
            'rating': row['rating'],
            'score': row['score'],
            'technical_score': row['technical_score'],
            'fundamental_score': row['fundamental_score'],
        }
    except Exception as exc:
        logger.debug("_get_key_metrics: %s – %s", ticker, exc)
        return None


def _row_to_brief(row, conn=None, include_key_metrics: bool = False) -> dict:
    """Convert a sqlite3.Row from research_briefs into a serialisable dict."""
    content = row['content'] or ''
    summary = row['summary'] if 'summary' in row.keys() else None
    if not summary:
        summary = _extract_summary(content)

    brief = {
        'id': row['id'],
        'ticker': row['ticker'],
        'title': row['title'],
        'content': content,
        'summary': summary,
        'agent_name': row['agent_name'],
        'model_used': row['model_used'],
        'created_at': row['created_at'],
    }

    if include_key_metrics and conn is not None:
        brief['key_metrics'] = _get_key_metrics(conn, row['ticker'])

    return brief


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@research_bp.route('/research/briefs', methods=['GET'])
@handle_api_errors
def list_briefs():
    """List research briefs, optionally filtered by ticker.

    Query Parameters:
        ticker (str, optional): Filter by stock ticker.
        page (int, optional): Page number, 1-based. Default 1.
        page_size (int, optional): Results per page, 1-100. Default 25.
        limit (int, deprecated): Alias for page_size for backwards compatibility.

    Returns:
        JSON envelope with data array and pagination metadata.
    """
    ticker = request.args.get('ticker', None)
    page, page_size = _parse_pagination(request.args)

    offset = (page - 1) * page_size

    try:
        conn = sqlite3.connect(Config.DB_PATH)
        conn.row_factory = sqlite3.Row

        if ticker:
            total = conn.execute(
                'SELECT COUNT(*) FROM research_briefs WHERE ticker = ?',
                (ticker.upper(),)
            ).fetchone()[0]
            rows = conn.execute(
                'SELECT * FROM research_briefs WHERE ticker = ?'
                ' ORDER BY created_at DESC LIMIT ? OFFSET ?',
                (ticker.upper(), page_size, offset),
            ).fetchall()
        else:
            total = conn.execute(
                'SELECT COUNT(*) FROM research_briefs'
            ).fetchone()[0]
            rows = conn.execute(
                'SELECT * FROM research_briefs ORDER BY created_at DESC LIMIT ? OFFSET ?',
                (page_size, offset),
            ).fetchall()

        briefs = [_row_to_brief(r, conn, include_key_metrics=False) for r in rows]
        conn.close()

        return jsonify({
            'data': briefs,
            'page': page,
            'page_size': page_size,
            'total': total,
            'has_next': (page * page_size) < total,
        })
    except Exception as exc:
        logger.error("Error fetching research briefs: %s", exc)
        raise DatabaseError('Database error fetching research briefs') from exc


@research_bp.route('/research/briefs/<int:brief_id>', methods=['GET'])
@handle_api_errors
def get_brief(brief_id: int):
    """Retrieve a single research brief by ID, including live key metrics.

    Path Parameters:
        brief_id (int): Primary key of the brief.

    Returns:
        JSON object with full brief content and key_metrics from ai_ratings.
    """
    try:
        conn = sqlite3.connect(Config.DB_PATH)
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            'SELECT * FROM research_briefs WHERE id = ?', (brief_id,)
        ).fetchone()
        if not row:
            conn.close()
            raise NotFoundError(f'Research brief {brief_id} not found')

        brief = _row_to_brief(row, conn, include_key_metrics=True)
        conn.close()
        return jsonify(brief)
    except (NotFoundError, DatabaseError):
        raise
    except Exception as exc:
        logger.error("Error fetching research brief %s: %s", brief_id, exc)
        raise DatabaseError('Database error fetching research brief') from exc


@research_bp.route('/research/briefs', methods=['POST'])
@handle_api_errors
def generate_brief():
    """Trigger generation of a new research brief.

    Request Body (JSON, optional):
        ticker (str): Stock ticker to research. If omitted, picks from watchlist.

    Returns:
        JSON object with the generated brief.
    """
    data = request.get_json(silent=True) or {}
    ticker = data.get('ticker', '').upper()

    if not ticker:
        # Pick a random ticker from the watchlist
        try:
            conn = sqlite3.connect(Config.DB_PATH)
            conn.row_factory = sqlite3.Row
            rows = conn.execute('SELECT ticker FROM stocks WHERE active = 1').fetchall()
            conn.close()
            if rows:
                ticker = random.choice(rows)['ticker']
            else:
                ticker = 'AAPL'
        except Exception:
            ticker = 'AAPL'

    brief = _generate_sample_brief(ticker)
    return jsonify(brief)


_EXT_MAP: dict[str, str] = {
    'zip': 'zip',
    'csv': 'csv',
    'markdown': 'md',
    'json': 'json',
    'pdf': 'pdf',
}

# Formats that benefit from live key_metrics being fetched from ai_ratings.
# PDF needs them for the metrics panel; JSON includes them so data consumers
# get price/rating data without a separate API call.
_FORMATS_WITH_METRICS: frozenset[str] = frozenset({'pdf', 'json'})


def _export_filename(briefs: list[dict], fmt: str) -> str:
    """Derive a descriptive, filesystem-safe filename for a batch export.

    Single-ticker selection: ``research-briefs-AAPL-2026-02-28.md``
    Multi-ticker selection:  ``research-briefs-2026-02-28.csv``
    """
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    tickers = sorted({b['ticker'] for b in briefs if b.get('ticker')})
    ext = _EXT_MAP.get(fmt, fmt)
    if len(tickers) == 1:
        safe_ticker = re.sub(r'[^\w.-]', '_', tickers[0].upper())
        return f'research-briefs-{safe_ticker}-{today}.{ext}'
    return f'research-briefs-{today}.{ext}'


@research_bp.route('/research/briefs/ids', methods=['GET'])
@handle_api_errors
def list_brief_ids() -> Response:
    """Return all brief IDs matching an optional ticker filter.

    Used by the frontend for the cross-page "select all N briefs" affordance.

    Query Parameters:
        ticker (str, optional): Filter by stock ticker symbol.

    Returns:
        JSON: { ids: list[int], total: int }
    """
    ticker = request.args.get('ticker', None)
    try:
        conn = sqlite3.connect(Config.DB_PATH)
        conn.row_factory = sqlite3.Row
        if ticker:
            rows = conn.execute(
                'SELECT id FROM research_briefs WHERE ticker = ? ORDER BY created_at DESC',
                (ticker.upper(),),
            ).fetchall()
        else:
            rows = conn.execute(
                'SELECT id FROM research_briefs ORDER BY created_at DESC'
            ).fetchall()
        ids = [r['id'] for r in rows]
        conn.close()
        return jsonify({'ids': ids, 'total': len(ids)})
    except Exception as exc:
        logger.error("list_brief_ids: DB error: %s", exc)
        raise DatabaseError('Database error fetching brief IDs') from exc


@research_bp.route('/research/briefs/export/capabilities', methods=['GET'])
@handle_api_errors
def export_capabilities():
    """Return which export formats are available on this server."""
    return jsonify({
        'formats': {
            'markdown': {'available': True},
            'json': {'available': True},
            'csv': {'available': True},
            'zip': {'available': True},
            'pdf': {'available': FPDF_AVAILABLE},
        }
    })


@research_bp.route('/research/briefs/export', methods=['POST'])
@handle_api_errors
def export_briefs():
    """Batch-export selected research briefs as ZIP, CSV, Markdown, JSON, or PDF.

    Request Body (JSON):
        ids (list[int]): Brief IDs to export. 1–100 items.
        format (str): "zip" | "csv" | "markdown" | "json" | "pdf"

    Returns:
        Binary file stream with appropriate Content-Type and Content-Disposition.
        Header X-Exported-Count reflects the number of briefs included (may be
        less than requested if some IDs were not found — non-existent IDs are
        skipped silently rather than returning a 404).
    """
    data = request.get_json(silent=True) or {}

    ids = data.get('ids')
    fmt = data.get('format', 'zip')

    # -- Validate ids ---------------------------------------------------------
    if not ids or not isinstance(ids, list):
        raise ValidationError(
            'ids must be a non-empty array',
            error_code='MISSING_FIELD',
            field_errors=[{'field': 'ids', 'message': 'Must be a non-empty array of integers'}],
        )
    if len(ids) > 100:
        raise ValidationError(
            'Too many briefs selected (max 100)',
            field_errors=[{'field': 'ids', 'message': 'Maximum 100 IDs allowed'}],
        )
    if not all(isinstance(i, int) and not isinstance(i, bool) and i > 0 for i in ids):
        raise ValidationError(
            'ids must be an array of positive integers',
            field_errors=[{'field': 'ids', 'message': 'All IDs must be positive integers'}],
        )

    # -- Validate format ------------------------------------------------------
    ALLOWED_FORMATS = {'zip', 'csv', 'pdf', 'markdown', 'json'}
    if fmt not in ALLOWED_FORMATS:
        raise ValidationError(
            f'format must be one of: {", ".join(sorted(ALLOWED_FORMATS))}',
            field_errors=[{'field': 'format', 'message': f'Must be one of: {", ".join(sorted(ALLOWED_FORMATS))}'}],
        )

    if fmt == 'pdf' and not FPDF_AVAILABLE:
        raise ServiceUnavailableError('PDF export requires fpdf2 to be installed')

    # -- Deduplicate IDs preserving first-occurrence order --------------------
    seen: set[int] = set()
    unique_ids: list[int] = []
    for i in ids:
        if i not in seen:
            seen.add(i)
            unique_ids.append(i)
    ids = unique_ids

    # -- Fetch briefs from DB --------------------------------------------------
    # include_key_metrics is enabled for PDF (metrics panel) and JSON (data consumers).
    include_metrics = fmt in _FORMATS_WITH_METRICS
    conn: sqlite3.Connection | None = None
    briefs_raw: list[dict] = []
    try:
        conn = sqlite3.connect(Config.DB_PATH)
        conn.row_factory = sqlite3.Row
        placeholders = ','.join('?' * len(ids))
        rows = conn.execute(
            f'SELECT * FROM research_briefs WHERE id IN ({placeholders})',
            ids,
        ).fetchall()

        # Build dicts and enrich; preserve caller-requested ID order.
        id_order = {bid: idx for idx, bid in enumerate(ids)}
        briefs_raw = sorted(
            [_row_to_brief(r, conn, include_key_metrics=include_metrics) for r in rows],
            key=lambda b: id_order[b['id']],
        )
    except Exception as exc:
        logger.error("export_briefs: DB error: %s", exc)
        raise DatabaseError('Database error while fetching briefs') from exc
    finally:
        if conn is not None:
            conn.close()

    # Graceful skip: export whatever was found; only error if nothing matched.
    briefs = briefs_raw
    if not briefs:
        raise NotFoundError('No matching briefs found for the given IDs')

    # -- Generate export payload ----------------------------------------------
    try:
        if fmt == 'zip':
            payload = build_zip(briefs)
            mime = 'application/zip'
        elif fmt == 'csv':
            payload = build_csv(briefs)
            mime = 'text/csv; charset=utf-8'
        elif fmt == 'markdown':
            payload = build_markdown(briefs)
            mime = 'text/markdown; charset=utf-8'
        elif fmt == 'json':
            payload = build_json(briefs)
            mime = 'application/json; charset=utf-8'
        else:  # pdf
            payload = build_pdf(briefs)
            mime = 'application/pdf'
    except Exception as exc:
        logger.error("export_briefs: generation error (format=%s): %s", fmt, exc)
        raise ServiceUnavailableError('Failed to generate export file') from exc

    filename = _export_filename(briefs, fmt)

    return Response(
        payload,
        status=200,
        mimetype=mime,
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"',
            'Content-Length': str(len(payload)),
            'X-Exported-Count': str(len(briefs)),
        },
    )


# ---------------------------------------------------------------------------
# Brief generation (stub / fallback)
# ---------------------------------------------------------------------------

def _generate_sample_brief(ticker: str) -> dict:
    """Generate and store a sample research brief for a given ticker."""

    # Get current price and rating data if available
    price_info = ''
    rating_info = ''
    try:
        conn = sqlite3.connect(Config.DB_PATH)
        conn.row_factory = sqlite3.Row

        stock = conn.execute(
            'SELECT current_price, price_change_pct FROM stocks WHERE ticker = ?',
            (ticker,)
        ).fetchone()
        if stock and stock['current_price']:
            price_info = f"Currently trading at ${stock['current_price']:.2f} ({stock['price_change_pct']:+.2f}%)"

        rating = conn.execute(
            'SELECT rating, score, rsi, sentiment_score, sentiment_label, technical_score, fundamental_score FROM ai_ratings WHERE ticker = ?',
            (ticker,)
        ).fetchone()
        if rating:
            rating_info = f"AI Rating: {rating['rating']} (Score: {rating['score']}/10)"

        conn.close()
    except Exception:
        pass

    templates = [
        {
            'title': f'{ticker} Deep Dive: Technical & Fundamental Analysis',
            'content': f"""## Executive Summary

{ticker} presents an interesting setup for investors. {price_info}. {rating_info}.

## Technical Analysis

The stock's RSI is currently in a neutral zone, suggesting neither overbought nor oversold conditions. Key moving averages remain supportive of the current trend.

**Key Levels:**
- Support: Recent consolidation zone provides strong support
- Resistance: Previous highs form a key resistance area
- Volume: Trading volume has been consistent with the 20-day average

## Fundamental Overview

The company continues to demonstrate solid fundamentals:
- Revenue growth trajectory remains intact
- Margins are stable or expanding
- Balance sheet strength provides a buffer against market volatility

## Sentiment Analysis

Market sentiment for {ticker} is currently leaning positive based on:
- News flow has been constructive
- Social media mentions show growing interest
- Institutional positioning appears favorable

## Risk Factors

- Broader market volatility could impact near-term performance
- Sector rotation could create headwinds
- Macroeconomic uncertainty remains elevated

## Conclusion

{ticker} warrants continued monitoring. The technical setup combined with solid fundamentals suggests a constructive outlook, though investors should remain mindful of broader market risks.""",
        },
        {
            'title': f'{ticker} Research Brief: Market Position & Outlook',
            'content': f"""## Overview

This research brief examines {ticker}'s current market position and near-term outlook. {price_info}. {rating_info}.

## Market Context

The broader market environment continues to be shaped by:
- Federal Reserve monetary policy expectations
- Earnings season dynamics
- Geopolitical considerations

## Company Analysis

### Strengths
- Strong competitive moat in core business segments
- Consistent execution on strategic initiatives
- Robust cash flow generation

### Catalysts
- Upcoming product launches or earnings reports
- Industry tailwinds in key growth segments
- Potential for margin expansion

## Technical Picture

The chart pattern suggests the stock is in a consolidation phase after recent moves. Key technical indicators:
- RSI: Moderate levels suggest room for movement in either direction
- MACD: Signal line positioning will be crucial for near-term direction
- Moving Averages: Price relationship with key MAs remains constructive

## Social Sentiment

Reddit and social media analysis indicates:
- Moderate but growing retail interest
- Discussion sentiment is predominantly constructive
- No unusual options activity flagged

## Investment Thesis

{ticker} offers a balanced risk-reward profile at current levels. The combination of solid fundamentals, constructive technicals, and positive sentiment provides a supportive backdrop for the stock.""",
        },
    ]

    template = random.choice(templates)
    now = datetime.now(timezone.utc).isoformat()
    summary = _extract_summary(template['content'])

    try:
        conn = sqlite3.connect(Config.DB_PATH)
        cursor = conn.execute(
            """INSERT INTO research_briefs
               (ticker, title, content, summary, agent_name, model_used, created_at)
               VALUES (?, ?, ?, ?, 'researcher', 'claude-sonnet-4-5 (stub)', ?)""",
            (ticker, template['title'], template['content'], summary, now),
        )
        brief_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return {
            'id': brief_id,
            'ticker': ticker,
            'title': template['title'],
            'content': template['content'],
            'summary': summary,
            'agent_name': 'researcher',
            'model_used': 'claude-sonnet-4-5 (stub)',
            'created_at': now,
        }
    except Exception as e:
        logger.error(f"Error saving research brief: {e}")
        return {
            'id': 0,
            'ticker': ticker,
            'title': template['title'],
            'content': template['content'],
            'summary': summary,
            'agent_name': 'researcher',
            'model_used': 'claude-sonnet-4-5 (stub)',
            'created_at': now,
        }