"""News wire collection lane for the standalone /news daily review.

Reuses EnhancedStockNewsMonitor's fast RSS fetchers (Google News, Yahoo
Finance, Benzinga) and sentiment scoring. Produces post dicts compatible with
backend.services.news_story_cards (text/date/handle keys) tagged with
source_type="news_wire". No database writes beyond the monitor's idempotent
CREATE TABLE IF NOT EXISTS on construction.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

from backend.services.dashboard_watchlist import load_dashboard_watchlist

logger = logging.getLogger(__name__)

_INCLUDED_MARKETS = {"US", "Private"}
_SOURCE_METHODS = (
    ("Google News", "fetch_google_news"),
    ("Yahoo Finance", "fetch_yahoo_finance_rss"),
    ("Benzinga", "fetch_benzinga"),
)
_MAX_WORKERS = 8
_monitor_cache = None


def _default_monitor():
    global _monitor_cache
    if _monitor_cache is None:
        from backend.config import Config
        from backend.core.stock_monitor import EnhancedStockNewsMonitor

        db_path = str(Path(Config.BASE_DIR) / "stock_news.db")
        _monitor_cache = EnhancedStockNewsMonitor(db_path=db_path)
    return _monitor_cache


def default_news_wire_tickers(*, max_tickers: int = 12) -> list[str]:
    tickers: list[str] = []
    for item in load_dashboard_watchlist():
        market = str(item.get("market") or "").strip()
        ticker = str(item.get("ticker") or "").strip().upper()
        if market in _INCLUDED_MARKETS and ticker:
            tickers.append(ticker)
        if len(tickers) >= max_tickers:
            break
    return tickers


def collect_news_wire(
    *,
    tickers: Sequence[str] | None = None,
    max_tickers: int = 12,
    articles_per_ticker: int = 4,
    monitor: object | None = None,
) -> dict[str, object]:
    active_monitor = monitor if monitor is not None else _default_monitor()
    if tickers is not None:
        targets = [str(t).strip().upper() for t in tickers if str(t).strip()]
    else:
        targets = default_news_wire_tickers(max_tickers=max_tickers)
    targets = targets[: max(0, max_tickers)]

    posts: list[dict[str, object]] = []
    errors: list[dict[str, object]] = []
    articles_collected = 0

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as pool:
        futures = {
            pool.submit(_fetch_ticker, active_monitor, ticker, articles_per_ticker): ticker
            for ticker in targets
        }
        for future in as_completed(futures):
            ticker = futures[future]
            try:
                ticker_posts, ticker_errors = future.result()
            except Exception as exc:  # never kill the lane on one ticker
                errors.append({"source": ticker, "message": str(exc)})
                continue
            articles_collected += len(ticker_posts)
            posts.extend(ticker_posts)
            errors.extend(ticker_errors)

    posts = _dedupe_posts(posts)
    posts.sort(key=lambda post: str(post.get("date") or ""), reverse=True)

    if posts:
        status = "degraded" if errors else "ok"
    else:
        status = "error" if errors else "degraded"

    return {
        "source_status": status,
        "tickers_checked": len(targets),
        "articles_collected": articles_collected,
        "posts": posts,
        "errors": errors,
    }


def _fetch_ticker(
    monitor: object,
    ticker: str,
    articles_per_ticker: int,
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    ticker_posts: list[dict[str, object]] = []
    ticker_errors: list[dict[str, object]] = []
    for source_name, method_name in _SOURCE_METHODS:
        fetcher = getattr(monitor, method_name, None)
        if not callable(fetcher):
            ticker_errors.append(
                {"source": f"{ticker}:{source_name}", "message": f"monitor missing {method_name}"}
            )
            continue
        try:
            articles = fetcher(ticker) or []
        except Exception as exc:
            ticker_errors.append({"source": f"{ticker}:{source_name}", "message": str(exc)})
            continue
        for article in articles:
            if not isinstance(article, dict):
                continue
            post = _article_to_post(monitor, article, ticker, source_name)
            if post is not None:
                ticker_posts.append(post)
    ticker_posts.sort(key=lambda post: str(post.get("date") or ""), reverse=True)
    return ticker_posts[: max(0, articles_per_ticker)], ticker_errors


def _article_to_post(
    monitor: object,
    article: dict[str, object],
    ticker: str,
    source_name: str,
) -> dict[str, object] | None:
    title = " ".join(str(article.get("title") or "").split())
    url = str(article.get("url") or "").strip()
    if not title or not url:
        return None
    description = " ".join(str(article.get("description") or "").split())[:300]
    text = f"{title}. {description}".strip()
    try:
        sentiment_score, sentiment_label = monitor.calculate_sentiment(  # type: ignore[attr-defined]
            text, int(article.get("engagement_score") or 0)
        )
    except Exception:
        sentiment_score, sentiment_label = 0.0, "neutral"
    return {
        "handle": f"news:{source_name}",
        "lane": "news_wire",
        "source_type": "news_wire",
        "title": title,
        "text": text,
        "url": url,
        "date": _normalize_date(str(article.get("published_date") or "")),
        "ticker_seeds": [ticker],
        "sentiment_score": round(float(sentiment_score), 3),
        "sentiment_label": str(sentiment_label),
    }


def _normalize_date(value: str) -> str:
    text = value.strip()
    if not text:
        return ""
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = parsedate_to_datetime(text)
        except (TypeError, ValueError):
            return ""
    if parsed is None:
        return ""
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


def _dedupe_posts(posts: list[dict[str, object]]) -> list[dict[str, object]]:
    merged: dict[str, dict[str, object]] = {}
    order: list[str] = []
    for post in posts:
        key = " ".join(str(post.get("title") or "").lower().split()) or str(post.get("url") or "")
        if key in merged:
            seeds = {
                *[str(s) for s in merged[key].get("ticker_seeds") or []],
                *[str(s) for s in post.get("ticker_seeds") or []],
            }
            merged[key]["ticker_seeds"] = sorted(seeds)
            continue
        merged[key] = dict(post)
        order.append(key)
    return [merged[key] for key in order]
