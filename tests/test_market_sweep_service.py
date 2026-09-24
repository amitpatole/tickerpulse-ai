import unittest
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from backend.agents.base import AgentResult


class _FakeScanner:
    def __init__(self) -> None:
        self.inputs: dict | None = None

    def run(self, inputs: dict) -> AgentResult:
        self.inputs = inputs
        return AgentResult(
            agent_name="scanner",
            framework="native",
            status="success",
            output="scan ok",
            raw_output={
                "top_results": [
                    {
                        "ticker": "NVDA",
                        "opportunity_score": 82.0,
                        "current_price": 100.0,
                        "rsi": 45.0,
                        "overall_signal": "bullish",
                    }
                ]
            },
        )


class _FakeNewsFetcher:
    def fetch_news_for_ticker(self, ticker: str, max_articles: int = 3) -> dict:
        return {
            "ticker": ticker,
            "articles": [
                {
                    "title": "NVDA supplier flags HBM shortage",
                    "source": "Google News",
                    "url": "https://example.test/news",
                    "sentiment_label": "positive",
                }
            ],
        }


class _FakeXCollector:
    def collect_accounts(self, max_accounts: int = 12, posts_per_account: int = 5) -> dict:
        return {
            "source_status": "ok",
            "posts": [
                {
                    "handle": "zephyr_z9",
                    "text": "HBM shortage matters for AI servers",
                    "url": "https://x.com/zephyr_z9/status/1",
                    "signal_score": 18,
                    "matched_keywords": ["HBM", "shortage"],
                }
            ],
            "errors": [],
        }

    def collect_searches(self, max_queries: int = 3, posts_per_query: int = 10) -> dict:
        return {"source_status": "ok", "posts": [], "errors": [], "queries_checked": 0}


class _FakeRedditScanner:
    def scan_multiple_tickers(
        self,
        tickers: list[str],
        subreddits: list[str] | None = None,
        limit: int = 10,
    ) -> dict:
        return {
            "NVDA": {
                "ticker": "NVDA",
                "source_status": "ok",
                "total_mentions": 1,
                "total_score": 240,
                "total_comments": 80,
                "avg_sentiment": 0.4,
                "posts": [
                    {
                        "title": "NVDA HBM shortage DD",
                        "url": "https://www.reddit.com/r/stocks/comments/1/nvda",
                        "subreddit": "stocks",
                        "score": 240,
                        "num_comments": 80,
                        "sentiment_label": "positive",
                    }
                ],
                "errors": [],
            }
        }


class _FailingRedditScanner:
    def scan_multiple_tickers(
        self,
        tickers: list[str],
        subreddits: list[str] | None = None,
        limit: int = 10,
    ) -> dict:
        raise RuntimeError("reddit unavailable")


def _fake_ai_infra_update() -> dict:
    return {
        "source_status": "ok",
        "items": [
            {
                "source": "ai_infra_update",
                "score": 91.9,
                "title": "AI infra update: H100 SXM rental median $2.40, 7D -41.9%, 30D +4.7%, offers 16",
                "url": None,
                "metadata": {
                    "gpu": "H100 SXM",
                    "ticker": "NVDA",
                    "related_tickers": ["NVDA", "AMD"],
                },
            }
        ],
        "errors": [],
    }


