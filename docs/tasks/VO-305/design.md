# VO-305: Implement batch export for research briefs

## Technical Design

Good. I have everything I need. Here's the technical design spec:

---

## VO-350: Batch Export for Research Briefs — Technical Design Spec

### 1. Approach

Pure client-side assembly. No schema changes. No new backend route for the common case — the existing `GET /api/research/briefs` already supports `ticker` + pagination. The only backend addition is a `GET /api/research/briefs/export` route that bypasses pagination for the cross-page "select all" case (fetches all matching rows in one query). File assembly and download happen in the browser via `Blob` + `URL.createObjectURL`.

---

### 2. Files to Modify / Create

| Action | Path |
|---|---|
| Modify | `frontend/src/app/research/page.tsx` — add selection state, checkboxes, toolbar Export button + format picker |
| Modify | `frontend/src/lib/api.ts` — add `getAllResearchBriefs(ticker?)` for cross-page select-all fetch |
| Modify | `frontend/src/lib/types.ts` — no struct changes needed |
| Create | `frontend/src/lib/exportBriefs.ts` — pure functions: `toMarkdown`, `toJson`, `toCsv`, `downloadFile` |
| Modify | `backend/api/research.py` — add `/api/research/briefs/export` route |

---

### 3. Data Model Changes

None. The existing `research_briefs` table has all required fields. No migrations needed.

---

### 4. API Changes

**New endpoint** (only needed for cross-page "select all"):

```
GET /api/research/briefs/export?ticker=AAPL
```

- No pagination params — returns all matching rows (capped at a hard limit, e.g. 500, to guard against runaway queries)
- Response: `{ "data": [...] }` — same brief objects as the list endpoint
- Reuses the existing `list_briefs` query logic; no new DB helpers needed

Register before the existing `GET /api/research/briefs` route to avoid Flask route ambiguity, or use a distinct path like `/api/research/briefs/export`.

---

### 5. Frontend Changes

**State additions in `page.tsx`:**
```ts
const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
const [exportFormat, setExportFormat] = useState<'md' | 'json' | 'csv'>('md');
const [exporting, setExporting] = useState(false);
```

**Selection UX:**
- Checkbox on each brief row (left of ticker badge); checked when `selectedIds.has(brief.id)`
- "Select all" checkbox in list panel header — selects all IDs in the current `briefs` array (current page/filter)
- If `filterTicker` is active and user clicks "Select all", trigger `getAllResearchBriefs(filterTicker)` to fetch complete set before export
- Clear selection when `filterTicker` changes

**Toolbar additions:**
- Format picker `<select>` (Markdown / JSON / CSV) — visible only when `selectedIds.size > 0`
- Export button — disabled when `selectedIds.size === 0` or `exporting`; shows `Loader2` spinner while active

**`exportBriefs.ts`** — three formatters:
- `toMarkdown(briefs)`: `# {title}\n\n{content}\n\n---\n\n` per brief
- `toJson(briefs)`: `JSON.stringify(briefs, null, 2)`
- `toCsv(briefs)`: header row + one row per brief with `id,ticker,title,agent_name,model_used,created_at` (no `content`)

Filename: `research-briefs-{TICKER|all}-{YYYY-MM-DD}.{ext}`

---

### 6. Testing Strategy

**Backend** (`backend/tests/test_research_export.py`):
- `GET /api/research/briefs/export` returns all rows for a ticker (no pagination)
- Hard limit respected (insert 600 rows, assert response capped at 500)
- Empty result when ticker has no briefs

**Frontend** (`exportBriefs.ts` — unit tests, no DOM needed):
- Markdown: separator `---` between briefs, correct title format
- JSON: valid parse, all fields present, no content truncation
- CSV: no `content` column, commas in titles properly escaped
- Filename generation: ticker filter vs. "all", correct date format

**Integration (manual / Playwright if CI harness exists):**
- Select 3 briefs → Export MD → verify downloaded file has 3 sections
- "Select all" with filter active → verify fetch hits `/export` endpoint, not just current page
