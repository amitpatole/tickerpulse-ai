# News Dirty Tree Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current `feat/news-morning-digest` dirty tree into a small set of test-green, reviewable commits, with generated/local artifacts removed or isolated.

**Architecture:** Clean up the branch by preserving current work first, fixing the one failing guard test, then staging by topic: X scraper/list sync, MSTR NAV, COR1M/VIXEQ scope cleanup, dashboard taxonomy, and workflow artifacts. No product behavior should be silently changed while staging; each topic gets its own focused verification command before commit.

**Tech Stack:** Python 3.12, pytest, existing TickerPulse `/news` services, Git worktrees, local X tooling via `twscrape` and `twikit`.

---

## Current Review Snapshot

- Branch: `feat/news-morning-digest`.
- Base: `main` at merge-base `3c56c6e`.
- Branch commits ahead of `main`: 15. Branch commits behind `main`: 0.
- Dirty entries before this plan: 33.
- Full test status before this plan: `214 passed, 1 failed`.
- Failing test: `tests/test_sync_x_list_guard.py::SyncXListGuardTest::test_dry_run_without_yes_does_not_build_client`.
- `git diff --check` currently fails only because `.ai/review.patch` has trailing whitespace; product/config diff check passes.
- Nested worktrees are visible as untracked directories because they live under `.worktrees/` inside this repo.

## Common Ground Assumptions

`/common-ground` was checked before writing this plan. No existing ground file was found for project ID `github.com/amitpatole/tickerpulse-ai`, so these are explicit working assumptions for execution:

- WORKING: `C:\Repos\tickerpulse-ai` is the only repo to clean in this plan.
- WORKING: Do not push, open a PR, merge, remove worktrees, or discard dirty files without a separate explicit execution step.
- WORKING: `.ai/implementation-notes.md`, `.ai/progress.md`, and `.ai/pre-mortem-20260625-mstr-nav-news.md` may contain useful workflow history; `.ai/review-*` and `.ai/review.patch` are generated review artifacts unless a task explicitly chooses to preserve them.
- WORKING: `.codesight/` is generated wiki output; commit it only if Ming wants persistent repo context in this branch. The cleanup default is to remove it from the branch.
- WORKING: `.worktrees/news-800v-review` is a clean worktree on `fix/news-800v-inversion`; `.worktrees/ai-capex-plan-review` is a detached worktree with dirty `.ai` review artifacts only.
- WORKING: X List write operations are live-account mutations. Unit tests may patch clients; live sync commands must remain dry-run unless Ming explicitly approves `--yes`.

## Dependency Graph

```text
git dirty tree
  -> topic inventory
  -> failing sync_x_list guard fix
  -> topic staging
      -> X scraper default commit
      -> X watchlist regrade + list reconciliation commit
      -> MSTR NAV lane commit
      -> COR1M/VIXEQ scope cleanup commit
      -> dashboard taxonomy commit
      -> workflow artifact decision commit or removal
  -> full verification
  -> finishing-a-development-branch options
```

## Boundary Contracts

**Boundary:** `sync_x_list CLI args -> client construction -> X account`
- End goal served: cleanup can preserve list-sync reconciliation without accidental X account access or live writes in create-list dry-run mode.
- Fake-pass checks: process exits 0; a mocked `_build_client` exists; command prints "DRY-RUN"; no exception is raised.
- Connected means: `sync_x_list.main(argv)` parses arguments and reaches the intended dry-run or write branch.
- Consumer-visible data flowing means: create-list dry-run prints the configured account count without constructing a client; existing-list dry-run may construct a client only to read list members and preview add/remove diffs.
- Acceptance rule: `test_dry_run_without_yes_does_not_build_client` passes, `test_yes_flag_proceeds_to_build_client` still passes, and reconciliation tests still pass.
- Ready condition: dry-run create path is no-network, write path still requires `--yes`, and existing-list dry-run remains read-only.
- Readiness revoked when: `--username MingFan0` without `--yes` constructs a client in create mode, any no-target command builds a client, or a live mutation can happen without `--yes`.
- Recovery/fail behavior: return nonzero for missing target or failed reconciliation; fail loud rather than silently treating partial list sync as ok.
- Smallest safe proof: patched `_build_client` unit tests plus fake-client reconciliation tests; no live X call.

