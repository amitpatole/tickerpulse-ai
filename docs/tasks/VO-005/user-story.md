# VO-005: Add research brief export as PDF and Markdown

## User Story

## User Story: Research Brief Export

**As a** financial analyst using TickerPulse, **I want** to export research briefs as PDF or Markdown, **so that** I can share findings with colleagues and integrate them into reports outside the platform.

---

### Acceptance Criteria

**Backend**
- `GET /api/research/briefs/<id>/export?format=md` returns raw Markdown with `Content-Type: text/markdown` and a `Content-Disposition: attachment` header
- `GET /api/research/briefs/<id>/export?format=pdf` returns a styled PDF with:
  - TickerPulse header/branding
  - Full brief content (formatted)
  - Metadata footer: agent name, generation date, model used
- Returns `400` for unsupported format values
- Returns `404` if brief ID doesn't exist
- Export endpoints require authentication (same as other `/api/research/` routes)

**Frontend**
- Each brief card on `/research` has two action buttons: "Copy as Markdown" and "Download PDF"
- "Copy as Markdown" copies content to clipboard and shows a brief confirmation (toast/label)
- "Download PDF" triggers file download via the export endpoint
- Buttons are disabled/loading-state while download is in progress
- Both actions are accessible (keyboard navigable, labeled for screen readers)

---

### Priority Reasoning

**Medium-High.** Core data is already generated — this is pure delivery value. Analysts live in documents and slide decks; without export, research briefs are a walled garden. Low risk, high perceived value. Unblocks enterprise sales conversations.

---

### Estimated Complexity: **3/5**

- PDF generation with `reportlab` or `weasyprint` adds a new dependency and requires layout work (+1)
- Backend routes are straightforward REST (+1)
- Frontend button wiring is simple, clipboard API is well-supported (+1)
- Main risk: PDF styling consistency across content lengths

---

**Recommended lib:** `weasyprint` if HTML→PDF styling matters; `reportlab` if we want zero CSS headaches and full programmatic control. I'd lean `weasyprint` for faster iteration on the PDF layout.
