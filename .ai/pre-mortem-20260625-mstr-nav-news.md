# Pre-Mortem Report

**Scope:** `backend/services/news_layer_review.py` MSTR NAV lane integration
**Date:** 2026-06-25

## Summary

The main fragility is schema drift across the `/news` lane surfaces: a new
monitor must appear in the live result, raw JSON, summary JSON, Markdown report,
and source health without being allowed to fail the whole news run. A second
fragility is valuation semantics: gross BTC value and common-equity NAV are easy
to conflate, which could create a false buy signal.

## Post-Mortems

### 1. MSTR Monitor Appeared In Markdown But Not Summary JSON

**Severity:** Medium
**Component:** `backend/services/news_layer_review.py:run_news_layer_review`, `_write_artifacts`, `format_news_layer_report`
**Fragility type:** Stringly-typed contracts

#### What happened

The daily Markdown report showed the MSTR NAV discount, but downstream readers
loading `tickerpulse_news_layer_summary.json` could not find the lane. A later
automation treated the missing key as "not run" and stopped alerting on MSTR
discount days.

#### The change that caused it

A future developer added `_mstr_nav_lines()` and put it into
`format_news_layer_report()`, but forgot to add `mstr_nav_monitor` to
`result` and `summary_payload`.

#### Why it broke

`news_layer_review.py` manually mirrors lane keys in three places:
`run_news_layer_review()` builds `result`, `_write_artifacts()` builds
`summary_payload`, and `format_news_layer_report()` renders sections. Nothing
enforces that a lane added to one surface is added to the others.

#### How it was caught

It would not be caught by a Markdown-only smoke. It would surface only when a
consumer inspected the summary artifact.

#### Hardening suggestions

Add a focused test that runs `/news` with an injected MSTR payload and asserts
that `result`, raw JSON, summary JSON, and Markdown all contain
`mstr_nav_monitor`.

### 2. Strategy API Timeout Killed The Whole News Run

**Severity:** High
**Component:** `backend/services/news_layer_review.py:_build_*` lane functions
**Fragility type:** Implicit resource lifecycle

#### What happened

`/news` failed before producing the daily digest because Strategy's API timed
out during the MSTR NAV check. The failure hid all other market tape, X, AI
infra, gamma, and breadth data.

#### The change that caused it

A future developer called the live MSTR fetcher directly inside
`run_news_layer_review()` instead of wrapping it in a guarded `_build_mstr_nav()`
lane.

#### Why it broke

Existing lanes such as `_build_market_tape()` and `_build_ai_infra()` catch
exceptions and return error payloads. A direct live fetch would violate that
lane contract and make one optional monitor a hard dependency for the whole
digest.

#### How it was caught

It would appear as a failed morning run when the API or network was unavailable.
Unit tests using injected payloads would not catch it unless an exception path
test existed.

#### Hardening suggestions

Implement `_build_mstr_nav()` with an injected callable and exception-to-error
payload behavior. Test an injected exception and assert the report says the
MSTR lane failed instead of raising.

### 3. Gross BTC Discount Triggered A False Common-Equity Signal

**Severity:** High
**Component:** `backend/services/mstr_nav_monitor.py` calculation and report labels
**Fragility type:** Assumptions baked into data transformations

#### What happened

The `/news` report flagged MSTR as "cheap" because market cap was far below
gross BTC value. Ming bought common even though common-equity NAV was still at a
premium after debt and preferred.

#### The change that caused it

A future cleanup renamed or promoted `gross_btc_discount_pct` above
`common_discount_pct`, or changed the signal classifier to use BTC NAV before
subtracting the financing stack.

#### Why it broke

Both numbers are useful, but only common-equity NAV answers the trading
question. A label or classifier that mixes them changes the economic meaning of
the monitor.

#### How it was caught

It would be visible in a day when gross BTC discount is positive but common NAV
discount is negative, like the 2026-06-25 snapshot.

#### Hardening suggestions

Test the 2026-06-25 snapshot so the signal remains `NO_DISCOUNT_PREMIUM` even
when gross BTC discount is large. Render "Common discount" before "Gross BTC
discount" in Markdown.
