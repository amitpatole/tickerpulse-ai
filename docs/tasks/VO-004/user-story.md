# VO-004: Create agent performance analytics dashboard

## User Story

## User Story: Agent Performance Analytics Dashboard

---

**User Story**

As a **platform operator**, I want a dedicated analytics dashboard showing AI agent performance metrics over time, so that I can identify underperforming agents, monitor costs, and make data-driven decisions about resource allocation.

---

**Acceptance Criteria**

- `GET /api/agents/analytics` endpoint returns:
  - [ ] Runs per day for the last 30 days, grouped by agent
  - [ ] Average duration per agent (ms)
  - [ ] Total token usage and cost per agent
  - [ ] Success rate per agent (success / total runs)
- Backend queries `agent_runs` table; response time < 500ms
- `/analytics` page renders without errors for empty data states
- **Chart 1:** Stacked `BarChart` — daily run count by agent
- **Chart 2:** `AreaChart` — cumulative cost trend over time
- **Chart 3:** `BarChart` — average response time by agent
- **Chart 4:** Donut or stacked bar — success/failure ratio per agent
- Date range picker filters all charts simultaneously (default: last 30 days)
- All charts use Tremor components; no new UI libraries introduced

---

**Priority Reasoning**

High. Without visibility into agent performance and cost, we're flying blind on one of our core product differentiators. This directly unblocks cost optimization and capacity planning conversations with customers.

---

**Estimated Complexity: 3/5**

Backend aggregation queries are straightforward if `agent_runs` is indexed on `created_at` and `agent_id`. Frontend complexity is low given Tremor's out-of-the-box chart components. Main risk: data volume at scale — add a note to paginate or limit aggregation window if table grows large.