**Boundary:** `MSTR Strategy API payload -> MSTR NAV lane -> /news artifacts`
- End goal served: `/news` shows MSTR common-equity NAV discount daily without letting the external Strategy API block the whole report.
- Fake-pass checks: Markdown contains an MSTR heading; result dict has a key; schema version changed.
- Connected means: `run_news_layer_review()` calls `_build_mstr_nav()` and includes `mstr_nav_monitor` in result, raw JSON, summary JSON, Markdown, and Source Health.
- Consumer-visible data flowing means: the 2026-06-25 fixture produces `NO_DISCOUNT_PREMIUM`, a negative common discount, a positive gross BTC discount, and all artifact surfaces carry the same payload.
- Acceptance rule: injected success and injected failure tests both pass; the failure path renders `MSTR NAV error` and does not raise.
- Ready condition: success payload and failure payload are both visible to artifact consumers and the report remains generated.
- Readiness revoked when: Strategy API timeout raises out of `/news`, summary JSON omits the lane, gross BTC discount drives the actionable signal, or schema-version consumers are not updated.
- Recovery/fail behavior: return `_lane_error_payload("mstr_nav", ...)` and keep other lanes running.
- Smallest safe proof: one fake success payload and one injected exception in `run_news_layer_review()`.

**Boundary:** `working tree topic -> staged diff -> commit`
- End goal served: branch cleanup produces reviewable commits instead of one mixed commit containing code, configs, generated review files, nested worktrees, and plans.
- Fake-pass checks: `git add .` succeeds; `git status` becomes shorter; a commit exists.
- Connected means: each task stages only its listed files or hunks.
- Consumer-visible data flowing means: `git diff --cached --name-status` matches the task file list, and the task-specific tests prove that staged topic.
- Acceptance rule: no `.worktrees/`, `.codesight/`, or unrelated `.ai/review-*` changes are staged with product code.
- Ready condition: staged diff is topic-pure, tests pass, commit message matches the topic.
- Readiness revoked when: staged diff contains another topic, deleted review artifacts are mixed with product changes, or the full suite remains red after all code commits.
- Recovery/fail behavior: unstage with `git restore --staged <path>`; do not revert user work unless the task explicitly says to restore generated artifacts.
- Smallest safe proof: `git diff --cached --name-status` before each commit.

---

### Task 1: Fix The Blocking `sync_x_list` Dry-Run Regression

**Files:**
- Modify: `backend/scripts/sync_x_list.py:197-302`
- Test: `tests/test_sync_x_list_guard.py`

**Boundary Contracts:** Applies `sync_x_list CLI args -> client construction -> X account`.

**Task Smoke:**

| Stage / Boundary | Activated by | Output assertion | Consumer acceptance point | Production path/config/limits |
|------------------|--------------|------------------|---------------------------|-------------------------------|
| `CLI -> create dry-run` | `sync_x_list.main(["--username", "MingFan0"])` with `_build_client` patched | exit `0`, `_build_client.assert_not_called()` | guard test | Yes - real parser and config loader |
| `CLI -> write path` | `sync_x_list.main(["--username", "MingFan0", "--yes"])` with `_build_client` raising | RuntimeError propagates and `_build_client` called once | guard test | Yes - real parser and write gate |
| `reconcile_list -> fake client` | fake current/configured member sets | add/remove/failure results are explicit | unit tests | Yes - production reconciliation function |

**Smoke input:** patched `_build_client`, current `config/x_watchlists.yaml`, and fake-client reconciliation fixtures.
**Time budget:** under 10 seconds.

- [ ] **Step 1: Reproduce the failure**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m pytest tests\test_sync_x_list_guard.py::SyncXListGuardTest::test_dry_run_without_yes_does_not_build_client -q
```

Expected before the fix: FAIL with `TypeError: object MagicMock can't be used in 'await' expression`, and captured stdout showing that create-list dry-run built a client.

