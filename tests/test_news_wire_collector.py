import unittest


class _FakeMonitor:
    """Stands in for EnhancedStockNewsMonitor; only the methods the collector uses."""

    def __init__(self, articles_by_source=None, fail_sources=()):
        self.articles_by_source = articles_by_source or {}
        self.fail_sources = set(fail_sources)

    def _articles(self, source, ticker):
        if source in self.fail_sources:
            raise RuntimeError(f"{source} boom")
        return [dict(article) for article in self.articles_by_source.get((source, ticker), [])]

    def fetch_google_news(self, ticker):
        return self._articles("google", ticker)

    def fetch_yahoo_finance_rss(self, ticker):
        return self._articles("yahoo", ticker)

    def fetch_benzinga(self, ticker):
        return self._articles("benzinga", ticker)

    def calculate_sentiment(self, text, engagement):
        return 0.25, "positive"


def _article(title, url="https://example.com/a", published="2026-06-12T01:00:00+00:00"):
    return {
        "title": title,
        "description": "desc " + title,
        "url": url,
        "published_date": published,
        "engagement_score": 0,
    }


class NewsWireCollectorTest(unittest.TestCase):
    def test_normalizes_articles_to_story_card_posts(self):
        from backend.services.news_wire_collector import collect_news_wire

        monitor = _FakeMonitor({("google", "NVDA"): [_article("Nvidia ships Rubin")]})
        payload = collect_news_wire(tickers=["NVDA"], monitor=monitor)

        self.assertEqual(payload["source_status"], "ok")
        self.assertEqual(payload["tickers_checked"], 1)
        post = payload["posts"][0]
        self.assertEqual(post["source_type"], "news_wire")
        self.assertEqual(post["lane"], "news_wire")
        self.assertEqual(post["handle"], "news:Google News")
        self.assertEqual(post["ticker_seeds"], ["NVDA"])
        self.assertIn("Nvidia ships Rubin", post["text"])
        self.assertEqual(post["date"], "2026-06-12T01:00:00+00:00")
        self.assertEqual(post["sentiment_label"], "positive")

    def test_rfc822_dates_normalize_and_bad_dates_become_empty(self):
        from backend.services.news_wire_collector import collect_news_wire

        monitor = _FakeMonitor({
            ("google", "NVDA"): [
                _article("rfc822 story", url="https://example.com/r", published="Fri, 12 Jun 2026 01:30:00 GMT"),
                _article("bad date story", url="https://example.com/b", published="not a date"),
            ],
        })
        payload = collect_news_wire(tickers=["NVDA"], monitor=monitor)

        by_title = {post["title"]: post for post in payload["posts"]}
        self.assertEqual(by_title["rfc822 story"]["date"], "2026-06-12T01:30:00+00:00")
        self.assertEqual(by_title["bad date story"]["date"], "")

    def test_dedupes_same_title_across_tickers_and_merges_seeds(self):
        from backend.services.news_wire_collector import collect_news_wire

        shared = _article("Broadcom guidance shakes AI chips")
        monitor = _FakeMonitor({
            ("google", "NVDA"): [dict(shared)],
            ("google", "AVGO"): [dict(shared)],
        })
        payload = collect_news_wire(tickers=["NVDA", "AVGO"], monitor=monitor)

        self.assertEqual(len(payload["posts"]), 1)
        self.assertEqual(payload["posts"][0]["ticker_seeds"], ["AVGO", "NVDA"])
        self.assertEqual(payload["articles_collected"], 2)

    def test_source_failures_recorded_not_raised(self):
        from backend.services.news_wire_collector import collect_news_wire

        monitor = _FakeMonitor(
            {("yahoo", "NVDA"): [_article("survivor story")]},
            fail_sources={"google", "benzinga"},
        )
        payload = collect_news_wire(tickers=["NVDA"], monitor=monitor)

        self.assertEqual(payload["source_status"], "degraded")
        self.assertEqual(len(payload["posts"]), 1)
        self.assertEqual(len(payload["errors"]), 2)

    def test_all_failed_is_error_and_empty_quiet_is_degraded(self):
        from backend.services.news_wire_collector import collect_news_wire

        all_fail = _FakeMonitor(fail_sources={"google", "yahoo", "benzinga"})
        self.assertEqual(collect_news_wire(tickers=["NVDA"], monitor=all_fail)["source_status"], "error")

        quiet = _FakeMonitor()
        self.assertEqual(collect_news_wire(tickers=["NVDA"], monitor=quiet)["source_status"], "degraded")

    def test_articles_per_ticker_cap_applies_per_ticker(self):
        from backend.services.news_wire_collector import collect_news_wire

        monitor = _FakeMonitor({
            ("google", "NVDA"): [
                _article(f"story {i}", url=f"https://example.com/{i}",
                         published=f"2026-06-12T0{i}:00:00+00:00")
                for i in range(6)
            ],
        })
        payload = collect_news_wire(tickers=["NVDA"], articles_per_ticker=2, monitor=monitor)
        self.assertEqual(len(payload["posts"]), 2)
        # newest first
        self.assertEqual(payload["posts"][0]["title"], "story 5")

    def test_default_tickers_filter_us_and_private_in_order(self):
        from backend.services import news_wire_collector

        items = [
            {"ticker": "9984.T", "market": "Japan"},
            {"ticker": "NVDA", "market": "US"},
            {"ticker": "SPACEX", "market": "Private"},
            {"ticker": "AAPL", "market": "US"},
        ]
        from unittest.mock import patch
        with patch.object(news_wire_collector, "load_dashboard_watchlist", return_value=items):
            tickers = news_wire_collector.default_news_wire_tickers(max_tickers=2)
        self.assertEqual(tickers, ["NVDA", "SPACEX"])


if __name__ == "__main__":
    unittest.main()
