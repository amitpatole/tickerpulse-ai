# /news Morning Digest Design

Date: 2026-06-11
Status: approved pending user spec review
Owner: Ming (decisions) / Claude (drafting)

## Goal

Turn `/news` (TickerPulse news layer) into a daily morning digest that sweeps
the curated X account list AND mainstream daily news, then produces a ranked,
cross-verified, decision-useful digest. The curated X list is the unique edge;
news wire is the floor of confirmed facts; local AI-infra data (GPU rental) and
a market tape snapshot anchor everything to prices.

Run mode: interactive `/news` in a Claude Code session (no scheduling in this
phase). Verification depth: light (main thread, top 3-5 stories only).

## Current State (verified 2026-06-11)

- `backend/services/news_layer_review.py` collects X accounts + X searches via
  `XWatchlistCollector`, builds Bernstein monitor, vol structure monitor
  (VIXEQ/COR1M), gamma exposure monitor, watchlist catalyst events, story
  cards, ranked following, and writes three artifacts under
  `D:\Crypto Data\Analysis\YYYYMMDD - TickerPulse news layer daily`.
- The repo ALREADY fetches news elsewhere, but `/news` does not use it:
  - `backend/core/stock_monitor.py` (`EnhancedStockNewsMonitor`): per-ticker
    fetchers for Google News RSS, Yahoo Finance RSS, Seeking Alpha,
    MarketWatch, Benzinga, Finviz, StockTwits + `calculate_sentiment`.
  - `backend/agents/tools/news_fetcher.py` (`NewsFetcher`): wraps the monitor;
    `fetch_news_for_ticker(ticker, max_articles) -> dict` with scored articles.
  - `backend/services/news_intelligence.py`: news-title <-> X-reaction
    cross-referencing cards (used by market_sweep, not by /news).
- `backend/services/ai_infra_update.py` (`build_ai_infra_update`): parses the
  local GPU rental daily report into items (median $/GPU-hr, 7D/30D change,
  offers, Looser/Tighter read). Used by market_sweep, not by /news.
- Known failure modes to fix: X session outage produced an empty-shell report
  (2026-06-11 run: 0 posts, all 46 accounts + 8 searches NoAccountError);
  empty-state message wrongly implied quality gating; vol/gamma monitor absent
  from artifacts without loud error.

## Architecture: three stages

```
Stage A  Collect (Python, deterministic, free)
    X accounts + X searches            (existing)
    news wire lane                     (NEW: news_wire_collector.py)
    market tape snapshot               (NEW: market_tape_snapshot.py)
    AI infra update                    (WIRE-IN: build_ai_infra_update)
    vol structure + gamma monitors     (existing)
        |
Stage B  Fuse (Python, deterministic)
    news articles normalized to post dicts -> existing story-card clustering
    wire <-> X cross-corroboration upgrades source grade / confidence
        |
Stage C  Synthesize (Claude, at /news time)
    read summary.json -> light-verify top 3-5 stories (primary source check)
    -> write digest prose per Morning Briefing Contract
```

The unique-perspective payoff is explicit: stories with X signal but no wire
echo get their own digest section ("X-only perspective").

## Components

### New: `backend/services/news_wire_collector.py` (~150 lines)

- `collect_news_wire(*, tickers: Sequence[str] | None = None, max_tickers: int = 12, articles_per_ticker: int = 4) -> dict`
- Ticker source when `tickers is None`: `load_dashboard_watchlist()` entries
  with `market in {"US", "Private"}`, in YAML order, capped at `max_tickers`.
- Fetch via the existing `EnhancedStockNewsMonitor` RSS methods directly
  (`fetch_google_news`, `fetch_yahoo_finance_rss`, `fetch_benzinga`) plus its
  `calculate_sentiment`, parallelized with `ThreadPoolExecutor(max_workers=8)`.
  (Deviation from earlier draft wording "via NewsFetcher": the wrapper
  hardcodes 7 sources including slow page scrapes — Seeking Alpha,
  MarketWatch, Finviz, StockTwits — unsuitable for a fast morning lane. Same
  reuse intent, three RSS-stable sources only.) Per-ticker failures are
  caught, logged, and counted; they never abort the lane.
