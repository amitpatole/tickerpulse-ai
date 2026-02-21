# VO-314: Add earnings calendar widget to market overview dashboard

## Technical Design

## VO-312: Earnings Calendar Widget — Technical Design Spec

---

### Approach

Fetch upcoming earnings data via `yfinance` (already a fallback provider — no new API key required). Cache results in a new `earnings_events` DB table. Serve via a new blueprint. Render a dashboard widget that highlights watchlist tickers and auto-refreshes hourly.

---

### Files to Modify / Create

**Backend**
| Action | Path |
|---|---|
| Modify | `backend/database.py` — add `earnings_events` table to schema init |
| Create | `backend/api/earnings.py` — new Blueprint with GET endpoints |
| Create | `backend/jobs/earnings_refresh.py` — scheduled job to pull fresh data |
| Modify | `backend/jobs/__init__.py` — register earnings refresh job |
| Modify | `backend/app.py` — register earnings blueprint |

**Frontend**
| Action | Path |
|---|---|
| Create | `frontend/src/components/dashboard/EarningsCalendar.tsx` |
| Modify | `frontend/src/lib/types.ts` — add `EarningsEvent` interface |
| Modify | `frontend/src/lib/api.ts` — add `getEarnings()` function |
| Modify | `frontend/src/app/page.tsx` (dashboard) — slot in widget |

**Tests**
| Action | Path |
|---|---|
| Create | `backend/tests/test_earnings_calendar.py` |

---

### Data Model Changes

New table in `backend/database.py`:

```sql
CREATE TABLE IF NOT EXISTS earnings_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker      TEXT NOT NULL,
    company     TEXT,
    earnings_date TEXT NOT NULL,          -- YYYY-MM-DD
    time_of_day TEXT,                     -- 'pre', 'post', 'during', NULL
    eps_estimate REAL,
    fiscal_quarter TEXT,                  -- 'Q1 2026'
    fetched_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticker, earnings_date)
);
CREATE INDEX IF NOT EXISTS idx_earnings_date ON earnings_events(earnings_date);
```

No new columns on existing tables. Watchlist join happens at query time.

---

### API Changes

**New endpoint — `backend/api/earnings.py`**

```
GET /api/earnings?days=7
```
- Queries `earnings_events` within `[today, today + days]`
- Joins against `watchlist_stocks` to flag watchlist membership
- Returns events sorted: watchlist tickers first, then by date
- Response shape: `{ events: EarningsEvent[], stale: bool, as_of: str }`
- `stale: true` if newest `fetched_at` is > 1 hour old (graceful degradation signal)

---

### Frontend Changes

**`EarningsCalendar.tsx`**
- `useApi(getEarnings, [], { refreshInterval: 3_600_000 })` (hourly refresh)
- Groups events by date (today / tomorrow / later this week)
- Watchlist tickers rendered with accent color and sorted to top
- Ticker click → `router.push('/research?ticker=AAPL')` (existing detail route)
- Stale indicator banner when `stale === true`
- Empty state: "No earnings in the next 7 days"

**Dashboard layout (`page.tsx`)**
- Place `<EarningsCalendar />` below the KPI cards, in the right-hand column alongside `NewsFeed` (stack vertically on XL, or replace a section)

---

### Testing Strategy

**`backend/tests/test_earnings_calendar.py`** covers:

1. **Schema** — `earnings_events` table created by `init_all_tables`
2. **Endpoint: happy path** — events returned sorted (watchlist first, then by date)
3. **Endpoint: `days` param** — events outside window excluded
4. **Stale detection** — `stale: true` when `fetched_at` > 1 hour old; `false` when fresh
5. **Empty state** — 200 with `events: []` when table is empty or window has no events
6. **Graceful degradation** — endpoint returns last known data + `stale: true` if refresh job hasn't run (no 500s)
7. **Watchlist prioritization** — watchlist tickers appear before non-watchlist tickers in response
8. **Duplicate handling** — `UNIQUE(ticker, earnings_date)` constraint honored via `INSERT OR REPLACE`

Frontend tested manually / via existing Playwright smoke tests if present.

---

**Key risk**: `yfinance` earnings data quality is inconsistent (missing `time_of_day`, stale estimates). Mitigate by storing `fetched_at` and surfacing the stale flag rather than hiding data gaps.
