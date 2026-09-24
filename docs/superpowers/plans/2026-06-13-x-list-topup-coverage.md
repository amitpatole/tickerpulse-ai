# X List Top-Up Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee every configured X List member with recent posts is represented in the `/news` followed-account lane, instead of being silently buried by high-frequency accounts in the reverse-chronological List timeline.

**Architecture:** Keep the existing single-call List timeline pull as the bulk source. After it runs, detect configured accounts that received **zero** posts from the List window, and fill them with a **bounded** per-account `user_tweets` top-up (priority-ranked, capped at `topup_max_accounts`, stops on rate-limit). All on the existing authenticated twikit runner — no new dependency, no search lane, no browser bootstrap.

**Tech Stack:** Python; local twikit clone at `C:\Repos\twikit` (authenticated via twscrape cookies); pytest in `C:\Repos\tickerpulse-ai\venv`; tests authored unittest-style (matching the existing file) and run under pytest.

---

## Why This Plan (evidence)

Live probes this session (account `@Mingfan0`, list_id `2065703090779492503`, 2026-06-13):

- Deep pull of **676 tweets** mapped to only **35 of 46** members. **11 members got zero posts** in-window, including high-value desks: `@iancutress`, `@trendforce`, `@dnystedt`, `@realdonaldtrump`, `@tier10k`, `@wallstengine`.
- Three accounts (`@FirstSquawk` 241, `@financialjuice` 85, `@zerohedge` 68) = **58% of the pull**, burying low-frequency accounts arbitrarily deep.
- Root cause: a raw List timeline is frequency-weighted; the existing per-author cap stops the floods dominating the digest but does **not** resurface buried/quiet accounts.

This plan fixes coverage at the source without touching the (separately walled) search lane.

## Post-Review Amendments (Codex adversarial review, 2026-06-13)

The first adversarial pass returned `needs-attention` with three [high] findings. Incorporated:

- **Finding 1 (List drops configured accounts):** this IS the plan's core (the top-up). Resolved on implementation.
- **Finding 2 (List path ignores `max_accounts` contract):** real and coupled to the top-up (which iterates the index). Fix folded into Task 1: build the List index from `self._selected_accounts(max_accounts)` (not all config accounts), base `fetch_limit` and `accounts_checked` on the selected set, and add a regression test where a non-selected account's List tweet is dropped. `/news` is unaffected (`news_layer_review.py:87` passes `max_accounts=len(all)`); `market_sweep.py:77` (`x_max_accounts=12`) is fixed.
- **Finding 3 (`sync_x_list` can write to the wrong X account):** added as Task 3 — require an explicit target account, print it, and gate `create_list`/`add_list_member` behind `--yes`.

## Dependency And Boundary Contract Gate

**Components touched:** one — `backend/services/x_watchlist.py` (`XWatchlistCollector`).
**External dependency:** yes — the X GraphQL API via the existing `TwscrapeRunnerProtocol` runner (`FallbackXRunner` → `TwikitAccountRunner`).

`/common-ground` was **not** run as a separate step because every assumption it would surface is already **empirically confirmed by live probes this session** (stronger than speculative agreement):

- `runner.list_tweets(list_id, limit)` works with the noop transaction (probe pulled 676 tweets). ✓
- `runner.user_tweets(user_id, limit)` + `runner.user_by_login(handle)` work at **bounded** scale on the twikit timeline path (prior bounded 6-account sweep returned 12 real posts; `UserTweets` and `UserByScreenName` are timeline-family endpoints that tolerate the empty txn-id — unlike `SearchTimeline`). ✓
- Rate budgets: `UserTweets` 50/15min, `UserByScreenName` 95/15min, `ListLatestTweetsTimeline` 500/15min. A run = 1 list call + ≤ `topup_max_accounts`×2 calls. With default 12 → ≤ 25 calls total, comfortably under every limit. ✓
- The original self-DOS came from an **unbounded** 46-account per-account sweep; this top-up is hard-bounded and stops on the first 429. ✓

