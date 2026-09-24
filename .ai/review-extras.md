# Frozen Extra Review Files

## File: C:\Repos\tickerpulse-ai\.ai\review-response-round3.md

`````text
status: needs_changes
severity: P1
reviewer: codex
review_scope: staged_patch

## Review Method
- pre-mortem: ran
- pre-mortem scope: Stress-tested curated-search trust and expert-reaction false-positive paths from the frozen patch.
- mutation-testing: blocked
- mutation scope: `backend.services.news_intelligence.build_news_intelligence_cards`; blocked because the frozen-input instruction forbids reading/running repository files outside `.ai/review.patch`.
- method notes: Static review only, constrained to the frozen inputs.

- P1: `backend/services/news_intelligence.py:178` accepts high-priority curated searches as trusted when any trusted term appears as a substring anywhere in `lane`, `source_query`, `query`, or `reason`. Reproduction: a post with `source_trust="curated_search"`, `priority="high"`, `source_query="notmemory"`, `query="stocks lang:en"`, and text overlapping an HBM article passes `_is_trusted_curated_search()` because `"memory"` is a substring of `"notmemory"`, then `_is_material_overlap()` promotes it to `expert_reaction_found`. That violates the stated invariant that curated search evidence must come from high/highest domain-specific memory/HBM/DRAM query metadata and reopens the false-positive expert confirmation path. Fix by tokenizing/normalizing the metadata and requiring exact trusted domain tokens from the configured query or explicit structured domain metadata, not substring matches across arbitrary fields.
`````

## File: C:\Repos\tickerpulse-ai\.ai\review-rebuttal.md

`````text

## Round 3 - 2026-06-08

State: in-progress

### P1 curated-search substring trust - accepted
- Evidence type: test
- Evidence: `tests/test_news_intelligence.py::test_curated_search_trust_requires_exact_domain_token`
- Implementation evidence: `backend/services/news_intelligence.py` tokenizes `lane`, `source_query`, `query`, and `reason` with `_terms(...)` and intersects exact trusted terms; focused Task 1-4 suite with explicit deps -> `40 passed`.
- Planned fix: completed; send Round 4 review for implementation verification.

`````
