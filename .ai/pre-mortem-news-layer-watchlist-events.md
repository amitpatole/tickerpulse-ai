# Pre-Mortem Report

**Scope:** `backend/services/news_layer_review.py` watchlist-event integration  
**Date:** 2026-06-09

## Summary

The main fragility is a split mental model: `market_sweep` already exposes `watchlist_events`, but the standalone news-layer review exposes only X/search/Bernstein data. A future edit could easily update one intake surface and leave the other stale unless the top-level contract is tested.

## Post-Mortems

### CBRS catalyst disappeared from the standalone news layer

**Severity:** Medium  
**Component:** `backend/services/news_layer_review.py::run_news_layer_review`  
**Fragility type:** Stringly-typed contracts

#### What happened

The daily standalone news-layer report showed X tape and Bernstein echoes, but did not show the CBRS lock-up tranche checks. Ming expected top-level TickerPulse catalysts and X to sit together, so the event was missed during a morning review.

#### The change that caused it

A developer added a new watchlist note to `config/watchlist_notes.yaml` and verified `market_sweep`, but did not realize `news_layer_review` has its own result shape and artifact writer.

#### Why it broke

`watchlist_events` is a dict key contract consumed by `market_sweep` and `idea_feed`, but `news_layer_review` builds its result independently. Nothing enforces that the standalone news-layer output carries the same catalyst surface.

#### How it was caught

It was caught manually when the report did not include CBRS even though the watchlist event builder returned the dates. Existing news-layer tests only covered X collection, Bernstein labels, and source error formatting.

#### Hardening suggestions

Add a focused test that patches the watchlist event loader and asserts `run_news_layer_review()` returns top-level `watchlist_events`, writes them to raw JSON, and includes a report section.

### Top-level source summary undercounted non-X intake

**Severity:** Low  
**Component:** `backend/services/news_layer_review.py::_build_executive_summary`  
**Fragility type:** Invisible invariants

#### What happened

The executive summary said only X posts were reviewed even when watchlist events were present. The report looked healthy, but readers did not know dated catalysts were part of the run.

#### The change that caused it

A developer added `watchlist_events` to the result payload but did not update the summary or Markdown formatter.

#### Why it broke

The result object, summary bullets, raw JSON summary, and Markdown sections are maintained manually. Adding one key does not force the display layer to acknowledge it.

#### How it was caught

Manual report review found the raw JSON had events but the Markdown report did not.

#### Hardening suggestions

Test both the machine result and report text for the watchlist-event section so the raw and human-readable artifacts stay aligned.
