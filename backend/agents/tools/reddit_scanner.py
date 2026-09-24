"""
TickerPulse AI v3.0 - Reddit Scanner Tool (CrewAI Compatible)
Uses Reddit's public .json endpoints -- NO API key or PRAW dependency needed.
Rate limit: 100 requests per 10 minutes (respected with time.sleep).
"""

import json
import logging
import re
import time
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Type

import requests

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Try to import CrewAI BaseTool; fall back to a minimal shim
# ------------------------------------------------------------------
try:
    from crewai.tools import BaseTool as _CrewAIBaseTool
    from pydantic import BaseModel as _PydanticBaseModel, Field as _PydanticField

    CREWAI_AVAILABLE = True

    class RedditScannerInput(_PydanticBaseModel):
        """Input schema for the Reddit Scanner tool."""
        ticker: str = _PydanticField(..., description="Stock ticker symbol to search for (e.g. AAPL, TSLA)")
        subreddits: str = _PydanticField(
            default="wallstreetbets,stocks,investing,pennystocks,StockMarket,options,thetagang,Daytrading",
            description="Comma-separated subreddit names to scan"
        )
        limit: int = _PydanticField(default=25, description="Max posts per subreddit (max 100)")

except ImportError:
    CREWAI_AVAILABLE = False

    class _CrewAIBaseTool:  # type: ignore[no-redef]
        name: str = ""
        description: str = ""

        def _run(self, *args, **kwargs):
            raise NotImplementedError

    RedditScannerInput = None  # type: ignore[assignment,misc]


# ------------------------------------------------------------------
# Rate limiter for Reddit's public API
# ------------------------------------------------------------------
class _RateLimiter:
    """Simple sliding-window rate limiter: max_requests per window_seconds."""

    def __init__(self, max_requests: int = 90, window_seconds: int = 600):
        self._max = max_requests
        self._window = window_seconds
        self._timestamps: List[float] = []
        self._lock = threading.Lock()

    def wait_if_needed(self):
        """Block until we're within the rate limit."""
        with self._lock:
            now = time.time()
            # Purge old timestamps outside the window
            self._timestamps = [t for t in self._timestamps if now - t < self._window]

            if len(self._timestamps) >= self._max:
                # Need to wait until the oldest request falls outside the window
                wait_time = self._window - (now - self._timestamps[0]) + 0.5
                if wait_time > 0:
                    logger.info(f"Reddit rate limit: sleeping {wait_time:.1f}s")
                    time.sleep(wait_time)

            self._timestamps.append(time.time())


_rate_limiter = _RateLimiter(max_requests=90, window_seconds=600)

# Default subreddits to scan
DEFAULT_SUBREDDITS = [
    "wallstreetbets", "stocks", "investing", "pennystocks",
    "StockMarket", "options", "thetagang", "Daytrading",
]

# Positive/negative keyword lists for quick sentiment
_POSITIVE_KW = {
    'bullish', 'moon', 'rocket', 'buy', 'calls', 'long', 'squeeze',
    'undervalued', 'breakout', 'rally', 'gain', 'profit', 'surge',
    'diamond hands', 'hold', 'yolo', 'green', 'tendies', 'rip',
}
_NEGATIVE_KW = {
    'bearish', 'puts', 'short', 'sell', 'crash', 'dump', 'overvalued',
    'loss', 'red', 'bag', 'bagholder', 'drop', 'tank', 'plunge',
    'recession', 'bankrupt', 'fraud', 'scam', 'rug pull',
}

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