- Date normalization: RSS `published_date` values are converted to ISO-8601 UTC
  (try ISO parse, then `email.utils.parsedate_to_datetime`) and stored under
  the `date` key — `news_story_cards.post_datetime` reads `post["date"]` and
  only parses ISO. Articles whose dates cannot be parsed get `date = ""` (they
  fall out of freshness-gated story building via `freshness_bucket == 0`) but
  stay in the raw artifact.
- Dedupe: normalized-title hash (lowercase, collapse whitespace). First
  occurrence wins; subsequent seed tickers are merged into `ticker_seeds`.
- Output payload:
  `{"source_status": "ok|degraded|error", "posts": [...], "errors": [...], "tickers_checked": N, "articles_collected": N}`
- Normalized post shape (compatible with `news_story_cards` helpers):
  `{"handle": "news:<source>", "lane": "news_wire", "source_type": "news_wire", "text": "<title>. <description>", "url": ..., "date": <iso>, "ticker_seeds": [...], "sentiment_score": ..., "sentiment_label": ...}`
- No DB writes. In-memory -> artifacts only.

### New: `backend/services/market_tape_snapshot.py` (~120 lines)

- `build_market_tape_snapshot() -> dict` using `yfinance` (existing dep).
- Fixed symbol list: SPY, QQQ, IWM, SMH, ^VIX, ^TNX, BTC-USD.
- Per symbol: last close, 1d % change, 5d % change, as-of date.
- Output: `{"source_status": ..., "as_of": ..., "rows": [...], "errors": [...]}`.
- Any symbol failure -> row-level error entry; all symbols failed -> lane
  `source_status = "error"`. Never substitute guessed values.

### Changed: `backend/services/news_story_cards.py`

- Accept `source_type == "news_wire"` posts in clustering, theming, and
  freshness logic. Theme matching unchanged.
- `tickers_for_post` returns the union of cashtags found in `text` AND the
  post's `ticker_seeds` field (news headlines rarely contain `$NVDA`-style
  cashtags; without this, news posts would detect zero tickers and the
  first-cashtag clustering fallback would never fire for them).
- `grade_source` ladder gains one grade, `news wire headline`, inserted below
  `followed account original post` and above `search echo citing
  primary/official source`. Rationale: wire headlines are confirmed-by-wire
  facts but RSS aggregation (Google News) includes low-tier outlets, so they
  do not outrank followed accounts citing primary sources.
- `_confidence` ladder becomes (high to low):
  1. cites primary/official source
  2. wire + followed-account corroboration (NEW: story contains >=1 news_wire
     post AND >=1 followed-account post)
  3. corroborated by two or more followed accounts
  4. single followed-account claim
  5. wire only (NEW)
  6. search echoes only

### Changed: `backend/services/news_layer_review.py`

- `run_news_layer_review` gains injected callables (same pattern as
  `vol_monitor`): `news_collector=None`, `tape_snapshot=None`, `ai_infra=None`.
  Defaults resolve to the real implementations; tests inject fakes.
- News posts join account/search posts for story building, executive summary,
  and top-tickers; raw articles appear in a new `News Wire Tape` report
  section (capped at 15 lines).
- New top-of-report section `Market Tape` (one line per symbol).
- New section `AI Infra (GPU rental)`: SKUs with |7D change| > 5% expanded,
  others one line. Freshness guard: if `report_timestamp_utc` is older than
  36h, prefix section with `STALE (<age>h) - run /ai-infra-update first`;
  data still shown with the stale label. Missing report -> degraded line,
  never silent omission.