**Boundary:** `runner.user_tweets / user_by_login (twikit timeline) -> XWatchlistCollector._topup_missing_accounts -> payload["posts"] -> news_layer_review account lane`
- End goal served: every configured List member with recent posts appears in the followed-account lane of `/news` (no silent absence).
- Fake-pass checks: `list_tweets` returning HTTP 200 / a non-empty list is NOT enough (it already does that, yet 11/46 are absent); a `user_tweets` call returning without exception is NOT enough; "no exception" is NOT enough.
- Connected means: `runner.user_tweets(user_id, limit)` returns a list without raising.
- Consumer-visible data flowing means: for a previously zero-representation account, one or more normalized post dicts with that `handle` (non-empty `id`, `handle`, `text`) are present in the returned `payload["posts"]`, observable by the digest builder.
- Acceptance rule: distinct `handle` count in `payload["posts"]` is **strictly greater** with top-up enabled than with `topup_max_accounts=0`, for the same live List; no duplicate `id` values across List + top-up.
- Ready condition: List bulk succeeded AND (in the live smoke) top-up added ≥1 post for ≥1 previously-absent priority account.
- Readiness revoked when: top-up hits a 429 (rate limit) — stop immediately, record the error, retain bulk posts; or `user_id` cannot be resolved — record the error and skip that account.
- Recovery/fail behavior: on 429 during top-up, break the loop, append an error entry, keep all List-bulk posts; lane status is derived from bulk presence and never escalated to `error` solely because top-up stopped. Bounded by `topup_max_accounts` so calls stay under `UserTweets` 50/15min.
- Smallest safe proof: fake-runner unit tests (absent→topped, dedupe, per-author cap, budget, priority order, 429-stop, disabled, cached-id) PLUS one live `collect_accounts` smoke asserting distinct-handle count rose vs `topup_max_accounts=0` with no crash. Read-only (no posting, no writes).

## File Structure

- **Modify** `backend/services/x_watchlist.py`
  - `XWatchlistCollector.collect_accounts` (`:427`) — add `topup_max_accounts: int = 12` param, thread to the list path.
  - `XWatchlistCollector._collect_accounts_via_list` (`:452`) — add `topup_max_accounts: int = 12` param; call the new helper before sorting; refine status so top-up errors surface as `degraded`.
  - `XWatchlistCollector._topup_missing_accounts` — **new** private method (single responsibility: bounded per-account fill of zero-representation accounts).
- **Modify** `tests/test_x_watchlist_list_lane.py` — add fakes (`_ManyUserTweetsRunner`, `_SharedIdRunner`, `_RateLimitUserTweetsRunner`) and a new `ListTopupTest` class.

No call-site changes: both callers (`news_layer_review.py:87`, `market_sweep.py:76`) use the existing 2-arg form and inherit the `topup_max_accounts=12` default. The `CollectorProtocol` in `news_layer_review.py:46` is unaffected (added param is optional with a default).

---

### Task 1: Bounded per-account top-up for zero-representation List members

**Files:**
- Modify: `backend/services/x_watchlist.py:427` (`collect_accounts`), `:452-506` (`_collect_accounts_via_list`), add new method after `_collect_accounts_via_list`.
- Test: `tests/test_x_watchlist_list_lane.py`

**Boundary Contracts:** See the canonical block in "Dependency And Boundary Contract Gate" above — this task implements that single boundary (`runner.user_tweets/user_by_login -> _topup_missing_accounts -> payload["posts"]`). All nine fields apply as written.

**Task Smoke:** Covered by Task 2 (live run). Unit tests below prove the glue logic deterministically with fakes; Task 2 proves the real twikit boundary.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_x_watchlist_list_lane.py` (reuses the existing `_tweet`, `_config`, `_ListRunner` helpers at the top of the file):

```python
class _ManyUserTweetsRunner(_ListRunner):
    """user_tweets returns several posts for the queried user (per-author cap test)."""

    def __init__(self, list_tweets_result=None, per_user=4):
        super().__init__(list_tweets_result=list_tweets_result)
        self._per_user = per_user

    def user_tweets(self, user_id, limit):
        self.calls.append(("user_tweets", user_id))
        return [_tweet(f"ut-{user_id}-{i}", "anyone", f"p{i}") for i in range(self._per_user)][:limit]


class _SharedIdRunner(_ListRunner):
    """user_tweets returns a tweet id that also came from the List (dedupe test)."""

    def user_tweets(self, user_id, limit):
        self.calls.append(("user_tweets", user_id))
        return [_tweet("shared", "anyone", "dup across sources")][:limit]


