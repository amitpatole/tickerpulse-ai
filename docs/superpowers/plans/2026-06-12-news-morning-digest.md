# /news Morning Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a news-wire lane, market tape snapshot, and AI-infra (GPU rental) lane into the existing /news pipeline so the daily run produces a fused X+news story layer that Claude turns into a morning digest.

**Architecture:** Stage A collect (X posts existing; news via existing `EnhancedStockNewsMonitor` RSS fetchers; tape via yfinance; AI infra via existing `build_ai_infra_update`) -> Stage B fuse (news articles normalized to post dicts join the existing `news_story_cards` clustering; wire+X corroboration upgrades confidence) -> Stage C synthesize (Claude reads `tickerpulse_news_layer_summary.json` at /news time, light-verifies top stories, writes the digest). All new lanes follow the existing injected-callable pattern (`vol_monitor`).

**Tech Stack:** Python 3.12, feedparser (installed), yfinance (installed), unittest (existing test style), pytest as runner. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-11-news-morning-digest-design.md` (approved 2026-06-12)

---

## Common Ground: Confirmed Assumptions

A separate `/common-ground` round was not run because every load-bearing assumption is either (a) a user decision made explicitly during brainstorming, or (b) a fact verified by reading code in this session. The single environment unknown is handled by an early smoke gate.

User-confirmed in brainstorming (2026-06-11/12):
1. Run mode: interactive `/news` in a Claude session; no scheduling.
2. News intake: reuse the repo's existing fetchers; do NOT build a new scraper.
3. Verification depth: light (main thread, top 3-5 stories).
4. Source ladder: news wire BELOW followed-account original, ABOVE search echo citing primary.
5. Confidence: "wire + followed corroboration" ABOVE "two followed accounts".
6. News ticker scope: `dashboard_watchlist.yaml` US+Private in YAML order, cap 12, 3-5 articles each.
7. AI infra lane: wire `build_ai_infra_update` with a 36h staleness flag.

Code-verified this session:
1. `EnhancedStockNewsMonitor.__init__` creates SQLite tables (idempotent `init_database`) and a praw client (`backend/core/stock_monitor.py:61-81`). Plan deviation from spec wording: use the monitor's three fast RSS methods (`fetch_google_news`, `fetch_yahoo_finance_rss`, `fetch_benzinga`) + `calculate_sentiment` directly instead of the `NewsFetcher` wrapper, which hardcodes 7 sources including slow page scrapes (Seeking Alpha, MarketWatch, Finviz, StockTwits). Same reuse intent, faster and fewer fragile paths.
2. Story-card post contract: `text`, `date` (ISO only, `news_story_cards.py:110-124`), `handle`, `signal_score`, `source_reliability_score`.
3. `grade_source` infers `followed` from non-empty `handle` (`news_story_cards.py:194`) — news posts MUST set `source_type: "news_wire"` and `grade_source` must branch on it BEFORE the handle check, or news gets followed-account scores.
4. Grade scores are ints compared with `int(grade["score"])`; inserting a grade between 4 and 5 requires renumbering followed grades to 8/7/6 and news wire to 5.
5. `tickers_for_post` only regexes cashtags from text (`news_story_cards.py:172-173`); news headlines have no cashtags -> must union `ticker_seeds`.
6. `feedparser>=6.0.10` and `yfinance>=0.2.33` already in `backend/requirements.txt:15,25`.
7. Injection pattern to copy: `_build_vol_structure` (`news_layer_review.py:203-237`): injected callable wins; injected `x_collector` without the lane callable -> `skipped_injected_collector`; real default otherwise; exceptions become error payloads, never kill the run.
8. `run_news_layer_review` result/summary.json key sets verified at `news_layer_review.py:99-176`.

Open risk (handled, not assumed away):
- R1: RSS reachability from this machine. The twscrape outage was a Cloudflare IP block; Google News/Yahoo/Benzinga RSS may also be blocked or slow on this network. Task 1's smoke is the earliest real fetch; if it returns 0 articles, STOP and report (this changes architecture, e.g. agent-side fetch fallback), do not continue building on a dead lane.

## File Structure

Create:
- `backend/services/news_wire_collector.py` — news lane: ticker selection, parallel RSS fetch via monitor methods, normalization to story-card post dicts, dedupe. One responsibility: produce a `{"source_status", "posts", "errors", ...}` payload.
- `backend/services/market_tape_snapshot.py` — tape lane: fixed symbol list, yfinance closes, 1d/5d changes. Same payload discipline.
- `tests/test_news_wire_collector.py`, `tests/test_market_tape_snapshot.py`.

Modify:
- `backend/services/news_story_cards.py` — `tickers_for_post` (seed union), `grade_source` (news_wire origin + renumber), `_confidence` (two wire rungs).
- `backend/services/news_layer_review.py` — three new injected lanes, exec-summary/top-news fusion, new report sections, source-health extension, status semantics, empty-state copy, schema_version 2.
- `backend/scripts/run_news_layer_review.py` — `--news-max-tickers` flag.
- `tests/test_news_story_cards.py`, `tests/test_news_layer_review.py` — extend.
- `C:\Users\MingC\.claude\skills\news\SKILL.md` — Stage C digest contract.

Git: all work on branch `feat/news-morning-digest` (Task 0). NOTE: `news_story_cards.py`, `news_layer_review.py`, tests and configs are currently UNTRACKED — the first commit that includes them necessarily snapshots their current in-flight content too. That is intended (protects the 2026-06-10 ranking work); commit only files named in each task, never `git add -A`.

---

### Task 0: Branch + implementation notes

**Files:**
- Modify: `.ai/implementation-notes.md` (append; create heading if file missing)

**Boundary Contracts:** Not applicable - git/services bookkeeping, no data boundary.

**Task Smoke:** Not applicable - no pipeline stage touched.

- [ ] **Step 1: Create feature branch from local main HEAD**

```powershell
cd C:\Repos\tickerpulse-ai
git checkout -b feat/news-morning-digest
```

Deviation note (record in notes file): the usual rule is branch from `origin/master`; here we branch from local `main` HEAD because the working tree carries ~30 modified + ~30 untracked in-flight files shared with other agents, and rebasing the tree onto origin state is not ours to do. Branching from HEAD changes no tree content.

- [ ] **Step 2: Append a dated section to `.ai/implementation-notes.md`**

```markdown
## 2026-06-12 /news morning digest (feat/news-morning-digest)

Spec: docs/superpowers/specs/2026-06-11-news-morning-digest-design.md
Plan: docs/superpowers/plans/2026-06-12-news-morning-digest.md

Decisions/deviations:
- Branch cut from local main HEAD (not origin/master): shared dirty tree, see plan Task 0.
- News lane uses EnhancedStockNewsMonitor RSS methods directly (3 fast sources), not the
  7-source NewsFetcher wrapper. Spec updated rationale: avoid slow page scrapes.
- First commit including news_story_cards.py / news_layer_review.py snapshots prior
  uncommitted 2026-06-10 ranking work (files were untracked); intentional.

