# Quick Social Sentiment Gauge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight CLI that gives Ming a fast bull/bear/neutral social-media gauge for an arbitrary ticker list using the existing X followed-account and search infrastructure.

**Architecture:** Reuse `XWatchlistCollector` and the existing `config/x_watchlists.yaml`; do not add a second scraper, dashboard, database, scheduler, or browser workflow. Add one public custom-search method to `XWatchlistCollector`, then add a standalone sentiment service and CLI that collect posts, dedupe them, classify sentiment with a deterministic finance/social lexicon, and write JSON plus a compact Markdown/ASCII report under `D:\Crypto Data\Analysis`. The classifier is intentionally cheap and deterministic in v1; FinTwitBERT/FinBERT can be added later behind the same classifier interface if the lexicon is too noisy.

**Tech Stack:** Python 3, existing `twscrape`/`twikit` via `backend.services.x_watchlist`, `unittest`, no new runtime dependency in v1.

---

## Common Ground Assumptions

`/common-ground` was used as a plan-authoring gate. Because this is a plan and not implementation, these assumptions are recorded here as the boundary contract for execution:

- ESTABLISHED: `C:\Repos\tickerpulse-ai` is the target repo because it already owns `XWatchlistCollector`, `/news`, and the X watchlist config.
- ESTABLISHED: X ingestion must reuse `C:\Repos\twscrape` primary and `C:\Repos\twikit` backup through `FallbackXRunner`; no custom X scraper is allowed for v1.
- WORKING: The first usable product is a standalone CLI/report, not dashboard UI and not a scheduled job.
- WORKING: The output is a quick gauge, not a trading signal; the report must label source coverage and search failures clearly.
- WORKING: Deterministic lexicon classification is acceptable for v1 if the output keeps examples and caveats visible. No transformer model download is required.
- OPEN: StockTwits should stay out of v1. It is a good later lane because it has explicit self-labeled bullish/bearish posts, but adding it now would widen scope.

## Dependency Graph

```text
CLI args
  -> backend.scripts.run_social_sentiment_gauge
  -> backend.services.social_sentiment_gauge
  -> backend.services.x_watchlist.XWatchlistCollector
  -> existing FallbackXRunner / twscrape / twikit
  -> normalized post dicts
  -> deterministic classifier
  -> ticker summaries + report artifacts
```

## Boundary Contracts

**Boundary:** `XWatchlistCollector.collect_custom_searches -> social_sentiment_gauge.build_social_sentiment_gauge`
- End goal served: arbitrary tickers supplied at CLI time get a recent X search lane without editing `config/x_watchlists.yaml`.
- Fake-pass checks: a search method exists; `runner.search()` returns without exception; `queries_checked` increments; output file exists.
- Connected means: `collector.collect_custom_searches()` returns a mapping with `posts`, `source_status`, `queries_checked`, and `errors`.
- Consumer-visible data flowing means: at least one returned search post contains `text`, `date`, `url`, `source_query`, `lane`, `signal_score`, and `ticker_seeds`, and `build_social_sentiment_gauge()` counts it under the intended ticker.
- Acceptance rule: a fake `$HOOD` search post with `ticker_seeds=("HOOD",)` appears in the HOOD summary and increments exactly one of `bullish`, `bearish`, or `neutral`.
- Ready condition: connected plus consumer-visible accepted post data under the requested ticker.
- Readiness revoked when: search returns zero posts for every requested ticker, raises a rate-limit/no-account error for every query, returns malformed post dicts without text, or omits the ticker seed required for attribution.
- Recovery/fail behavior: keep followed-account results, mark the search lane `error` or `degraded`, include query errors in the result, and render the caveat instead of failing the whole gauge.
- Smallest safe proof: one fake collector with one account post and one custom search post for one ticker; no live X call required for unit proof.

**Boundary:** `normalized posts -> LightweightFinancialSentimentClassifier -> ticker summary`
- End goal served: turn noisy posts into quick bull/bear/neutral counts.
- Fake-pass checks: classifier returns a string; post text contains a positive or negative word; final report contains a table.
- Connected means: each post text is passed to `classify(text)` and receives a `SentimentResult`.
- Consumer-visible data flowing means: the ticker summary contains `posts`, `bullish`, `bearish`, `neutral`, `followed_posts`, `search_posts`, and example posts with classifier labels and reasons.
- Acceptance rule: known positive, negative, and neutral fixture posts are classified as `bullish`, `bearish`, and `neutral`; totals equal the number of unique counted posts.
- Ready condition: connected plus examples and counts that reconcile exactly to the deduped input posts.
- Readiness revoked when: a post is counted under no ticker, counted twice for the same ticker, or totals do not equal `bullish + bearish + neutral`.
- Recovery/fail behavior: classify malformed/empty text as neutral with reason `empty_text`; never raise from classifier on user text.
- Smallest safe proof: three in-memory posts for one ticker, one per sentiment class.

**Boundary:** `social sentiment result -> CLI artifact writer -> user-readable report`
- End goal served: Ming gets a quick saved artifact and terminal output comparable to the manual scrape summary.
- Fake-pass checks: process exits 0; directory exists; JSON file exists; stdout has any text.
- Connected means: CLI invokes `build_social_sentiment_gauge()` and receives a result mapping.
- Consumer-visible data flowing means: `social_sentiment_raw.json`, `social_sentiment_summary.json`, and `social_sentiment_report.md` contain the requested tickers and the same per-ticker counts.
- Acceptance rule: a CLI test using a patched service writes all three files, and the report includes a rectangular ASCII table row for `HOOD`.
- Ready condition: connected plus file contents accepted by JSON parsing and report text assertions.
- Readiness revoked when: output write fails, report omits a requested ticker, JSON cannot parse, or CLI accepts zero tickers.
- Recovery/fail behavior: return exit code 2 for missing tickers via argparse, return nonzero only for unexpected exceptions, and write search/source caveats into successful reports.
- Smallest safe proof: patched service result for one ticker and a temporary output directory.

## File Structure

- Modify: `backend/services/x_watchlist.py`
  - Add `collections.abc.Mapping` and `Sequence` imports.
  - Add public method `XWatchlistCollector.collect_custom_searches`.
  - Keep existing `collect_searches()` behavior unchanged by sharing a helper or duplicating the small loop.