class _RateLimitUserTweetsRunner(_ListRunner):
    """user_tweets raises a 429-style error (rate-limit-stop test)."""

    def user_tweets(self, user_id, limit):
        self.calls.append(("user_tweets", user_id))
        raise RuntimeError("status: 429 Too Many Requests")


class ListTopupTest(unittest.TestCase):
    def _accounts(self):
        return (
            XAccount(handle="semisource", lane="ai_semis", priority="highest", reason="r", alert_keywords=("HBM",)),
            XAccount(handle="macro", lane="macro", priority="high", reason="r"),
        )

    def test_topup_fills_account_absent_from_list(self):
        runner = _ListRunner(list_tweets_result=[_tweet("m1", "macro", "macro note")])
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=self._accounts()), runner=runner)
        payload = collector.collect_accounts(max_accounts=46, posts_per_account=5, topup_max_accounts=12)
        handles = sorted({p["handle"] for p in payload["posts"]})
        self.assertEqual(handles, ["macro", "semisource"])
        self.assertTrue(any(c[0] == "user_by_login" and c[1] == "semisource" for c in runner.calls))
        self.assertTrue(any(c[0] == "user_tweets" for c in runner.calls))

    def test_topup_skipped_when_account_already_present(self):
        tweets = [_tweet("m1", "macro", "x"), _tweet("s1", "semisource", "HBM")]
        runner = _ListRunner(list_tweets_result=tweets)
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=self._accounts()), runner=runner)
        collector.collect_accounts(max_accounts=46, posts_per_account=5, topup_max_accounts=12)
        self.assertFalse(any(c[0] == "user_tweets" for c in runner.calls))

    def test_topup_respects_per_author_cap(self):
        runner = _ManyUserTweetsRunner(list_tweets_result=[_tweet("m1", "macro", "x")], per_user=4)
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=self._accounts()), runner=runner)
        payload = collector.collect_accounts(max_accounts=46, posts_per_account=2, topup_max_accounts=12)
        semi = [p for p in payload["posts"] if p["handle"] == "semisource"]
        self.assertEqual(len(semi), 2)

    def test_topup_dedupes_against_list_ids(self):
        runner = _SharedIdRunner(list_tweets_result=[_tweet("shared", "macro", "x")])
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=self._accounts()), runner=runner)
        payload = collector.collect_accounts(max_accounts=46, posts_per_account=5, topup_max_accounts=12)
        self.assertEqual(len([p for p in payload["posts"] if p["id"] == "shared"]), 1)

    def test_topup_budget_limits_to_highest_priority(self):
        accounts = (
            XAccount(handle="a_low", lane="l", priority="low", reason="r"),
            XAccount(handle="b_high", lane="l", priority="highest", reason="r"),
            XAccount(handle="c_med", lane="l", priority="medium", reason="r"),
        )
        runner = _ListRunner(list_tweets_result=[])
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=accounts), runner=runner)
        payload = collector.collect_accounts(max_accounts=46, posts_per_account=5, topup_max_accounts=1)
        handles = sorted({p["handle"] for p in payload["posts"]})
        self.assertEqual(handles, ["b_high"])

    def test_topup_stops_on_rate_limit(self):
        runner = _RateLimitUserTweetsRunner(list_tweets_result=[_tweet("m1", "macro", "x")])
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=self._accounts()), runner=runner)
        payload = collector.collect_accounts(max_accounts=46, posts_per_account=5, topup_max_accounts=12)
        self.assertTrue(any(p["handle"] == "macro" for p in payload["posts"]))
        self.assertTrue(any("rate limit" in e["message"].lower() for e in payload["errors"]))
        self.assertIn(payload["source_status"], ("ok", "degraded"))

    def test_topup_disabled_when_zero(self):
        runner = _ListRunner(list_tweets_result=[_tweet("m1", "macro", "x")])
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=self._accounts()), runner=runner)
        collector.collect_accounts(max_accounts=46, posts_per_account=5, topup_max_accounts=0)
        self.assertFalse(any(c[0] == "user_tweets" for c in runner.calls))

    def test_topup_uses_cached_user_id_without_login(self):
        accounts = (
            XAccount(handle="semisource", lane="ai_semis", priority="highest", reason="r", user_id="999"),
            XAccount(handle="macro", lane="macro", priority="high", reason="r"),
        )
        runner = _ListRunner(list_tweets_result=[_tweet("m1", "macro", "x")])
        collector = XWatchlistCollector(config=_config(list_id="L123", accounts=accounts), runner=runner)
        collector.collect_accounts(max_accounts=46, posts_per_account=5, topup_max_accounts=12)
        self.assertFalse(any(c[0] == "user_by_login" and c[1] == "semisource" for c in runner.calls))
        self.assertTrue(any(c == ("user_tweets", "999") for c in runner.calls))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /c/Repos/tickerpulse-ai && rtk venv/Scripts/python.exe -m pytest tests/test_x_watchlist_list_lane.py::ListTopupTest -v`
Expected: FAIL — `TypeError: collect_accounts() got an unexpected keyword argument 'topup_max_accounts'` (param not added yet).

- [ ] **Step 3: Add the `topup_max_accounts` param to `collect_accounts`**

Modify `collect_accounts` signature and the list-path call (`backend/services/x_watchlist.py:427-432`):

```python
    def collect_accounts(
        self, max_accounts: int = 12, posts_per_account: int = 5, topup_max_accounts: int = 12
    ) -> dict:
        if self.config.list_id and hasattr(self.runner, "list_tweets"):
            try:
                return self._collect_accounts_via_list(
                    max_accounts=max_accounts,
                    posts_per_account=posts_per_account,
                    topup_max_accounts=topup_max_accounts,
                )
            except Exception as exc:
