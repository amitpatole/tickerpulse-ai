# Review Brief

## What Changed
- Added required X account selection so user-requested accounts are not skipped by first-N sampling.
- Added X search reaction collection with partial-failure status semantics and curated-search trust metadata.
- Added source-backed news intelligence cards with stable IDs and conservative expert-reaction matching.
- Integrated news intelligence into market sweep output and idea feed metadata.
- Hardened feed survival so top-level `news_intelligence` cards still reach `build_idea_feed()` even when display `insights` are capped.
- Round 1 ai-review fixes require non-empty article URLs for cards, require trusted expert signal for expert reactions, and degrade market-sweep status on news-fetch failures.
- Round 2 ai-review fix carries curated X-search trust metadata into normalized search posts and allows only high/highest domain-specific curated searches to count as expert evidence.
- Round 3 ai-review fix tokenizes curated-search metadata and requires exact trusted domain tokens, so substrings such as `notmemory` no longer satisfy `memory`.

## Important Paths
- `backend/services/x_watchlist.py`
- `backend/services/news_intelligence.py`
- `backend/services/market_sweep.py`
- `backend/services/idea_feed.py`
- `tests/test_monitoring_hardening.py`
- `tests/test_news_intelligence.py`
- `tests/test_market_sweep_service.py`
- `tests/test_daily_idea_sweep.py`

## Review Artifact Type
- `code`

## Pre-Mortem Scope
- Check source URL invariants, hidden source degradation, expert-reaction false positives, curated search trust, feed metadata survival, duplicate handling, and exact-token search trust boundaries.

## Mutation Scope
- `backend.services.x_watchlist.XWatchlistCollector`
- `backend.services.news_intelligence.build_news_intelligence_cards`
- `backend.services.market_sweep.MarketSweepService.run`
- `backend.services.idea_feed.build_idea_feed`

## Mutation Preconditions
- Baseline TickerPulse focused tests pass.
- The staged files are limited to the cumulative TickerPulse Tasks 1-4 news intelligence change.
- Safe revert scope is the staged TickerPulse files listed above.
- The repo contains unrelated dirty/untracked files; mutation must not touch or revert them.

## Mutation-Testing Reporting
- `blocked`: the repo has unrelated dirty/untracked local state and the staged files are intentionally uncommitted until this aggregate upstream review completes. Narrow regression tests were added for each review finding instead.

## Logic And Invariants
- User-requested X accounts must be selected even when they appear after the account limit.
- X search `error` and `degraded` statuses must propagate to market-sweep top-level `source_status`.
- News fetch failures must degrade market-sweep top-level `source_status`.
- News-intelligence cards must be source-backed with non-empty source URLs.
- `insight_id` must be stable across runs for the same source URL, claim, and ticker, and must not drift when provider source names change.
- Expert X reactions must be preserved with why-source-matters evidence and must not falsely confirm ticker-only, generic, single-domain-token generalist, or multi-domain generalist overlap.
- Curated X search reactions may count as expert evidence only when they carry `source_trust="curated_search"`, high/highest priority, and exact domain-specific memory/HBM/DRAM query metadata tokens.
- Curated X search trust must not accept substrings such as `notmemory`; metadata is tokenized before intersecting trusted terms.
- Idea feed rows must preserve `insight_id`, related tickers, themes, source claim, evidence, and human review metadata, even when display insights are capped.

## Tests
- `uv run --with flask==3.0.0 --with APScheduler --with SQLAlchemy --with pytest --with pyyaml python -m pytest tests\test_monitoring_hardening.py tests\test_news_intelligence.py tests\test_market_sweep_service.py tests\test_daily_idea_sweep.py -q` -> `40 passed`
- `git diff --cached --check` -> clean
- Raw `uv run pytest -q` remains blocked by undeclared local dependencies in this worktree (`flask`, `apscheduler`, SQLAlchemy path), not by Task 1-4 assertions.

