import tempfile
import unittest
from pathlib import Path

from backend.services.news_layer_review import run_news_layer_review
from backend.services.x_watchlist import XAccount, XWatchlistConfig


class _SpyCollector:
    """Records the kwargs /news passes to collect_accounts."""

    def __init__(self, n_accounts=20):
        accounts = tuple(
            XAccount(handle=f"acct{i}", lane="l", priority="medium", reason="r")
            for i in range(n_accounts)
        )
        self.config = XWatchlistConfig(
            accounts=accounts, search_queries=(), promote_keywords=()
        )
        self.account_kwargs = None

    def collect_accounts(self, **kwargs):
        self.account_kwargs = kwargs
        return {
            "source": "x_watchlist",
            "source_status": "ok",
            "accounts_checked": 0,
            "posts": [],
            "errors": [],
            "config_warnings": [],
            "lane_mode": "list",
        }

    def collect_searches(self, **kwargs):
        return {
            "source": "x_search",
            "source_status": "ok",
            "queries_checked": 0,
            "posts": [],
            "errors": [],
        }


class NewsLayerTopupCapTest(unittest.TestCase):
    def test_news_covers_all_configured_accounts_no_deferral_cap(self):
        spy = _SpyCollector(n_accounts=20)
        with tempfile.TemporaryDirectory() as tmp:
            run_news_layer_review(
                x_collector=spy,
                output_dir=Path(tmp),
                vol_monitor=lambda: {},
                gamma_monitor=lambda: {},
                news_collector=lambda: {},
                tape_snapshot=lambda: {},
                ai_infra=lambda: {},
            )
        self.assertIsNotNone(spy.account_kwargs)
        # /news must size the top-up budget to cover every configured account,
        # so the production followed-account lane never silently defers members.
        self.assertEqual(
            spy.account_kwargs.get("topup_max_accounts"), len(spy.config.accounts)
        )


if __name__ == "__main__":
    unittest.main()