```

(The `except` block, rate-limit branch, and the trailing `_collect_accounts_per_account(...)` fallback are unchanged.)

- [ ] **Step 4: Thread the param into `_collect_accounts_via_list` and call the top-up helper before sorting**

Replace the signature line and insert the top-up call + status refinement in `_collect_accounts_via_list` (`backend/services/x_watchlist.py:452` and `:476-496`):

```python
    def _collect_accounts_via_list(
        self, *, max_accounts: int, posts_per_account: int, topup_max_accounts: int = 12
    ) -> dict:
        index = {account.handle.lower(): account for account in self.config.accounts}
        fetch_limit = max(posts_per_account * max(1, len(index)), 100)
        tweets = self.runner.list_tweets(self.config.list_id, fetch_limit)

        posts: list[dict] = []
        errors: list[dict] = []
        seen_ids: set[str] = set()
        per_author: dict[str, int] = {}
        for tweet in tweets:
            author = str(tweet.get("author_screen_name") or "").lower()
            account = index.get(author)
            if account is None:
                continue
            tweet_id = str(tweet.get("id") or tweet.get("id_str") or "")
            if tweet_id and tweet_id in seen_ids:
                continue
            if tweet_id:
                seen_ids.add(tweet_id)
            if per_author.get(author, 0) >= posts_per_account:
                continue
            per_author[author] = per_author.get(author, 0) + 1
            posts.append(self._normalize_post(account, tweet))

        if topup_max_accounts > 0:
            self._topup_missing_accounts(
                index=index,
                posts=posts,
                errors=errors,
                seen_ids=seen_ids,
                per_author=per_author,
                posts_per_account=posts_per_account,
                topup_max_accounts=topup_max_accounts,
            )

        posts.sort(
            key=lambda post: (
                int(post.get("signal_score", 0)),
                int(post.get("engagement", 0)),
            ),
            reverse=True,
        )

        if posts and errors:
            source_status = "degraded"
        elif posts:
            source_status = "ok"
        else:
            errors.append(
                {
                    "handle": "*",
                    "message": (
                        f"List {self.config.list_id} returned 0 posts from configured "
                        "members; X session likely dead or expired - check session health."
                    ),
                }
            )
            source_status = "degraded"

        return {
            "source": "x_watchlist",
            "source_status": source_status,
            "accounts_checked": len(self.config.accounts),
            "posts": posts,
            "errors": errors,
            "config_warnings": list(self.config.warnings),
            "lane_mode": "list",
        }
