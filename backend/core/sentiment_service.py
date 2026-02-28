"""
TickerPulse AI v3.0 - Sentiment Service

Aggregates social/news sentiment signals for stock tickers into a single
0.0–1.0 bullish-proportion score, cached in SQLite with a 15-minute TTL.

Sources:
  - news table    : articles with NLP sentiment_score (-1 to 1)
  - agent_runs    : recent investigator runs from the Reddit scanner job
  - StockTwits    : public symbol message stream (live, not cached)

Extras:
  - trend         : 24h directional change computed from two 12h news windows
"""

import json
import logging
from datetime import datetime, timedelta

import requests

from backend.config import Config
from backend.database import db_session

logger = logging.getLogger(__name__)

SENTIMENT_CACHE_TTL_SECONDS = 900  # 15 minutes

# Lookback windows for signal collection
NEWS_LOOKBACK_HOURS = 24
REDDIT_LOOKBACK_HOURS = 6

# Label thresholds (applied to 0–1 score)
BULLISH_THRESHOLD = 0.6
BEARISH_THRESHOLD = 0.4

# News score thresholds for signal classification
NEWS_BULLISH_MIN = 0.1
NEWS_BEARISH_MAX = -0.1

# StockTwits public API
STOCKTWITS_MESSAGES_LIMIT = 30
STOCKTWITS_TIMEOUT_SECONDS = 3

# Trend computation
TREND_WINDOW_HOURS = 12   # each half of the 24h window
TREND_THRESHOLD = 0.05    # minimum score delta to declare a directional trend


def _pool_path(db_path: str):
    """Return None (pooled) when db_path is the default DB, else the custom path.

    Passing None to db_session() routes through the connection pool; passing a
    custom path opens a dedicated connection (used in tests with tmp_path DBs).
    """
    return None if db_path == Config.DB_PATH else db_path


def _score_to_label(score: float) -> str:
    """Map a 0–1 bullish proportion to 'bullish' | 'neutral' | 'bearish'."""
    if score >= BULLISH_THRESHOLD:
        return 'bullish'
    if score <= BEARISH_THRESHOLD:
        return 'bearish'
    return 'neutral'


def _get_news_signals(ticker: str, db_path: str) -> dict:
    """Return news sentiment signal counts for *ticker*.

    Returns a dict with keys: bullish, bearish, neutral (integer counts).
    """
    cutoff = (datetime.utcnow() - timedelta(hours=NEWS_LOOKBACK_HOURS)).isoformat()
    counts = {'bullish': 0, 'bearish': 0, 'neutral': 0}
    try:
        with db_session(_pool_path(db_path)) as conn:
            rows = conn.execute(
                """
                SELECT sentiment_score FROM news
                WHERE ticker = ? AND sentiment_score IS NOT NULL AND created_at >= ?
                """,
                (ticker.upper(), cutoff),
            ).fetchall()
    except Exception as exc:
        logger.debug("News query failed for %s: %s", ticker, exc)
        return counts

    for row in rows:
        score = row['sentiment_score']
        if score > NEWS_BULLISH_MIN:
            counts['bullish'] += 1
        elif score < NEWS_BEARISH_MAX:
            counts['bearish'] += 1
        else:
            counts['neutral'] += 1
    return counts