Open risks: R1 RSS reachability from this network (gate at Task 1 smoke).
```

- [ ] **Step 3: Commit plan + spec + notes**

```powershell
git add docs/superpowers/specs/2026-06-11-news-morning-digest-design.md docs/superpowers/plans/2026-06-12-news-morning-digest.md
git commit -m "docs: add /news morning digest spec and implementation plan"
```

`.ai/implementation-notes.md` stays UNSTAGED (standing workflow-notes policy).

---

### Task 1: News wire collector

**Files:**
- Create: `backend/services/news_wire_collector.py`
- Test: `tests/test_news_wire_collector.py`

**Boundary Contracts:**

**Boundary:** `Google News / Yahoo Finance / Benzinga RSS -> news_wire_collector`
- End goal served: overnight mainstream headlines become normalized post dicts that can join story-card clustering.
- Fake-pass checks: HTTP 200 from feedparser, non-exception fetch, monitor instantiated — none prove articles flowed.
- Connected means: `feedparser.parse(url)` returned a feed object for at least one source.
- Consumer-visible data flowing means: `payload["posts"]` contains >=1 dict with non-empty `text`, `url`, parseable ISO `date`, `ticker_seeds`.
- Acceptance rule: every post has `source_type=="news_wire"`, `lane=="news_wire"`, `handle` startswith `news:`, `date` empty-or-ISO; `articles_collected >= len(posts)`.
- Ready condition: `source_status in {"ok","degraded"}` AND >=1 accepted post.
- Readiness revoked when: 0 posts (status `degraded` if no errors recorded, `error` if errors) — downstream story building simply receives no wire posts; report shows the lane status.
- Recovery/fail behavior: per-source/per-ticker errors recorded and surfaced in Source Health; lane never raises into the pipeline.
- Smallest safe proof: 1 known-good ticker (NVDA) through all 3 sources, assert >=1 accepted post (read-only fetch, no side effects beyond idempotent CREATE TABLE IF NOT EXISTS on the repo's own stock_news.db).

**Task Smoke:**

| Stage / Boundary | Activated by | Output assertion | Consumer acceptance point | Production path/config/limits |
|------------------|--------------|------------------|---------------------------|-------------------------------|
| RSS fetch (3 sources) | NVDA is heavily covered; every source has NVDA items | per-source article list non-empty for >=1 source | `_fetch_ticker` merged list | Yes - real monitor methods, default timeouts |
| normalize+sentiment | every fetched article passes through `_article_to_post` | post has text/url/ISO date/sentiment fields | `payload["posts"]` | Yes - `calculate_sentiment` production path |
| dedupe+status | duplicate titles across sources common for NVDA | `articles_collected >= len(posts)`; status ok/degraded | `collect_news_wire` return | Yes - same code path as full run |

**Smoke input:** `collect_news_wire(tickers=["NVDA"], articles_per_ticker=4)`
**Time budget:** < 60s (3 RSS calls). If 0 posts -> STOP, report R1, do not proceed to Task 2.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_news_wire_collector.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m pytest tests\test_news_wire_collector.py -v
```

Expected: FAIL/ERROR with `ModuleNotFoundError: No module named 'backend.services.news_wire_collector'`.

- [ ] **Step 3: Write the implementation**

Create `backend/services/news_wire_collector.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
venv\Scripts\python.exe -m pytest tests\test_news_wire_collector.py -v
```

Expected: 7 passed.

- [ ] **Step 5: Run the real smoke (gate for risk R1)**

```powershell
venv\Scripts\python.exe -c "from backend.services.news_wire_collector import collect_news_wire; import json; p = collect_news_wire(tickers=['NVDA'], articles_per_ticker=4); print(json.dumps({'status': p['source_status'], 'posts': len(p['posts']), 'errors': p['errors'][:3]}, indent=2)); assert p['posts'], 'R1: RSS unreachable from this network - STOP'"
```

Expected: status ok/degraded, posts >= 1. If the assert fires: STOP the plan, report R1 to Ming with the recorded errors.

- [ ] **Step 6: Commit**

```powershell
git add backend/services/news_wire_collector.py tests/test_news_wire_collector.py
git commit -m "feat: add news wire collector lane reusing stock_monitor RSS fetchers"
```

---

### Task 2: Market tape snapshot

**Files:**
- Create: `backend/services/market_tape_snapshot.py`
- Test: `tests/test_market_tape_snapshot.py`

**Boundary Contracts:**

**Boundary:** `Yahoo Finance (yfinance) -> market_tape_snapshot`
- End goal served: digest opens with last close + 1d/5d change so story expectation-deltas have a price baseline.
- Fake-pass checks: yfinance import succeeds, download returns a frame, no exception — none prove per-symbol closes exist.
- Connected means: `yf.download` returned a non-empty frame.
- Consumer-visible data flowing means: `payload["rows"]` has dicts with numeric `last` and `chg_1d_pct` for >=5 of 7 symbols.
- Acceptance rule: each row has `last > 0`, `chg_1d_pct` finite, `as_of` ISO date; missing symbols appear in `errors`, never as fabricated rows.
- Ready condition: `source_status in {"ok","degraded"}` AND >=1 valid row.
- Readiness revoked when: all symbols fail -> `error`, rows empty; report prints the error status (never guessed values).
- Recovery/fail behavior: per-symbol errors recorded; lane never raises into the pipeline.
- Smallest safe proof: real fetch of 7 symbols once (single yf.download call), assert >=5 rows valid.

**Task Smoke:**

| Stage / Boundary | Activated by | Output assertion | Consumer acceptance point | Production path/config/limits |
|------------------|--------------|------------------|---------------------------|-------------------------------|
| yfinance download | default symbol list always requested in one call | frame non-empty for >=5 symbols | `_yfinance_closes` dict | Yes - production fetch fn, default 10d period |
| row math + status | every returned close series flows through row builder | row `last>0`, finite pct, ISO `as_of` | `payload["rows"]` | Yes - same builder as full run |

**Smoke input:** `build_market_tape_snapshot()` (one real call)
**Time budget:** < 30s.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_market_tape_snapshot.py`:

```python
import unittest
from datetime import datetime, timezone


def _closes(*values, start_day=1):
    return [
        (f"2026-06-{start_day + i:02d}", float(value))
        for i, value in enumerate(values)
    ]