- [ ] **Step 2: Add a regression assertion for existing-list dry-run**

Add this test to `tests/test_sync_x_list_guard.py` after `test_dry_run_without_yes_does_not_build_client`:

```python
    def test_existing_list_dry_run_builds_client_for_read_only_diff(self):
        class _Result(list):
            next = None

        class _Client:
            async def get_list_members(self, list_id, count=100):
                return _Result()

        with mock.patch.object(sync_x_list, "_build_client", return_value=_Client()) as build:
            rc = sync_x_list.main(["--username", "MingFan0", "--list-id", "123"])

        self.assertEqual(rc, 0)
        build.assert_called_once()
```

- [ ] **Step 3: Move client construction below the create-mode dry-run return**

In `backend/scripts/sync_x_list.py`, keep `_build_client(...)` inside the branch that actually needs a client. The intended shape is:

```python
    if not args.list_id and not args.yes:
        print(
            f"Dry run: would create private list '{args.name}' and add "
            f"{len(handles)} configured members."
        )
        return 0

    client = _build_client(
        Path(os.getenv("TWIKIT_REPO", r"C:\Repos\twikit")),
        Path(os.getenv("TWIKIT_ACCOUNTS_DB", r"C:\Repos\twscrape\accounts.db")),
        target,
    )
```

Keep the existing `try/finally: await _aclose(client)` around the branches that use the client.

- [ ] **Step 4: Harden `_aclose()` for patched or sync close methods**

Replace `_aclose()` with:

```python
async def _aclose(client: object) -> None:
    http = getattr(client, "http", None)
    aclose = getattr(http, "aclose", None)
    if not callable(aclose):
        return
    result = aclose()
    if hasattr(result, "__await__"):
        await result
```

This keeps real async clients working and avoids failing on a synchronous or mocked close method.

- [ ] **Step 5: Verify the fix**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m pytest tests\test_sync_x_list_guard.py tests\test_sync_x_list.py -q
```

Expected: all guard and reconciliation tests pass.

- [ ] **Step 6: Commit only the guard fix when staged with the X list-sync topic**

Do not commit this as a standalone behavior change unless the staged diff is only `backend/scripts/sync_x_list.py` and `tests/test_sync_x_list_guard.py`. Otherwise include it in Task 3's list-sync commit.

---

### Task 2: Commit The X Scraper Default Change

**Files:**
- Modify: `backend/services/x_watchlist.py`
- Modify: `tests/test_x_watchlist_twikit_fallback.py`

**Boundary Contracts:** Applies `working tree topic -> staged diff -> commit`.

**Task Smoke:**

| Stage / Boundary | Activated by | Output assertion | Consumer acceptance point | Production path/config/limits |
|------------------|--------------|------------------|---------------------------|-------------------------------|
| `FallbackXRunner -> twscrape primary` | `FallbackXRunner()` | primary `TwscrapeRunner`, backup `TwikitAccountRunner` | test default runner | Yes - production constructors |
| `twscrape list_timeline -> normalized post` | fake CLI JSON row with nested `user` | `author_screen_name`, `author_id`, `source_backend=twscrape` | list lane consumer | Yes - production normalization helper |

**Smoke input:** unit-test fakes only.
**Time budget:** under 15 seconds.

- [ ] **Step 1: Stage only the X scraper hunks**

Run interactive staging and select only hunks in `x_watchlist.py` and `test_x_watchlist_twikit_fallback.py` related to:

- `TwscrapeRunner.list_tweets()`
- `_twscrape_tweet_to_dict()`
- `FallbackXRunner` default primary/backup reversal
- matching tests

```powershell
cd C:\Repos\tickerpulse-ai
git add -p backend/services/x_watchlist.py tests/test_x_watchlist_twikit_fallback.py
git diff --cached --name-status
```

Expected staged files:

```text
M       backend/services/x_watchlist.py
M       tests/test_x_watchlist_twikit_fallback.py
```

- [ ] **Step 2: Verify**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m pytest tests\test_x_watchlist_twikit_fallback.py tests\test_x_watchlist_list_lane.py -q
```

