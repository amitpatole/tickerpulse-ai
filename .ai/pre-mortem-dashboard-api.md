# Pre-Mortem Report

**Scope:** Dashboard token-cost API and AI-infra update API
**Date:** 2026-06-09

## Summary

Two fragile contracts matter for this patch: the dashboard cost card depends on a query-string shape that had drifted from the backend, and AI-infra data is already consumed through the market-sweep payload. The hardening target is to keep the public API shapes explicit and tested before adding the UI panel.

## Post-Mortems

### Token Cards Stayed At Zero

**Severity:** Medium
**Component:** `backend/api/agents.py:get_cost_summary`, `frontend/src/app/agents/page.tsx`
**Fragility type:** Stringly-typed contracts

#### What happened

The dashboard showed `$0.00` and zero tokens even after agent runs consumed tokens. Users trusted the dashboard and missed a real cost increase.

#### The change that caused it

A frontend change standardized cost summary calls on `?days=30`, while the backend endpoint still only interpreted `period=daily|weekly|monthly`.

#### Why it broke

The query-string contract was implicit. The backend accepted the request but ignored `days`, then returned placeholder zero totals.

#### How it was caught

The issue surfaced only by comparing the dashboard with `agent_runs`; the endpoint itself returned HTTP 200.

#### Hardening suggestions

Add an API regression test for `GET /api/agents/costs?days=30` against a temp `agent_runs` table, and return real aggregate data with both `days` and `period` supported.

### AI-Infra Rows Diverged Between API Surfaces

**Severity:** Medium
**Component:** `backend/api/market_sweep.py`, `backend/services/ai_infra_update.py`
**Fragility type:** Invisible invariants

#### What happened

The market sweep showed refreshed GPU prices, while a future dashboard route showed stale or differently ranked GPU rows.

#### The change that caused it

A developer added a standalone AI-infra dashboard route and re-parsed `daily-report.md` separately.

#### Why it broke

The parser and ranking logic were already centralized in `build_ai_infra_update()`, but nothing forced new dashboard routes to reuse it.

#### How it was caught

It would appear as inconsistent GPU rows between `/api/market-sweep` and the dashboard panel.

#### Hardening suggestions

Make the standalone route call `build_ai_infra_update()` directly and test that the route returns the same payload shape expected by the market-sweep `ai_infra_update` field.