- Create: `backend/services/social_sentiment_gauge.py`
  - Owns ticker normalization, ad hoc X search query construction, deterministic classification, aggregation, report formatting, and artifact writing.
- Create: `backend/scripts/run_social_sentiment_gauge.py`
  - Standalone CLI wrapper.
- Create: `tests/test_x_watchlist_custom_search.py`
  - Covers custom search normalization and degraded/error behavior with fakes.
- Create: `tests/test_social_sentiment_gauge.py`
  - Covers classifier, aggregation, dedupe, report formatting, artifact writing, and CLI behavior.

No changes in v1:
- `config/x_watchlists.yaml`
- `backend/services/news_layer_review.py`
- Dashboard/frontend files
- `requirements.txt`

---

### Task 1: Add Custom X Search Collection

**Files:**
- Modify: `backend/services/x_watchlist.py`
- Test: `tests/test_x_watchlist_custom_search.py`

**Boundary Contracts:** Applies `XWatchlistCollector.collect_custom_searches -> social_sentiment_gauge.build_social_sentiment_gauge` from the Boundary Contracts section.

**Task Smoke:**

| Stage / Boundary | Activated by | Output assertion | Consumer acceptance point | Production path/config/limits |
|------------------|--------------|------------------|---------------------------|-------------------------------|
| `runner.search -> collect_custom_searches` | one fake `XSearchQuery(name="ticker_HOOD", query="$HOOD lang:en")` | one normalized post with `source_query="ticker_HOOD"` and `ticker_seeds=["HOOD"]` | service can count ticker seed later | Yes - same collector method and same `runner.search` call shape |

**Smoke input:** one fake query and one fake tweet
**Time budget:** under 5 seconds

- [ ] **Step 1: Write the failing tests**

Create `tests/test_x_watchlist_custom_search.py`:

```python
import unittest

from backend.services.x_watchlist import XAccount
from backend.services.x_watchlist import XSearchQuery
from backend.services.x_watchlist import XWatchlistCollector
from backend.services.x_watchlist import XWatchlistConfig


def _tweet(tweet_id: str, text: str) -> dict[str, object]:
    return {
        "id": tweet_id,
        "id_str": tweet_id,
        "rawContent": text,
        "url": f"https://x.com/example/status/{tweet_id}",
        "date": "2026-06-16T14:00:00+00:00",
        "likeCount": 7,
        "retweetCount": 2,
        "replyCount": 1,
        "quoteCount": 0,
        "bookmarkedCount": 3,
        "source_backend": "twscrape",
    }


class _SearchRunner:
    def __init__(self, tweets: list[dict[str, object]] | None = None, fail_on: str = "") -> None:
        self.tweets = tweets or []
        self.fail_on = fail_on
        self.calls: list[tuple[str, str, int]] = []

    def search(self, query: str, limit: int) -> list[dict[str, object]]:
        self.calls.append(("search", query, limit))
        if self.fail_on and self.fail_on in query:
            raise RuntimeError("SearchTimeline unavailable")
        return [dict(tweet) for tweet in self.tweets[:limit]]

    def user_by_login(self, handle: str) -> dict[str, object]:
        return {"id_str": "1"}

    def user_tweets(self, user_id: str, limit: int) -> list[dict[str, object]]:
        return []


def _collector(runner: _SearchRunner) -> XWatchlistCollector:
    config = XWatchlistConfig(
        accounts=(XAccount(handle="semisource", lane="ai_semis", priority="highest", reason="r"),),
        search_queries=(),
        promote_keywords=("breakout", "layoff"),
    )
    return XWatchlistCollector(config=config, runner=runner)


class CustomSearchCollectionTest(unittest.TestCase):
    def test_collect_custom_searches_adds_ticker_seed_and_normalized_fields(self) -> None:
        runner = _SearchRunner([_tweet("1", "$HOOD breakout and record traffic")])
        collector = _collector(runner)
        query = XSearchQuery(name="ticker_HOOD", query="$HOOD lang:en -filter:retweets", priority="high")

        result = collector.collect_custom_searches(
            (query,),
            posts_per_query=5,
            ticker_seeds={"ticker_HOOD": ("HOOD",)},
        )

        self.assertEqual(result["source_status"], "ok")
        self.assertEqual(result["queries_checked"], 1)
        self.assertEqual(runner.calls, [("search", "$HOOD lang:en -filter:retweets", 5)])
        post = result["posts"][0]
        self.assertEqual(post["id"], "1")
        self.assertEqual(post["source_query"], "ticker_HOOD")
        self.assertEqual(post["ticker_seeds"], ["HOOD"])
        self.assertEqual(post["source_backend"], "twscrape")
        self.assertGreater(post["engagement"], 0)
        self.assertIn("breakout", [keyword.lower() for keyword in post["matched_keywords"]])

    def test_collect_custom_searches_degrades_when_one_query_fails(self) -> None:
        runner = _SearchRunner([_tweet("1", "$HOOD breakout")], fail_on="$DAVE")
        collector = _collector(runner)
        queries = (
            XSearchQuery(name="ticker_HOOD", query="$HOOD lang:en", priority="high"),
            XSearchQuery(name="ticker_DAVE", query="$DAVE lang:en", priority="high"),
        )

        result = collector.collect_custom_searches(
            queries,
            posts_per_query=3,
            ticker_seeds={"ticker_HOOD": ("HOOD",), "ticker_DAVE": ("DAVE",)},
        )

        self.assertEqual(result["source_status"], "degraded")
        self.assertEqual(result["queries_checked"], 2)
        self.assertEqual(len(result["posts"]), 1)
        self.assertEqual(result["errors"], [{"query": "ticker_DAVE", "message": "SearchTimeline unavailable"}])

    def test_collect_custom_searches_reports_error_when_all_queries_fail(self) -> None:
        runner = _SearchRunner(fail_on="$HOOD")
        collector = _collector(runner)
        query = XSearchQuery(name="ticker_HOOD", query="$HOOD lang:en", priority="high")

        result = collector.collect_custom_searches((query,), posts_per_query=3)

        self.assertEqual(result["source_status"], "error")
        self.assertEqual(result["queries_checked"], 1)
        self.assertEqual(result["posts"], [])
        self.assertEqual(result["errors"], [{"query": "ticker_HOOD", "message": "SearchTimeline unavailable"}])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m unittest tests.test_x_watchlist_custom_search -v
```

