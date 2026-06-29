import unittest

from backend.services.x_watchlist import (
    FallbackXRunner,
    XAccount,
    XSearchQuery,
    XWatchlistCollector,
    XWatchlistConfig,
)


def _tweet(tweet_id, author, text, date="2026-06-13T12:00:00+00:00", likes=10):
    return {
        "id": tweet_id,
        "id_str": tweet_id,
        "rawContent": text,
        "author_screen_name": author,
        "author_id": "uid-" + author,
        "url": f"https://x.com/{author}/status/{tweet_id}",
        "date": date,
        "likeCount": likes,
        "retweetCount": 0,
        "replyCount": 0,
        "quoteCount": 0,
        "bookmarkedCount": 0,
        "source_backend": "twikit_account",
    }


class _ListRunner:
    """Fake runner exposing list_tweets + search + per-account methods."""

    def __init__(self, list_tweets_result=None, search_result=None):
        self._list_tweets = list_tweets_result or []
        self._search = search_result or []
        self.calls: list[tuple] = []

    def list_tweets(self, list_id, limit):
        self.calls.append(("list_tweets", list_id, limit))
        return [dict(t) for t in self._list_tweets][:limit]

    def search(self, query, limit):
        self.calls.append(("search", query, limit))
        return [dict(t) for t in self._search][:limit]

    def user_by_login(self, handle):
        self.calls.append(("user_by_login", handle))
        return {"id_str": "per-acct-" + handle, "source_backend": "twikit_account"}

    def user_tweets(self, user_id, limit):
        self.calls.append(("user_tweets", user_id))
        return [_tweet("ut-" + user_id, "anyone", "per account path")][:limit]


def _config(list_id="", accounts=None, searches=None):
    accounts = accounts or (
        XAccount(handle="semisource", lane="ai_semis", priority="highest", reason="r", alert_keywords=("HBM",)),
        XAccount(handle="macro", lane="macro", priority="high", reason="r"),
    )
    return XWatchlistConfig(
        accounts=tuple(accounts),
        search_queries=tuple(searches or (XSearchQuery(name="ai", query="AI", priority="high"),)),
        promote_keywords=("CPO",),
        list_id=list_id,
    )


class ListLaneTest(unittest.TestCase):
    def test_list_path_maps_tweets_to_account_lane_and_drops_non_members(self):
        tweets = [
            _tweet("t1", "semisource", "HBM and CPO supply update"),
            _tweet("t2", "semisource", "second semisource post"),
            _tweet("t3", "macro", "macro liquidity note"),
            _tweet("t4", "randomoutsider", "not a configured account"),
        ]
        runner = _ListRunner(list_tweets_result=tweets)
        collector = XWatchlistCollector(config=_config(list_id="L123"), runner=runner)

        payload = collector.collect_accounts(max_accounts=46, posts_per_account=5)

        self.assertEqual(payload["source_status"], "ok")
        handles = sorted(p["handle"] for p in payload["posts"])
        self.assertEqual(handles, ["macro", "semisource", "semisource"])  # outsider dropped
        self.assertTrue(any(c[0] == "list_tweets" for c in runner.calls))
        self.assertFalse(any(c[0] == "user_tweets" for c in runner.calls))
        semi = [p for p in payload["posts"] if p["handle"] == "semisource"][0]
        self.assertEqual(semi["lane"], "ai_semis")
        self.assertEqual(semi["source_backend"], "twikit_account")
        self.assertIn("HBM", semi["matched_keywords"])

    def test_list_path_caps_posts_per_account(self):
        tweets = [_tweet(f"t{i}", "semisource", f"post {i}") for i in range(5)]
        runner = _ListRunner(list_tweets_result=tweets)
        collector = XWatchlistCollector(config=_config(list_id="L123"), runner=runner)
        payload = collector.collect_accounts(max_accounts=46, posts_per_account=2)
        semi = [p for p in payload["posts"] if p["handle"] == "semisource"]
        self.assertEqual(len(semi), 2)

    def test_list_path_dedupes_by_tweet_id(self):
        dup = _tweet("dup", "semisource", "same tweet twice")
        runner = _ListRunner(list_tweets_result=[dup, dict(dup)])
        collector = XWatchlistCollector(config=_config(list_id="L123"), runner=runner)
        payload = collector.collect_accounts(max_accounts=46, posts_per_account=5)
        self.assertEqual(len([p for p in payload["posts"] if p["id"] == "dup"]), 1)

    def test_no_list_id_uses_per_account_path(self):
        runner = _ListRunner()
        collector = XWatchlistCollector(config=_config(list_id=""), runner=runner)
        collector.collect_accounts(max_accounts=2, posts_per_account=1)
        self.assertTrue(any(c[0] == "user_tweets" for c in runner.calls))
        self.assertFalse(any(c[0] == "list_tweets" for c in runner.calls))

    def test_list_failure_falls_back_to_per_account(self):
        class _FailingList(_ListRunner):
            def list_tweets(self, list_id, limit):
                self.calls.append(("list_tweets", list_id, limit))
                raise RuntimeError("list endpoint boom")

        runner = _FailingList()
        collector = XWatchlistCollector(config=_config(list_id="L123"), runner=runner)
        collector.collect_accounts(max_accounts=2, posts_per_account=1)
        self.assertTrue(any(c[0] == "user_tweets" for c in runner.calls))