def _get_reddit_signals(ticker: str, db_path: str) -> dict:
    """Return Reddit sentiment signal counts for *ticker*.

    Parses recent investigator agent-run outputs from the Reddit scanner job.
    Returns a dict with keys: bullish, bearish, neutral (integer counts).
    """
    cutoff = (datetime.utcnow() - timedelta(hours=REDDIT_LOOKBACK_HOURS)).isoformat()
    counts = {'bullish': 0, 'bearish': 0, 'neutral': 0}
    try:
        with db_session(_pool_path(db_path)) as conn:
            rows = conn.execute(
                """
                SELECT output_data FROM agent_runs
                WHERE agent_name = 'investigator'
                  AND status = 'completed'
                  AND input_data LIKE '%reddit_scan%'
                  AND completed_at >= ?
                ORDER BY completed_at DESC
                LIMIT 10
                """,
                (cutoff,),
            ).fetchall()
    except Exception as exc:
        logger.debug("Reddit agent_runs query failed for %s: %s", ticker, exc)
        return counts

    ticker_upper = ticker.upper()
    for row in rows:
        output = row['output_data']
        if not output:
            continue
        try:
            data = json.loads(output)
        except (json.JSONDecodeError, TypeError):
            continue

        # Handle list of trending items or {"trending": [...]} wrapper
        items = data if isinstance(data, list) else data.get('trending', [])
        for item in items:
            if not isinstance(item, dict):
                continue
            if item.get('ticker', '').upper() != ticker_upper:
                continue
            sentiment = item.get('sentiment', 'unknown').lower()
            # Weight by mention count when available
            weight = max(1, int(item.get('mentions', 1)))
            if sentiment == 'bullish':
                counts['bullish'] += weight
            elif sentiment == 'bearish':
                counts['bearish'] += weight
            else:
                counts['neutral'] += weight
    return counts


