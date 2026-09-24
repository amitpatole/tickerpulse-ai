"""Lightweight on-demand market sweep built from existing TickerPulse tools."""

from __future__ import annotations

import logging
import sqlite3
from collections.abc import Callable
from datetime import datetime, timezone

from backend.agents.base import AgentResult
from backend.agents.scanner_agent import ScannerAgent
from backend.agents.tools.news_fetcher import NewsFetcher
from backend.agents.tools.reddit_scanner import RedditScanner
from backend.config import Config
from backend.services.ai_infra_update import build_ai_infra_update
from backend.services.news_intelligence import build_news_intelligence_cards
from backend.services.watchlist_notes import build_watchlist_event_insights
from backend.services.x_watchlist import XWatchlistCollector

logger = logging.getLogger(__name__)


DEFAULT_SWEEP_TICKERS = [
    "SPY", "QQQ", "IWM",
    "NVDA", "AVGO", "MRVL", "AMD", "MU", "SMCI", "VRT", "PLTR",
    "MSFT", "AAPL", "AMZN", "GOOGL", "META", "TSLA",
    "COIN", "MSTR", "JPM", "XOM", "RBRK",
]

DEFAULT_REDDIT_SUBREDDITS = [
    "wallstreetbets",
    "stocks",
    "investing",
    "options",
    "stockmarket",
    "smallstreetbets",
]
_PRIVATE_MARKETS = {"private"}