class SearchViaTwikitTest(unittest.TestCase):
    class _Primary:
        def __init__(self):
            self.calls: list[tuple] = []

        def user_by_login(self, handle):
            return {"id_str": "1"}

        def user_tweets(self, user_id, limit):
            return []

        def search(self, query, limit):
            self.calls.append(("search", query))
            return [_tweet("s1", "x", "primary search")][:limit]

    class _Backup:
        def __init__(self):
            self.calls: list[tuple] = []

        def user_by_login(self, handle):
            return {"id_str": "2"}

        def user_tweets(self, user_id, limit):
            return []

        def search(self, query, limit):
            self.calls.append(("search", query))
            return [_tweet("s2", "x", "backup search")][:limit]

    def test_default_search_runner_is_primary(self):
        runner = FallbackXRunner()
        self.assertIs(runner.search_runner, runner.primary)

    def test_search_routes_to_twikit_primary(self):
        primary, backup = self._Primary(), self._Backup()
        runner = FallbackXRunner(primary=primary, backup=backup)
        out = runner.search("AI", 1)
        self.assertEqual(out[0]["id_str"], "s1")
        self.assertEqual(primary.calls, [("search", "AI")])
        self.assertEqual(backup.calls, [])


class _ManyUserTweetsRunner(_ListRunner):
    """user_tweets returns several posts for the queried user (per-author cap test)."""

    def __init__(self, list_tweets_result=None, per_user=4):
        super().__init__(list_tweets_result=list_tweets_result)
        self._per_user = per_user

    def user_tweets(self, user_id, limit):
        self.calls.append(("user_tweets", user_id))
        return [_tweet(f"ut-{user_id}-{i}", "anyone", f"p{i}") for i in range(self._per_user)][:limit]


class _SharedIdRunner(_ListRunner):
    """user_tweets returns a tweet id that also came from the List (dedupe test)."""

    def user_tweets(self, user_id, limit):
        self.calls.append(("user_tweets", user_id))
        return [_tweet("shared", "anyone", "dup across sources")][:limit]


class _RateLimitUserTweetsRunner(_ListRunner):
    """user_tweets raises a 429-style error (rate-limit-stop test)."""

    def user_tweets(self, user_id, limit):
        self.calls.append(("user_tweets", user_id))
        raise RuntimeError("status: 429 Too Many Requests")