def _get_stocktwits_signals(ticker: str) -> dict:
    """Return StockTwits sentiment signal counts for *ticker*.

    Fetches the public symbol message stream and counts bullish/bearish/neutral
    signals from user-tagged messages.  Network errors are silenced so a
    StockTwits outage never breaks the sentiment endpoint.

    Returns a dict with keys: bullish, bearish, neutral (integer counts).
    """
    counts = {'bullish': 0, 'bearish': 0, 'neutral': 0}
    url = f'https://api.stocktwits.com/api/2/streams/symbol/{ticker.upper()}.json'
    try:
        resp = requests.get(
            url,
            timeout=STOCKTWITS_TIMEOUT_SECONDS,
            params={'limit': STOCKTWITS_MESSAGES_LIMIT},
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.debug("StockTwits fetch failed for %s: %s", ticker, exc)
        return counts

    for msg in data.get('messages', []):
        sentiment_obj = (msg.get('entities') or {}).get('sentiment')
        if not isinstance(sentiment_obj, dict):
            counts['neutral'] += 1
            continue
        basic = sentiment_obj.get('basic', '').lower()
        if basic == 'bullish':
            counts['bullish'] += 1
        elif basic == 'bearish':
            counts['bearish'] += 1
        else:
            counts['neutral'] += 1
    return counts


def _compute_trend(ticker: str, db_path: str) -> str:
    """Compute 24h sentiment trend by comparing two consecutive 12h windows.

    Splits the last 24h of news signals into a recent half (0–12h ago) and an
    older half (12–24h ago), then returns 'up', 'flat', or 'down' based on
    whether the bullish proportion has meaningfully risen or fallen.
    """
    now = datetime.utcnow()
    mid = now - timedelta(hours=TREND_WINDOW_HOURS)
    early = now - timedelta(hours=TREND_WINDOW_HOURS * 2)

    def _bullish_proportion(after: datetime, before: datetime) -> float | None:
        try:
            with db_session(_pool_path(db_path)) as conn:
                rows = conn.execute(
                    """
                    SELECT sentiment_score FROM news
                    WHERE ticker = ?
                      AND sentiment_score IS NOT NULL
                      AND created_at >= ? AND created_at < ?
                    """,
                    (ticker.upper(), after.isoformat(), before.isoformat()),
                ).fetchall()
        except Exception as exc:
            logger.debug("Trend window query failed for %s: %s", ticker, exc)
            return None

        if not rows:
            return None
        bullish = sum(1 for r in rows if r['sentiment_score'] > NEWS_BULLISH_MIN)
        return bullish / len(rows)

    recent = _bullish_proportion(mid, now)
    older = _bullish_proportion(early, mid)

    if recent is None or older is None:
        return 'flat'

    delta = recent - older
    if delta >= TREND_THRESHOLD:
        return 'up'
    if delta <= -TREND_THRESHOLD:
        return 'down'
    return 'flat'


def _compute_sentiment(ticker: str, db_path: str) -> dict:
    """Aggregate news + Reddit signals into a raw (uncached) sentiment dict."""
    news_counts = _get_news_signals(ticker, db_path)
    reddit_counts = _get_reddit_signals(ticker, db_path)

    news_total = sum(news_counts.values())
    reddit_total = sum(reddit_counts.values())
    total = news_total + reddit_total

    sources = {'news': news_total, 'reddit': reddit_total}

    if total == 0:
        return {
            'ticker': ticker.upper(),
            'score': None,
            'label': 'neutral',
            'signal_count': 0,
            'sources': sources,
        }

    bullish = news_counts['bullish'] + reddit_counts['bullish']
    score = round(bullish / total, 4)
    return {
        'ticker': ticker.upper(),
        'score': score,
        'label': _score_to_label(score),
        'signal_count': total,
        'sources': sources,
    }


def invalidate_ticker(ticker: str, db_path: str | None = None) -> None:
    """Evict *ticker* from the sentiment cache.

    The next call to :func:`get_sentiment` for this ticker will recompute
    scores from the source tables rather than returning a stale cached value.
    """
    db_path = db_path or Config.DB_PATH
    ticker = ticker.upper()
    try:
        with db_session(_pool_path(db_path)) as conn:
            conn.execute("DELETE FROM sentiment_cache WHERE ticker = ?", (ticker,))
        logger.debug("Sentiment cache invalidated for %s", ticker)
    except Exception as exc:
        logger.warning("Cache invalidation failed for %s: %s", ticker, exc)


def get_sentiment(ticker: str, db_path: str | None = None) -> dict:
    """Return cached or freshly-computed sentiment for *ticker*.

    Cache TTL is ``SENTIMENT_CACHE_TTL_SECONDS`` (15 min).

    Always returns a dict with keys:
        ticker, label, score, signal_count, sources, updated_at, stale.
    """
    db_path = db_path or Config.DB_PATH
    ticker = ticker.upper()
    now = datetime.utcnow()
    cutoff = (now - timedelta(seconds=SENTIMENT_CACHE_TTL_SECONDS)).isoformat()

    # --- Try cache ---
    cached_row = None
    try:
        with db_session(_pool_path(db_path)) as conn:
            cached_row = conn.execute(
                "SELECT * FROM sentiment_cache WHERE ticker = ?", (ticker,)
            ).fetchone()
    except Exception as exc:
        logger.debug("Cache read failed for %s: %s", ticker, exc)

    if cached_row is not None and cached_row['updated_at'] >= cutoff:
        cached_sources = json.loads(cached_row['sources'])
        st_counts = _get_stocktwits_signals(ticker)
        cached_sources['stocktwits'] = sum(st_counts.values())
        return {
            'ticker': ticker,
            'label': cached_row['label'],
            'score': cached_row['score'],
            'signal_count': cached_row['signal_count'],
            'sources': cached_sources,
            'updated_at': cached_row['updated_at'] + 'Z',
            'stale': False,
            'trend': _compute_trend(ticker, db_path),
        }

    # --- Compute fresh ---
    result = _compute_sentiment(ticker, db_path)
    updated_at_stored = now.isoformat()

    # Only cache when there are actual signals (score column is NOT NULL)
    if result['signal_count'] > 0:
        try:
            with db_session(_pool_path(db_path)) as conn:
                conn.execute(
                    """
                    INSERT INTO sentiment_cache
                        (ticker, score, label, signal_count, sources, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(ticker) DO UPDATE SET
                        score        = excluded.score,
                        label        = excluded.label,
                        signal_count = excluded.signal_count,
                        sources      = excluded.sources,
                        updated_at   = excluded.updated_at
                    """,
                    (
                        ticker,
                        result['score'],
                        result['label'],
                        result['signal_count'],
                        json.dumps(result['sources']),
                        updated_at_stored,
                    ),
                )
        except Exception as exc:
            logger.warning("Cache write failed for %s: %s", ticker, exc)

    # StockTwits is always fetched live (not cached — real-time social source)
    # NOTE: no DB connection is held during this outbound HTTP call
    st_counts = _get_stocktwits_signals(ticker)
    result['sources']['stocktwits'] = sum(st_counts.values())

    result['updated_at'] = updated_at_stored + 'Z'
    result['stale'] = False
    result['trend'] = _compute_trend(ticker, db_path)
    return result