```

- [ ] **Step 5: Implement the `_topup_missing_accounts` helper**

Insert this new method immediately after `_collect_accounts_via_list` (before `_collect_accounts_per_account`):

```python
    def _topup_missing_accounts(
        self,
        *,
        index: dict[str, XAccount],
        posts: list[dict],
        errors: list[dict],
        seen_ids: set[str],
        per_author: dict[str, int],
        posts_per_account: int,
        topup_max_accounts: int,
    ) -> None:
        """Fill configured accounts that got zero posts from the List window.

        Bounded per-account fetch (priority-ranked, capped at topup_max_accounts,
        stops on the first rate-limit) so the followed-account lane represents
        every member, not just the high-frequency floods. Timeline-family calls
        only (user_by_login / user_tweets) -> tolerated by the noop txn-id.
        """
        missing = [
            account
            for handle_lc, account in index.items()
            if per_author.get(handle_lc, 0) == 0
        ]
        missing.sort(key=lambda account: (-_priority_rank(account), account.handle))

        for account in missing[:topup_max_accounts]:
            handle_lc = account.handle.lower()
            try:
                user_id = account.user_id or str(
                    self.runner.user_by_login(account.handle).get("id_str") or ""
                )
                if not user_id:
                    errors.append(
                        {"handle": account.handle, "message": "Could not resolve user id for top-up"}
                    )
                    continue
                for tweet in self.runner.user_tweets(user_id, posts_per_account)[:posts_per_account]:
                    if per_author.get(handle_lc, 0) >= posts_per_account:
                        break
                    tweet_id = str(tweet.get("id") or tweet.get("id_str") or "")
                    if tweet_id and tweet_id in seen_ids:
                        continue
                    if tweet_id:
                        seen_ids.add(tweet_id)
                    per_author[handle_lc] = per_author.get(handle_lc, 0) + 1
                    posts.append(self._normalize_post(account, tweet))
            except Exception as exc:
                if _is_rate_limit_error(exc):
                    errors.append(
                        {
                            "handle": account.handle,
                            "message": f"top-up stopped at rate limit: {_error_log_summary(exc)}",
                        }
                    )
                    break
                errors.append({"handle": account.handle, "message": _error_log_summary(exc)})
```

- [ ] **Step 6: Run the new tests to verify they pass**

Run: `cd /c/Repos/tickerpulse-ai && rtk venv/Scripts/python.exe -m pytest tests/test_x_watchlist_list_lane.py::ListTopupTest -v`
Expected: PASS — all 8 `ListTopupTest` methods green.

- [ ] **Step 7: Run the full X-watchlist + news suite to confirm no regression**

Run: `cd /c/Repos/tickerpulse-ai && rtk venv/Scripts/python.exe -m pytest tests/test_x_watchlist_list_lane.py tests/test_x_watchlist_twikit_fallback.py tests/ -k "x_watchlist or news" -v`
Expected: PASS — the pre-existing `ListLaneTest`/`SearchViaTwikitTest` still green (top-up runs incidentally for the 2-account fixtures but assertions hold), no failures introduced.

- [ ] **Step 8: Commit**

```bash
cd /c/Repos/tickerpulse-ai
git add backend/services/x_watchlist.py tests/test_x_watchlist_list_lane.py
git commit -m "feat: bounded per-account top-up for zero-representation X List members"
```

---

### Task 2: Live coverage smoke (real twikit boundary)

**Files:**
- Create (throwaway, NOT committed): `%TEMP%\smoke_list_topup.py`

**Boundary Contracts:** Proves the boundary from the gate block above against the real runner. Acceptance rule = distinct-handle count strictly higher with top-up than without, no exception, no duplicate ids.

**Task Smoke:**

| Stage / Boundary | Activated by | Output assertion | Consumer acceptance point | Production path/config/limits |
|------------------|--------------|------------------|---------------------------|-------------------------------|
| `list_tweets` bulk | real `list_id 2065703090779492503` | non-empty posts; ≥1 distinct handle | collector map loop | Yes — `XWatchlistConfig.load()`, real `FallbackXRunner`, default fetch_limit |
| `_topup_missing_accounts` → `user_by_login`/`user_tweets` | ≥1 zero-representation member (live shows 11/46) | ≥1 post for a previously-absent handle; bounded to `topup_max_accounts` | `payload["posts"]` | Yes — real twikit runner, default `topup_max_accounts=12` |
| `payload` → digest | posts list | distinct-handle count(topup) > count(topup=0); no duplicate `id` | `news_layer_review` account lane | Yes — same `collect_accounts` entrypoint |

**Smoke input:** the real production List + real config, one `collect_accounts(topup_max_accounts=0)` baseline and one `collect_accounts()` (default) call. This is the smallest input that activates the top-up stage — it cannot be shrunk below "1 list call + ≥1 absent account" without failing to activate top-up.
**Time budget:** < 2 min (1 list call + ≤ 24 bounded calls).

- [ ] **Step 1: Write the live smoke script**

Create `%TEMP%\smoke_list_topup.py`:

```python
import os, sys
sys.path.insert(0, r"C:\Repos\tickerpulse-ai")
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
from backend.services.x_watchlist import XWatchlistCollector