Expected: fail with `AttributeError: 'XWatchlistCollector' object has no attribute 'collect_custom_searches'`.

- [ ] **Step 3: Implement the minimal collection method**

Modify imports in `backend/services/x_watchlist.py`:

```python
from collections.abc import Awaitable, Callable, Mapping, Sequence
```

Add this method inside `class XWatchlistCollector`, directly after `collect_searches()`:

```python
    def collect_custom_searches(
        self,
        queries: Sequence[XSearchQuery],
        posts_per_query: int = 40,
        ticker_seeds: Mapping[str, Sequence[str]] | None = None,
    ) -> dict[str, object]:
        posts: list[dict[str, object]] = []
        errors: list[dict[str, str]] = []
        successful_queries = 0
        selected_queries = tuple(queries)
        seed_map = ticker_seeds or {}

        for query in selected_queries:
            try:
                tweets = self.runner.search(query.query, posts_per_query)[:posts_per_query]
                successful_queries += 1
                for tweet in tweets:
                    post = self._normalize_search_post(query, tweet)
                    seeds = [str(seed).strip().upper().lstrip("$") for seed in seed_map.get(query.name, ()) if str(seed).strip()]
                    if seeds:
                        post["ticker_seeds"] = seeds
                    posts.append(post)
            except Exception as exc:
                logger.warning("Custom X search failed for %s: %s", query.name, _error_log_summary(exc))
                errors.append({"query": query.name, "message": str(exc)})

        posts.sort(
            key=lambda post: (
                int(post.get("signal_score", 0)),
                int(post.get("engagement", 0)),
            ),
            reverse=True,
        )

        if errors and successful_queries:
            source_status = "degraded"
        elif errors:
            source_status = "error"
        elif selected_queries and not posts:
            errors.append(
                {
                    "query": "*",
                    "message": (
                        f"All {len(selected_queries)} custom queries succeeded but returned "
                        "0 posts; X session may be stale, rate-limited, or the tickers are quiet."
                    ),
                }
            )
            source_status = "degraded"
        else:
            source_status = "ok"

        return {
            "source": "x_custom_search",
            "source_status": source_status,
            "queries_checked": len(selected_queries),
            "posts": posts,
            "errors": errors,
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m unittest tests.test_x_watchlist_custom_search -v
```

Expected: 3 tests pass.

- [ ] **Step 5: Run relevant existing X tests**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m unittest tests.test_x_watchlist_list_lane tests.test_x_watchlist_twikit_fallback -v
```

Expected: existing X watchlist tests pass; `collect_searches()` behavior is unchanged.

- [ ] **Step 6: Commit**

```powershell
cd C:\Repos\tickerpulse-ai
git add backend/services/x_watchlist.py tests/test_x_watchlist_custom_search.py
git commit -m "feat: add custom X search collection"
```

---

### Task 2: Add Sentiment Classification And Aggregation Service

**Files:**
- Create: `backend/services/social_sentiment_gauge.py`
- Test: `tests/test_social_sentiment_gauge.py`

**Boundary Contracts:** Applies `normalized posts -> LightweightFinancialSentimentClassifier -> ticker summary` from the Boundary Contracts section.

**Task Smoke:**

| Stage / Boundary | Activated by | Output assertion | Consumer acceptance point | Production path/config/limits |
|------------------|--------------|------------------|---------------------------|-------------------------------|
| `fake collector -> gauge service` | one followed post and three custom-search posts for `HOOD` | HOOD summary has 4 posts and totals reconcile | service result consumed by report formatter in Task 3 | Yes - same service entry point and collector protocol |
| `classifier -> summary` | texts contain bullish, bearish, and neutral fixtures | labels include all three sentiment classes | per-ticker count fields | Yes - default classifier |

**Smoke input:** one fake collector result with four posts for one ticker
**Time budget:** under 5 seconds

- [ ] **Step 1: Write the failing tests**

Create `tests/test_social_sentiment_gauge.py` with these initial tests:

```python
import unittest
from datetime import datetime
from datetime import timezone

from backend.services.x_watchlist import XAccount
from backend.services.x_watchlist import XSearchQuery
from backend.services.x_watchlist import XWatchlistConfig


class _FakeCollector:
    def __init__(self) -> None:
        self.config = XWatchlistConfig(
            accounts=(XAccount(handle="semisource", lane="ai_semis", priority="highest", reason="r"),),
            search_queries=(),
            promote_keywords=("breakout", "layoff", "downtime", "record traffic"),
        )
        self.account_call: dict[str, int] | None = None
        self.search_call: dict[str, object] | None = None

    def collect_accounts(
        self,
        max_accounts: int,
        posts_per_account: int,
        topup_max_accounts: int = 12,
    ) -> dict[str, object]:
        self.account_call = {
            "max_accounts": max_accounts,
            "posts_per_account": posts_per_account,
            "topup_max_accounts": topup_max_accounts,
        }
        return {
            "source_status": "ok",
            "accounts_checked": max_accounts,
            "posts": [
                {
                    "id": "followed-1",
                    "handle": "semisource",
                    "lane": "ai_semis",
                    "date": "2026-06-16T13:00:00+00:00",
                    "text": "$HOOD record traffic and prediction markets are a strong product tailwind",
                    "url": "https://x.com/semisource/status/followed-1",
                    "matched_keywords": ["record traffic"],
                    "signal_score": 20,
                    "engagement": 10,
                    "source_reliability_score": 8.0,
                },
                {
                    "id": "old-1",
                    "handle": "semisource",
                    "lane": "ai_semis",
                    "date": "2026-05-01T13:00:00+00:00",
                    "text": "$HOOD old stale bullish note",
                    "url": "https://x.com/semisource/status/old-1",
                    "matched_keywords": [],
                    "signal_score": 99,
                    "engagement": 10,
                    "source_reliability_score": 8.0,
                },
            ],
            "errors": [],
        }

    def collect_custom_searches(
        self,
        queries,
        posts_per_query: int,
        ticker_seeds,
    ) -> dict[str, object]:
        self.search_call = {
            "queries": tuple(query.name for query in queries),
            "posts_per_query": posts_per_query,
            "ticker_seeds": dict(ticker_seeds),
        }
        return {
            "source_status": "ok",
            "queries_checked": len(queries),
            "posts": [
                {
                    "id": "search-1",
                    "source_query": "ticker_HOOD",
                    "lane": "x_custom_search:ticker_HOOD",
                    "date": "2026-06-16T14:00:00+00:00",
                    "text": "$HOOD breakout with upside momentum",
                    "url": "https://x.com/example/status/search-1",
                    "matched_keywords": ["breakout"],
                    "signal_score": 7,
                    "engagement": 4,
                    "ticker_seeds": ["HOOD"],
                },
                {
                    "id": "search-2",
                    "source_query": "ticker_HOOD",
                    "lane": "x_custom_search:ticker_HOOD",
                    "date": "2026-06-16T14:05:00+00:00",
                    "text": "$HOOD layoffs and app downtime are downside risk",
                    "url": "https://x.com/example/status/search-2",
                    "matched_keywords": ["layoff", "downtime"],
                    "signal_score": 7,
                    "engagement": 3,
                    "ticker_seeds": ["HOOD"],
                },
                {
                    "id": "search-3",
                    "source_query": "ticker_HOOD",
                    "lane": "x_custom_search:ticker_HOOD",
                    "date": "2026-06-16T14:10:00+00:00",
                    "text": "$HOOD mentioned in a neutral watchlist",
                    "url": "https://x.com/example/status/search-3",
                    "matched_keywords": [],
                    "signal_score": 5,
                    "engagement": 1,
                    "ticker_seeds": ["HOOD"],
                },
                {
                    "id": "promo-1",
                    "source_query": "ticker_HOOD",
                    "lane": "x_custom_search:ticker_HOOD",
                    "date": "2026-06-16T14:20:00+00:00",
                    "text": "$HOOD exact entries in my telegram signals",
                    "url": "https://x.com/example/status/promo-1",
                    "matched_keywords": [],
                    "signal_score": 5,
                    "engagement": 1,
                    "ticker_seeds": ["HOOD"],
                },
            ],
            "errors": [],
        }


