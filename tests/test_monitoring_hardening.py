import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


class _FakeAnalytics:
    def get_stock_price_data(self, ticker: str, period: str) -> dict:
        return {
            "open": [100.0, 101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0,
                     108.0, 109.0, 110.0, 111.0, 112.0, 113.0, None],
            "high": [101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0, 108.0,
                     109.0, 110.0, 111.0, 112.0, 113.0, 114.0, None],
            "low": [99.0, 100.0, 101.0, 102.0, 103.0, 104.0, 105.0, 106.0,
                    107.0, 108.0, 109.0, 110.0, 111.0, 112.0, None],
            "close": [100.0, 101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0,
                      108.0, 109.0, 110.0, 111.0, 112.0, 113.0, None],
            "volume": [1000] * 14 + [None],
        }

    def calculate_rsi(self, prices: list[float], period: int = 14) -> float:
        return 55.0

    def calculate_macd(self, prices: list[float]) -> tuple[float, float, str]:
        return 1.0, 0.5, "bullish"

    def calculate_moving_averages(self, prices: list[float]) -> dict:
        return {"ma_20": {"value": 105.0, "signal": "bullish"}}

    def calculate_ema(self, prices: list[float], period: int) -> float:
        return 106.0


class _FakeRedditResponse:
    status_code = 403
    headers = {}

    def json(self) -> dict:
        return {}


class _FakeRedditSession:
    headers: dict = {}

    def get(self, *args, **kwargs) -> _FakeRedditResponse:
        return _FakeRedditResponse()


class MonitoringHardeningTest(unittest.TestCase):
    def test_technical_analyzer_sanitizes_trailing_null_ohlcv_bars(self) -> None:
        from backend.agents.tools.technical import TechnicalAnalyzer

        with patch("backend.agents.tools.technical._get_analytics", return_value=_FakeAnalytics()):
            result = TechnicalAnalyzer().analyze_ticker(
                "NVDA",
                "3mo",
                "rsi,macd,ma,bollinger,atr,vwap,obv,stochastic",
            )

        self.assertNotIn("error", result)
        self.assertEqual(result["current_price"], 113.0)
        self.assertEqual(result["data_points"], 14)
        self.assertIn("stochastic", result["indicators"])
        self.assertIn("atr", result["indicators"])

    def test_reddit_scanner_reports_degraded_source_errors(self) -> None:
        from backend.agents.tools.reddit_scanner import RedditScanner

        with patch("backend.agents.tools.reddit_scanner.requests.Session", return_value=_FakeRedditSession()):
            result = RedditScanner().scan_ticker("NVDA", ["wallstreetbets"], limit=1)

        self.assertEqual(result["source_status"], "degraded")
        self.assertEqual(result["total_mentions"], 0)
        self.assertEqual(result["errors"][0]["subreddit"], "wallstreetbets")
        self.assertEqual(result["errors"][0]["status_code"], 403)

    def test_x_watchlist_collector_scores_keyword_matches_from_config(self) -> None:
        from backend.services.x_watchlist import XWatchlistCollector, XWatchlistConfig

        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "x_watchlists.yaml"
            config_path.write_text(
                """
version: 1
quality_filters:
  promote_when_contains:
    - "HBM"
watchlists:
  user_seed_core:
    priority: highest
    accounts:
      - handle: "seed"
        lane: "ai_semis_supply_chain"
        reason: "seed account"
search_queries: []
""",
                encoding="utf-8",
            )

            config = XWatchlistConfig.load(config_path)
            collector = XWatchlistCollector(config=config, runner=_FakeTwscrapeRunner())
            result = collector.collect_accounts(max_accounts=1, posts_per_account=1)

        self.assertEqual(result["source_status"], "ok")
        self.assertEqual(result["accounts_checked"], 1)
        self.assertEqual(len(result["posts"]), 1)
        self.assertEqual(result["posts"][0]["handle"], "seed")
        self.assertGreaterEqual(result["posts"][0]["signal_score"], 10)
        self.assertIn("HBM", result["posts"][0]["matched_keywords"])