## Risks
- Direct X collection may degrade when twscrape has no local account session.
- Conservative expert matching can miss useful source reactions if trusted experts use synonyms outside the small theme vocabulary.
- Schema drift can break the downstream inv-workflow parser if metadata fields are renamed.
- `news_intelligence` cards are discovery artifacts and still require human review before technical filtering.

## Review Focus
- P0/P1 correctness issues in account selection, stable IDs, card evidence, source URL requirements, source status propagation, curated-search trust, exact-token matching, feed metadata survival, duplicate handling, and downstream schema compatibility.

## Prior Review Context
Round 1 `ai-review` returned `needs_changes` with severity `P1`:
- Prior P1: `build_news_intelligence_cards()` emitted normal cards with blank `source_url` for articles without URLs. Codex response: accepted and fixed. Evidence: `tests/test_news_intelligence.py::test_skips_news_card_without_source_url` failed before the fix and now passes; `backend/services/news_intelligence.py` now skips articles whose URL is blank before building a card.
- Prior P1: generalist posts with two overlapping domain terms, e.g. HBM and DRAM, were labeled `expert_reaction_found`. Codex response: accepted and fixed. Evidence: `tests/test_news_intelligence.py::test_generalist_two_domain_terms_do_not_count_as_expert_reaction` failed before the fix and now passes; `backend/services/news_intelligence.py` now requires trusted expert signal before any material overlap can count as expert reaction.
- Prior P1: news-fetch failures were recorded under `result["news"][ticker]["error"]` but omitted from top-level `source_status`. Codex response: accepted and fixed. Evidence: `tests/test_market_sweep_service.py::test_market_sweep_degrades_when_news_fetch_fails` failed before the fix and now passes; `backend/services/market_sweep.py` now passes `news` into `_source_status()` and degrades if any news result contains an error.

Round 2 `ai-review` returned `needs_changes` with severity `P1`:
- Prior P1: normalized X search reactions had no lane/reason/trust metadata, so conservative expert matching rejected all search posts. Codex response: accepted and fixed. Evidence: `tests/test_news_intelligence.py::test_curated_search_reaction_counts_as_expert_evidence` failed before the fix and now passes; `tests/test_news_intelligence.py::test_low_priority_generic_search_does_not_count_as_expert_evidence` verifies the guardrail; `tests/test_monitoring_hardening.py::test_x_collector_collects_search_reactions` now asserts normalized search posts include `lane`, `reason`, `source_trust`, and priority. `backend/services/x_watchlist.py` now emits curated-search trust metadata and `backend/services/news_intelligence.py` only trusts high/highest domain-specific curated search reactions.

Round 3 `ai-review` returned `needs_changes` with severity `P1`:
- Prior P1: curated-search trust matched trusted terms as substrings, so `source_query="notmemory"` could satisfy `memory` and falsely promote a search post to expert evidence. Codex response: accepted and fixed. Evidence: `tests/test_news_intelligence.py::test_curated_search_trust_requires_exact_domain_token` failed before the fix and now passes; `backend/services/news_intelligence.py` now tokenizes `lane`, `source_query`, `query`, and `reason` through `_terms(...)` before intersecting exact trusted terms (`MEMORY`, `HBM`, `DRAM`).
- Round-3 checkpoint: structural accepted P1 = 1; theoretical/defensive/cosmetic findings = 0. The latest user instruction after this finding was to continue `subagent-driven-development`, so Round 4 is being run to verify the implemented fix.

Prior subagent code-quality findings were also accepted/fixed before Round 1:
- Task 1: required-account dedupe/capacity bug fixed and re-reviewed.
- Task 2: partial X-search failure with zero-result success was reported as `error` instead of `degraded`; fixed and re-reviewed.
- Task 3: ticker-only/generic/single-domain-token false confirmations, source-name ID drift, and malformed post crashes; fixed and re-reviewed.
- Task 4: X-search status was hidden from top-level source status and news-intelligence cards could be capped out before feed generation; fixed and re-reviewed.