class MarketSweepServiceTest(unittest.TestCase):
    def test_market_sweep_reuses_scanner_news_and_x_without_ai_summary(self) -> None:
        from backend.services.market_sweep import MarketSweepService

        scanner = _FakeScanner()
        service = MarketSweepService(
            scanner=scanner,
            news_fetcher=_FakeNewsFetcher(),
            x_collector=_FakeXCollector(),
            reddit_scanner=_FakeRedditScanner(),
            ai_infra_loader=_fake_ai_infra_update,
        )

        result = service.run(tickers=["NVDA"], include_x=True, include_reddit=False, top_n=5)

        self.assertEqual(scanner.inputs["tickers"], ["NVDA"])
        self.assertFalse(scanner.inputs["ai_summary"])
        self.assertEqual(result["source_status"], "ok")
        self.assertEqual(result["scanner"]["metadata"]["scanned"], 1)
        self.assertEqual(result["news"]["NVDA"]["articles"][0]["title"], "NVDA supplier flags HBM shortage")
        self.assertEqual(result["x"]["posts"][0]["handle"], "zephyr_z9")
        self.assertEqual(result["ai_infra_update"]["source_status"], "ok")
        self.assertTrue(any(item["source"] == "ai_infra_update" for item in result["insights"]))

    def test_market_sweep_emits_news_intelligence_cards(self) -> None:
        from backend.services.market_sweep import MarketSweepService

        class FakeScanner:
            def run(self, inputs: dict) -> AgentResult:
                return AgentResult(
                    agent_name="scanner",
                    framework="native",
                    status="success",
                    output="scan ok",
                    raw_output={
                        "top_results": [
                            {
                                "ticker": "MU",
                                "opportunity_score": 50,
                                "overall_signal": "neutral",
                                "rsi": 55,
                            }
                        ]
                    },
                    metadata={"scanned": 1},
                    error=None,
                )

        class FakeNewsFetcher:
            def fetch_news_for_ticker(self, ticker: str, max_articles: int) -> dict[str, object]:
                return {
                    "articles": [
                        {
                            "title": "Memory chip supply tightens as HBM demand rises",
                            "url": "https://example.com/memory-hbm",
                            "source": "Example Wire",
                            "published_at": "2026-06-08T00:30:00+00:00",
                        }
                    ]
                }

        class FakeXCollector:
            def collect_accounts(self, max_accounts: int, posts_per_account: int) -> dict[str, object]:
                return {
                    "source_status": "ok",
                    "posts": [
                        {
                            "handle": "mindmoon_108",
                            "lane": "user_requested_memory",
                            "reason": "Korean memory-chip engineer with supply/demand context",
                            "text": "HBM demand is still stronger than supply and DRAM allocation is tight.",
                            "url": "https://x.com/mindmoon_108/status/2",
                            "matched_keywords": ["HBM", "DRAM"],
                            "signal_score": 30,
                        }
                    ],
                    "errors": [],
                }

            def collect_searches(self, max_queries: int, posts_per_query: int) -> dict[str, object]:
                return {"source_status": "ok", "posts": [], "errors": [], "queries_checked": 0}

        service = MarketSweepService(
            scanner=FakeScanner(),
            news_fetcher=FakeNewsFetcher(),
            x_collector=FakeXCollector(),
            ai_infra_loader=lambda: {"source_status": "skipped", "items": [], "errors": []},
        )

        result = service.run(tickers=["MU"], include_x=True, include_ai_infra=False, top_n=5)

        cards = result["news_intelligence"]
        assert cards[0]["source_type"] == "news_intelligence"
        assert cards[0]["cross_reference_status"] == "expert_reaction_found"
        assert any(item["source"] == "news_intelligence" for item in result["insights"])

    def test_market_sweep_errors_when_x_search_fails(self) -> None:
        from backend.services.market_sweep import MarketSweepService

        class SearchFailingXCollector(_FakeXCollector):
            def collect_searches(self, max_queries: int, posts_per_query: int) -> dict:
                return {
                    "source_status": "error",
                    "posts": [],
                    "errors": [{"message": "x search unavailable"}],
                    "queries_checked": 1,
                }

        service = MarketSweepService(
            scanner=_FakeScanner(),
            news_fetcher=_FakeNewsFetcher(),
            x_collector=SearchFailingXCollector(),
            reddit_scanner=_FakeRedditScanner(),
            ai_infra_loader=_fake_ai_infra_update,
        )

        result = service.run(tickers=["NVDA"], include_x=True, include_ai_infra=False, top_n=5)

        self.assertEqual(result["x"]["source_status"], "ok")
        self.assertEqual(result["x_search"]["source_status"], "error")
        self.assertEqual(result["source_status"], "error")

    def test_market_sweep_degrades_when_news_fetch_fails(self) -> None:
        from backend.services.market_sweep import MarketSweepService

        class FailingNewsFetcher:
            def fetch_news_for_ticker(self, ticker: str, max_articles: int = 3) -> dict:
                raise RuntimeError("news unavailable")

        service = MarketSweepService(
            scanner=_FakeScanner(),
            news_fetcher=FailingNewsFetcher(),
            x_collector=_FakeXCollector(),
            reddit_scanner=_FakeRedditScanner(),
            ai_infra_loader=_fake_ai_infra_update,
        )

        result = service.run(tickers=["NVDA"], include_x=False, include_ai_infra=False, top_n=5)

        self.assertIn("error", result["news"]["NVDA"])
        self.assertEqual(result["source_status"], "degraded")

    def test_market_sweep_uses_active_dashboard_watchlist_by_default(self) -> None:
        from backend.services.market_sweep import MarketSweepService

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = str(Path(tmpdir) / "stocks.db")
            conn = sqlite3.connect(db_path)
            conn.execute(
                """
                CREATE TABLE stocks (
                    ticker TEXT PRIMARY KEY,
                    name TEXT,
                    market TEXT,
                    active INTEGER
                )
                """
            )
            conn.executemany(
                "INSERT INTO stocks (ticker, name, market, active) VALUES (?, ?, ?, ?)",
                [
                    ("NVDA", "NVIDIA Corporation", "US", 1),
                    ("AAPL", "Apple Inc.", "US", 1),
                    ("TSLA", "Tesla Inc.", "US", 0),
                ],
            )
            conn.commit()
            conn.close()

            scanner = _FakeScanner()
            service = MarketSweepService(
                scanner=scanner,
                news_fetcher=_FakeNewsFetcher(),
                x_collector=_FakeXCollector(),
                reddit_scanner=_FakeRedditScanner(),
                ai_infra_loader=_fake_ai_infra_update,
            )

            with patch("backend.config.Config.DB_PATH", db_path):
                result = service.run(tickers=None, include_x=False, include_reddit=False)

        self.assertEqual(scanner.inputs["tickers"], ["AAPL", "NVDA"])
        self.assertEqual(result["inputs"]["tickers"], ["AAPL", "NVDA"])

    def test_market_sweep_skips_private_dashboard_symbols_in_quote_scan(self) -> None:
        from backend.services.market_sweep import MarketSweepService

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = str(Path(tmpdir) / "stocks.db")
            conn = sqlite3.connect(db_path)
            conn.execute(
                """
                CREATE TABLE stocks (
                    ticker TEXT PRIMARY KEY,
                    name TEXT,
                    market TEXT,
                    active INTEGER
                )
                """
            )
            conn.executemany(
                "INSERT INTO stocks (ticker, name, market, active) VALUES (?, ?, ?, ?)",
                [
                    ("NVDA", "NVIDIA Corporation", "US", 1),
                    ("SPACEX", "SpaceX", "Private", 1),
                ],
            )
            conn.commit()
            conn.close()

            scanner = _FakeScanner()
            service = MarketSweepService(
                scanner=scanner,
                news_fetcher=_FakeNewsFetcher(),
                x_collector=_FakeXCollector(),
                reddit_scanner=_FakeRedditScanner(),
                ai_infra_loader=_fake_ai_infra_update,
            )

            with patch("backend.config.Config.DB_PATH", db_path):
                result = service.run(tickers=None, include_x=False, include_reddit=False)

        self.assertEqual(scanner.inputs["tickers"], ["NVDA"])
        self.assertEqual(result["inputs"]["tickers"], ["NVDA"])
        self.assertEqual(
            result["inputs"]["skipped_tickers"],
            [{"ticker": "SPACEX", "market": "Private", "reason": "private_market"}],
        )

    def test_market_sweep_includes_watchlist_events(self) -> None:
        from backend.services.market_sweep import MarketSweepService

        event = {
            "source": "watchlist_event",
            "score": 65,
            "title": "GENB: Generate Biomedicines IPO lock-up overhang",
            "metadata": {"ticker": "GENB", "event_date": "2026-08-26"},
        }
        service = MarketSweepService(
            scanner=_FakeScanner(),
            news_fetcher=_FakeNewsFetcher(),
            x_collector=_FakeXCollector(),
            reddit_scanner=_FakeRedditScanner(),
            ai_infra_loader=_fake_ai_infra_update,
        )

        with patch("backend.services.market_sweep.build_watchlist_event_insights", return_value=[event]):
            result = service.run(tickers=["NVDA"], include_x=False, include_reddit=False)

        self.assertEqual(result["watchlist_events"], [event])

    def test_market_sweep_includes_reddit_intake_when_enabled(self) -> None:
        from backend.services.market_sweep import MarketSweepService

        service = MarketSweepService(
            scanner=_FakeScanner(),
            news_fetcher=_FakeNewsFetcher(),
            x_collector=_FakeXCollector(),
            reddit_scanner=_FakeRedditScanner(),
            ai_infra_loader=_fake_ai_infra_update,
        )

        result = service.run(tickers=["NVDA"], include_x=False, include_reddit=True, top_n=5)

        self.assertEqual(result["reddit"]["source_status"], "ok")
        self.assertEqual(result["reddit"]["tickers"]["NVDA"]["total_mentions"], 1)
        self.assertFalse(any(item["source"] == "reddit" for item in result["insights"]))
        self.assertEqual(result["workflow"]["reddit_stage"], "final_diligence")
        self.assertEqual(result["workflow"]["final_diligence_status"], "ok")
        self.assertEqual(result["final_diligence"][0]["source"], "reddit")
        self.assertTrue(result["final_diligence"][0]["metadata"]["diligence_only"])
        self.assertEqual(
            result["final_diligence"][0]["metadata"]["workflow_stage"],
            "final_diligence",
        )

    def test_market_sweep_skips_reddit_by_default_for_second_stage_diligence(self) -> None:
        from backend.services.market_sweep import MarketSweepService

        service = MarketSweepService(
            scanner=_FakeScanner(),
            news_fetcher=_FakeNewsFetcher(),
            x_collector=_FakeXCollector(),
            reddit_scanner=_FailingRedditScanner(),
            ai_infra_loader=_fake_ai_infra_update,
        )

        result = service.run(tickers=["NVDA"], include_x=False)

        self.assertEqual(result["source_status"], "ok")
        self.assertEqual(result["reddit"]["source_status"], "skipped")
        self.assertFalse(any(item["source"] == "reddit" for item in result["insights"]))

    def test_reddit_failure_degrades_market_sweep_without_blocking_other_sources(self) -> None:
        from backend.services.market_sweep import MarketSweepService

        service = MarketSweepService(
            scanner=_FakeScanner(),
            news_fetcher=_FakeNewsFetcher(),
            x_collector=_FakeXCollector(),
            reddit_scanner=_FailingRedditScanner(),
            ai_infra_loader=_fake_ai_infra_update,
        )

        result = service.run(tickers=["NVDA"], include_x=False, include_reddit=True)

        self.assertEqual(result["source_status"], "ok")
        self.assertEqual(result["reddit"]["source_status"], "degraded")
        self.assertEqual(result["workflow"]["final_diligence_status"], "degraded")
        self.assertEqual(result["scanner"]["status"], "success")

    def test_watchlist_notes_loader_builds_due_event_insights(self) -> None:
        from backend.services.watchlist_notes import build_watchlist_event_insights

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "watchlist_notes.yaml"
            path.write_text(
                """
events:
  - ticker: GENB
    title: Generate Biomedicines IPO lock-up overhang
    event_date: "2026-08-26"
    user_note_basis: Watch restricted share overhang.
    process:
      - Watch volume after unlock.
    sources:
      - https://example.test/genb
""",
                encoding="utf-8",
            )

            events = build_watchlist_event_insights(
                now=datetime(2026, 6, 7, tzinfo=timezone.utc),
                lookahead_days=90,
                path=path,
            )

        self.assertEqual(events[0]["source"], "watchlist_event")
        self.assertEqual(events[0]["metadata"]["ticker"], "GENB")
        self.assertEqual(events[0]["metadata"]["event_date"], "2026-08-26")
        self.assertEqual(events[0]["metadata"]["days_until_event"], 80)

    def test_market_sweep_api_returns_service_result(self) -> None:
        from flask import Flask
        from backend.api.market_sweep import market_sweep_bp

        app = Flask(__name__)
        app.register_blueprint(market_sweep_bp)

        with patch("backend.api.market_sweep.MarketSweepService") as service_class:
            service_class.return_value.run.return_value = {
                "source_status": "ok",
                "insights": [],
            }
            response = app.test_client().post(
                "/api/market-sweep",
                json={"tickers": ["NVDA"], "include_x": False, "top_n": 3},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["source_status"], "ok")
        service_class.return_value.run.assert_called_once_with(
            tickers=["NVDA"],
            include_x=False,
            include_reddit=False,
            include_ai_infra=True,
            top_n=3,
            period="3mo",
            x_max_accounts=12,
            x_posts_per_account=5,
            news_max_articles=3,
            reddit_max_tickers=5,
            reddit_posts_per_ticker=5,
        )


if __name__ == "__main__":
    unittest.main()