class _FakeTwscrapeRunner:
    def user_by_login(self, handle: str) -> dict:
        return {"id_str": "123", "username": handle}

    def user_tweets(self, user_id: str, limit: int) -> list[dict]:
        return [
            {
                "id_str": "tweet-1",
                "url": "https://x.com/seed/status/tweet-1",
                "date": "2026-06-05 12:00:00+00:00",
                "rawContent": "HBM supply shortage is getting worse for AI servers",
                "likeCount": 10,
                "retweetCount": 2,
                "replyCount": 1,
            },
            {
                "id_str": "tweet-2",
                "url": "https://x.com/seed/status/tweet-2",
                "date": "2026-06-05 12:01:00+00:00",
                "rawContent": "second row should be capped by collector",
                "likeCount": 0,
                "retweetCount": 0,
                "replyCount": 0,
            }
        ]


class _RecordingXRunner:
    def __init__(self) -> None:
        self.requested_handles: list[str] = []

    def user_by_login(self, handle: str) -> dict[str, object]:
        self.requested_handles.append(handle)
        return {"id_str": f"user-{handle}"}

    def user_tweets(self, user_id: str, limit: int) -> list[dict[str, object]]:
        handle = user_id.removeprefix("user-")
        return [
            {
                "id_str": f"tweet-{handle}",
                "rawContent": f"{handle} HBM DRAM demand check",
                "url": f"https://x.com/{handle}/status/1",
                "date": "2026-06-08T00:00:00+00:00",
                "likeCount": 1,
                "retweetCount": 0,
                "replyCount": 0,
                "quoteCount": 0,
                "bookmarkedCount": 0,
            }
        ]

    def search(self, query: str, limit: int) -> list[dict[str, object]]:
        return []


def test_x_collector_includes_late_user_requested_accounts() -> None:
    from backend.services.x_watchlist import (
        XAccount,
        XSearchQuery,
        XWatchlistCollector,
        XWatchlistConfig,
    )

    class RecordingRunner:
        def __init__(self) -> None:
            self.requested_handles: list[str] = []

        def user_by_login(self, handle: str) -> dict[str, object]:
            self.requested_handles.append(handle)
            return {"id_str": f"user-{handle}"}

        def user_tweets(self, user_id: str, limit: int) -> list[dict[str, object]]:
            handle = user_id.removeprefix("user-")
            return [
                {
                    "id_str": f"tweet-{handle}",
                    "rawContent": f"{handle} HBM DRAM demand check",
                    "url": f"https://x.com/{handle}/status/1",
                    "date": "2026-06-08T00:00:00+00:00",
                    "likeCount": 1,
                    "retweetCount": 0,
                    "replyCount": 0,
                    "quoteCount": 0,
                    "bookmarkedCount": 0,
                }
            ]

        def search(self, query: str, limit: int) -> list[dict[str, object]]:
            return []

    config = XWatchlistConfig(
        accounts=(
            XAccount(handle="early_low", lane="macro", priority="low", reason="Low-priority early source"),
            XAccount(handle="late_highest", lane="semis", priority="highest", reason="High-authority later source"),
            XAccount(
                handle="mindmoon_108",
                lane="user_requested_memory",
                priority="low",
                reason="User-requested memory-chip engineer",
            ),
        ),
        search_queries=(
            XSearchQuery(
                name="memory",
                query="(HBM OR DRAM OR memory) lang:en",
                priority="high",
            ),
        ),
        promote_keywords=("HBM", "DRAM"),
    )
    runner = RecordingRunner()
    collector = XWatchlistCollector(config=config, runner=runner)

    result = collector.collect_accounts(max_accounts=2, posts_per_account=1)

    assert result["accounts_checked"] == 2
    assert "mindmoon_108" in runner.requested_handles
    assert "late_highest" in runner.requested_handles
    assert "early_low" not in runner.requested_handles
    assert len(runner.requested_handles) == len(set(runner.requested_handles))


def test_x_collector_skips_optional_when_required_accounts_fill_limit() -> None:
    from backend.services.x_watchlist import XAccount, XWatchlistCollector, XWatchlistConfig

    config = XWatchlistConfig(
        accounts=(
            XAccount(
                handle="optional_highest",
                lane="semis",
                priority="highest",
                reason="Optional high-authority source",
            ),
            XAccount(
                handle="mindmoon_108",
                lane="user_requested_memory",
                priority="low",
                reason="User-requested memory-chip engineer",
            ),
        ),
        search_queries=(),
        promote_keywords=("HBM", "DRAM"),
    )
    runner = _RecordingXRunner()
    collector = XWatchlistCollector(config=config, runner=runner)

    result = collector.collect_accounts(max_accounts=1, posts_per_account=1)

    assert result["accounts_checked"] == 1
    assert runner.requested_handles == ["mindmoon_108"]


