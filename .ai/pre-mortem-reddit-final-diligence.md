# Pre-Mortem: Reddit Final-Diligence News Layer

### Reddit Re-Entered First-Pass Ranking

**Severity:** Medium
**Component:** `backend/services/market_sweep.py`
**Fragility type:** Load-bearing defaults / stringly-typed contracts

#### What happened

The daily news layer started surfacing Reddit posts as top-ranked ideas again. A high-engagement Reddit thread displaced scanner, X, news, and AI-infra evidence in `insights`, even though the intended process was to run Reddit only after a candidate had already cleared the first-pass filters.

#### The change that caused it

A future edit reused `_build_insights()` for all source types and appended Reddit posts back into the same `insights` list because that looked consistent with the other source integrations.

#### Why it broke

The previous contract relied on a convention: `include_reddit=false` by default. It did not enforce that explicit Reddit checks stayed out of first-pass `insights`. Because consumers treat `insights` as idea intake, adding Reddit there silently changed workflow ordering.

#### How it was caught

The issue would surface in idea feeds or daily market checks where Reddit-sourced items appeared before primary or higher-quality sources. A test must assert that explicit Reddit output is returned in a separate final-diligence channel, not in `insights`.

#### Hardening suggestions

- Keep Reddit items in a separate `final_diligence` list.
- Add workflow metadata that labels Reddit as `final_diligence`.
- Test that `include_reddit=true` does not add Reddit items to `insights`.

### Reddit Failure Made A Good Candidate Look Like A Broken Sweep

**Severity:** Medium
**Component:** `backend/services/market_sweep.py::_source_status`
**Fragility type:** Invisible invariants

#### What happened

A candidate passed scanner/news/X checks, but the sweep returned `source_status=degraded` because Reddit was blocked. Downstream tools treated the whole sweep as low quality even though Reddit was supposed to be optional final diligence.

#### The change that caused it

Reddit status remained included in the same aggregate source status as first-pass sources after the workflow changed.

#### Why it broke

`source_status` was overloaded to mean both "first-pass news layer health" and "every optional source health." Once Reddit became a last-step source, that invariant no longer held.

#### How it was caught

Runtime sweeps with `include_reddit=true` would report degraded because Reddit public endpoints often block or throttle. A test must assert that Reddit failures do not degrade first-pass `source_status`.

#### Hardening suggestions

- Exclude Reddit from first-pass `source_status`.
- Preserve Reddit's own `reddit.source_status`.
- Expose `workflow.final_diligence_status` for the Reddit stage.

### Final-Diligence Results Lost Their Purpose Label

**Severity:** Low
**Component:** `backend/services/market_sweep.py`
**Fragility type:** Stringly-typed contracts

#### What happened

The API returned Reddit results, but downstream consumers could not tell whether they were first-pass ideas or final-diligence context. A later agent reused them as raw idea intake.

#### The change that caused it

The result payload only had `source=reddit`, which did not encode workflow stage or handling rules.

#### Why it broke

The handling rule lived in docs, not the API payload. Any consumer that did not read the playbook could treat Reddit like news/X/scanner.

#### How it was caught

The mismatch would show up when another workflow consumed the API directly and routed Reddit output into idea generation. A test should assert Reddit items carry `workflow_stage=final_diligence` and `diligence_only=true`.

#### Hardening suggestions

- Add `workflow_stage` and `diligence_only` metadata to Reddit final-diligence items.
- Include a top-level workflow policy string in the market sweep response.
