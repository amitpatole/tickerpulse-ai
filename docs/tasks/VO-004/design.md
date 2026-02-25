# VO-004: Create agent performance analytics dashboard

## Technical Design

## Technical Design Spec: Agent Performance Analytics Dashboard

---

### 1. Approach

Extend the existing `agents.py` blueprint with a new aggregation endpoint querying the already-indexed `agent_runs` table. Add a `/analytics` page following the same Next.js app-router pattern as `/agents`, using `@tremor/react` (already installed at ^3.18.7) for charts. Date filtering passes `start_date`/`end_date` query params from frontend to backend.

No new libraries, no schema changes — all required columns (`agent_name`, `status`, `duration_ms`, `estimated_cost`, `tokens_input`, `tokens_output`, `created_at`) exist and are indexed.

---

### 2. Files to Modify / Create

| Action | Path |
|---|---|
| **Modify** | `backend/api/agents.py` — add analytics route |
| **Create** | `frontend/src/app/analytics/page.tsx` — analytics page |
| **Create** | `frontend/src/components/analytics/AgentAnalyticsCharts.tsx` — chart components |
| **Modify** | `frontend/src/lib/types.ts` — add `AgentAnalytics` response type |
| **Modify** | `frontend/src/components/layout/Sidebar.tsx` (or nav file) — add `/analytics` nav link |
| **Create** | `backend/tests/test_analytics_endpoint.py` — backend unit tests |

---

### 3. Data Model Changes

**None.** `agent_runs` already has all required columns with indexes on `agent_name` and `started_at`. The `cost_tracking` table provides a secondary cost ledger but `agent_runs.estimated_cost` is sufficient.

---

### 4. API Changes

**New endpoint:** `GET /api/agents/analytics`

Query params: `start_date` (ISO8601, default `now-30d`), `end_date` (default `now`)

Response shape:
```json
{
  "runs_per_day": [{"date": "2026-01-20", "agent_name": "scanner", "count": 4}],
  "avg_duration_ms": [{"agent_name": "scanner", "avg_ms": 1240}],
  "cost_per_agent": [{"agent_name": "scanner", "total_cost": 0.42, "total_tokens": 18200}],
  "success_rate": [{"agent_name": "scanner", "success": 38, "failed": 2, "rate": 0.95}],
  "cost_trend": [{"date": "2026-01-20", "cumulative_cost": 1.23}]
}
```

Three SQLite GROUP BY queries (runs/day, per-agent aggregates, cost trend) — all use existing indexes, well within 500ms.

---

### 5. Frontend Changes

**`/analytics` page:** Client component with `useState` for date range, single `useApi` fetch to `/api/agents/analytics?start_date=...&end_date=...`, refetches on date change.

**`AgentAnalyticsCharts.tsx`** renders four Tremor components:
1. `BarChart` (stacked) — `runs_per_day`, x=date, group by agent
2. `AreaChart` — `cost_trend`, x=date, y=cumulative_cost
3. `BarChart` — `avg_duration_ms`, x=agent_name, y=avg_ms
4. `DonutChart` — `success_rate`, one donut per agent (or stacked bar if >4 agents)

Date range picker: two `<input type="date">` inputs styled with Tailwind, defaulting to last 30 days. No new library needed.

**`types.ts`:** Add `AgentAnalytics` interface matching the response shape above.

---

### 6. Testing Strategy

**Backend (`test_analytics_endpoint.py`):**
- Seed fixture rows into in-memory SQLite, assert aggregation correctness
- Test empty-data returns `200` with empty arrays (not 500)
- Test date range filtering excludes out-of-range rows
- Test response time assertion (< 500ms) with 1000 seeded rows

**Frontend:**
- Mock `useApi` returning empty arrays → assert charts render without crash (empty state)
- Mock with fixture data → assert Tremor components receive correct `data` props
- Date picker change → assert new fetch URL includes updated params