class SocialSentimentGaugeTest(unittest.TestCase):
    def test_lightweight_classifier_labels_finance_social_text(self) -> None:
        from backend.services.social_sentiment_gauge import LightweightFinancialSentimentClassifier

        classifier = LightweightFinancialSentimentClassifier()

        self.assertEqual(classifier.classify("$HOOD breakout with upside momentum").label, "bullish")
        self.assertEqual(classifier.classify("$HOOD layoffs and downtime are downside risk").label, "bearish")
        self.assertEqual(classifier.classify("$HOOD mentioned in a neutral watchlist").label, "neutral")

    def test_build_gauge_counts_posts_by_ticker_and_source_lane(self) -> None:
        from backend.services.social_sentiment_gauge import build_social_sentiment_gauge

        collector = _FakeCollector()
        result = build_social_sentiment_gauge(
            ("hood",),
            collector=collector,
            now=datetime(2026, 6, 16, 15, 0, tzinfo=timezone.utc),
            posts_per_account=2,
            posts_per_query=4,
            lookback_hours=72,
        )

        self.assertEqual(collector.account_call, {"max_accounts": 1, "posts_per_account": 2, "topup_max_accounts": 1})
        self.assertEqual(collector.search_call["queries"], ("ticker_HOOD",))
        self.assertEqual(collector.search_call["ticker_seeds"], {"ticker_HOOD": ("HOOD",)})
        hood = result["tickers"][0]
        self.assertEqual(hood["ticker"], "HOOD")
        self.assertEqual(hood["posts"], 4)
        self.assertEqual(hood["bullish"], 2)
        self.assertEqual(hood["bearish"], 1)
        self.assertEqual(hood["neutral"], 1)
        self.assertEqual(hood["followed_posts"], 1)
        self.assertEqual(hood["search_posts"], 3)
        self.assertEqual(hood["promotional_posts_dropped"], 1)
        self.assertEqual(hood["stale_posts_dropped"], 1)
        self.assertEqual(len(hood["examples"]), 4)

    def test_duplicate_post_id_is_counted_once_per_ticker(self) -> None:
        from backend.services.social_sentiment_gauge import build_social_sentiment_gauge

        collector = _FakeCollector()
        original = collector.collect_custom_searches

        def duplicate_searches(queries, posts_per_query, ticker_seeds):
            payload = original(queries, posts_per_query, ticker_seeds)
            payload["posts"].append(dict(payload["posts"][0]))
            return payload

        collector.collect_custom_searches = duplicate_searches
        result = build_social_sentiment_gauge(
            ("HOOD",),
            collector=collector,
            now=datetime(2026, 6, 16, 15, 0, tzinfo=timezone.utc),
            posts_per_account=2,
            posts_per_query=4,
            lookback_hours=72,
        )

        hood = result["tickers"][0]
        self.assertEqual(hood["posts"], 4)
        self.assertEqual(hood["bullish"], 2)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m unittest tests.test_social_sentiment_gauge -v
```

Expected: fail with `ModuleNotFoundError: No module named 'backend.services.social_sentiment_gauge'`.

- [ ] **Step 3: Create the service**

Create `backend/services/social_sentiment_gauge.py`:

```python
"""Lightweight social sentiment gauge built on the existing X watchlist collector."""

from __future__ import annotations

import json
import os
import re
from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from backend.services.news_story_cards import grade_source
from backend.services.news_story_cards import post_datetime
from backend.services.news_story_cards import post_text
from backend.services.news_story_cards import tickers_for_post
from backend.services.news_story_cards import truncate
from backend.services.x_watchlist import XSearchQuery
from backend.services.x_watchlist import XWatchlistCollector


SENTIMENT_LABELS = ("bullish", "bearish", "neutral")
PROMO_REASON = "promotional_post"

BULLISH_PATTERNS = (
    "bullish",
    "breakout",
    "upside",
    "record traffic",
    "record-breaking",
    "strong",
    "stronger",
    "growth",
    "tailwind",
    "momentum",
    "upgrade",
    "buy rating",
    "new high",
    "all-time high",
    "52 week high",
    "short squeeze",
    "positive data",
    "undervalued",
    "cheap",
    "added with size",
    "adding",
    "beat",
    "beats",
)

BEARISH_PATTERNS = (
    "bearish",
    "downside",
    "layoff",
    "layoffs",
    "downtime",
    "down detector",
    "downdetector",
    "risk",
    "risks",
    "weakness",
    "weak",
    "downgrade",
    "sell rating",
    "lawsuit",
    "dilution",
    "dilutive",
    "exit scam",
    "scam",
    "fraud",
    "puts",
    "put volume",
    "miss",
    "misses",
)