def test_x_collector_dedupes_required_accounts_before_optional_capacity() -> None:
    from backend.services.x_watchlist import XAccount, XWatchlistCollector, XWatchlistConfig

    config = XWatchlistConfig(
        accounts=(
            XAccount(
                handle="mindmoon_108",
                lane="user_requested_memory",
                priority="low",
                reason="User-requested memory-chip engineer",
            ),
            XAccount(
                handle="mindmoon_108",
                lane="user_requested_memory",
                priority="low",
                reason="Duplicate user-requested memory-chip engineer",
            ),
            XAccount(
                handle="optional_highest",
                lane="semis",
                priority="highest",
                reason="Optional high-authority source",
            ),
        ),
        search_queries=(),
        promote_keywords=("HBM", "DRAM"),
    )
    runner = _RecordingXRunner()
    collector = XWatchlistCollector(config=config, runner=runner)

    result = collector.collect_accounts(max_accounts=2, posts_per_account=1)

    assert result["accounts_checked"] == 2
    assert runner.requested_handles == ["mindmoon_108", "optional_highest"]
    assert len(runner.requested_handles) == len(set(runner.requested_handles))


def test_x_collector_collects_search_reactions() -> None:
    from backend.services.x_watchlist import (
        XAccount,
        XSearchQuery,
        XWatchlistCollector,
        XWatchlistConfig,
    )

    class SearchRunner:
        def user_by_login(self, handle: str) -> dict[str, object]:
            return {"id_str": f"user-{handle}"}

        def user_tweets(self, user_id: str, limit: int) -> list[dict[str, object]]:
            return []

        def search(self, query: str, limit: int) -> list[dict[str, object]]:
            assert query == "(HBM OR DRAM) lang:en"
            assert limit == 2
            return [
                {
                    "id_str": "search-1",
                    "rawContent": "HBM supply remains tight into the second half.",
                    "url": "https://x.com/mindmoon_108/status/2",
                    "date": "2026-06-08T01:00:00+00:00",
                    "likeCount": 20,
                    "retweetCount": 3,
                    "replyCount": 1,
                    "quoteCount": 0,
                    "bookmarkedCount": 4,
                }
            ]

    config = XWatchlistConfig(
        accounts=(XAccount(handle="mindmoon_108", lane="user_requested_memory", priority="low", reason="Memory source"),),
        search_queries=(XSearchQuery(name="memory", query="(HBM OR DRAM) lang:en", priority="high"),),
        promote_keywords=("HBM", "DRAM"),
    )
    collector = XWatchlistCollector(config=config, runner=SearchRunner())

    result = collector.collect_searches(max_queries=1, posts_per_query=2)

    assert result["source_status"] == "ok"
    assert result["queries_checked"] == 1
    assert result["posts"][0]["source_query"] == "memory"
    assert result["posts"][0]["lane"] == "x_search:memory"
    assert result["posts"][0]["reason"] == "Configured X search query: memory"
    assert result["posts"][0]["source_trust"] == "curated_search"
    assert result["posts"][0]["priority"] == "high"
    assert result["posts"][0]["matched_keywords"] == ["HBM"]


def test_x_collector_marks_empty_success_and_search_error_degraded() -> None:
    from backend.services.x_watchlist import XSearchQuery, XWatchlistCollector, XWatchlistConfig

    class PartialSearchRunner:
        def user_by_login(self, handle: str) -> dict[str, object]:
            return {"id_str": f"user-{handle}"}

        def user_tweets(self, user_id: str, limit: int) -> list[dict[str, object]]:
            return []

        def search(self, query: str, limit: int) -> list[dict[str, object]]:
            if query == "first lang:en":
                return []
            raise RuntimeError("search backend unavailable")

    config = XWatchlistConfig(
        accounts=(),
        search_queries=(
            XSearchQuery(name="first", query="first lang:en", priority="medium"),
            XSearchQuery(name="second", query="second lang:en", priority="medium"),
        ),
        promote_keywords=(),
    )
    collector = XWatchlistCollector(config=config, runner=PartialSearchRunner())

    result = collector.collect_searches(max_queries=2, posts_per_query=2)

    assert result["queries_checked"] == 2
    assert len(result["errors"]) == 1
    assert result["source_status"] == "degraded"


if __name__ == "__main__":
    unittest.main()
