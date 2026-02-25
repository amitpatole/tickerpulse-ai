# VO-041: Timezone display bug in scheduler configuration for non-US locales

## User Story

Done. Filed as **BUG-041**. Here's the summary:

---

**BUG-041: Timezone Display Bug in Scheduler (Non-US Locales)**

**Root cause (two issues, both confirmed in code):**

1. **Backend** — `str(sched_job.next_run_time)` at `scheduler.py:138,154` emits `"2026-02-20 09:30:00-05:00"` (space, not `T`). Not strict ISO 8601 — JS `Date` parsing is undefined behavior across browsers, can produce `NaN` / `Invalid Date`.
2. **UI** — No timezone label anywhere. The scheduler runs in `US/Eastern` (hardcoded default in `config.py:42`). Non-US users see cron trigger strings like `"cron[hour='9', minute='30']"` with no indication that's ET, then see "Next Run" times that may display in the wrong timezone.

**Fix is small:** `.isoformat()` instead of `str()` on the backend, a timezone indicator label in the UI. Complexity **2/5**.

**Priority: Medium** — the app explicitly targets India market users (`Asia/Kolkata` config) so non-US support is intentional, not incidental.