class ListTopupTest(unittest.TestCase):
    def _accounts(self):
        return (
            XAccount(handle="semisource", lane="ai_semis", priority="highest", reason="r", alert_keywords=("HBM",)),
            XAccount(handle="macro", lane="macro", priority="high", reason="r"),
        )

    def test_topup_fills_account_absent_from_list(self):
        runner = _ListRunner(list_tweets_result=[_tweet("m1", "macro", "macro note")])
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=self._accounts()), runner=runner)
        payload = collector.collect_accounts(max_accounts=46, posts_per_account=5, topup_max_accounts=12)
        handles = sorted({p["handle"] for p in payload["posts"]})
        self.assertEqual(handles, ["macro", "semisource"])
        self.assertTrue(any(c[0] == "user_by_login" and c[1] == "semisource" for c in runner.calls))
        self.assertTrue(any(c[0] == "user_tweets" for c in runner.calls))

    def test_topup_skipped_when_account_already_present(self):
        tweets = [_tweet("m1", "macro", "x"), _tweet("s1", "semisource", "HBM")]
        runner = _ListRunner(list_tweets_result=tweets)
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=self._accounts()), runner=runner)
        collector.collect_accounts(max_accounts=46, posts_per_account=5, topup_max_accounts=12)
        self.assertFalse(any(c[0] == "user_tweets" for c in runner.calls))

    def test_topup_respects_per_author_cap(self):
        runner = _ManyUserTweetsRunner(list_tweets_result=[_tweet("m1", "macro", "x")], per_user=4)
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=self._accounts()), runner=runner)
        payload = collector.collect_accounts(max_accounts=46, posts_per_account=2, topup_max_accounts=12)
        semi = [p for p in payload["posts"] if p["handle"] == "semisource"]
        self.assertEqual(len(semi), 2)

    def test_topup_dedupes_against_list_ids(self):
        runner = _SharedIdRunner(list_tweets_result=[_tweet("shared", "macro", "x")])
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=self._accounts()), runner=runner)
        payload = collector.collect_accounts(max_accounts=46, posts_per_account=5, topup_max_accounts=12)
        self.assertEqual(len([p for p in payload["posts"] if p["id"] == "shared"]), 1)

    def test_topup_budget_limits_to_highest_priority(self):
        accounts = (
            XAccount(handle="a_low", lane="l", priority="low", reason="r"),
            XAccount(handle="b_high", lane="l", priority="highest", reason="r"),
            XAccount(handle="c_med", lane="l", priority="medium", reason="r"),
        )
        runner = _ListRunner(list_tweets_result=[])
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=accounts), runner=runner)
        payload = collector.collect_accounts(max_accounts=46, posts_per_account=5, topup_max_accounts=1)
        handles = sorted({p["handle"] for p in payload["posts"]})
        self.assertEqual(handles, ["b_high"])

    def test_topup_stops_on_rate_limit(self):
        runner = _RateLimitUserTweetsRunner(list_tweets_result=[_tweet("m1", "macro", "x")])
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=self._accounts()), runner=runner)
        payload = collector.collect_accounts(max_accounts=46, posts_per_account=5, topup_max_accounts=12)
        self.assertTrue(any(p["handle"] == "macro" for p in payload["posts"]))
        self.assertTrue(any("rate limit" in e["message"].lower() for e in payload["errors"]))
        self.assertIn(payload["source_status"], ("ok", "degraded"))

    def test_topup_disabled_when_zero(self):
        runner = _ListRunner(list_tweets_result=[_tweet("m1", "macro", "x")])
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=self._accounts()), runner=runner)
        collector.collect_accounts(max_accounts=46, posts_per_account=5, topup_max_accounts=0)
        self.assertFalse(any(c[0] == "user_tweets" for c in runner.calls))

    def test_topup_uses_cached_user_id_without_login(self):
        accounts = (
            XAccount(handle="semisource", lane="ai_semis", priority="highest", reason="r", user_id="999"),
            XAccount(handle="macro", lane="macro", priority="high", reason="r"),
        )
        runner = _ListRunner(list_tweets_result=[_tweet("m1", "macro", "x")])
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=accounts), runner=runner)
        collector.collect_accounts(max_accounts=46, posts_per_account=5, topup_max_accounts=12)
        self.assertFalse(any(c[0] == "user_by_login" and c[1] == "semisource" for c in runner.calls))
        self.assertTrue(any(c == ("user_tweets", "999") for c in runner.calls))

    def test_list_path_respects_max_accounts_selection(self):
        # max_accounts=2 selects the two highest-priority; low1 is non-selected.
        accounts = (
            XAccount(handle="high1", lane="l", priority="highest", reason="r"),
            XAccount(handle="high2", lane="l", priority="high", reason="r"),
            XAccount(handle="low1", lane="l", priority="low", reason="r"),
        )
        # List window only carries the NON-selected account's tweet; it must be dropped.
        runner = _ListRunner(list_tweets_result=[_tweet("lo1", "low1", "should be dropped")])
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=accounts), runner=runner)
        payload = collector.collect_accounts(max_accounts=2, posts_per_account=5, topup_max_accounts=0)
        self.assertFalse(any(p["handle"] == "low1" for p in payload["posts"]))
        self.assertEqual(payload["accounts_checked"], 2)

    def test_topup_surfaces_accounts_beyond_budget(self):
        # 3 selected accounts, all absent from the List; cap=1 -> 1 attempted, 2 deferred.
        accounts = (
            XAccount(handle="a_high", lane="l", priority="highest", reason="r"),
            XAccount(handle="b_high", lane="l", priority="high", reason="r"),
            XAccount(handle="c_med", lane="l", priority="medium", reason="r"),
        )
        runner = _ListRunner(list_tweets_result=[])
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=accounts), runner=runner)
        payload = collector.collect_accounts(max_accounts=46, posts_per_account=5, topup_max_accounts=1)
        self.assertEqual(payload["source_status"], "degraded")
        deferred = [e for e in payload["errors"] if "not checked" in e["message"]]
        self.assertEqual(len(deferred), 1)
        self.assertIn("b_high", deferred[0]["message"])
        self.assertIn("c_med", deferred[0]["message"])
        self.assertNotIn("a_high", deferred[0]["message"])

    def test_max_accounts_zero_does_not_fetch_list(self):
        runner = _ListRunner(list_tweets_result=[_tweet("m1", "macro", "x")])
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=self._accounts()), runner=runner)
        payload = collector.collect_accounts(max_accounts=0, posts_per_account=5, topup_max_accounts=12)
        self.assertEqual(payload["source_status"], "ok")
        self.assertEqual(payload["posts"], [])
        self.assertEqual(payload["accounts_checked"], 0)
        self.assertFalse(any(c[0] == "list_tweets" for c in runner.calls))
        self.assertFalse(any(c[0] == "user_tweets" for c in runner.calls))


if __name__ == "__main__":
    unittest.main()
