import json
import sqlite3
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from backend.services import x_watchlist as x_watchlist_module
from backend.services.x_watchlist import (
    FallbackXRunner,
    TwscrapeRunner,
    XAccount,
    XSearchQuery,
    XWatchlistCollector,
    XWatchlistConfig,
)


class _BrokenTwikitRunner:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def user_by_login(self, handle: str) -> dict[str, object]:
        self.calls.append(("user_by_login", handle))
        raise RuntimeError("Twikit account cookie session failed")

    def user_tweets(self, user_id: str, limit: int) -> list[dict[str, object]]:
        self.calls.append(("user_tweets", user_id))
        raise RuntimeError("should not keep retrying the broken primary")

    def search(self, query: str, limit: int) -> list[dict[str, object]]:
        self.calls.append(("search", query))
        raise RuntimeError("Twikit account runner does not serve search")


class _WorkingTwikitRunner:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def user_by_login(self, handle: str) -> dict[str, object]:
        self.calls.append(("user_by_login", handle))
        return {"id_str": "123", "source_backend": "twikit_account"}

    def user_tweets(self, user_id: str, limit: int) -> list[dict[str, object]]:
        self.calls.append(("user_tweets", user_id))
        return [
            {
                "id_str": "tweet-1",
                "rawContent": "HBM shortage update for AI data center supply",
                "date": "2026-06-13T12:00:00+00:00",
                "url": "https://x.com/source/status/tweet-1",
                "likeCount": 10,
                "retweetCount": 2,
                "replyCount": 1,
                "quoteCount": 0,
                "bookmarkedCount": 0,
                "source_backend": "twikit_account",
            }
        ][:limit]

    def search(self, query: str, limit: int) -> list[dict[str, object]]:
        self.calls.append(("search", query))
        return [
            {
                "id_str": "twikit-search-1",
                "rawContent": "Twikit authenticated search result",
                "date": "2026-06-13T13:00:00+00:00",
                "url": "https://x.com/search/status/twikit-search-1",
                "likeCount": 0,
                "retweetCount": 0,
                "replyCount": 0,
                "quoteCount": 0,
                "bookmarkedCount": 0,
                "source_backend": "twikit_account",
            }
        ][:limit]


class _TwscrapeRunner:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def user_by_login(self, handle: str) -> dict[str, object]:
        self.calls.append(("user_by_login", handle))
        return {"id_str": "456", "source_backend": "twscrape"}

    def user_tweets(self, user_id: str, limit: int) -> list[dict[str, object]]:
        self.calls.append(("user_tweets", user_id))
        return [
            {
                "id_str": "tweet-2",
                "rawContent": "Backup twscrape account timeline update",
                "date": "2026-06-13T12:30:00+00:00",
                "url": "https://x.com/source/status/tweet-2",
                "likeCount": 1,
                "retweetCount": 0,
                "replyCount": 0,
                "quoteCount": 0,
                "bookmarkedCount": 0,
                "source_backend": "twscrape",
            }
        ][:limit]

    def search(self, query: str, limit: int) -> list[dict[str, object]]:
        self.calls.append(("search", query))
        return [
            {
                "id_str": "search-1",
                "rawContent": "AI search result from twscrape",
                "date": "2026-06-13T13:00:00+00:00",
                "url": "https://x.com/search/status/search-1",
                "likeCount": 0,
                "retweetCount": 0,
                "replyCount": 0,
                "quoteCount": 0,
                "bookmarkedCount": 0,
                "source_backend": "twscrape",
            }
        ][:limit]


class _RateLimitedTwikitRunner(_WorkingTwikitRunner):
    def user_by_login(self, handle: str) -> dict[str, object]:
        self.calls.append(("user_by_login", handle))
        if handle == "limited":
            raise RuntimeError('status: 429, message: "Rate limit exceeded\\n"')
        return {"id_str": "123", "source_backend": "twikit_account"}


class _FakeTwikitUser:
    id = "42"
    screen_name = "openai"
    name = "OpenAI"


class _FakeTwikitTweet:
    id = "99"
    full_text = "CPO and 800VDC timeline update"
    text = "fallback text"
    created_at = "Sat Jun 13 12:00:00 +0000 2026"
    created_at_datetime = datetime(2026, 6, 13, 12, 0, tzinfo=timezone.utc)
    favorite_count = 5
    retweet_count = 3
    reply_count = 2
    quote_count = 1
    bookmark_count = 4
    user = _FakeTwikitUser()