Expected: pass.

- [ ] **Step 3: Commit**

```powershell
cd C:\Repos\tickerpulse-ai
git commit -m "fix(news): use twscrape as default X runner"
```

---

### Task 3: Commit The X Watchlist Regrade And List Reconciliation

**Files:**
- Modify: `config/x_watchlists.yaml`
- Modify: `backend/scripts/sync_x_list.py`
- Modify: `tests/test_monitoring_hardening.py`
- Create: `tests/test_sync_x_list.py`
- Optionally modify: `tests/test_sync_x_list_guard.py` if Task 1 added the list-id dry-run regression.

**Boundary Contracts:** Applies `sync_x_list CLI args -> client construction -> X account` and `working tree topic -> staged diff -> commit`.

**Task Smoke:**

| Stage / Boundary | Activated by | Output assertion | Consumer acceptance point | Production path/config/limits |
|------------------|--------------|------------------|---------------------------|-------------------------------|
| `config/x_watchlists.yaml -> XWatchlistConfig` | load real config | 25 unique accounts, top10 grades load, cut handles absent | config loader and ranking | Yes - real config |
| `sync_x_list reconcile -> fake client` | fake current/configured sets | add missing, remove cut, fail nonzero on unresolved/failure | unit tests | Yes - production reconcile functions |
| `sync_x_list create dry-run -> no client` | patched `_build_client` | no client built without `--yes` and no `--list-id` | guard tests | Yes - real parser |

**Smoke input:** real config plus fake clients.
**Time budget:** under 20 seconds.

- [ ] **Step 1: Verify the topic diff**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
git diff -- config/x_watchlists.yaml backend/scripts/sync_x_list.py tests/test_monitoring_hardening.py tests/test_sync_x_list.py tests/test_sync_x_list_guard.py
```

Expected: only watchlist regrade, X List add/remove reconciliation, guard tests, and config test changes.

- [ ] **Step 2: Verify**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m pytest tests/test_sync_x_list.py tests/test_sync_x_list_guard.py tests/test_monitoring_hardening.py::test_x_watchlist_config_includes_top10_insight_reliability_scores -q
```

Expected: pass.