PROMO_PATTERNS = (
    "telegram",
    "discord",
    "whop",
    "exact entries",
    "entries/exits",
    "free signals",
    "join my",
)


@dataclass(frozen=True)
class SentimentResult:
    label: str
    score: int
    reasons: Sequence[str]


class LightweightFinancialSentimentClassifier:
    def classify(self, text: str) -> SentimentResult:
        lowered = text.lower()
        if not lowered.strip():
            return SentimentResult(label="neutral", score=0, reasons=("empty_text",))

        bull_reasons = tuple(pattern for pattern in BULLISH_PATTERNS if pattern in lowered)
        bear_reasons = tuple(pattern for pattern in BEARISH_PATTERNS if pattern in lowered)
        bull_score = len(bull_reasons)
        bear_score = len(bear_reasons)
        if "🚀" in text or "📈" in text:
            bull_score += 1
            bull_reasons = (*bull_reasons, "emoji_up")
        if "📉" in text:
            bear_score += 1
            bear_reasons = (*bear_reasons, "emoji_down")

        if bull_score > bear_score:
            return SentimentResult(label="bullish", score=bull_score - bear_score, reasons=bull_reasons)
        if bear_score > bull_score:
            return SentimentResult(label="bearish", score=bear_score - bull_score, reasons=bear_reasons)
        return SentimentResult(label="neutral", score=0, reasons=("balanced_or_no_signal",))


def normalize_ticker(ticker: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9.]", "", ticker.strip().upper().lstrip("$"))
    if not normalized:
        raise ValueError("Ticker values must contain at least one letter or number.")
    return normalized


def build_ticker_queries(tickers: Sequence[str]) -> Sequence[XSearchQuery]:
    queries: list[XSearchQuery] = []
    for ticker in tickers:
        normalized = normalize_ticker(ticker)
        query = f"(${normalized}) lang:en -filter:retweets"
        queries.append(XSearchQuery(name=f"ticker_{normalized}", query=query, priority="high"))
    return tuple(queries)


def default_social_sentiment_output_dir(now: datetime | None = None) -> Path:
    generated = now or datetime.now(timezone.utc)
    root = Path(os.getenv("TICKERPULSE_SOCIAL_SENTIMENT_OUTPUT_ROOT", r"D:\Crypto Data\Analysis"))
    return root / f"{generated:%Y%m%d} - Social sentiment gauge"


def build_social_sentiment_gauge(
    tickers: Sequence[str],
    *,
    collector: XWatchlistCollector | object | None = None,
    posts_per_account: int = 3,
    posts_per_query: int = 40,
    lookback_hours: int = 168,
    now: datetime | None = None,
) -> dict[str, object]:
    generated = now or datetime.now(timezone.utc)
    normalized_tickers = tuple(dict.fromkeys(normalize_ticker(ticker) for ticker in tickers))
    if not normalized_tickers:
        raise ValueError("At least one ticker is required.")

    x_collector = collector or XWatchlistCollector()
    account_count = len(getattr(getattr(x_collector, "config", None), "accounts", ()) or ())
    max_accounts = max(0, account_count)
    accounts = x_collector.collect_accounts(
        max_accounts=max_accounts,
        posts_per_account=max(1, posts_per_account),
        topup_max_accounts=max_accounts,
    )
    queries = build_ticker_queries(normalized_tickers)
    seed_map = {query.name: (query.name.removeprefix("ticker_"),) for query in queries}
    searches = x_collector.collect_custom_searches(
        queries,
        posts_per_query=max(1, posts_per_query),
        ticker_seeds=seed_map,
    )

    classifier = LightweightFinancialSentimentClassifier()
    combined_posts = [
        *(_payload_posts(accounts, source_lane="followed")),
        *(_payload_posts(searches, source_lane="search")),
    ]
    summaries = [
        _summarize_ticker(
            ticker,
            combined_posts,
            classifier=classifier,
            generated_at=generated,
            lookback_hours=max(1, lookback_hours),
        )
        for ticker in normalized_tickers
    ]
    return {
        "schema_version": 1,
        "generated_at": generated.isoformat(),
        "source_status": _combined_status(accounts, searches),
        "requested_tickers": list(normalized_tickers),
        "accounts": _source_metadata(accounts),
        "searches": _source_metadata(searches),
        "tickers": summaries,
        "caveats": _caveats(accounts, searches),
    }


def format_social_sentiment_report(result: Mapping[str, object]) -> str:
    lines = [
        "# Quick Social Sentiment Gauge",
        "",
        f"Generated: {result.get('generated_at', '')}",
        f"Source status: {result.get('source_status', 'unknown')}",
        "",
        "+--------+-------+------+------+------+----------+--------+",
        "| Ticker | Posts | Bull | Bear | Neut | Followed | Search |",
        "+--------+-------+------+------+------+----------+--------+",
    ]
    for row in result.get("tickers", []):
        if not isinstance(row, Mapping):
            continue
        lines.append(
            "| {ticker:<6} | {posts:>5} | {bullish:>4} | {bearish:>4} | {neutral:>4} | {followed_posts:>8} | {search_posts:>6} |".format(
                ticker=str(row.get("ticker") or "")[:6],
                posts=int(row.get("posts") or 0),
                bullish=int(row.get("bullish") or 0),
                bearish=int(row.get("bearish") or 0),
                neutral=int(row.get("neutral") or 0),
                followed_posts=int(row.get("followed_posts") or 0),
                search_posts=int(row.get("search_posts") or 0),
            )
        )
    lines.append("+--------+-------+------+------+------+----------+--------+")
    lines.append("")
    lines.append("## Readout")
    for row in result.get("tickers", []):
        if not isinstance(row, Mapping):
            continue
        lines.append(f"- {row.get('ticker')}: {row.get('verdict')}")
        for example in row.get("examples", [])[:3]:
            if isinstance(example, Mapping):
                source = example.get("source")
                label = example.get("sentiment")
                text = example.get("text")
                url = example.get("url")
                lines.append(f"  - [{label}] @{source}: {text} ({url})")
    caveats = result.get("caveats")
    if isinstance(caveats, list) and caveats:
        lines.append("")
        lines.append("## Caveats")
        for caveat in caveats:
            lines.append(f"- {caveat}")
    return "\n".join(lines).rstrip() + "\n"