class _FakeTwikitHttp:
    def __init__(self) -> None:
        self.close_count = 0

    async def aclose(self) -> None:
        self.close_count += 1


class _OriginalClientTransaction:
    home_page_response = False

    def generate_transaction_id(self, method: str, path: str) -> str:
        return "should-not-use-brittle-parser"


class _FakeTwikitAccountClient:
    def __init__(self) -> None:
        self.set_cookies_calls: list[tuple[dict[str, str], bool]] = []
        self.http = _FakeTwikitHttp()
        self.client_transaction = _OriginalClientTransaction()

    def set_cookies(self, cookies: dict[str, str], clear_cookies: bool = False) -> None:
        self.set_cookies_calls.append((dict(cookies), clear_cookies))

    async def get_user_by_screen_name(self, screen_name: str) -> _FakeTwikitUser:
        assert screen_name == "openai"
        return _FakeTwikitUser()

    async def get_user_tweets(self, user_id: str, tweet_type: str = "Tweets", count: int = 40) -> list[_FakeTwikitTweet]:
        assert user_id == "42"
        assert tweet_type == "Tweets"
        return [_FakeTwikitTweet()][:count]


def _write_accounts_db(
    db_path: Path,
    cookies: dict[str, str],
    *,
    username: str = "@Mingfan0",
    active: int = 1,
) -> None:
    con = sqlite3.connect(db_path)
    try:
        con.execute(
            "CREATE TABLE accounts ("
            "username TEXT, password TEXT, email TEXT, email_password TEXT,"
            "user_agent TEXT, active BOOLEAN, locks TEXT, headers TEXT,"
            "cookies TEXT, proxy TEXT, error_msg TEXT, stats TEXT,"
            "last_used TEXT, _tx TEXT, mfa_code TEXT)"
        )
        con.execute(
            "INSERT INTO accounts (username, active, cookies, headers) VALUES (?, ?, ?, '{}')",
            (username, active, json.dumps(cookies)),
        )
        con.commit()
    finally:
        con.close()