- [ ] **Step 3: Run a no-write dry-run**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m backend.scripts.sync_x_list --username MingFan0
```

Expected: prints create-list dry-run intent and exits `0`; it must not create a client or touch X.

- [ ] **Step 4: Stage and commit**

```powershell
cd C:\Repos\tickerpulse-ai
git add config/x_watchlists.yaml backend/scripts/sync_x_list.py tests/test_monitoring_hardening.py tests/test_sync_x_list.py tests/test_sync_x_list_guard.py
git diff --cached --name-status
git commit -m "chore(news): regrade X watchlist and reconcile list sync"
```

Expected staged files must not include `.ai/`, `.codesight/`, `.worktrees/`, dashboard config, MSTR files, or vol monitor files.

---

### Task 4: Commit The MSTR NAV Monitor Lane

**Files:**
- Create: `backend/services/mstr_nav_monitor.py`
- Create: `tests/test_mstr_nav_monitor.py`
- Modify: `backend/services/news_layer_review.py`
- Modify: `tests/test_news_layer_review.py`
- Create: `.ai/pre-mortem-20260625-mstr-nav-news.md`

**Boundary Contracts:** Applies `MSTR Strategy API payload -> MSTR NAV lane -> /news artifacts` and `working tree topic -> staged diff -> commit`.

**Task Smoke:**

| Stage / Boundary | Activated by | Output assertion | Consumer acceptance point | Production path/config/limits |
|------------------|--------------|------------------|---------------------------|-------------------------------|
| `Strategy fixtures -> calculate_mstr_nav` | 2026-06-25 snapshot | `NO_DISCOUNT_PREMIUM`, common discount negative, gross BTC discount positive | monitor signal | Yes - production calculation |
| `injected MSTR payload -> /news artifacts` | fake collector plus `mstr_nav_monitor=lambda` | result/raw/summary/report/source health include lane | artifact consumers | Yes - production writer |
| `injected MSTR exception -> /news artifacts` | `mstr_nav_monitor` raises | report contains `MSTR NAV error`; no exception escapes | daily digest | Yes - production guarded builder |

**Smoke input:** fake collector and injected payloads.
**Time budget:** under 20 seconds.

- [ ] **Step 1: Add the missing failure-path test**

Add this test near the existing MSTR test in `tests/test_news_layer_review.py`:

```python
    def test_news_layer_review_keeps_running_when_mstr_nav_monitor_fails(self) -> None:
        from backend.services.news_layer_review import run_news_layer_review

        collector = _FakeNewsLayerCollector()

        def fail_mstr() -> dict[str, object]:
            raise RuntimeError("strategy timeout")

        with tempfile.TemporaryDirectory() as tmpdir:
            result = run_news_layer_review(
                x_collector=collector,
                output_dir=Path(tmpdir),
                posts_per_account=1,
                posts_per_query=1,
                mstr_nav_monitor=fail_mstr,
            )
            summary = json.loads(Path(result["paths"]["summary_json"]).read_text(encoding="utf-8"))
            report = Path(result["paths"]["report_markdown"]).read_text(encoding="utf-8")

        self.assertEqual(result["mstr_nav_monitor"]["source_status"], "error")
        self.assertEqual(summary["mstr_nav_monitor"]["source_status"], "error")
        self.assertIn("MSTR NAV error: injected MSTR NAV monitor failed: strategy timeout", report)
        self.assertIn("## Market Tape", report)
```

- [ ] **Step 2: Replace mojibake parsing with ASCII-safe normalization**

In `backend/services/mstr_nav_monitor.py`, replace the two-line string cleanup in `parse_number()` with:

```python
    text = value.strip().replace(",", "").replace("$", "").replace("%", "")
    text = text.removeprefix("USD").removeprefix("US").strip()
```

Do not add non-ASCII currency symbols to the source file. If future Strategy payloads include other symbols, add a fixture first and handle it deliberately.

- [ ] **Step 3: Add parser coverage**

Add this test to `tests/test_mstr_nav_monitor.py`:

```python
    def test_parse_number_accepts_usd_percent_and_parentheses(self) -> None:
        from backend.services.mstr_nav_monitor import parse_number

        self.assertEqual(parse_number("USD$1,234.50%"), 1234.5)
        self.assertEqual(parse_number("(1,234.50)"), -1234.5)
```

- [ ] **Step 4: Stage only MSTR hunks**

Use interactive staging for shared files:

```powershell
cd C:\Repos\tickerpulse-ai
git add backend/services/mstr_nav_monitor.py tests/test_mstr_nav_monitor.py .ai/pre-mortem-20260625-mstr-nav-news.md
git add -p backend/services/news_layer_review.py tests/test_news_layer_review.py
git diff --cached --name-status
```

Expected staged files:

```text
A       .ai/pre-mortem-20260625-mstr-nav-news.md
A       backend/services/mstr_nav_monitor.py
M       backend/services/news_layer_review.py
A       tests/test_mstr_nav_monitor.py
M       tests/test_news_layer_review.py
```

- [ ] **Step 5: Verify**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m pytest tests/test_mstr_nav_monitor.py tests/test_news_layer_review.py::NewsLayerReviewTest::test_news_layer_review_includes_mstr_nav_discount_monitor tests/test_news_layer_review.py::NewsLayerReviewTest::test_news_layer_review_keeps_running_when_mstr_nav_monitor_fails -q
venv\Scripts\python.exe -m py_compile backend/services/mstr_nav_monitor.py backend/services/news_layer_review.py
```

Expected: tests pass and compile succeeds.

- [ ] **Step 6: Commit**

```powershell
cd C:\Repos\tickerpulse-ai
git commit -m "feat(news): add MSTR common NAV monitor"
```

