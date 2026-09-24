# Pre-Mortem Report

**Scope:** `config/x_watchlists.yaml`, `backend/services/x_watchlist.py`, `backend/services/news_layer_review.py`
**Date:** 2026-06-10

## Summary

The reliability-ranking change adds a second ranking dimension to the X news layer: source quality over time, not only per-post freshness and keyword score. The main fragility is that the account YAML, collector normalization, raw JSON, summary JSON, and Markdown report are separate contracts; a future edit could update one surface while silently dropping reliability context from another.

## Post-Mortems

### 1. Reliability Seeds Stopped Affecting Ranked Twitter Following

**Severity:** Medium
**Component:** `backend/services/x_watchlist.py::_normalize_post`, `backend/services/news_layer_review.py::_rank_posts`
**Fragility type:** Stringly-typed contracts

#### What Happened

The `/news` report stopped prioritizing high-reliability accounts during a busy AI-infra tape day. Fresh posts from low-quality headline accounts outranked posts from the CRDO top-10 list because only `signal_score` and freshness were considered.

#### The Change That Caused It

A future developer refactored `XAccount` metadata and renamed `reliability_score` to `source_score` in `x_watchlist.py`, but did not update the news-layer ranking helpers.

#### Why It Broke

The collector and report communicate through plain dict keys. `_rank_posts()` only sees fields present in normalized post dicts, and nothing enforces that `reliability_score` remains present for account posts.

#### How It Was Caught

The bug showed up only in daily reports where the same topic had posts from both high- and low-reliability handles. Without a fixture asserting ranking by reliability, ordinary smoke runs still looked valid.

#### Hardening Suggestions

- Add a test that feeds two fresh posts with different `source_reliability_score` values and expects the higher score to rank first.
- Keep the reliability field name stable in raw JSON and Markdown output.
- Add a config-load test that verifies all seeded top-10 accounts carry a numeric reliability score.

### 2. Top-10 Account Additions Created Duplicate Handles

**Severity:** Medium
**Component:** `config/x_watchlists.yaml`, `backend/services/x_watchlist.py::XWatchlistConfig.load`
**Fragility type:** Invisible invariants

#### What Happened

The same handle was collected twice after a new high-signal group was added. One duplicate had a high reliability score and the other had no score, so the report showed inconsistent source quality for the same account.

#### The Change That Caused It

A future edit added `ParadisLabs` to a new top-sources group without noticing it already existed in `discovery_seed_network`.

#### Why It Broke

`XWatchlistConfig.load()` appends accounts from every group and only selection later dedupes by handle. The first duplicate wins for collection ordering, but metadata quality depends on which entry appears first.

#### How It Was Caught

The issue was visible in source-health counts and raw JSON, but not as a hard failure. Tests that only check selected handles would not catch metadata drift unless they assert no duplicates or assert top-source metadata survives.

#### Hardening Suggestions

- Keep top-10 additions in-place by updating existing entries where a handle already exists.
- Add a config test that fails if a handle appears twice.
- Add a config test that verifies top-10 reliability handles are present exactly once.

### 3. Reliability Was Treated As Permanent Truth Instead Of Day-Zero Seed

**Severity:** Medium
**Component:** `config/x_watchlists.yaml`, `backend/services/news_layer_review.py::_source_health_lines`
**Fragility type:** Load-bearing defaults

#### What Happened

Months later, `/news` still displayed the June 10 CRDO reliability ranking as if it were current measured reliability. The report over-trusted an account whose later calls deteriorated.

#### The Change That Caused It

A future developer added reliability display to the report but omitted the start date and sample context, making the score look like a continuously updated metric.

#### Why It Broke

The initial score is a seed from one CRDO study, not a statistically updated long-term hit rate. Without `reliability_started_at` and source notes in normalized posts, the report loses that distinction.

#### How It Was Caught

The mismatch surfaced during a manual review of poor follow-up calls, not through tests. The raw score looked authoritative despite lacking update history.

#### Hardening Suggestions

- Store `reliability_started_at` and `reliability_basis` with the account metadata.
- Display the start date in the report so readers know today is day zero.
- Keep future score updates additive rather than overwriting the original seed basis silently.

## Themes and Recommendations

The dominant theme is schema drift across YAML, normalized post dicts, raw JSON, summary JSON, and Markdown. The implementation should keep the new reliability fields small, explicitly named, and covered by tests at both config-load and report-format levels.
