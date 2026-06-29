# Execution Prompt: /news Morning Digest Plan

Hand this to the executing agent verbatim. Drafted 2026-06-12 by the design session.

---

Role:
You are an execution agent (coding agent with shell + file tools) on Ming's Windows 11 machine, working in the local repo C:\Repos\tickerpulse-ai. Shell is PowerShell; Python runs via the repo venv: venv\Scripts\python.exe.

Objective:
Execute the approved implementation plan docs/superpowers/plans/2026-06-12-news-morning-digest.md task-by-task (Task 0 through Task 7), exactly as written, to wire a news-wire lane, market tape snapshot, and AI-infra lane into the /news pipeline.

Context (read these BEFORE any change, in this order):
1. C:\Repos\tickerpulse-ai\docs\superpowers\plans\2026-06-12-news-morning-digest.md  — the binding plan; contains complete code for every step.
2. C:\Repos\tickerpulse-ai\docs\superpowers\specs\2026-06-11-news-morning-digest-design.md — approved spec the plan implements.
3. C:\Repos\tickerpulse-ai\.ai\news-layer-process.md — domain contract for the news layer.
Source-of-truth modules you reuse (do not reimplement): backend/core/stock_monitor.py (RSS fetchers + calculate_sentiment), backend/services/ai_infra_update.py, backend/services/dashboard_watchlist.py, backend/services/news_story_cards.py helpers.

Hard Scope:
- The plan is binding. Do not reinterpret it, substitute equivalent designs, or add refactors/abstractions it does not name. If plan and reality conflict (e.g., a function body differs from what the plan shows), STOP and report; do not improvise.
- Files you may CREATE: backend/services/news_wire_collector.py, backend/services/market_tape_snapshot.py, tests/test_news_wire_collector.py, tests/test_market_tape_snapshot.py.
- Files you may MODIFY: backend/services/news_story_cards.py, backend/services/news_layer_review.py, backend/scripts/run_news_layer_review.py, tests/test_news_story_cards.py, tests/test_news_layer_review.py, .ai/implementation-notes.md, and (outside the repo, no git) C:\Users\MingC\.claude\skills\news\SKILL.md.
- Everything else is OUT OF SCOPE, especially: backend/api/*, dashboard.py, frontend/*, config/x_watchlists.yaml, reliability scores, Bernstein lane logic, vol/gamma monitor internals, backend/agents/*, requirements files (NO dependency changes).
- Dirty worktree rule: the repo carries ~30 modified + ~30 untracked in-flight files owned by other work. Never revert, reformat, stage, or "clean up" any file the plan does not name. Never run git add -A / git add . / git stash / git checkout -- <file>.
- Git: all work on branch feat/news-morning-digest (created in Task 0 from local main HEAD). Never commit to main. Never push to any remote. Per task, git add ONLY the files that task's commit step names. Known consequence (intended, do not "fix"): committing news_story_cards.py / news_layer_review.py snapshots their previously uncommitted 2026-06-10 content because they are untracked today.
- .ai/implementation-notes.md: append dated entries as the plan instructs; it stays UNSTAGED always.

Process:
1. Read the three context docs fully.
2. Execute tasks strictly in order: Task 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7. Within each task, follow the checkbox steps in order.
3. TDD is mandatory where the plan says so: write the failing test first, RUN it, confirm it fails for the expected reason (capture output), then implement, then confirm pass. Never write implementation before observing the failing test.
4. Existing-test edits are allowed ONLY where the plan predicts them: grade-score literals 5/6/7 -> 6/7/8 in story-card tests, and Source Health line-set assertions in test_news_layer_review.py. Never weaken or delete any other assertion to get green.
5. Commit after each task using the plan's exact commit step (message + file list).
6. Update .ai/implementation-notes.md at Task 0, at any deviation, and at Task 7 close-out.

Verification (evidence required, not claims):
- Per task: run the plan's exact pytest command(s); record pass/fail counts.
- Task 1 Step 5, Task 2 Step 5, Task 5 Steps 2-3: run the real smokes exactly as written and keep their stdout as evidence.
- Task 7: full suite venv\Scripts\python.exe -m pytest tests -v must be green; run git log --oneline main..feat/news-morning-digest and git status --short to prove commit hygiene (only plan-named files committed; in-flight files untouched).

Stop Conditions (pause and report instead of continuing):
- R1 gate: Task 1's real smoke returns 0 posts -> STOP, report the recorded errors (RSS likely unreachable from this network). Do not proceed to Task 2.
- Any spec/plan conflict with actual code that the plan did not predict.
- Any pre-existing test failing BEFORE your changes (record baseline first if suspected).
- Any need to install/upgrade a dependency, touch credentials, push to a remote, or modify an out-of-scope file.
- Task 5 smoke failing its artifact assertions after one honest retry.

Final Response (required format):
1. Per-task table: task #, commit hash, test command, result counts.
2. Smoke evidence: news posts N / tape rows N / ai items N / source_status from Task 5's assertion script output, pasted verbatim.
3. Deviations list: every place reality differed from the plan and what you did (or "none").
4. Branch state: output of git log --oneline main..feat/news-morning-digest and confirmation that git status shows in-flight files untouched and .ai/ unstaged.
5. Explicitly-unchanged confirmation: Bernstein lane, x_watchlists.yaml, reliability scores, dashboard/DB paths, vol/gamma monitors, requirements.
Do not claim completion without items 1-5.