---

### Task 5: Commit The COR1M/VIXEQ Scope Cleanup

**Files:**
- Modify: `backend/services/vol_structure_monitor.py`
- Modify: `backend/services/news_layer_review.py`
- Modify: `tests/test_vol_structure_monitor.py`
- Modify: `tests/test_news_layer_review.py`

**Boundary Contracts:** Applies `working tree topic -> staged diff -> commit`.

**Task Smoke:**

| Stage / Boundary | Activated by | Output assertion | Consumer acceptance point | Production path/config/limits |
|------------------|--------------|------------------|---------------------------|-------------------------------|
| `vol monitor -> report` | focused monitor/report tests | VIX lacks regime-window fields; COR1M/VIXEQ keep regime fields | Markdown report | Yes - production renderer |
| `ranked/news freshness fallback` | stale-post regression test | stale fallback behavior remains intentional | report sections | Yes - production ranking helpers |

**Smoke input:** existing fixtures in `tests/test_vol_structure_monitor.py` and `tests/test_news_layer_review.py`.
**Time budget:** under 30 seconds.

- [ ] **Step 1: Stage only vol-scope hunks**

Use interactive staging for shared files and avoid MSTR hunks:

```powershell
cd C:\Repos\tickerpulse-ai
git add backend/services/vol_structure_monitor.py tests/test_vol_structure_monitor.py
git add -p backend/services/news_layer_review.py tests/test_news_layer_review.py
git diff --cached --name-status
```

Expected staged files:

```text
M       backend/services/news_layer_review.py
M       backend/services/vol_structure_monitor.py
M       tests/test_news_layer_review.py
M       tests/test_vol_structure_monitor.py
```

- [ ] **Step 2: Verify**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m pytest tests/test_vol_structure_monitor.py tests/test_news_layer_review.py -q
venv\Scripts\python.exe -m py_compile backend/services/vol_structure_monitor.py backend/services/news_layer_review.py
```

Expected: pass.

- [ ] **Step 3: Commit**

```powershell
cd C:\Repos\tickerpulse-ai
git commit -m "fix(news): keep VIX outside regime-window scope"
```

---

### Task 6: Commit Dashboard Watchlist Taxonomy Separately

**Files:**
- Modify: `config/dashboard_watchlist.yaml`

**Boundary Contracts:** Applies `working tree topic -> staged diff -> commit`.

**Task Smoke:**

| Stage / Boundary | Activated by | Output assertion | Consumer acceptance point | Production path/config/limits |
|------------------|--------------|------------------|---------------------------|-------------------------------|
| `dashboard_watchlist.yaml -> loader` | `load_dashboard_watchlist(include_all=True)` | YAML parses; intended buckets present | market sweep/news wire | Yes - production loader |
| `dashboard config -> dashboard tests` | existing dashboard watchlist tests | news:false behavior still correct | dashboard sync | Yes - production tests |

**Smoke input:** real `config/dashboard_watchlist.yaml`.
**Time budget:** under 20 seconds.

- [ ] **Step 1: Validate YAML and bucket counts**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -c "from pathlib import Path; from collections import Counter; from backend.services.dashboard_watchlist import load_dashboard_watchlist; items=load_dashboard_watchlist(Path('config/dashboard_watchlist.yaml'), include_all=True); buckets=Counter(str(i.get('bucket')) for i in items); print(len(items), buckets)"
```

Expected: command exits `0` and prints the item count plus buckets. Confirm `mag7`, `neo_cloud`, `semis_major`, `software`, `photonics_cpo`, `financials`, `consumer`, `fx_cad`, and `commodities` are present.