- `source_status` semantics: X lanes dead but news wire alive -> `degraded`
  (not `error`); both dead -> `error`.
- Empty-state copy fix: when 0 posts collected, executive summary reads
  `0 posts collected (X session outage)` and never the quality-gating wording.
- Result dict adds keys: `news_wire`, `market_tape`, `ai_infra_update`.
  `schema_version` bumps to 2.

### Changed: `/news` skill (`C:\Users\MingC\.claude\skills\news\SKILL.md`)

Stage C contract added:

1. Run the pipeline command (unchanged wrapper).
2. Read `tickerpulse_news_layer_summary.json`.
3. Light verification: for the top 3-5 story cards, check the primary source
   behind the claim via WebSearch/WebFetch (or curl fallback); record
   confirmed / not confirmed / conflicting in the digest line.
4. Write the digest inline using the format below. Do not only point at
   artifact paths.
5. X-outage behavior: if X lanes are dead, lead with the outage notice and the
   classified cause from Source Health, then produce a wire-only digest.
   Missing data is named, never papered over.

## Digest output format (what Ming reads every morning)

1. Market tape table (7 rows: last close, 1d, 5d)
2. Top stories, max 5 — each: What happened / Expectation delta / Impact /
   What to do (causal because-clause) + source grade + wire<->X
   corroboration status + verification result
3. X-only perspective: followed-account stories with no wire echo (the edge)
4. AI infra data: GPU rental medians, 7D/30D, tightness read, staleness flag
5. Monitor alerts: VIXEQ/COR1M/gamma — expanded only on watch/alert
6. Catalysts: watchlist events due today/this week
7. Source health: one line per lane

## Error handling summary

- Every lane (X accounts, X searches, news wire, tape, AI infra, monitors)
  reports independent status into Source Health; one dead lane never blanks
  the report.
- No silent fallbacks: degraded/stale/missing data is labeled in the section
  where it would have appeared.
- No guessed values anywhere (tape, GPU prices, monitor readings).

## Testing (TDD: failing test first for each unit)

- `tests/test_news_wire_collector.py`: dedupe by title; ticker merge; date
  normalization incl. unparseable dates; per-ticker failure tolerance;
  payload shape; max_tickers cap; US/Private filter.
- `tests/test_market_tape_snapshot.py`: row math from stubbed quote frames;
  partial failure -> row errors; total failure -> lane error.
- `tests/test_news_story_cards.py` (extend): news_wire post joins an X story
  cluster; wire+followed confidence upgrade; wire-only confidence; grade
  ladder position.
- `tests/test_news_layer_review.py` (extend, existing injection pattern):
  injected fake news/tape/ai-infra lanes appear in result + report sections;
  X-dead/news-alive -> `degraded` + outage copy; schema_version 2; stale
  ai-infra label.
- Real-lib smoke (no fakes, per feedback_fake_vs_real_api_drift):
  `venv\Scripts\python.exe -m backend.scripts.run_news_layer_review
  --posts-per-account 1 --posts-per-query 1 --news-max-tickers 3`
  (`--news-max-tickers` is a new CLI flag passed through to the news lane);
  verify report contains Market Tape, News Wire Tape, AI Infra sections with
  real data before claiming code-complete.

## Explicitly out of scope (YAGNI)

- Scheduling/automation (interactive only this phase)
- Bernstein lane changes; new X search lanes; reliability re-seeding
- Dashboard/DB writes for the news lane
- OpenRouter / Frontier-labs token data (parser extension is a later task if
  the ai-infra report gains those sections)
- inv-workflow routing (unchanged rule: only on explicit request)

## Repo state caveat

The entire news layer (services, tests, configs) is currently UNTRACKED on
`main` alongside ~30 modified tracked files from in-flight work. This spec
does not bundle any git cleanup. Branch/commit strategy is decided with Ming
at implementation start (no direct-to-main commits; per-item confirmation).
