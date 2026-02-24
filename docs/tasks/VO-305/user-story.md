# VO-305: Implement batch export for research briefs

## User Story

Here's the user story. Filed at `docs/tasks/VO-350/batch-export-user-story.md`.

---

**User Story**

> As a research analyst, I want to select multiple research briefs and export them as a single file, so that I can share curated research packages with colleagues or archive them offline without manual copying.

---

**Acceptance Criteria highlights:**

- Checkbox selection per brief + "select all" scoped to the active ticker filter
- Export button activates at ≥1 selection; format picker: **Markdown / JSON / CSV**
- Markdown: titled sections separated by `---`; JSON: full brief objects; CSV: metadata only (content too large for tabular)
- Filename reflects scope and date (`research-briefs-AAPL-2026-02-21.md`)
- "Select all" across pages triggers a single backend fetch before export — not just the current page
- PDF explicitly out of scope (separate ticket)

---

**Priority:** Medium — real workflow value, no reliability risk. Ships after the VO-350 settings bug fix.

**Complexity: 2/5** — no schema changes, no new backend routes for the common case, client-side file assembly via `Blob` + `URL.createObjectURL`. Only wrinkle is the cross-page "select all" fetch.