- [ ] **Step 2: Verify dashboard config tests**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m pytest tests/test_dashboard_watchlist_config.py tests/test_market_sweep_service.py::MarketSweepServiceTest::test_market_sweep_uses_active_dashboard_watchlist_by_default tests/test_news_wire_collector.py -q
```

Expected: pass.

- [ ] **Step 3: Commit**

```powershell
cd C:\Repos\tickerpulse-ai
git add config/dashboard_watchlist.yaml
git diff --cached --name-status
git commit -m "chore(watchlist): update dashboard taxonomy"
```

---

### Task 7: Clean Workflow And Generated Artifacts

**Files:**
- Decide/keep: `.ai/implementation-notes.md`
- Decide/keep: `.ai/progress.md`
- Default restore/remove: `.ai/review-brief.md`, `.ai/review-extras.md`, `.ai/review-metadata.md`, `.ai/review-request.md`, `.ai/review-response.md`, `.ai/review-response.raw.md`, `.ai/review.patch`
- Default remove from branch: `.codesight/`
- Default remove after preservation: `.worktrees/news-800v-review/`, `.worktrees/ai-capex-plan-review/`
- Decide separately: `docs/superpowers/plans/2026-06-16-quick-social-sentiment-gauge.md`

**Boundary Contracts:** Applies `working tree topic -> staged diff -> commit`.

**Task Smoke:**

| Stage / Boundary | Activated by | Output assertion | Consumer acceptance point | Production path/config/limits |
|------------------|--------------|------------------|---------------------------|-------------------------------|
| `.ai notes -> workflow commit` | staged implementation/progress notes only | no review patch artifacts staged | future agents | Yes - tracked notes |
| `.worktrees -> cleanup` | `git worktree list` | worktrees removed only after preserving needed artifacts | git status | Yes - git worktree command |
| generated docs -> decision | `.codesight/` and social sentiment plan | either committed alone or removed | branch cleanliness | Yes - git status |

**Smoke input:** current dirty artifact state.
**Time budget:** 5-15 minutes depending on worktree preservation.

- [ ] **Step 1: Preserve dirty detached worktree notes before removal**

If the `ai-capex-plan-review` worktree is still needed, stop and do not remove it. If it is not needed, preserve a local patch under `D:\Crypto Data\Analysis` before removal:

```powershell
cd C:\Repos\tickerpulse-ai
$out = 'D:\Crypto Data\Analysis\20260629 - tickerpulse branch cleanup'
New-Item -ItemType Directory -Force -Path $out | Out-Null
git -C .worktrees/ai-capex-plan-review status --short --branch --untracked-files=all | Set-Content -Encoding UTF8 "$out\ai-capex-plan-review-status.txt"
git -C .worktrees/ai-capex-plan-review diff > "$out\ai-capex-plan-review.diff"
```

Expected: status and diff files are written outside the repo.

- [ ] **Step 2: Remove nested worktrees using Git, not raw deletion**

Only run after Step 1 and explicit approval for cleanup:

```powershell
cd C:\Repos\tickerpulse-ai
git worktree remove .worktrees/news-800v-review
git worktree remove .worktrees/ai-capex-plan-review --force
git worktree prune
```

Expected: `.worktrees/` no longer appears in `git status`.

- [ ] **Step 3: Restore generated review artifacts**

Run:

```powershell
cd C:\Repos\tickerpulse-ai
git restore -- .ai/review-brief.md .ai/review-extras.md .ai/review-metadata.md .ai/review-request.md .ai/review-response.md .ai/review-response.raw.md .ai/review.patch
```

Expected: `.ai/review-*` and `.ai/review.patch` no longer appear in `git status`. This also clears the current `git diff --check` trailing-whitespace failure.

- [ ] **Step 4: Decide Codesight**

Default cleanup:

```powershell
cd C:\Repos\tickerpulse-ai
git clean -fd .codesight
```

Alternative if persistent repo wiki is desired:

```powershell
cd C:\Repos\tickerpulse-ai
git add .codesight
git commit -m "docs: add Codesight wiki"
```

Choose exactly one path. Do not mix `.codesight/` with product commits.

- [ ] **Step 5: Decide social sentiment plan**

Default cleanup for this `/news` branch:

```powershell
cd C:\Repos\tickerpulse-ai
git clean -f docs/superpowers/plans/2026-06-16-quick-social-sentiment-gauge.md
```

Alternative if the plan is intentionally durable:

```powershell
cd C:\Repos\tickerpulse-ai
git add docs/superpowers/plans/2026-06-16-quick-social-sentiment-gauge.md
git commit -m "docs: add social sentiment gauge plan"
```

Choose exactly one path. Do not mix this plan with `/news` code commits.

- [ ] **Step 6: Commit durable `.ai` notes only if desired**

If keeping workflow notes:

```powershell
cd C:\Repos\tickerpulse-ai
git add .ai/implementation-notes.md .ai/progress.md
git diff --cached --name-status
git commit -m "chore: record news branch implementation notes"
```

Expected staged files:

```text
M       .ai/implementation-notes.md
M       .ai/progress.md
```

If notes should remain local, do not commit them. Restore only with explicit approval because these tracked notes contain useful history.

---

### Task 8: Final Verification And Branch-Finishing Gate

**Files:**
- No new source files.

**Boundary Contracts:** Applies all boundary contracts.

**Task Smoke:**

| Stage / Boundary | Activated by | Output assertion | Consumer acceptance point | Production path/config/limits |
|------------------|--------------|------------------|---------------------------|-------------------------------|
| full tests | `pytest -q` | all tests pass | branch finish | Yes - full suite |
| diff hygiene | `git diff --check` | no whitespace errors | branch finish | Yes - whole worktree |
| bounded `/news` smoke | `news --posts-per-account 1 --posts-per-query 1 --news-max-tickers 3` | report writes and includes MSTR NAV, monitor sections, source health | user daily command | Yes - wrapper |
| Git cleanliness | `git status --short --branch --untracked-files=all` | only intentional local notes remain, or clean | branch finish | Yes - git status |

**Smoke input:** current repo after Tasks 1-7.
**Time budget:** full suite about 10-20 seconds locally; bounded `/news` depends on network/X.

- [ ] **Step 1: Run full tests**

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m pytest -q
```