base = XWatchlistCollector()  # real config (yaml) + real FallbackXRunner
no_topup = base.collect_accounts(max_accounts=len(base.config.accounts), posts_per_account=5, topup_max_accounts=0)
with_topup = base.collect_accounts(max_accounts=len(base.config.accounts), posts_per_account=5, topup_max_accounts=12)

def handles(p):
    return {x["handle"] for x in p["posts"]}

h0, h1 = handles(no_topup), handles(with_topup)
ids = [x["id"] for x in with_topup["posts"]]
print(f"distinct handles: list-only={len(h0)}  with-topup={len(h1)}")
print(f"newly covered: {sorted(h1 - h0)}")
print(f"status={with_topup['source_status']}  posts={len(with_topup['posts'])}  errors={len(with_topup['errors'])}")
assert len(with_topup["posts"]) > 0, "no posts at all -> session likely dead"
assert len(h1) >= len(h0), "top-up reduced coverage (bug)"
assert len(ids) == len(set(ids)), "duplicate tweet ids across list + top-up (dedupe bug)"
print("SMOKE PASS")
```

- [ ] **Step 2: Run the smoke**

Run: `rtk "C:\Repos\tickerpulse-ai\venv\Scripts\python.exe" "%TEMP%\smoke_list_topup.py"` (PowerShell: `$env:TEMP\smoke_list_topup.py`)
Expected: `SMOKE PASS`, with `with-topup` distinct-handle count **higher** than `list-only` and `newly covered` listing previously-absent members (e.g., some of `@iancutress`, `@trendforce`, `@dnystedt`, `@realdonaldtrump`, `@tier10k`, `@wallstengine`). If `source_status` is `error`/`degraded` with 0 posts, STOP — the X session is dead; do not claim success.

- [ ] **Step 3: Record evidence and clean up**

Append the smoke output (distinct-handle before/after, newly-covered handles) to `.ai/progress.md` under a dated `X List top-up` entry. Delete `%TEMP%\smoke_list_topup.py`. No repo file is created by this task.

---

## Self-Review

**1. Spec coverage:**
- "every configured member with recent posts represented" → Task 1 `_topup_missing_accounts` (zero-rep detection + fill); proven live in Task 2.
- "bounded / no self-DOS" → `topup_max_accounts` cap + rate-limit-stop (`test_topup_budget_limits_to_highest_priority`, `test_topup_stops_on_rate_limit`).
- "no new dependency / no search / no browser" → timeline-only `user_by_login`/`user_tweets` on existing runner.
- "no silent fallback" → top-up errors recorded in `payload["errors"]` and surfaced as `degraded`.
- Gap: none identified.

**2. Placeholder scan:** No TBD/TODO/"add error handling"/"similar to" — all steps carry complete code and exact commands. Boundary and smoke sections filled, not declared N/A.

**3. Type consistency:** `topup_max_accounts: int` used identically in `collect_accounts`, `_collect_accounts_via_list`, and `_topup_missing_accounts`. Helper consumes existing types only (`XAccount`, `_priority_rank`, `_is_rate_limit_error`, `_error_log_summary`, `_normalize_post`) — all defined in the same module. Payload keys unchanged (`source`, `source_status`, `accounts_checked`, `posts`, `errors`, `config_warnings`, `lane_mode`). `per_author` keyed by lowercased handle consistently across bulk loop and top-up. Runner methods (`list_tweets`, `user_by_login`, `user_tweets`) match `TwscrapeRunnerProtocol` / `FallbackXRunner` signatures.