class MarketTapeSnapshotTest(unittest.TestCase):
    def test_rows_compute_1d_and_5d_changes(self):
        from backend.services.market_tape_snapshot import TAPE_SYMBOLS, build_market_tape_snapshot

        data = {symbol: _closes(100, 101, 102, 103, 104, 110) for symbol, _ in TAPE_SYMBOLS}
        payload = build_market_tape_snapshot(
            fetch_closes=lambda symbols: data,
            now=datetime(2026, 6, 12, tzinfo=timezone.utc),
        )

        self.assertEqual(payload["source_status"], "ok")
        self.assertEqual(len(payload["rows"]), len(TAPE_SYMBOLS))
        row = payload["rows"][0]
        self.assertEqual(row["last"], 110.0)
        self.assertAlmostEqual(row["chg_1d_pct"], (110 / 104 - 1) * 100, places=2)
        self.assertAlmostEqual(row["chg_5d_pct"], (110 / 100 - 1) * 100, places=2)
        self.assertEqual(row["as_of"], "2026-06-06")

    def test_partial_failure_degraded_with_row_errors(self):
        from backend.services.market_tape_snapshot import TAPE_SYMBOLS, build_market_tape_snapshot

        data = {symbol: _closes(100, 101, 102, 103, 104, 110) for symbol, _ in TAPE_SYMBOLS}
        first_symbol = TAPE_SYMBOLS[0][0]
        data[first_symbol] = _closes(100)  # insufficient history

        payload = build_market_tape_snapshot(fetch_closes=lambda symbols: data)

        self.assertEqual(payload["source_status"], "degraded")
        self.assertEqual(len(payload["rows"]), len(TAPE_SYMBOLS) - 1)
        self.assertTrue(any(first_symbol in str(err) for err in payload["errors"]))

    def test_total_failure_is_error_with_no_rows(self):
        from backend.services.market_tape_snapshot import build_market_tape_snapshot

        def explode(symbols):
            raise RuntimeError("network down")

        payload = build_market_tape_snapshot(fetch_closes=explode)
        self.assertEqual(payload["source_status"], "error")
        self.assertEqual(payload["rows"], [])
        self.assertTrue(payload["errors"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
venv\Scripts\python.exe -m pytest tests\test_market_tape_snapshot.py -v
```

Expected: ERROR `ModuleNotFoundError: No module named 'backend.services.market_tape_snapshot'`.

- [ ] **Step 3: Write the implementation**

Create `backend/services/market_tape_snapshot.py`:

```python
"""Daily market tape snapshot for the /news morning digest."""

from __future__ import annotations

import logging
import math
from collections.abc import Callable, Mapping, Sequence
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

TAPE_SYMBOLS: tuple[tuple[str, str], ...] = (
    ("SPY", "S&P 500 (SPY)"),
    ("QQQ", "Nasdaq 100 (QQQ)"),
    ("IWM", "Russell 2000 (IWM)"),
    ("SMH", "Semis (SMH)"),
    ("^VIX", "VIX"),
    ("^TNX", "US 10Y yield (TNX, % x10)"),
    ("BTC-USD", "Bitcoin"),
)

FetchCloses = Callable[[Sequence[str]], Mapping[str, Sequence[tuple[str, float]]]]


def build_market_tape_snapshot(
    *,
    fetch_closes: FetchCloses | None = None,
    now: datetime | None = None,
) -> dict[str, object]:
    timestamp = (now or datetime.now(timezone.utc)).isoformat()
    fetch = fetch_closes or _yfinance_closes
    symbols = [symbol for symbol, _label in TAPE_SYMBOLS]
    try:
        closes_by_symbol = fetch(symbols)
    except Exception as exc:  # tape failure must not kill the news run
        return {
            "source_status": "error",
            "generated_at": timestamp,
            "as_of": "",
            "rows": [],
            "errors": [{"source": "tape", "message": str(exc)}],
        }

    rows: list[dict[str, object]] = []
    errors: list[dict[str, object]] = []
    as_of = ""
    for symbol, label in TAPE_SYMBOLS:
        closes = [
            (str(date), float(value))
            for date, value in (closes_by_symbol.get(symbol) or [])
            if value is not None and not math.isnan(float(value))
        ]
        if len(closes) < 2:
            errors.append({"source": symbol, "message": "insufficient close history"})
            continue
        last_date, last = closes[-1]
        prev = closes[-2][1]
        base_5d = closes[-6][1] if len(closes) >= 6 else closes[0][1]
        rows.append(
            {
                "symbol": symbol,
                "label": label,
                "last": round(last, 2),
                "chg_1d_pct": round((last / prev - 1) * 100, 2) if prev else None,
                "chg_5d_pct": round((last / base_5d - 1) * 100, 2) if base_5d else None,
                "as_of": last_date,
            }
        )
        as_of = max(as_of, last_date)

    if rows and not errors:
        status = "ok"
    elif rows:
        status = "degraded"
    else:
        status = "error"
    return {
        "source_status": status,
        "generated_at": timestamp,
        "as_of": as_of,
        "rows": rows,
        "errors": errors,
    }


def _yfinance_closes(symbols: Sequence[str]) -> dict[str, list[tuple[str, float]]]:
    import yfinance as yf

    frame = yf.download(
        list(symbols),
        period="10d",
        interval="1d",
        progress=False,
        auto_adjust=False,
        group_by="ticker",
        threads=True,
    )
    out: dict[str, list[tuple[str, float]]] = {}
    for symbol in symbols:
        try:
            closes = frame[symbol]["Close"] if len(symbols) > 1 else frame["Close"]
        except (KeyError, TypeError):
            out[symbol] = []
            continue
        series = closes.dropna()
        out[symbol] = [
            (index.date().isoformat(), float(value)) for index, value in series.items()
        ]
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
venv\Scripts\python.exe -m pytest tests\test_market_tape_snapshot.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Run the real smoke**

```powershell
venv\Scripts\python.exe -c "from backend.services.market_tape_snapshot import build_market_tape_snapshot; import json; p = build_market_tape_snapshot(); print(json.dumps(p, indent=2)); assert len(p['rows']) >= 5, 'tape lane unhealthy: ' + str(p['errors'])"
```

Expected: >=5 rows with real closes. If it fails: record the error payload, continue (tape is additive; report shows error status), but note in implementation notes.

- [ ] **Step 6: Commit**

```powershell
git add backend/services/market_tape_snapshot.py tests/test_market_tape_snapshot.py
git commit -m "feat: add market tape snapshot lane for /news digest"
```

---

### Task 3: Story-card fusion (news_wire posts)

**Files:**
- Modify: `backend/services/news_story_cards.py` (functions `tickers_for_post` ~line 172, `grade_source` ~line 185, `_confidence` ~line 505)
- Test: `tests/test_news_story_cards.py` (extend)

**Boundary Contracts:**

**Boundary:** `news_wire_collector posts -> news_story_cards clustering`
- End goal served: wire headlines and X posts cluster into single stories; wire+X corroboration upgrades confidence so the digest can rank trust correctly.
- Fake-pass checks: build_story_cards returns without exception; cards exist — neither proves news posts joined nor that grading is correct.
- Connected means: a news_wire post is accepted by `build_story_cards` input filtering (grade > 0, fresh, has theme or tickers).
- Consumer-visible data flowing means: a story card's `sources` list contains a `news wire headline` grade AND the same card carries a followed-account source when both exist for one theme.
- Acceptance rule: mixed card confidence string is the new wire+followed rung; wire-only card confidence is the wire-only rung; news post never grades as `followed account ...`.
- Ready condition: unit fusion tests pass (in-process boundary).
- Readiness revoked when: grade renumbering or key contract drift breaks tests.
- Recovery/fail behavior: not applicable at runtime (pure functions); contract enforced by tests.
- Smallest safe proof: 1 X post + 1 news post sharing a theme -> 1 card with both sources and upgraded confidence (test below).

**Task Smoke:** in-process fusion test (Step 1 `test_wire_and_followed_posts_cluster_into_one_story`) — this boundary is pure-Python; the cross-process proof happens in Task 5's end-to-end smoke.

**Smoke input:** 2 posts (1 followed X, 1 news_wire), same CPO theme
**Time budget:** seconds (unit test).

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_news_story_cards.py`:

```python
class NewsWireFusionTest(unittest.TestCase):
    @staticmethod
    def _x_post():
        return {
            "handle": "semisource",
            "lane": "ai_semis",
            "date": "2026-06-11T12:00:00+00:00",
            "text": "CPO mass adoption pushed to 2028, later than the 2027 ramp investors expected $NVDA",
            "url": "https://x.com/semisource/status/9",
            "signal_score": 40,
        }

    @staticmethod
    def _news_post():
        return {
            "handle": "news:Benzinga",
            "lane": "news_wire",
            "source_type": "news_wire",
            "title": "Optical CPO rollout delayed",
            "date": "2026-06-11T13:00:00+00:00",
            "text": "Optical CPO rollout delayed. Vendors flag slower 800VDC and CPO timing.",
            "url": "https://example.com/cpo",
            "ticker_seeds": ["NVDA"],
            "sentiment_score": -0.2,
            "sentiment_label": "negative",
        }

    def test_news_post_never_grades_as_followed_account(self):
        from backend.services.news_story_cards import grade_source

        grade = grade_source(self._news_post())
        self.assertEqual(grade["origin"], "news_wire")
        self.assertEqual(grade["label"], "news wire headline")
        self.assertEqual(grade["score"], 5)

    def test_followed_grades_renumbered_above_wire(self):
        from backend.services.news_story_cards import grade_source

        followed = grade_source(self._x_post())
        self.assertEqual(followed["label"], "followed account original post")
        self.assertEqual(followed["score"], 6)

    def test_tickers_for_post_unions_ticker_seeds(self):
        from backend.services.news_story_cards import tickers_for_post

        self.assertEqual(tickers_for_post(self._news_post()), ["$NVDA"])

    def test_wire_and_followed_posts_cluster_into_one_story(self):
        from backend.services.news_story_cards import build_story_cards

        cards = build_story_cards(
            [self._x_post(), self._news_post()],
            generated_at="2026-06-12T00:00:00+00:00",
        )
        self.assertEqual(len(cards), 1)
        grades = {source["grade"] for source in cards[0]["sources"]}
        self.assertIn("news wire headline", grades)
        self.assertIn("followed account original post", grades)
        self.assertIn("wire headline corroborated by followed account", cards[0]["confidence"])

    def test_wire_only_story_gets_wire_only_confidence(self):
        from backend.services.news_story_cards import build_story_cards

        cards = build_story_cards(
            [self._news_post()],
            generated_at="2026-06-12T00:00:00+00:00",
        )
        self.assertEqual(len(cards), 1)
        self.assertIn("wire headline only", cards[0]["confidence"])
```

(Use the existing import style at the top of the file; `unittest` is already imported.)

- [ ] **Step 2: Run to verify the new tests fail**

```powershell
venv\Scripts\python.exe -m pytest tests\test_news_story_cards.py -k NewsWireFusion -v
```

Expected: FAIL (origin "followed" instead of "news_wire"; score 5 vs 6; missing seeds union; old confidence strings).

- [ ] **Step 3: Implement the three function changes**

In `backend/services/news_story_cards.py` replace `tickers_for_post`:

```python
def tickers_for_post(post: Mapping[str, object]) -> list[str]:
    tags = {match.upper() for match in CASHTAG_RE.findall(post_text(post))}
    seeds = post.get("ticker_seeds")
    if isinstance(seeds, (list, tuple)):
        tags.update(
            "$" + str(seed).strip().upper().lstrip("$")
            for seed in seeds if str(seed).strip()
        )
    return sorted(tags)
```

Replace `grade_source` (renumber followed 7/6/5 -> 8/7/6; add news_wire at 5; search grades unchanged):

```python
def grade_source(post: Mapping[str, object]) -> dict[str, object]:
    """Grade one post's source quality for the story layer.

    Ladder: followed-account posts outrank news wire headlines, which outrank
    search echoes; primary/official and named research/wire citations outrank
    plain text; uncited search hits are downgraded; promotional posts are
    dropped from the story layer entirely (raw tape keeps them visible).
    """
    text = post_text(post).lower()
    if str(post.get("source_type") or "") == "news_wire":
        origin = "news_wire"
    elif str(post.get("handle") or ""):
        origin = "followed"
    else:
        origin = "search"
    if contains_any(text, PROMO_MARKERS):
        return {"score": 0, "label": "promotional post (dropped)", "origin": origin, "cites_primary": False}

    cites_primary = contains_any(text, PRIMARY_SOURCE_MARKERS)
    cites_named = contains_any(text, CITED_SOURCE_MARKERS)
    if origin == "followed":
        if cites_primary:
            return {"score": 8, "label": "followed account citing primary/official source", "origin": origin, "cites_primary": True}
        if cites_named:
            return {"score": 7, "label": "followed account citing named research/wire", "origin": origin, "cites_primary": False}
        return {"score": 6, "label": "followed account original post", "origin": origin, "cites_primary": False}
    if origin == "news_wire":
        return {"score": 5, "label": "news wire headline", "origin": origin, "cites_primary": cites_primary}
    if cites_primary:
        return {"score": 4, "label": "search echo citing primary/official source", "origin": origin, "cites_primary": True}
    if cites_named:
        return {"score": 3, "label": "search echo citing named research/wire", "origin": origin, "cites_primary": False}
    if "http" not in text:
        return {"score": 1, "label": "uncited search echo, downgraded", "origin": origin, "cites_primary": False}
    return {"score": 2, "label": "generic search echo", "origin": origin, "cites_primary": False}
```

Replace `_confidence`:

```python
def _confidence(
    ranked: Sequence[tuple[str, Mapping[str, object], dict[str, object]]],
    followed_handles: set[str],
) -> str:
    has_wire = any(grade["origin"] == "news_wire" for _, _, grade in ranked)
    if any(bool(grade["cites_primary"]) for _, _, grade in ranked):
        return "medium-high - cites a primary/official source; verify the underlying document directly"
    if has_wire and followed_handles:
        return "medium-high - wire headline corroborated by followed account(s); verify the primary source before sizing"
    if len(followed_handles) >= 2:
        return "medium - corroborated by multiple followed accounts, not yet officially confirmed"
    if len(followed_handles) == 1:
        return "low-medium - single followed-account claim, unconfirmed"
    if has_wire:
        return "low-medium - wire headline only, no followed-account read yet"
    return "low - public search echoes only, treat as unconfirmed watch"
```

- [ ] **Step 4: Run the full story-cards + news-layer suites**

```powershell
venv\Scripts\python.exe -m pytest tests\test_news_story_cards.py tests\test_news_layer_review.py -v
```

Expected: NewsWireFusion tests pass. If any EXISTING test asserts old literal scores 5/6/7 for followed grades, update those literals to 6/7/8 (labels are unchanged; only renumbering). Do not weaken any other assertion.

- [ ] **Step 5: Commit**

```powershell
git add backend/services/news_story_cards.py tests/test_news_story_cards.py
git commit -m "feat: fuse news wire posts into story cards with wire grade and confidence rungs"
```

Note: this commit snapshots the previously uncommitted 2026-06-10 content of `news_story_cards.py` (file was untracked) — intentional, recorded in Task 0 notes.

---

### Task 4: Pipeline wiring in news_layer_review

**Files:**
- Modify: `backend/services/news_layer_review.py` (signature ~line 59, body ~lines 83-118, `format_news_layer_report` ~line 121, `_write_artifacts` ~line 148, `_build_executive_summary` ~line 179, `_combined_status` ~line 313, `_top_news_and_tickers_payload` ~line 368, `_source_health_lines` ~line 689; add new helpers near `_build_vol_structure`)
- Test: `tests/test_news_layer_review.py` (extend)

**Boundary Contracts:**

**Boundary:** `GPU rental daily-report.md -> ai_infra lane -> report/summary.json`
- End goal served: digest shows GPU rental tightness with explicit freshness so stale local data is never read as today's fact.
- Fake-pass checks: file exists, parse returned items — does not prove freshness or that the section prints.
- Connected means: `build_ai_infra_update` returned `source_status` ok/degraded.
- Consumer-visible data flowing means: `result["ai_infra_update"]["items"]` non-empty AND the report contains an `## AI Infra (GPU rental)` section with at least one SKU line.
- Acceptance rule: payload gains `staleness = {age_hours, stale, note}`; `stale=True` when age > 36h or timestamp unparseable; STALE flag string appears in the section title when stale.
- Ready condition: section printed with real items + correct staleness flag.
- Readiness revoked when: report file missing -> degraded payload, section prints degraded status line (never silently absent).
- Recovery/fail behavior: lane exceptions -> error payload via the `_build_*` wrapper; run continues.
- Smallest safe proof: injected fake ai_infra payload with an old timestamp -> STALE title in markdown (unit); real file path exercised in Task 5 smoke.

**Boundary:** `pipeline result -> tickerpulse_news_layer_summary.json -> Claude Stage C`
- End goal served: Claude writes the digest from one machine-readable file without re-reading raw tape.
- Fake-pass checks: file written, JSON loads — does not prove the new lanes are inside.
- Connected means: summary file exists after run.
- Consumer-visible data flowing means: parsed summary contains keys `schema_version == 2`, `market_tape.rows`, `ai_infra_update.staleness`, `news_wire.posts`, plus the existing keys.
- Acceptance rule: unit test parses the written summary.json and asserts those keys/values.
- Ready condition: summary parse test green + Task 5 real artifact check.
- Readiness revoked when: schema drift (missing key) fails the test.
- Recovery/fail behavior: not applicable - file write failures already raise loudly in `_write_artifacts`.
- Smallest safe proof: injected-fakes run in tmp dir, parse summary.json, assert keys.

**Task Smoke:**

| Stage / Boundary | Activated by | Output assertion | Consumer acceptance point | Production path/config/limits |
|------------------|--------------|------------------|---------------------------|-------------------------------|
| news lane inject | fake news_collector returns 1 CPO post | `result["news_wire"]["posts"]` len 1 | exec summary story + News Wire Tape section | Yes - same run_news_layer_review path |
| fusion | fake X post + fake news post share CPO theme | one story card with both source grades | summary.json `executive_summary.top_stories` | Yes |
| tape lane inject | fake tape_snapshot returns 7 rows | `## Market Tape` section lists rows | report markdown | Yes |
| ai-infra stale | fake ai_infra timestamp 2026-06-09 vs now 6-12 | STALE title + staleness dict | report markdown + summary.json | Yes |
| degraded status | X collectors return error payloads, news ok | `source_status == "degraded"`, outage bullet | summary.json + report header | Yes |

**Smoke input:** injected fakes (1 X post, 1 news post, 7 tape rows, 1 stale ai-infra payload) in a tmp output dir
**Time budget:** seconds (unit-level, no network).

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_news_layer_review.py` (reuse `_FakeNewsLayerCollector`; add an error-collector variant):

```python
class _DeadXCollector(_FakeNewsLayerCollector):
    def collect_accounts(self, max_accounts: int, posts_per_account: int) -> dict[str, object]:
        return {"source_status": "error", "accounts_checked": max_accounts, "posts": [], "errors": [{"handle": "all", "message": "NoAccountError"}]}

    def collect_searches(self, max_queries: int, posts_per_query: int) -> dict[str, object]:
        return {"source_status": "error", "queries_checked": max_queries, "posts": [], "errors": [{"query": "all", "message": "NoAccountError"}]}


def _fake_news_payload():
    return {
        "source_status": "ok",
        "tickers_checked": 1,
        "articles_collected": 1,
        "posts": [
            {
                "handle": "news:Benzinga",
                "lane": "news_wire",
                "source_type": "news_wire",
                "title": "CPO rollout delayed by vendors",
                "date": "2026-06-11T13:00:00+00:00",
                "text": "CPO rollout delayed by vendors. Slower 800VDC and CPO timing flagged.",
                "url": "https://example.com/cpo",
                "ticker_seeds": ["NVDA"],
                "sentiment_score": -0.2,
                "sentiment_label": "negative",
            }
        ],
        "errors": [],
    }


def _fake_tape_payload():
    return {
        "source_status": "ok",
        "generated_at": "2026-06-12T00:00:00+00:00",
        "as_of": "2026-06-11",
        "rows": [
            {"symbol": "SPY", "label": "S&P 500 (SPY)", "last": 725.43, "chg_1d_pct": -1.2, "chg_5d_pct": -3.8, "as_of": "2026-06-11"},
            {"symbol": "^VIX", "label": "VIX", "last": 22.2, "chg_1d_pct": 5.0, "chg_5d_pct": 38.0, "as_of": "2026-06-11"},
        ],
        "errors": [],
    }


def _fake_ai_infra_payload():
    return {
        "source_status": "ok",
        "report_dir": "D:/fake",
        "report_path": "D:/fake/daily-report.md",
        "report_timestamp_utc": "2026-06-09T21:15:17+00:00",
        "summary": [],
        "items": [
            {
                "source": "ai_infra_update",
                "score": 78.5,
                "title": "AI infra update: B200 rental median $4.58, 7D -28.5%, 30D -26.6%, offers 43",
                "url": "file:///D:/fake/daily-report.md",
                "metadata": {
                    "gpu": "B200",
                    "median_usd_per_gpu_hr": 4.58,
                    "offers": 43,
                    "price_change_7d_pct": -28.5,
                    "price_change_30d_pct": -26.6,
                    "price_read_7d": "Looser",
                    "price_read_30d": "Looser",
                },
            }
        ],
        "errors": [],
    }


class MorningDigestLanesTest(unittest.TestCase):
    def _run(self, collector, **kwargs):
        from backend.services.news_layer_review import run_news_layer_review

        with tempfile.TemporaryDirectory() as tmp:
            result = run_news_layer_review(
                x_collector=collector,
                output_dir=Path(tmp),
                generated_at=datetime(2026, 6, 12, 0, 0, tzinfo=timezone.utc),
                **kwargs,
            )
            summary_text = (Path(tmp) / "tickerpulse_news_layer_summary.json").read_text(encoding="utf-8")
        return result, json.loads(summary_text)

    def test_new_lanes_skipped_with_injected_collector_and_no_callables(self):
        result, summary = self._run(_FakeNewsLayerCollector())
        self.assertEqual(result["news_wire"]["source_status"], "skipped_injected_collector")
        self.assertEqual(result["market_tape"]["source_status"], "skipped_injected_collector")
        self.assertEqual(result["ai_infra_update"]["source_status"], "skipped_injected_collector")
        self.assertEqual(summary["schema_version"], 2)

    def test_news_post_fuses_into_story_and_sections_print(self):
        result, summary = self._run(
            _FakeNewsLayerCollector(),
            news_collector=_fake_news_payload,
            tape_snapshot=_fake_tape_payload,
            ai_infra=_fake_ai_infra_payload,
        )
        report = str(result["report_markdown"])
        self.assertIn("## Market Tape", report)
        self.assertIn("S&P 500 (SPY): 725.43 | 1d -1.20% | 5d -3.80%", report)
        self.assertIn("## News Wire Tape", report)
        self.assertIn("STALE", report)  # 2026-06-09 report vs 2026-06-12 now
        self.assertIn("- News wire: ok; tickers 1, articles 1", report)
        cards = summary["executive_summary"]["top_stories"]
        merged = [card for card in cards if any(s["grade"] == "news wire headline" for s in card["sources"])]
        self.assertTrue(merged)
        self.assertTrue(any(str(s["grade"]).startswith("followed account") for s in merged[0]["sources"]))
        self.assertIn("$NVDA", summary["top_news_and_tickers"]["top_tickers"])
        self.assertEqual(summary["market_tape"]["rows"][0]["symbol"], "SPY")
        self.assertTrue(summary["ai_infra_update"]["staleness"]["stale"])
        self.assertEqual(len(summary["news_wire"]["posts"]), 1)

    def test_x_dead_news_alive_is_degraded_with_outage_copy(self):
        result, summary = self._run(
            _DeadXCollector(),
            news_collector=_fake_news_payload,
            tape_snapshot=_fake_tape_payload,
            ai_infra=_fake_ai_infra_payload,
        )
        self.assertEqual(result["source_status"], "degraded")
        bullets = summary["executive_summary"]["bullets"]
        self.assertTrue(any("X lanes returned 0 posts" in bullet for bullet in bullets))
        self.assertFalse(any("survived quality gating" in bullet for bullet in bullets))

    def test_everything_dead_is_error_with_outage_not_gating_copy(self):
        dead_news = lambda: {"source_status": "error", "tickers_checked": 0, "articles_collected": 0, "posts": [], "errors": [{"source": "rss", "message": "down"}]}
        result, summary = self._run(
            _DeadXCollector(),
            news_collector=dead_news,
            tape_snapshot=_fake_tape_payload,
            ai_infra=_fake_ai_infra_payload,
        )
        self.assertEqual(result["source_status"], "error")
        bullets = summary["executive_summary"]["bullets"]
        self.assertTrue(any("collection outage, not quality gating" in bullet for bullet in bullets))
```

- [ ] **Step 2: Run to verify the new tests fail**

```powershell
venv\Scripts\python.exe -m pytest tests\test_news_layer_review.py -k "MorningDigestLanes" -v
```

Expected: TypeError (unexpected keyword `news_collector`) / KeyError (`news_wire`).

- [ ] **Step 3: Implement the wiring**

In `backend/services/news_layer_review.py`:

3a. Extend the signature and body of `run_news_layer_review`:

```python
def run_news_layer_review(
    *,
    x_collector: NewsLayerCollectorProtocol | None = None,
    output_dir: Path | str | None = None,
    posts_per_account: int = 5,
    posts_per_query: int = 10,
    generated_at: datetime | None = None,
    vol_monitor: Callable[[], Mapping[str, object]] | None = None,
    gamma_monitor: Callable[[], Mapping[str, object]] | None = None,
    news_collector: Callable[[], Mapping[str, object]] | None = None,
    tape_snapshot: Callable[[], Mapping[str, object]] | None = None,
    ai_infra: Callable[[], Mapping[str, object]] | None = None,
    news_max_tickers: int = 12,
) -> dict[str, object]:
```

After the `searches = ...` call, add:

```python
    news_wire = _build_news_wire(news_collector, x_collector, news_max_tickers=news_max_tickers)
    market_tape = _build_market_tape(tape_snapshot, x_collector, now=now)
    ai_infra_update = _build_ai_infra(ai_infra, x_collector, now=now)
```

Change the two fusion call sites:

```python
    executive_summary = _build_executive_summary(accounts, searches, news_wire, generated_at=now.isoformat())
    ...
    top_news_and_tickers = _top_news_and_tickers_payload(accounts, searches, news_wire, generated_at=now.isoformat())
```

In the result dict: change `"schema_version": 1` to `"schema_version": 2`, change `"source_status": _combined_status(accounts, searches)` to `_combined_status(accounts, searches, news_wire)`, and add:

```python
        "news_wire": news_wire,
        "market_tape": market_tape,
        "ai_infra_update": ai_infra_update,
```

3b. Add the three lane builders next to `_build_vol_structure` (same pattern):

```python
def _build_news_wire(
    news_collector: Callable[[], Mapping[str, object]] | None,
    x_collector: NewsLayerCollectorProtocol | None,
    *,
    news_max_tickers: int,
) -> dict[str, object]:
    if news_collector is not None:
        try:
            return dict(news_collector())
        except Exception as exc:  # lane failure must not kill the news run
            return _lane_error_payload("news_wire", f"injected news collector failed: {exc}")
    if x_collector is not None:
        return {"source_status": "skipped_injected_collector", "tickers_checked": 0, "articles_collected": 0, "posts": [], "errors": []}
    try:
        from backend.services.news_wire_collector import collect_news_wire

        return dict(collect_news_wire(max_tickers=news_max_tickers))
    except Exception as exc:
        return _lane_error_payload("news_wire", f"news wire collection failed: {exc}")


def _build_market_tape(
    tape_snapshot: Callable[[], Mapping[str, object]] | None,
    x_collector: NewsLayerCollectorProtocol | None,
    *,
    now: datetime,
) -> dict[str, object]:
    if tape_snapshot is not None:
        try:
            return dict(tape_snapshot())
        except Exception as exc:
            return {"source_status": "error", "generated_at": now.isoformat(), "as_of": "", "rows": [], "errors": [{"source": "tape", "message": f"injected tape snapshot failed: {exc}"}]}
    if x_collector is not None:
        return {"source_status": "skipped_injected_collector", "generated_at": now.isoformat(), "as_of": "", "rows": [], "errors": []}
    try:
        from backend.services.market_tape_snapshot import build_market_tape_snapshot

        return dict(build_market_tape_snapshot(now=now))
    except Exception as exc:
        return {"source_status": "error", "generated_at": now.isoformat(), "as_of": "", "rows": [], "errors": [{"source": "tape", "message": str(exc)}]}


def _build_ai_infra(
    ai_infra: Callable[[], Mapping[str, object]] | None,
    x_collector: NewsLayerCollectorProtocol | None,
    *,
    now: datetime,
) -> dict[str, object]:
    if ai_infra is not None:
        try:
            return _ai_infra_with_staleness(dict(ai_infra()), now=now)
        except Exception as exc:
            return _lane_error_payload("ai_infra", f"injected ai infra source failed: {exc}")
    if x_collector is not None:
        return {"source_status": "skipped_injected_collector", "items": [], "errors": [], "report_timestamp_utc": None}
    try:
        from backend.services.ai_infra_update import build_ai_infra_update

        return _ai_infra_with_staleness(dict(build_ai_infra_update()), now=now)
    except Exception as exc:
        return _lane_error_payload("ai_infra", f"ai infra update failed: {exc}")


def _ai_infra_with_staleness(payload: dict[str, object], *, now: datetime) -> dict[str, object]:
    stamp = parse_datetime(str(payload.get("report_timestamp_utc") or ""))
    if stamp is None:
        payload["staleness"] = {"age_hours": None, "stale": True, "note": "report timestamp missing or unparseable - run /ai-infra-update first"}
        return payload
    age_hours = round((now - stamp).total_seconds() / 3600, 1)
    stale = age_hours > 36.0
    payload["staleness"] = {"age_hours": age_hours, "stale": stale, "note": "run /ai-infra-update first" if stale else ""}
    return payload


def _lane_error_payload(lane: str, message: str) -> dict[str, object]:
    payload: dict[str, object] = {"source_status": "error", "posts": [], "items": [], "errors": [{"source": lane, "message": message}]}
    if lane == "news_wire":
        payload.update({"tickers_checked": 0, "articles_collected": 0})
    return payload
```

3c. Replace `_combined_status`:

```python
def _combined_status(
    accounts: Mapping[str, object],
    searches: Mapping[str, object],
    news_wire: Mapping[str, object] | None = None,
) -> str:
    skip_markers = {"skipped", "skipped_injected_collector"}
    lane_statuses = [
        str(accounts.get("source_status") or "unknown"),
        str(searches.get("source_status") or "unknown"),
    ]
    news_status = str((news_wire or {}).get("source_status") or "skipped")
    if news_status not in skip_markers:
        lane_statuses.append(news_status)
    if all(status == "error" for status in lane_statuses):
        return "error"
    if any(status in {"error", "degraded"} for status in lane_statuses):
        return "degraded"
    return "ok"
```

3d. Replace `_build_executive_summary`:

```python
def _build_executive_summary(
    accounts: Mapping[str, object],
    searches: Mapping[str, object],
    news_wire: Mapping[str, object] | None = None,
    *,
    generated_at: str,
) -> dict[str, object]:
    account_posts = _posts(accounts)
    search_posts = _posts(searches)
    news_posts = _posts(news_wire or {})
    x_posts = [*account_posts, *search_posts]
    all_posts = [*x_posts, *news_posts]
    top_stories = build_story_cards(all_posts, generated_at=generated_at, limit=5)
    bullets: list[str] = []
    if not x_posts and news_posts:
        bullets.append(
            "X lanes returned 0 posts (session outage or collection failure) - "
            "wire-only briefing; see Source Health for the classified cause."
        )
    if top_stories:
        bullets.extend(f"{story['theme']}: {story['headline']}" for story in top_stories)
    elif not all_posts:
        bullets.append(
            "0 posts collected across all lanes (collection outage, not quality gating) - "
            "see Source Health for the classified cause."
        )
    else:
        bullets.append(
            "No fresh high-signal stories survived quality gating; review raw tape "
            "and source health below."
        )
    return {
        "bullets": bullets,
        "top_stories": top_stories,
        "top_topics": _top_topics(all_posts),
    }
```

3e. Replace `_top_news_and_tickers_payload`:

```python
def _top_news_and_tickers_payload(
    accounts: Mapping[str, object],
    searches: Mapping[str, object],
    news_wire: Mapping[str, object] | None = None,
    *,
    generated_at: str = "",
) -> dict[str, object]:
    account_posts = _posts(accounts)
    search_posts = _posts(searches)
    news_posts = _posts(news_wire or {})
    ticker_posts = fresh_posts([*account_posts, *search_posts, *news_posts], generated_at=generated_at)
    return {
        "top_news": _ranked_post_briefs([*search_posts, *news_posts], limit=5, generated_at=generated_at),
        "top_tickers": _top_tickers(ticker_posts, limit=10),
    }
```

3f. In `format_news_layer_report`, insert after the `Source status` header lines:

```python
    lines.extend(_market_tape_lines(_mapping(result.get("market_tape"))))
```

after the gamma line:

```python
    lines.extend(_ai_infra_lines(_mapping(result.get("ai_infra_update"))))
```

after the `X Search Tape` post section:

```python
    lines.extend(_post_section("News Wire Tape", _posts(_mapping(result.get("news_wire")))[:15]))
```

and change the source-health call to:

```python
    lines.extend(
        _source_health_lines(
            accounts,
            searches,
            _mapping(result.get("session_guard")),
            news_wire=_mapping(result.get("news_wire")),
            market_tape=_mapping(result.get("market_tape")),
            ai_infra=_mapping(result.get("ai_infra_update")),
        )
    )
```

3g. Add the two section renderers (near `_vol_structure_lines`):

```python
def _fmt_pct(value: object) -> str:
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return "n/a"
    return f"{number:+.2f}%"


def _market_tape_lines(tape: Mapping[str, object]) -> list[str]:
    lines = [
        "",
        "## Market Tape",
        f"- Status: {tape.get('source_status', 'unknown')}; as of {tape.get('as_of') or 'n/a'}",
    ]
    rows = tape.get("rows")
    if isinstance(rows, list):
        for row in rows:
            if not isinstance(row, Mapping):
                continue
            lines.append(
                f"- {row.get('label')}: {row.get('last')} | 1d {_fmt_pct(row.get('chg_1d_pct'))} | 5d {_fmt_pct(row.get('chg_5d_pct'))}"
            )
    for error in _errors(tape):
        lines.append(f"- Tape error: {error}")
    return lines


def _ai_infra_lines(payload: Mapping[str, object]) -> list[str]:
    staleness = _mapping(payload.get("staleness"))
    title = "## AI Infra (GPU rental)"
    if staleness.get("stale"):
        age = staleness.get("age_hours")
        age_text = f"{age}h" if age is not None else "age unknown"
        title = f"## AI Infra (GPU rental) - STALE ({age_text}) - run /ai-infra-update first"
    lines = [
        "",
        title,
        f"- Status: {payload.get('source_status', 'unknown')}; report {payload.get('report_timestamp_utc') or 'n/a'}",
    ]
    items = payload.get("items")
    if isinstance(items, list):
        for item in items:
            if not isinstance(item, Mapping):
                continue
            meta = _mapping(item.get("metadata"))
            chg7 = meta.get("price_change_7d_pct")
            try:
                expanded = abs(float(chg7)) > 5.0  # type: ignore[arg-type]
            except (TypeError, ValueError):
                expanded = False
            if expanded:
                lines.append(f"- {item.get('title')}")
                read_7d = str(meta.get("price_read_7d") or "").strip()
                if read_7d:
                    lines.append(f"  - Read: 7D {read_7d}; 30D {meta.get('price_read_30d')}")
            else:
                lines.append(
                    f"- {meta.get('gpu')}: median ${meta.get('median_usd_per_gpu_hr')}, "
                    f"7D {_fmt_pct(chg7)}, 30D {_fmt_pct(meta.get('price_change_30d_pct'))}"
                )
    for error in _errors(payload):
        lines.append(f"- AI infra error: {error}")
    return lines
```

3h. Replace `_source_health_lines`:

```python
def _source_health_lines(
    accounts: Mapping[str, object],
    searches: Mapping[str, object],
    session_guard: Mapping[str, object] | None = None,
    *,
    news_wire: Mapping[str, object] | None = None,
    market_tape: Mapping[str, object] | None = None,
    ai_infra: Mapping[str, object] | None = None,
) -> list[str]:
    account_posts = _posts(accounts)
    search_posts = _posts(searches)
    news = news_wire or {}
    tape = market_tape or {}
    infra = ai_infra or {}
    guard = session_guard or {}
    guard_status = str(guard.get("status") or "not run")
    guard_detail = str(guard.get("detail") or "")
    guard_line = f"- X session guard: {guard_status}"
    if guard_detail:
        guard_line = f"{guard_line}; {guard_detail}"
    tape_rows = tape.get("rows")
    lines = [
        "",
        "## Source Health",
        f"- X accounts: {accounts.get('source_status', 'unknown')}; checked {accounts.get('accounts_checked', 0)}",
        f"- X searches: {searches.get('source_status', 'unknown')}; checked {searches.get('queries_checked', 0)}",
        f"- News wire: {news.get('source_status', 'skipped')}; tickers {news.get('tickers_checked', 0)}, articles {news.get('articles_collected', 0)}",
        f"- Market tape: {tape.get('source_status', 'skipped')}; rows {len(tape_rows) if isinstance(tape_rows, list) else 0}",
        f"- AI infra: {infra.get('source_status', 'skipped')}",
        f"- Posts reviewed: {len(account_posts)} followed-account posts, {len(search_posts)} search posts, {len(_posts(news))} wire articles.",
        guard_line,
    ]
    for error in _errors(accounts):
        lines.append(f"- Account error: {error}")
    for error in _errors(searches):
        lines.append(f"- Search error: {error}")
    for error in _errors(news):
        lines.append(f"- News wire error: {error}")
    for error in _errors(tape):
        lines.append(f"- Tape error: {error}")
    for error in _errors(infra):
        lines.append(f"- AI infra error: {error}")
    return lines
```

3i. In `_write_artifacts`, add to `summary_payload` (after `"source_status"`):

```python
        "schema_version": result.get("schema_version"),
        "news_wire": result.get("news_wire"),
        "market_tape": result.get("market_tape"),
        "ai_infra_update": result.get("ai_infra_update"),
```

- [ ] **Step 4: Run the full news-layer suite**

```powershell
venv\Scripts\python.exe -m pytest tests\test_news_layer_review.py -v
```

Expected: new MorningDigestLanes tests pass AND all pre-existing tests pass. Pre-existing tests use injected `x_collector` without lane callables, so the new lanes return `skipped_injected_collector` and old report assertions still hold. If an existing test asserts the exact old Source Health line set, update it to include the three new lane lines — do not weaken other assertions.

- [ ] **Step 5: Commit**

```powershell
git add backend/services/news_layer_review.py tests/test_news_layer_review.py
git commit -m "feat: wire news wire, market tape, and ai-infra lanes into news layer review"
```

Note: snapshots prior uncommitted news_layer_review.py content (was untracked) — intentional, see Task 0.

---

### Task 5: CLI flag + end-to-end real smoke

**Files:**
- Modify: `backend/scripts/run_news_layer_review.py`

**Boundary Contracts:** Covered by Tasks 1/2/4 contracts; this task proves them end-to-end on the real pipeline.

**Task Smoke:** (the plan's primary glue proof)

| Stage / Boundary | Activated by | Output assertion | Consumer acceptance point | Production path/config/limits |
|------------------|--------------|------------------|---------------------------|-------------------------------|
| X collection | real twscrape pool (may be dead - that is a valid degraded path) | Source Health X lines present with real status | report markdown | Yes - production collector |
| RSS -> news lane | 3 real tickers x 3 sources | News wire: ok/degraded with articles > 0 | News Wire Tape section + summary.json | Yes - default collector, only max_tickers bounded via real CLI flag |
| yfinance -> tape | 7 real symbols | Market Tape rows >= 5 | report + summary.json | Yes |
| GPU report -> ai-infra | real `D:\Crypto Data\Analysis\20260605 - GPU rental daily report\daily-report.md` | AI Infra section with >= 1 SKU + staleness flag correct for file age | report + summary.json | Yes - default path |
| fusion + artifacts | all collected posts | summary.json has schema_version 2 + all lane keys; exec summary bullets non-empty | `tickerpulse_news_layer_summary.json` | Yes |

**Smoke input:** `--posts-per-account 1 --posts-per-query 1 --news-max-tickers 3` to a dated smoke output dir
**Time budget:** 2-4 min (X timeouts dominate if session dead). No smaller path: this is the minimum that crosses every lane once.

- [ ] **Step 1: Add the CLI flag**

In `backend/scripts/run_news_layer_review.py`, add to `_build_parser()`:

```python
    parser.add_argument(
        "--news-max-tickers",
        type=int,
        default=12,
        help="Max dashboard-watchlist tickers for the news wire lane.",
    )
```

and pass it through in `main()`:

```python
    result = run_news_layer_review(
        output_dir=output_dir,
        posts_per_account=max(1, int(args.posts_per_account)),
        posts_per_query=max(1, int(args.posts_per_query)),
        news_max_tickers=max(1, int(args.news_max_tickers)),
    )
```

- [ ] **Step 2: Run the end-to-end real smoke**

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m backend.scripts.run_news_layer_review --posts-per-account 1 --posts-per-query 1 --news-max-tickers 3 --output-dir "D:\Crypto Data\Analysis\20260612 - TickerPulse news layer digest smoke"
```

- [ ] **Step 3: Verify per-stage assertions on the artifacts**

```powershell
venv\Scripts\python.exe -c "import json; s = json.load(open(r'D:\Crypto Data\Analysis\20260612 - TickerPulse news layer digest smoke\tickerpulse_news_layer_summary.json', encoding='utf-8')); assert s['schema_version'] == 2; nw = s['news_wire']; assert nw['source_status'] in ('ok','degraded') and len(nw['posts']) > 0, ('news lane', nw['source_status'], nw['errors'][:2]); mt = s['market_tape']; assert len(mt['rows']) >= 5, ('tape', mt['errors']); ai = s['ai_infra_update']; assert ai['items'], ('ai infra', ai['errors']); assert 'staleness' in ai; print('news posts:', len(nw['posts']), '| tape rows:', len(mt['rows']), '| ai items:', len(ai['items']), '| status:', s['source_status'])"
```

Expected: all asserts pass. Then open `daily_news_layer_report.md` and verify by eye: `## Market Tape`, `## AI Infra (GPU rental)` (STALE flag iff the GPU report is older than 36h at run time), `## News Wire Tape`, Source Health with five lane lines. If X is still dead, `source_status` MUST read `degraded` (not `error`) and the executive summary MUST lead with the X-outage bullet — that is the spec's resilience fix working, record it as evidence.

- [ ] **Step 4: Commit**

```powershell
git add backend/scripts/run_news_layer_review.py
git commit -m "feat: add --news-max-tickers flag to news layer CLI"
```

---

### Task 6: /news skill Stage C digest contract

**Files:**
- Modify: `C:\Users\MingC\.claude\skills\news\SKILL.md`

**Boundary Contracts:**

**Boundary:** `tickerpulse_news_layer_summary.json -> Claude Stage C digest`
- End goal served: Ming reads one digest with verified top stories instead of a raw report.
- Fake-pass checks: pipeline ran, artifacts exist — does not mean the digest was written or stories verified.
- Connected means: Claude read summary.json from the run's output dir.
- Consumer-visible data flowing means: the inline digest contains the 7 sections with real values from the summary (tape numbers, story claims, GPU medians).
- Acceptance rule: each top story line carries a verification result (`confirmed` / `not confirmed` / `conflicting` / `unverifiable`) and a what-to-do with a because-clause; staleness and outage labels propagate verbatim.
- Ready condition: digest printed inline at /news time.
- Readiness revoked when: summary.json missing or schema_version != 2 -> Claude says so and falls back to the report markdown.
- Recovery/fail behavior: on X outage, lead with outage + wire-only digest; on missing lanes, name them as missing.
- Smallest safe proof: one manual /news run after merge (Ming's first morning use; no automated proof possible for prose quality).

**Task Smoke:** Not applicable - documentation/contract change; runtime proof is Task 5's artifacts plus first manual /news run.

- [ ] **Step 1: Update SKILL.md**

In `C:\Users\MingC\.claude\skills\news\SKILL.md`, replace the `## Required Reporting` section header and its first paragraph with the following (keep the existing ranked-item style rules that follow — they still apply to digest story lines):

```markdown
## Morning Digest (Stage C)

After running the command, build the digest from
`tickerpulse_news_layer_summary.json` (schema_version 2) in the run's output
directory. Do not only point Ming to artifact paths. If schema_version is not
2 or the file is missing, say so and fall back to `daily_news_layer_report.md`.

Light verification before writing: for the top 3-5 stories in
`executive_summary.top_stories`, check the primary source behind the claim
(WebSearch/WebFetch; curl fallback per the web-search fallback memory). Label
each story `confirmed` / `not confirmed` / `conflicting` / `unverifiable`.
Do not deep-dive beyond 5 stories unless Ming asks.

Digest sections, in order:

1. Market tape - one line per row from `market_tape.rows` (last, 1d, 5d).
   If `market_tape.source_status` is error: say "tape unavailable", never
   substitute numbers.
2. Top stories (max 5) - per story: What happened / Expectation delta /
   Impact / What to do with an explicit because-clause, plus source grade,
   wire<->X corroboration state (from `sources` grades), and the verification
   label from above.
3. X-only perspective - stories whose sources contain followed-account posts
   but NO `news wire headline` grade: this is the unique-edge section.
4. AI infra - GPU rental medians and 7D/30D changes from
   `ai_infra_update.items`; if `ai_infra_update.staleness.stale` is true,
   lead the section with the STALE flag and the note.
5. Monitor alerts - VIXEQ/COR1M and gamma sections; expand only on
   watch/alert, one line each otherwise. Missing data is not calm: report
   error/degraded status explicitly.
6. Catalysts - `watchlist_events` due within the next 7 days only.
7. Source health - one line per lane (X accounts, X searches, news wire,
   market tape, AI infra) with the X session guard classification.

X-outage behavior: when X lanes are dead but the news wire lane returned
articles, the run reports `source_status=degraded`. Lead the digest with the
outage notice and classified cause, then produce the wire-only digest. Never
describe an outage as quality gating.
```

Also update the `Expected files` list in the `## Command` section to note the
summary now carries `schema_version: 2` with `news_wire`, `market_tape`, and
`ai_infra_update` lanes, and document the new CLI flag in the bounded smoke
example:

```markdown
Bounded smoke run:

```powershell
news --posts-per-account 1 --posts-per-query 1 --news-max-tickers 3
```
```

- [ ] **Step 2: Verify the skill file is consistent**

Re-read the edited SKILL.md top to bottom once: no stale references to "Required Reporting" ordering that contradicts the digest sections; Bernstein/source rules and failure-handling sections remain unchanged.

- [ ] **Step 3: Commit (skill file lives outside the repo - no git)**

SKILL.md is under `C:\Users\MingC\.claude\` (not the tickerpulse repo). No commit. Note the edit in `.ai/implementation-notes.md`.

---

### Task 7: Close-out verification

**Files:**
- Modify: `.ai/implementation-notes.md` (append evidence; stays unstaged)

**Boundary Contracts:** Not applicable - verification only.

**Task Smoke:** Not applicable - aggregates Task 1-5 smokes.

- [ ] **Step 1: Run the full repo test suite**

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m pytest tests -v
```

Expected: all green, including pre-existing suites (no regression in test_news_intelligence, test_vol_structure_monitor, test_ai_infra_update, etc.).

- [ ] **Step 2: Spec verification pass**

For each spec section quote the requirement and cite file:line + test evidence in `.ai/implementation-notes.md`: news lane (Task 1), tape (Task 2), fusion/grades/confidence (Task 3), wiring/sections/status/empty-copy/schema (Task 4), CLI+smoke (Task 5), Stage C contract (Task 6). Explicitly verify out-of-scope items did NOT change: Bernstein lane behavior, X search lanes, reliability scores, dashboard/DB write paths (`backend/api/*`, `dashboard.py` untouched by `git status` on the branch).

- [ ] **Step 3: Branch hygiene check**

```powershell
git log --oneline main..feat/news-morning-digest
git status --short
```

Expected: 5-6 commits, each containing only the files named in its task; pre-existing in-flight modified files still uncommitted and untouched. Do NOT push; Ming decides remote/PR.

- [ ] **Step 4: Close-out checklist (report to Ming)**

```markdown
- Changed: news_wire_collector (new), market_tape_snapshot (new), story-card fusion,
  news_layer_review lanes/sections/status, CLI flag, /news SKILL.md Stage C.
- Verified: unit suites green (counts), real smokes (news posts N, tape rows N,
  ai items N), end-to-end artifact assertions, degraded-path behavior.
- Explicitly unchanged: Bernstein lane, X watchlists config, reliability scores,
  dashboard/DB paths, vol/gamma monitors, inv-workflow routing rule.
- Known limits: RSS source quality varies (Google News aggregates blogs);
  X session still dead until cookies refreshed; OpenRouter/Frontier-labs data
  out of scope this phase.
```

---

## Self-Review (done at plan time)

1. Spec coverage: news lane -> Task 1; tape -> Task 2; grade/confidence/tickers fusion -> Task 3; injection wiring, report sections, AI-infra staleness, status semantics, empty-state copy, schema v2, summary keys -> Task 4; CLI flag + real-lib smoke -> Task 5; Stage C/SKILL.md digest contract incl. X-outage behavior -> Task 6; spec's "Repo state caveat" -> Task 0. No uncovered spec requirement found.
2. Placeholder scan: no TBDs; every code step shows complete code; smokes assert per-stage non-empty outputs on production paths; no smoke-only config bumps (the `--news-max-tickers 3` bound is a real production flag added in Task 5 before the smoke uses it).
3. Type consistency: post dict keys (`date`, `text`, `title`, `ticker_seeds`, `source_type`) consistent across Tasks 1/3/4; lane payload keys (`source_status`, `posts`/`rows`/`items`, `errors`) consistent; `_build_executive_summary(accounts, searches, news_wire, *, generated_at)` signature matches both definition (Task 4 3d) and call site (Task 4 3a); grade scores 8/7/6/5/4/3/2/1 consistent between Task 3 code and tests.
```