Expected: all tests pass. Do not present merge/PR options while this is red.

- [ ] **Step 2: Run diff hygiene**

```powershell
cd C:\Repos\tickerpulse-ai
git diff --check
```

Expected: no output and exit `0`.

- [ ] **Step 3: Run a bounded `/news` smoke**

```powershell
cd C:\Repos\tickerpulse-ai
news --posts-per-account 1 --posts-per-query 1 --news-max-tickers 3
```

Expected: report under `D:\Crypto Data\Analysis\YYYYMMDD - TickerPulse news layer daily`, with `## MSTR NAV Discount Monitor`, market tape, monitor sections, AI infra/token sections, and Source Health.

- [ ] **Step 4: Confirm final status**

```powershell
cd C:\Repos\tickerpulse-ai
git status --short --branch --untracked-files=all
git log --oneline --decorate --max-count=20
```

Expected: no accidental `.worktrees/`, `.codesight/`, `.ai/review-*`, or unrelated docs remain dirty.

- [ ] **Step 5: Use finishing-a-development-branch**

Only after Step 1 passes, present the exact branch finishing options:

```text
Implementation complete. What would you like to do?

1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work

Which option?
```

Do not merge, push, remove a branch, or discard work before Ming chooses.

---

## Self-Review Checklist

**Spec coverage**
- Review current dirty tree: covered by the snapshot and task split.
- Plan cleanup: covered by Tasks 1-8.
- Superpowers branch finishing: final gate uses the branch-finishing options only after tests pass.
- `/news` context: MSTR NAV, X lanes, monitor cleanup, and watchlist changes are treated as separate `/news` topics.

**Placeholder scan**
- No task uses deferred placeholder wording.
- Generated-artifact decisions have explicit default actions and explicit alternatives.
- Destructive cleanup of worktrees requires preservation first and explicit approval.

**Type consistency**
- `sync_x_list` commands use the existing CLI.
- MSTR lane keeps `mstr_nav_monitor` as the schema key.
- Staging commands use exact file paths from the current dirty tree.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-29-news-dirty-tree-cleanup.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
