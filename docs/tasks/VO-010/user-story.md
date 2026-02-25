# VO-010: Add unit tests for backend API endpoints

## User Story

## User Story: Backend API Test Suite

---

**As a** backend developer on the Virtual Office platform,
**I want** a comprehensive pytest suite covering all critical API endpoints,
**so that** I can ship changes confidently without manually verifying core functionality regresses.

---

### Acceptance Criteria

- [ ] `backend/tests/` directory exists with `conftest.py` providing a test Flask app fixture backed by in-memory SQLite (no production DB touched)
- [ ] `GET /api/stocks` — tests cover: list all stocks, search by query param, pagination (page/limit), empty DB returns `[]`, invalid pagination params return 400
- [ ] `GET /api/news` — tests cover: list all news, filter by `ticker` param, unknown ticker returns `[]` (not 404), missing ticker param returns all
- [ ] `GET /api/agents` — tests cover: list agents, trigger agent run, verify cost metadata present in response, invalid agent ID returns 404
- [ ] `GET /api/settings/ai-providers` — tests cover: returns provider list with expected schema, unauthenticated request returns 401
- [ ] Minimum **20 test cases** total across all endpoints
- [ ] All tests pass with `pytest backend/tests/` from repo root
- [ ] `pytest-asyncio` used where async routes exist; no skipped tests in CI
- [ ] No real network calls or external API calls in any test (mock/stub all external deps)

---

### Priority Reasoning

**High.** We have zero automated backend coverage today. Every PR touching API logic is a manual QA burden and a regression risk. This is foundational — blocks reliable delivery of every future backend feature. Fixes before features.

---

### Estimated Complexity

**3 / 5**

Standard pytest work, but requires careful fixture design to isolate DB state between tests and stub external dependencies (AI providers, market data). The async test setup adds minor friction. Scope is well-defined and bounded.