class TwikitFallbackRunnerTest(unittest.TestCase):
    def _twikit_account_runner_class(self) -> type:
        runner_class = getattr(x_watchlist_module, "TwikitAccountRunner", None)
        self.assertIsNotNone(runner_class, "TwikitAccountRunner must exist")
        return runner_class

    def test_default_runner_uses_twikit_account_primary_and_twscrape_backup(self) -> None:
        runner = FallbackXRunner()
        runner_class = self._twikit_account_runner_class()

        self.assertIsInstance(runner.primary, runner_class)
        self.assertIsInstance(runner.backup, TwscrapeRunner)
        self.assertIs(runner.search_runner, runner.primary)

    def test_twikit_primary_handles_account_calls_without_twscrape(self) -> None:
        primary = _WorkingTwikitRunner()
        backup = _TwscrapeRunner()
        runner = FallbackXRunner(primary=primary, backup=backup)

        self.assertEqual(runner.user_by_login("source")["id_str"], "123")
        self.assertEqual(runner.user_tweets("123", 1)[0]["id_str"], "tweet-1")

        self.assertEqual(primary.calls, [("user_by_login", "source"), ("user_tweets", "123")])
        self.assertEqual(backup.calls, [])

    def test_twikit_failure_falls_back_and_disables_primary_for_account_calls(self) -> None:
        primary = _BrokenTwikitRunner()
        backup = _TwscrapeRunner()
        runner = FallbackXRunner(primary=primary, backup=backup)

        self.assertEqual(runner.user_by_login("source")["id_str"], "456")
        self.assertEqual(runner.user_tweets("456", 1)[0]["id_str"], "tweet-2")

        self.assertEqual(primary.calls, [("user_by_login", "source")])
        self.assertEqual(backup.calls, [("user_by_login", "source"), ("user_tweets", "456")])

    def test_twikit_rate_limit_does_not_disable_primary_for_other_accounts(self) -> None:
        primary = _RateLimitedTwikitRunner()
        backup = _TwscrapeRunner()
        runner = FallbackXRunner(primary=primary, backup=backup)

        with self.assertRaisesRegex(RuntimeError, "Rate limit exceeded"):
            runner.user_by_login("limited")

        self.assertEqual(runner.user_by_login("source")["id_str"], "123")
        self.assertEqual(primary.calls, [("user_by_login", "limited"), ("user_by_login", "source")])
        self.assertEqual(backup.calls, [])

    def test_searches_route_to_twikit_primary(self) -> None:
        primary = _WorkingTwikitRunner()
        backup = _TwscrapeRunner()
        runner = FallbackXRunner(primary=primary, backup=backup)

        self.assertEqual(runner.search("AI", 1)[0]["id_str"], "twikit-search-1")

        self.assertEqual(primary.calls, [("search", "AI")])
        self.assertEqual(backup.calls, [])

    def test_search_falls_back_to_twscrape_when_twikit_search_breaks(self) -> None:
        primary = _BrokenTwikitRunner()
        backup = _TwscrapeRunner()
        runner = FallbackXRunner(primary=primary, backup=backup)

        self.assertEqual(runner.search("AI", 1)[0]["id_str"], "search-1")

        self.assertEqual(primary.calls, [("search", "AI")])
        self.assertEqual(backup.calls, [("search", "AI")])

    def test_collector_uses_shared_watchlist_with_twikit_primary_runner(self) -> None:
        config = XWatchlistConfig(
            accounts=(
                XAccount(
                    handle="source",
                    lane="ai_semis",
                    priority="highest",
                    reason="shared watchlist source",
                    alert_keywords=("HBM",),
                ),
            ),
            search_queries=(XSearchQuery(name="ai", query="AI", priority="high"),),
            promote_keywords=("data center",),
        )
        collector = XWatchlistCollector(
            config=config,
            runner=FallbackXRunner(primary=_WorkingTwikitRunner(), backup=_TwscrapeRunner()),
        )

        payload = collector.collect_accounts(max_accounts=1, posts_per_account=1)

        self.assertEqual(payload["source_status"], "ok")
        self.assertEqual(payload["accounts_checked"], 1)
        self.assertEqual(payload["posts"][0]["handle"], "source")
        self.assertEqual(payload["posts"][0]["source_backend"], "twikit_account")
        self.assertIn("HBM", payload["posts"][0]["matched_keywords"])

    def test_twikit_account_runner_loads_active_twscrape_cookies_and_normalizes_objects(self) -> None:
        client = _FakeTwikitAccountClient()
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "accounts.db"
            _write_accounts_db(
                db_path,
                {"auth_token": "dummy-auth", "ct0": "dummy-csrf", "twid": "u=123"},
            )
            runner = self._twikit_account_runner_class()(accounts_db_path=db_path, client_factory=lambda: client)

            user = runner.user_by_login("openai")
            tweets = runner.user_tweets("42", 1)

        self.assertEqual(
            client.set_cookies_calls,
            [({"auth_token": "dummy-auth", "ct0": "dummy-csrf", "twid": "u=123"}, True)],
        )
        self.assertEqual(client.http.close_count, 0)
        self.assertEqual(user["id_str"], "42")
        self.assertEqual(user["username"], "openai")
        self.assertEqual(user["source_backend"], "twikit_account")
        self.assertEqual(tweets[0]["id_str"], "99")
        self.assertEqual(tweets[0]["rawContent"], "CPO and 800VDC timeline update")
        self.assertEqual(tweets[0]["url"], "https://x.com/openai/status/99")
        self.assertEqual(tweets[0]["date"], "2026-06-13T12:00:00+00:00")
        self.assertEqual(tweets[0]["likeCount"], 5)
        self.assertEqual(tweets[0]["source_backend"], "twikit_account")

        runner.close()
        self.assertEqual(client.http.close_count, 1)

    def test_twikit_account_runner_bypasses_brittle_client_transaction_parser(self) -> None:
        client = _FakeTwikitAccountClient()
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "accounts.db"
            _write_accounts_db(db_path, {"auth_token": "dummy-auth", "ct0": "dummy-csrf"})
            runner = self._twikit_account_runner_class()(accounts_db_path=db_path, client_factory=lambda: client)

            runner.user_by_login("openai")

        self.assertTrue(client.client_transaction.home_page_response)
        self.assertEqual(client.client_transaction.generate_transaction_id("GET", "/i/api/graphql/test"), "")

    def test_twikit_account_runner_requires_active_twscrape_cookie_session(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "accounts.db"
            _write_accounts_db(db_path, {"auth_token": "dummy-auth"}, active=1)
            runner = self._twikit_account_runner_class()(
                accounts_db_path=db_path,
                client_factory=lambda: _FakeTwikitAccountClient(),
            )

            with self.assertRaisesRegex(RuntimeError, "No active twscrape cookie session"):
                runner.user_by_login("openai")


if __name__ == "__main__":
    unittest.main()