# ------------------------------------------------------------------
# The Tool
# ------------------------------------------------------------------
class RedditScanner(_CrewAIBaseTool):
    """CrewAI-compatible tool that scans Reddit for stock ticker mentions
    using public .json endpoints. No API key required."""

    name: str = "Reddit Scanner"
    description: str = (
        "Scans Reddit subreddits for mentions of a stock ticker using public .json endpoints. "
        "No API key needed. Searches: wallstreetbets, stocks, investing, pennystocks, "
        "StockMarket, options, thetagang, Daytrading. "
        "Returns posts with title, score, comments, sentiment, and engagement metrics."
    )

    if CREWAI_AVAILABLE and RedditScannerInput is not None:
        args_schema: Type = RedditScannerInput  # type: ignore[assignment]

    def _run(self, ticker: str,
             subreddits: str = "wallstreetbets,stocks,investing,pennystocks,StockMarket,options,thetagang,Daytrading",
             limit: int = 25, **kwargs) -> str:
        """Execute the tool -- called by CrewAI or directly."""
        ticker = ticker.strip().upper()
        sub_list = [s.strip() for s in subreddits.split(",") if s.strip()]
        limit = min(limit, 100)
        return self._scan(ticker, sub_list, limit)

    # ---- public helpers (usable outside CrewAI) -----------------------

    def scan_ticker(self, ticker: str, subreddits: Optional[List[str]] = None,
                    limit: int = 25) -> Dict[str, Any]:
        """Return a dict with Reddit mention data for a ticker."""
        subs = subreddits or DEFAULT_SUBREDDITS
        return json.loads(self._scan(ticker.strip().upper(), subs, min(limit, 100)))

    def scan_multiple_tickers(self, tickers: List[str],
                              subreddits: Optional[List[str]] = None,
                              limit: int = 10) -> Dict[str, Any]:
        """Scan multiple tickers in one call. Returns a dict keyed by ticker."""
        subs = subreddits or DEFAULT_SUBREDDITS
        results = {}
        for tk in tickers:
            tk = tk.strip().upper()
            data = json.loads(self._scan(tk, subs, min(limit, 100)))
            results[tk] = data
        return results

    # ---- internals ----------------------------------------------------

    def _scan(self, ticker: str, subreddits: List[str], limit: int) -> str:
        session = requests.Session()
        session.headers.update({"User-Agent": USER_AGENT})

        all_posts: List[Dict[str, Any]] = []
        subreddit_counts: Dict[str, int] = {}
        errors: List[Dict[str, Any]] = []

        for sub_name in subreddits:
            try:
                posts, error = self._search_subreddit(session, sub_name, ticker, limit)
                subreddit_counts[sub_name] = len(posts)
                all_posts.extend(posts)
                if error:
                    errors.append(error)
            except Exception as e:
                logger.warning(f"Reddit scan failed for r/{sub_name} ({ticker}): {e}")
                subreddit_counts[sub_name] = 0
                errors.append({
                    "subreddit": sub_name,
                    "status_code": None,
                    "message": str(e),
                })

        # De-duplicate by post ID
        seen_ids = set()
        unique_posts = []
        for post in all_posts:
            pid = post.get("id", "")
            if pid and pid not in seen_ids:
                seen_ids.add(pid)
                unique_posts.append(post)

        # Sort by engagement (score + num_comments) descending
        unique_posts.sort(key=lambda p: p.get("score", 0) + p.get("num_comments", 0), reverse=True)

        # Compute aggregate metrics
        total_score = sum(p.get("score", 0) for p in unique_posts)
        total_comments = sum(p.get("num_comments", 0) for p in unique_posts)
        sentiments = [p.get("sentiment_score", 0) for p in unique_posts]
        avg_sentiment = sum(sentiments) / len(sentiments) if sentiments else 0

        positive_count = sum(1 for p in unique_posts if p.get("sentiment_label") == "positive")
        negative_count = sum(1 for p in unique_posts if p.get("sentiment_label") == "negative")
        neutral_count = sum(1 for p in unique_posts if p.get("sentiment_label") == "neutral")

        return json.dumps({
            "ticker": ticker,
            "total_mentions": len(unique_posts),
            "subreddit_breakdown": subreddit_counts,
            "total_score": total_score,
            "total_comments": total_comments,
            "avg_sentiment": round(avg_sentiment, 3),
            "positive_count": positive_count,
            "negative_count": negative_count,
            "neutral_count": neutral_count,
            "posts": unique_posts[:50],  # Cap at top 50 posts
            "source_status": "degraded" if errors else "ok",
            "errors": errors,
            "scanned_at": datetime.now(timezone.utc).isoformat(),
        })

    def _search_subreddit(self, session: requests.Session, subreddit: str,
                          ticker: str, limit: int) -> tuple[List[Dict[str, Any]], Optional[Dict[str, Any]]]:
        """Search a single subreddit using the public .json endpoint."""
        _rate_limiter.wait_if_needed()

        url = f"https://www.reddit.com/r/{subreddit}/search.json"
        params = {
            "q": ticker,
            "sort": "new",
            "limit": limit,
            "restrict_sr": "on",
            "t": "week",
        }

        resp = session.get(url, params=params, timeout=15)

        if resp.status_code == 429:
            # Rate limited -- back off and retry once
            retry_after = int(resp.headers.get("Retry-After", 10))
            logger.warning(f"Reddit 429 for r/{subreddit}: sleeping {retry_after}s")
            time.sleep(retry_after)
            _rate_limiter.wait_if_needed()
            resp = session.get(url, params=params, timeout=15)

        if resp.status_code != 200:
            message = f"Reddit returned {resp.status_code} for r/{subreddit}"
            logger.warning(message)
            return [], {
                "subreddit": subreddit,
                "status_code": resp.status_code,
                "message": message,
            }

        data = resp.json()
        children = data.get("data", {}).get("children", [])

        posts = []
        for child in children:
            post_data = child.get("data", {})
            title = post_data.get("title", "")
            selftext = post_data.get("selftext", "")

            # Check if the ticker is actually mentioned
            combined = f"{title} {selftext}".upper()
            # Look for $TICKER or standalone TICKER
            if not re.search(rf'\$?{re.escape(ticker)}\b', combined):
                continue

            # Compute basic sentiment
            full_text = f"{title} {selftext}".lower()
            pos = sum(1 for kw in _POSITIVE_KW if kw in full_text)
            neg = sum(1 for kw in _NEGATIVE_KW if kw in full_text)
            total_kw = pos + neg
            if total_kw > 0:
                sentiment_score = (pos - neg) / total_kw
            else:
                sentiment_score = 0.0
            sentiment_score = max(-1.0, min(1.0, sentiment_score))

            if sentiment_score > 0.2:
                sentiment_label = "positive"
            elif sentiment_score < -0.2:
                sentiment_label = "negative"
            else:
                sentiment_label = "neutral"

            created_utc = post_data.get("created_utc", 0)
            created_dt = datetime.fromtimestamp(created_utc, tz=timezone.utc).isoformat() if created_utc else ""

            posts.append({
                "id": post_data.get("id", ""),
                "subreddit": subreddit,
                "title": title,
                "selftext": selftext[:500],
                "score": post_data.get("score", 0),
                "num_comments": post_data.get("num_comments", 0),
                "upvote_ratio": post_data.get("upvote_ratio", 0.5),
                "url": f"https://www.reddit.com{post_data.get('permalink', '')}",
                "author": post_data.get("author", "[deleted]"),
                "created_utc": created_utc,
                "created_at": created_dt,
                "sentiment_score": round(sentiment_score, 3),
                "sentiment_label": sentiment_label,
            })

        # Small delay between subreddit requests
        time.sleep(1.2)

        return posts, None