def write_social_sentiment_artifacts(
    result: Mapping[str, object],
    report_markdown: str,
    output_dir: Path,
) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    raw_path = output_dir / "social_sentiment_raw.json"
    summary_path = output_dir / "social_sentiment_summary.json"
    report_path = output_dir / "social_sentiment_report.md"
    raw_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    summary_payload = {
        "generated_at": result.get("generated_at"),
        "source_status": result.get("source_status"),
        "requested_tickers": result.get("requested_tickers"),
        "tickers": result.get("tickers"),
        "caveats": result.get("caveats"),
    }
    summary_path.write_text(json.dumps(summary_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    report_path.write_text(report_markdown, encoding="utf-8")
    return {"raw_json": raw_path, "summary_json": summary_path, "report_markdown": report_path}


def _payload_posts(payload: Mapping[str, object], *, source_lane: str) -> list[dict[str, object]]:
    raw_posts = payload.get("posts")
    if not isinstance(raw_posts, list):
        return []
    posts: list[dict[str, object]] = []
    for item in raw_posts:
        if isinstance(item, dict):
            post = {str(key): value for key, value in item.items()}
            post["social_source_lane"] = source_lane
            posts.append(post)
    return posts


def _summarize_ticker(
    ticker: str,
    posts: Sequence[Mapping[str, object]],
    *,
    classifier: LightweightFinancialSentimentClassifier,
    generated_at: datetime,
    lookback_hours: int,
) -> dict[str, object]:
    seen_ids: set[str] = set()
    counted: list[dict[str, object]] = []
    stale_dropped = 0
    promo_dropped = 0
    for post in posts:
        post_id = str(post.get("id") or post.get("url") or post_text(post))
        if post_id in seen_ids:
            continue
        if not _post_mentions_ticker(post, ticker):
            continue
        if not _within_lookback(post, generated_at=generated_at, lookback_hours=lookback_hours):
            stale_dropped += 1
            continue
        if _is_promotional(post):
            promo_dropped += 1
            continue
        seen_ids.add(post_id)
        sentiment = classifier.classify(post_text(post))
        counted.append(_example(post, sentiment))

    totals = Counter(str(item["sentiment"]) for item in counted)
    followed_posts = sum(1 for item in counted if item.get("source_lane") == "followed")
    search_posts = sum(1 for item in counted if item.get("source_lane") == "search")
    examples = sorted(counted, key=lambda item: (item.get("source_lane") != "followed", -int(item.get("engagement") or 0)))[:8]
    return {
        "ticker": ticker,
        "posts": len(counted),
        "bullish": totals["bullish"],
        "bearish": totals["bearish"],
        "neutral": totals["neutral"],
        "followed_posts": followed_posts,
        "search_posts": search_posts,
        "promotional_posts_dropped": promo_dropped,
        "stale_posts_dropped": stale_dropped,
        "verdict": _verdict(totals),
        "examples": examples,
    }


def _post_mentions_ticker(post: Mapping[str, object], ticker: str) -> bool:
    tags = {tag.upper().lstrip("$") for tag in tickers_for_post(post)}
    return ticker in tags


def _within_lookback(post: Mapping[str, object], *, generated_at: datetime, lookback_hours: int) -> bool:
    timestamp = post_datetime(post)
    if timestamp is None:
        return True
    age_seconds = (generated_at - timestamp).total_seconds()
    return age_seconds <= lookback_hours * 3600


def _is_promotional(post: Mapping[str, object]) -> bool:
    text = post_text(post).lower()
    if any(pattern in text for pattern in PROMO_PATTERNS):
        return True
    return int(grade_source(post).get("score") or 0) <= 0


def _example(post: Mapping[str, object], sentiment: SentimentResult) -> dict[str, object]:
    return {
        "id": str(post.get("id") or ""),
        "source": str(post.get("handle") or post.get("source_query") or "x"),
        "source_lane": str(post.get("social_source_lane") or ""),
        "lane": str(post.get("lane") or ""),
        "date": str(post.get("date") or ""),
        "sentiment": sentiment.label,
        "sentiment_score": sentiment.score,
        "sentiment_reasons": list(sentiment.reasons),
        "engagement": int(post.get("engagement") or 0),
        "text": truncate(post_text(post), 180),
        "url": str(post.get("url") or ""),
    }


def _verdict(totals: Counter[str]) -> str:
    bullish = totals["bullish"]
    bearish = totals["bearish"]
    neutral = totals["neutral"]
    if bullish >= bearish * 2 and bullish >= 2:
        return "bullish tilt"
    if bearish >= bullish * 2 and bearish >= 2:
        return "bearish tilt"
    if bullish > bearish:
        return "constructive but mixed"
    if bearish > bullish:
        return "negative but mixed"
    if neutral > 0:
        return "neutral or noisy"
    return "no current signal"


def _combined_status(accounts: Mapping[str, object], searches: Mapping[str, object]) -> str:
    statuses = {str(accounts.get("source_status") or "unknown"), str(searches.get("source_status") or "unknown")}
    if "error" in statuses and len(statuses) == 1:
        return "error"
    if "error" in statuses or "degraded" in statuses:
        return "degraded"
    if statuses == {"ok"}:
        return "ok"
    return "degraded"


def _source_metadata(payload: Mapping[str, object]) -> dict[str, object]:
    return {
        "source_status": payload.get("source_status"),
        "accounts_checked": payload.get("accounts_checked"),
        "queries_checked": payload.get("queries_checked"),
        "errors": payload.get("errors", []),
    }


def _caveats(accounts: Mapping[str, object], searches: Mapping[str, object]) -> list[str]:
    caveats: list[str] = []
    for error in accounts.get("errors", []) if isinstance(accounts.get("errors"), list) else []:
        if isinstance(error, Mapping):
            caveats.append(f"followed lane: {error.get('handle', '*')}: {error.get('message', '')}")
    for error in searches.get("errors", []) if isinstance(searches.get("errors"), list) else []:
        if isinstance(error, Mapping):
            caveats.append(f"search lane: {error.get('query', '*')}: {error.get('message', '')}")
    return caveats
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m unittest tests.test_social_sentiment_gauge -v
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```powershell
cd C:\Repos\tickerpulse-ai
git add backend/services/social_sentiment_gauge.py tests/test_social_sentiment_gauge.py
git commit -m "feat: add lightweight social sentiment gauge"
```

---

### Task 3: Add CLI And Artifact Writing

**Files:**
- Modify: `tests/test_social_sentiment_gauge.py`
- Create: `backend/scripts/run_social_sentiment_gauge.py`

**Boundary Contracts:** Applies `social sentiment result -> CLI artifact writer -> user-readable report` from the Boundary Contracts section.

**Task Smoke:**

| Stage / Boundary | Activated by | Output assertion | Consumer acceptance point | Production path/config/limits |
|------------------|--------------|------------------|---------------------------|-------------------------------|
| `CLI -> service -> artifact writer` | patched service returns one HOOD summary | raw JSON, summary JSON, and Markdown report exist and parse/render | user's terminal and analysis folder | Yes - same CLI parser and writer code |

**Smoke input:** one patched result for one ticker in a temporary directory
**Time budget:** under 5 seconds

- [ ] **Step 1: Add failing artifact/report tests**

Append these tests to `tests/test_social_sentiment_gauge.py`:

```python
import json
import tempfile
from pathlib import Path
from unittest.mock import patch


class SocialSentimentReportAndCliTest(unittest.TestCase):
    def _result(self) -> dict[str, object]:
        return {
            "schema_version": 1,
            "generated_at": "2026-06-16T15:00:00+00:00",
            "source_status": "ok",
            "requested_tickers": ["HOOD"],
            "tickers": [
                {
                    "ticker": "HOOD",
                    "posts": 4,
                    "bullish": 2,
                    "bearish": 1,
                    "neutral": 1,
                    "followed_posts": 1,
                    "search_posts": 3,
                    "verdict": "bullish tilt",
                    "examples": [
                        {
                            "source": "semisource",
                            "sentiment": "bullish",
                            "text": "$HOOD record traffic",
                            "url": "https://x.com/semisource/status/1",
                        }
                    ],
                }
            ],
            "caveats": [],
        }

    def test_report_formats_boxed_ascii_table(self) -> None:
        from backend.services.social_sentiment_gauge import format_social_sentiment_report

        report = format_social_sentiment_report(self._result())

        self.assertIn("+--------+-------+------+------+------+----------+--------+", report)
        self.assertIn("| HOOD   |     4 |    2 |    1 |    1 |        1 |      3 |", report)
        self.assertIn("- HOOD: bullish tilt", report)

    def test_artifact_writer_writes_json_and_markdown(self) -> None:
        from backend.services.social_sentiment_gauge import format_social_sentiment_report
        from backend.services.social_sentiment_gauge import write_social_sentiment_artifacts

        result = self._result()
        report = format_social_sentiment_report(result)
        with tempfile.TemporaryDirectory() as tmpdir:
            paths = write_social_sentiment_artifacts(result, report, Path(tmpdir))
            raw = json.loads(paths["raw_json"].read_text(encoding="utf-8"))
            summary = json.loads(paths["summary_json"].read_text(encoding="utf-8"))
            markdown = paths["report_markdown"].read_text(encoding="utf-8")

        self.assertEqual(raw["requested_tickers"], ["HOOD"])
        self.assertEqual(summary["tickers"][0]["ticker"], "HOOD")
        self.assertIn("Quick Social Sentiment Gauge", markdown)

    def test_cli_writes_report_for_requested_ticker(self) -> None:
        from backend.scripts import run_social_sentiment_gauge

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch.object(run_social_sentiment_gauge, "build_social_sentiment_gauge", return_value=self._result()) as build:
                exit_code = run_social_sentiment_gauge.main(["HOOD", "--output-dir", tmpdir])
            report = Path(tmpdir, "social_sentiment_report.md").read_text(encoding="utf-8")

        self.assertEqual(exit_code, 0)
        build.assert_called_once()
        self.assertIn("| HOOD", report)

    def test_cli_requires_at_least_one_ticker(self) -> None:
        from backend.scripts import run_social_sentiment_gauge

        with self.assertRaises(SystemExit) as ctx:
            run_social_sentiment_gauge.main([])

        self.assertEqual(ctx.exception.code, 2)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m unittest tests.test_social_sentiment_gauge -v
```

Expected: fail with `ImportError` for `backend.scripts.run_social_sentiment_gauge` or missing report functions if Task 2 did not include them.

- [ ] **Step 3: Create the CLI**

Create `backend/scripts/run_social_sentiment_gauge.py`:

```python
"""CLI entry point for the lightweight social sentiment gauge."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path

from backend.services.social_sentiment_gauge import build_social_sentiment_gauge
from backend.services.social_sentiment_gauge import default_social_sentiment_output_dir
from backend.services.social_sentiment_gauge import format_social_sentiment_report
from backend.services.social_sentiment_gauge import write_social_sentiment_artifacts


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    result = build_social_sentiment_gauge(
        tuple(args.tickers),
        posts_per_account=max(1, int(args.posts_per_account)),
        posts_per_query=max(1, int(args.posts_per_query)),
        lookback_hours=max(1, int(args.lookback_hours)),
    )
    report = format_social_sentiment_report(result)
    output_dir = Path(args.output_dir) if args.output_dir else default_social_sentiment_output_dir()
    paths = write_social_sentiment_artifacts(result, report, output_dir)
    if args.json:
        _write_stdout(json.dumps(_json_payload(result, paths), ensure_ascii=False, indent=2) + "\n")
    else:
        _write_stdout(report)
        _write_stdout(f"\nReport saved: {paths['report_markdown']}\n")
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run a lightweight X social sentiment gauge for tickers.")
    parser.add_argument("tickers", nargs="+", help="Ticker symbols, with or without '$'. Example: HOOD ICHR UCTT")
    parser.add_argument("--output-dir", default="", help="Directory for JSON and Markdown report artifacts.")
    parser.add_argument("--posts-per-account", type=int, default=3, help="Recent posts per followed X account.")
    parser.add_argument("--posts-per-query", type=int, default=40, help="Recent X search posts per ticker query.")
    parser.add_argument("--lookback-hours", type=int, default=168, help="Maximum post age to count.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable metadata instead of Markdown.")
    return parser


def _json_payload(result: dict[str, object], paths: dict[str, Path]) -> dict[str, object]:
    return {
        "generated_at": result.get("generated_at"),
        "source_status": result.get("source_status"),
        "requested_tickers": result.get("requested_tickers"),
        "tickers": result.get("tickers"),
        "paths": {key: str(value) for key, value in paths.items()},
        "caveats": result.get("caveats"),
    }


def _write_stdout(text: str) -> None:
    try:
        sys.stdout.write(text)
        return
    except UnicodeEncodeError:
        stdout_buffer = getattr(sys.stdout, "buffer", None)
        buffer_write = getattr(stdout_buffer, "write", None)
        if callable(buffer_write):
            buffer_write(text.encode("utf-8", errors="replace"))
            return

    encoding = sys.stdout.encoding or "utf-8"
    safe_text = text.encode(encoding, errors="replace").decode(encoding, errors="replace")
    sys.stdout.write(safe_text)


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m unittest tests.test_social_sentiment_gauge -v
```

Expected: all social sentiment tests pass.

- [ ] **Step 5: Commit**

```powershell
cd C:\Repos\tickerpulse-ai
git add backend/scripts/run_social_sentiment_gauge.py tests/test_social_sentiment_gauge.py
git commit -m "feat: add social sentiment gauge CLI"
```

---

### Task 4: Verification And Live Read-Only Smoke

**Files:**
- No new source files.
- Possible generated artifacts: `D:\Crypto Data\Analysis\YYYYMMDD - Social sentiment gauge\*`

**Boundary Contracts:** Applies all three boundary contracts.

**Task Smoke:**

| Stage / Boundary | Activated by | Output assertion | Consumer acceptance point | Production path/config/limits |
|------------------|--------------|------------------|---------------------------|-------------------------------|
| real X account lane -> gauge | `HOOD` with `--posts-per-account 1` | result has `accounts.source_status` as `ok` or `degraded`; no crash | raw JSON and report | Yes - real `XWatchlistCollector` and existing `x_watchlists.yaml` |
| real X search lane -> gauge | `HOOD` with `--posts-per-query 5` | result has search metadata and either posts or explicit errors | report caveats | Yes - real `collect_custom_searches` |
| artifact writer -> user | explicit output dir under `D:\Crypto Data\Analysis` | all three artifact files exist and JSON parses | saved report path printed | Yes - CLI writer |

**Smoke input:** one liquid ticker, `HOOD`
**Time budget:** under 90 seconds; if X rate-limits, the smoke still passes only when the report shows a degraded/error caveat and followed-account lane remains usable.

- [ ] **Step 1: Run focused unit tests**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m unittest tests.test_x_watchlist_custom_search tests.test_social_sentiment_gauge -v
```

Expected: all tests pass.

- [ ] **Step 2: Run affected existing tests**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m unittest tests.test_x_watchlist_list_lane tests.test_x_watchlist_twikit_fallback tests.test_news_layer_review -v
```

Expected: all tests pass. This verifies custom search did not break the existing `/news` collection flow.

- [ ] **Step 3: Run full test suite**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m unittest discover -s tests -v
```

Expected: full suite passes.

- [ ] **Step 4: Run live read-only smoke**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
$env:PYTHONUTF8='1'
venv\Scripts\python.exe -m backend.scripts.run_social_sentiment_gauge HOOD --posts-per-account 1 --posts-per-query 5 --lookback-hours 168 --output-dir "D:\Crypto Data\Analysis\20260616 - Social sentiment gauge smoke"
```

Expected:

```text
# Quick Social Sentiment Gauge
Generated: 2026-06-16T15:00:00+00:00
Source status: ok
Report saved: D:\Crypto Data\Analysis\20260616 - Social sentiment gauge smoke\social_sentiment_report.md
```

Acceptable degraded variant if X search is rate-limited:

```text
Source status: degraded
## Caveats
- search lane: ticker_HOOD: SearchTimeline unavailable
Report saved: D:\Crypto Data\Analysis\20260616 - Social sentiment gauge smoke\social_sentiment_report.md
```

- [ ] **Step 5: Validate artifact contents**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -c "import json; from pathlib import Path; root=Path(r'D:\Crypto Data\Analysis\20260616 - Social sentiment gauge smoke'); raw=json.loads((root/'social_sentiment_raw.json').read_text(encoding='utf-8')); summary=json.loads((root/'social_sentiment_summary.json').read_text(encoding='utf-8')); report=(root/'social_sentiment_report.md').read_text(encoding='utf-8'); assert raw['requested_tickers']==['HOOD']; assert summary['tickers'][0]['ticker']=='HOOD'; assert '| HOOD' in report; print('ok', raw['source_status'], summary['tickers'][0]['posts'])"
```

Expected: prints `ok` plus source status and post count.

- [ ] **Step 6: Commit verification-only doc note if needed**

If the live smoke reveals a stable operational caveat worth recording, append a short entry to `.ai/progress.md` without secrets:

```powershell
cd C:\Repos\tickerpulse-ai
Add-Content -Path .ai\progress.md -Value "- 2026-06-16 - Quick social sentiment gauge live smoke: HOOD completed; source_status=<ok-or-degraded>; artifacts under D:\Crypto Data\Analysis\20260616 - Social sentiment gauge smoke."
git add .ai/progress.md
git commit -m "chore: record social sentiment gauge smoke"
```

Skip this commit if `.ai/progress.md` is intentionally local-only for the current branch.

---

## Self-Review Checklist

**Spec coverage**
- User wants lightweight quick social-media gauge: covered by standalone CLI and deterministic classifier.
- User likes post counts and bull/bear counts: report includes posts, bull, bear, neutral, followed, and search counts.
- User asked whether established tools can do better: plan keeps a classifier interface but excludes heavy transformer dependency in v1.
- Existing followed-account preference: covered by `collect_accounts()` and followed/search split.
- Arbitrary tickers: covered by `collect_custom_searches()` with ad hoc ticker queries.

**Placeholder scan**
- No dashboard, scheduler, StockTwits, FinTwitBERT, or database scope is hidden in this plan.
- No step depends on unlisted files.
- No task uses a fake final-output-only smoke; every boundary has a consumer-visible assertion.

**Type consistency**
- `collect_custom_searches()` returns `dict[str, object]` matching `collect_searches()` shape.
- `ticker_seeds` is a list in normalized posts because `tickers_for_post()` already consumes list/tuple seeds.
- CLI calls `build_social_sentiment_gauge()` and `write_social_sentiment_artifacts()` exactly as defined in Task 2.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-16-quick-social-sentiment-gauge.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.
