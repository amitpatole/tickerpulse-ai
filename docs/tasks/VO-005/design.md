# VO-005: Add research brief export as PDF and Markdown

## Technical Design

The design doc has already been updated. Here's the spec I've written:

---

**Design is in `docs/tasks/VO-004/design.md`.** Key decisions worth calling out:

**`reportlab` over `weasyprint`** — weasyprint pulls in Cairo/Pango as system deps, which creates friction in Docker/CI. reportlab is pure Python and gives full programmatic layout control. The tradeoff is more verbose PDF construction code, but for a structured brief with three clear sections (header, body, footer) that's fine.

**"Copy as Markdown" is purely client-side** — `navigator.clipboard.writeText(brief.content)` against the data already in state. No backend roundtrip, no rate-limiting concerns, instant response. The Markdown export endpoint still exists for direct URL access and programmatic use, but the UI button doesn't need it.

**Single `downloadingId: number | null` state** (not a boolean) — this handles the case where a user could try to download multiple briefs from the list. Tracks which specific brief is loading rather than just "is anything loading."

**PDF verification in tests uses `pypdf`** — it's already a dep (patched in a prior commit). Lets us assert the ticker and agent name actually appear in the document without adding a new test dependency.

**No schema changes, no new frontend libraries, one new Python package.** Low blast radius for a feature that meaningfully extends the platform's value.