class MarketSweepService:
    def __init__(
        self,
        scanner: ScannerAgent | None = None,
        news_fetcher: NewsFetcher | None = None,
        x_collector: XWatchlistCollector | None = None,
        reddit_scanner: RedditScanner | None = None,
        ai_infra_loader: Callable[[], dict[str, object]] | None = None,
    ) -> None:
        self.scanner = scanner or ScannerAgent()
        self.news_fetcher = news_fetcher or NewsFetcher()
        self.x_collector = x_collector or XWatchlistCollector()
        self.reddit_scanner = reddit_scanner or RedditScanner()
        self.ai_infra_loader = ai_infra_loader or build_ai_infra_update

    def run(
        self,
        tickers: list[str] | None = None,
        include_x: bool = True,
        include_reddit: bool = False,
        include_ai_infra: bool = True,
        top_n: int = 10,
        period: str = "3mo",
        x_max_accounts: int = 12,
        x_posts_per_account: int = 5,
        news_max_articles: int = 3,
        reddit_max_tickers: int = 5,
        reddit_posts_per_ticker: int = 5,
    ) -> dict[str, object]:
        clean_tickers, skipped_tickers = self._clean_tickers(tickers)
        scanner_result = self._run_scanner(clean_tickers, period, top_n)
        top_results = self._scanner_top_results(scanner_result)

        news = self._fetch_news(top_results[: min(top_n, 8)], news_max_articles)
        x_result = (
            self.x_collector.collect_accounts(
                max_accounts=x_max_accounts,
                posts_per_account=x_posts_per_account,
            )
            if include_x
            else {"source_status": "skipped", "posts": [], "errors": []}
        )
        x_search_result = (
            self.x_collector.collect_searches(max_queries=3, posts_per_query=10)
            if include_x
            else {"source_status": "skipped", "posts": [], "errors": [], "queries_checked": 0}
        )
        reddit = (
            self._fetch_reddit(top_results, reddit_max_tickers, reddit_posts_per_ticker)
            if include_reddit
            else self._skipped_reddit()
        )
        ai_infra_update = (
            self._fetch_ai_infra_update()
            if include_ai_infra
            else {"source_status": "skipped", "items": [], "errors": []}
        )
        news_intelligence = build_news_intelligence_cards(
            news=news,
            account_posts=x_result.get("posts", []) if isinstance(x_result, dict) else [],
            search_posts=x_search_result.get("posts", []) if isinstance(x_search_result, dict) else [],
            generated_at=datetime.now(timezone.utc).isoformat(),
            max_cards=10,
        )
        watchlist_events = build_watchlist_event_insights()

        insights = self._build_insights(
            top_results,
            news,
            x_result,
            reddit,
            ai_infra_update,
            news_intelligence,
            top_n,
        )
        final_diligence = self._build_reddit_diligence(reddit)
        source_status = self._source_status(
            scanner_result,
            news,
            x_result,
            x_search_result,
            ai_infra_update,
        )

        scanner_metadata = dict(scanner_result.metadata or {})
        scanner_metadata.setdefault("scanned", len(top_results))

        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source_status": source_status,
            "inputs": {
                "tickers": clean_tickers,
                "period": period,
                "top_n": top_n,
                "include_x": include_x,
                "include_reddit": include_reddit,
                "include_ai_infra": include_ai_infra,
                "skipped_tickers": skipped_tickers,
            },
            "scanner": {
                "status": scanner_result.status,
                "metadata": scanner_metadata,
                "top_results": top_results,
                "error": scanner_result.error,
            },
            "news": news,
            "x": x_result,
            "x_search": x_search_result,
            "reddit": reddit,
            "ai_infra_update": ai_infra_update,
            "news_intelligence": news_intelligence,
            "watchlist_events": watchlist_events,
            "workflow": self._workflow_metadata(reddit),
            "final_diligence": final_diligence,
            "insights": insights,
        }

    def _clean_tickers(self, tickers: list[str] | None) -> tuple[list[str], list[dict[str, str]]]:
        if tickers is not None:
            return self._dedupe_tickers(tickers), []

        quote_tickers, skipped_tickers, loaded_dashboard = self._dashboard_watchlist_tickers()
        source = quote_tickers if loaded_dashboard else DEFAULT_SWEEP_TICKERS
        return self._dedupe_tickers(source), skipped_tickers

    @staticmethod
    def _dedupe_tickers(tickers: list[str]) -> list[str]:
        seen: set[str] = set()
        cleaned: list[str] = []
        for ticker in tickers:
            normalized = str(ticker).strip().upper()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            cleaned.append(normalized)
        return cleaned[:50]

    @staticmethod
    def _dashboard_watchlist_tickers() -> tuple[list[str], list[dict[str, str]], bool]:
        conn: sqlite3.Connection | None = None
        try:
            conn = sqlite3.connect(Config.DB_PATH)
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT ticker, market FROM stocks WHERE active = 1 ORDER BY ticker"
            ).fetchall()
            quote_tickers: list[str] = []
            skipped_tickers: list[dict[str, str]] = []
            for row in rows:
                ticker = str(row["ticker"] or "").strip().upper()
                market = str(row["market"] or "").strip()
                if not ticker:
                    continue
                if market.lower() in _PRIVATE_MARKETS:
                    skipped_tickers.append(
                        {
                            "ticker": ticker,
                            "market": market,
                            "reason": "private_market",
                        }
                    )
                    continue
                quote_tickers.append(ticker)
            return quote_tickers, skipped_tickers, bool(rows)
        except sqlite3.Error as exc:
            logger.warning("Market sweep could not load dashboard watchlist: %s", exc)
            return [], [], False
        finally:
            if conn is not None:
                conn.close()

    def _run_scanner(
        self,
        tickers: list[str],
        period: str,
        top_n: int,
    ) -> AgentResult:
        if not tickers:
            return AgentResult(
                agent_name="scanner",
                framework="native",
                status="success",
                output="No quoteable public tickers to scan.",
                raw_output={"top_results": [], "all_results": []},
                metadata={"scanned": 0, "skipped": "no_quoteable_tickers"},
            )
        return self.scanner.run({
            "tickers": tickers,
            "period": period,
            "top_n": top_n,
            "ai_summary": False,
        })

    @staticmethod
    def _scanner_top_results(scanner_result: AgentResult) -> list[dict]:
        raw_output = scanner_result.raw_output
        if not isinstance(raw_output, dict):
            return []
        top_results = raw_output.get("top_results") or []
        return [row for row in top_results if isinstance(row, dict)]

    def _fetch_news(self, top_results: list[dict], max_articles: int) -> dict[str, dict]:
        if max_articles <= 0:
            return {}

        news: dict[str, dict] = {}
        for row in top_results:
            ticker = str(row.get("ticker") or "").upper()
            if not ticker:
                continue
            try:
                data = self.news_fetcher.fetch_news_for_ticker(ticker, max_articles)
                articles = data.get("articles", []) if isinstance(data, dict) else []
                news[ticker] = {
                    "articles": articles[:max_articles],
                    "total_articles": len(articles),
                }
            except Exception as exc:
                logger.warning("News fetch failed for %s: %s", ticker, exc)
                news[ticker] = {"articles": [], "error": str(exc)}
        return news

    def _fetch_reddit(
        self,
        top_results: list[dict],
        max_tickers: int,
        posts_per_ticker: int,
    ) -> dict[str, object]:
        if max_tickers <= 0 or posts_per_ticker <= 0:
            return self._skipped_reddit()

        tickers = []
        seen: set[str] = set()
        for row in top_results:
            ticker = str(row.get("ticker") or "").upper()
            if not ticker or ticker in seen:
                continue
            seen.add(ticker)
            tickers.append(ticker)
            if len(tickers) >= max_tickers:
                break

        if not tickers:
            return self._skipped_reddit()

        try:
            data = self.reddit_scanner.scan_multiple_tickers(
                tickers,
                subreddits=DEFAULT_REDDIT_SUBREDDITS,
                limit=posts_per_ticker,
            )
        except Exception as exc:
            logger.warning("Reddit sweep failed: %s", exc)
            return {
                "source_status": "degraded",
                "tickers": {},
                "errors": [{"message": str(exc)}],
                "workflow_stage": "final_diligence",
                "diligence_only": True,
            }

        errors: list[dict] = []
        status = "ok"
        if isinstance(data, dict):
            for ticker_data in data.values():
                if not isinstance(ticker_data, dict):
                    continue
                if ticker_data.get("source_status") == "degraded":
                    status = "degraded"
                for error in ticker_data.get("errors", []):
                    if isinstance(error, dict):
                        errors.append(error)

        return {
            "source_status": status,
            "tickers": data if isinstance(data, dict) else {},
            "errors": errors,
            "workflow_stage": "final_diligence",
            "diligence_only": True,
        }

    @staticmethod
    def _skipped_reddit() -> dict[str, object]:
        return {
            "source_status": "skipped",
            "tickers": {},
            "errors": [],
            "workflow_stage": "final_diligence",
            "diligence_only": True,
        }

    def _fetch_ai_infra_update(self) -> dict[str, object]:
        try:
            return self.ai_infra_loader()
        except Exception as exc:
            logger.warning("AI infra update failed: %s", exc)
            return {
                "source_status": "degraded",
                "items": [],
                "errors": [{"message": str(exc)}],
            }

    def _build_insights(
        self,
        top_results: list[dict],
        news: dict[str, dict],
        x_result: dict[str, object],
        reddit: dict[str, object],
        ai_infra_update: dict[str, object],
        news_intelligence: list[dict[str, object]],
        top_n: int,
    ) -> list[dict[str, object]]:
        insights: list[dict[str, object]] = []

        for post in x_result.get("posts", []) if isinstance(x_result, dict) else []:
            if not isinstance(post, dict):
                continue
            signal_score = int(post.get("signal_score") or 0)
            insights.append({
                "source": "x",
                "score": 50 + min(50, signal_score * 2),
                "title": f"@{post.get('handle')}: {str(post.get('text') or '')[:160]}",
                "url": post.get("url"),
                "metadata": {
                    "matched_keywords": post.get("matched_keywords", []),
                    "lane": post.get("lane"),
                },
                })

        ai_infra_items = (
            ai_infra_update.get("items", []) if isinstance(ai_infra_update, dict) else []
        )
        for item in ai_infra_items:
            if not isinstance(item, dict):
                continue
            insights.append({
                "source": str(item.get("source") or "ai_infra_update"),
                "score": item.get("score", 0),
                "title": str(item.get("title") or "AI infra update"),
                "url": item.get("url"),
                "metadata": item.get("metadata") if isinstance(item.get("metadata"), dict) else {},
            })

        for row in top_results:
            ticker = str(row.get("ticker") or "").upper()
            score = float(row.get("opportunity_score") or 0)
            insights.append({
                "source": "scanner",
                "score": score,
                "title": (
                    f"{ticker} technical score {score:.1f}, "
                    f"signal {row.get('overall_signal', 'neutral')}, RSI {row.get('rsi', 'N/A')}"
                ),
                "url": None,
                "metadata": row,
            })

        for ticker, data in news.items():
            articles = data.get("articles", []) if isinstance(data, dict) else []
            for article in articles[:1]:
                if not isinstance(article, dict):
                    continue
                insights.append({
                    "source": "news",
                    "score": 45,
                    "title": f"{ticker}: {article.get('title')}",
                    "url": article.get("url"),
                    "metadata": {
                        "source": article.get("source"),
                        "sentiment": article.get("sentiment_label"),
                    },
                })

        for card in news_intelligence:
            insights.append(
                {
                    "source": "news_intelligence",
                    "score": card.get("score", 0),
                    "title": str(card.get("source_claim") or "News intelligence card"),
                    "url": card.get("source_url"),
                    "metadata": {
                        "insight_id": card.get("insight_id"),
                        "related_tickers": card.get("related_tickers", []),
                        "themes": card.get("themes", []),
                        "source_claim": card.get("source_claim"),
                        "cross_reference_status": card.get("cross_reference_status"),
                        "evidence": card.get("evidence", []),
                        "human_review": card.get("human_review", {}),
                    },
                }
            )

        insights.sort(key=lambda item: float(item.get("score") or 0), reverse=True)
        return insights[:top_n]

    def _build_reddit_diligence(self, reddit: dict[str, object]) -> list[dict[str, object]]:
        items: list[dict[str, object]] = []
        reddit_tickers = reddit.get("tickers", {}) if isinstance(reddit, dict) else {}
        if not isinstance(reddit_tickers, dict):
            return items

        for ticker, data in reddit_tickers.items():
            if not isinstance(data, dict):
                continue
            posts = data.get("posts", [])
            if not isinstance(posts, list) or not posts:
                continue
            post = posts[0]
            if not isinstance(post, dict):
                continue
            engagement = int(post.get("score") or 0) + int(post.get("num_comments") or 0)
            items.append({
                "source": "reddit",
                "score": min(90, 35 + engagement / 10),
                "title": f"r/{post.get('subreddit')}: {ticker} - {post.get('title')}",
                "url": post.get("url"),
                "metadata": {
                    "ticker": str(ticker).upper(),
                    "subreddit": post.get("subreddit"),
                    "score": post.get("score"),
                    "num_comments": post.get("num_comments"),
                    "sentiment": post.get("sentiment_label"),
                    "workflow_stage": "final_diligence",
                    "diligence_only": True,
                },
            })

        items.sort(key=lambda item: float(item.get("score") or 0), reverse=True)
        return items

    @staticmethod
    def _workflow_metadata(reddit: dict[str, object]) -> dict[str, object]:
        reddit_status = reddit.get("source_status") if isinstance(reddit, dict) else None
        return {
            "first_pass_sources": [
                "scanner",
                "news",
                "x",
                "ai_infra_update",
                "watchlist_events",
            ],
            "final_diligence_sources": ["reddit"],
            "reddit_stage": "final_diligence",
            "final_diligence_status": str(reddit_status or "unknown"),
            "reddit_policy": (
                "Run Reddit only after first-pass filters produce a candidate; "
                "use low-volume discovery only."
            ),
        }

    @staticmethod
    def _news_status(news: dict[str, dict]) -> str | None:
        for data in news.values():
            if isinstance(data, dict) and data.get("error"):
                return "degraded"
        return None

    @staticmethod
    def _source_status(
        scanner_result: AgentResult,
        news: dict[str, dict],
        x_result: dict[str, object],
        x_search_result: dict[str, object],
        ai_infra_update: dict[str, object],
    ) -> str:
        statuses = [scanner_result.status]
        news_status = MarketSweepService._news_status(news)
        if news_status:
            statuses.append(news_status)
        x_status = x_result.get("source_status") if isinstance(x_result, dict) else None
        if x_status:
            statuses.append(str(x_status))
        x_search_status = (
            x_search_result.get("source_status")
            if isinstance(x_search_result, dict)
            else None
        )
        if x_search_status:
            statuses.append(str(x_search_status))
        ai_infra_status = (
            ai_infra_update.get("source_status")
            if isinstance(ai_infra_update, dict)
            else None
        )
        if ai_infra_status:
            statuses.append(str(ai_infra_status))
        if "error" in statuses:
            return "error"
        if "degraded" in statuses:
            return "degraded"
        return "ok"
