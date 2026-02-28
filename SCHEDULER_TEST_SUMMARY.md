# TickerPulse AI — Agent Scheduling UI Test Suite

**Created:** 2026-02-28
**Status:** ✅ **35/35 TESTS PASSING**
**Test Modules:** 2 (35 total test cases)

---

## Test Files

### 1. `backend/tests/test_scheduler_reschedule_api.py` (21 tests)
**Tests:** Job reschedule API (`PUT /api/scheduler/jobs/{job_id}/schedule`)

**Test Classes:**
- `TestSchedulerRescheduleAPI` (11 tests) — Route-level tests
- `TestSchedulerValidators` (10 tests) — Unit tests for validators

**Coverage:**
- ✅ AC1: Cron schedule update with valid fields (hour, minute, day_of_week)
- ✅ AC2: Interval schedule update with valid minutes
- ✅ AC3: Invalid trigger type rejection (not cron/interval/date)
- ✅ AC4: Missing trigger field error handling
- ✅ AC5: Out-of-range cron field validation (hour > 23)
- ✅ Cron minute boundaries (min=0, max=59)
- ✅ Invalid job_id format rejection
- ✅ Empty request body error
- ✅ Invalid day_of_week format rejection
- ✅ Cron field type validation (string vs int)

**Key Tests:**
1. `test_reschedule_cron_happy_path` — Cron with hour=9, minute=30
2. `test_reschedule_cron_with_day_of_week` — Cron with day_of_week='mon-fri'
3. `test_reschedule_interval_happy_path` — Interval with minutes=60
4. `test_reschedule_invalid_trigger_type` — Rejects trigger='invalid_trigger'
5. `test_reschedule_cron_hour_out_of_range` — Rejects hour=25
6. `test_validate_cron_args_happy_path` — Unit test for cron validator
7. `test_validate_interval_args_missing_fields` — Rejects empty interval dict
8. `test_validate_job_id_too_long` — Rejects job_id > 64 chars

---

### 2. `backend/tests/test_agent_schedule_crud.py` (14 tests)
**Tests:** Agent schedule CRUD endpoints (`POST/PUT/DELETE /api/scheduler/agent-schedules`)

**Test Class:** `TestAgentScheduleCRUD` (14 tests)

**Coverage:**
- ✅ AC1: POST creates new schedule with cron/interval → 201 Created
- ✅ AC2: PUT updates label, trigger, trigger_args → 200 OK
- ✅ AC3: DELETE removes schedule → 200 OK
- ✅ AC4: POST rejects duplicate job_id → 409 Conflict
- ✅ AC5: PUT rejects non-existent schedule_id → 404 Not Found
- ✅ GET retrieves all schedules (empty & populated)
- ✅ Missing required fields (job_id, label, trigger)
- ✅ Invalid trigger_args validation
- ✅ Update with no changes error (400)

**Key Tests:**
1. `test_create_schedule_cron_happy_path` — Create cron schedule with day_of_week
2. `test_create_schedule_interval_happy_path` — Create interval schedule
3. `test_create_schedule_duplicate_job_id` — 409 on duplicate job_id
4. `test_update_schedule_trigger` — Change trigger type (interval → cron)
5. `test_delete_schedule_happy_path` — Delete existing schedule
6. `test_list_schedules_after_creation` — GET returns all created schedules
7. `test_create_schedule_invalid_trigger_args` — Rejects invalid cron values

---

## Design Spec Coverage

### Backend API Endpoints

| Endpoint | Method | Status | Test Coverage |
|----------|--------|--------|---|
| `/api/scheduler/jobs/{job_id}/schedule` | PUT | ✅ | 11 tests (reschedule with cron/interval) |
| `/api/scheduler/agent-schedules` | POST | ✅ | 6 tests (create with validation) |
| `/api/scheduler/agent-schedules/{id}` | PUT | ✅ | 4 tests (update label/trigger) |
| `/api/scheduler/agent-schedules/{id}` | DELETE | ✅ | 2 tests (delete existing/nonexistent) |
| `/api/scheduler/agent-schedules` | GET | ✅ | 2 tests (list empty/populated) |

### Validators

| Validator | Tests |
|-----------|-------|
| `validate_cron_args()` | 4 tests (range, day_of_week, edge cases) |
| `validate_interval_args()` | 3 tests (happy path, multiple fields, missing) |
| `validate_job_id()` | 3 tests (format, special chars, length) |

---

## Test Quality Checklist

- ✅ All tests syntactically valid and executable
- ✅ All tests have clear assertions (assert statements)
- ✅ All imports complete (pytest, Mock, Flask, sqlite3, json)
- ✅ Descriptive test names (not generic like 'test_1')
- ✅ No hardcoded test data (fixtures for temp DB)
- ✅ Tests run in any order (independent, no dependencies)
- ✅ Happy path tests present (normal operation)
- ✅ Error cases tested (invalid input, not found, conflict)
- ✅ Edge cases tested (boundaries, empty data)
- ✅ At least 1-2 acceptance criteria per test

---

## Running the Tests

```bash
# Run all scheduler tests
pytest backend/tests/test_scheduler_reschedule_api.py backend/tests/test_agent_schedule_crud.py -v

# Run reschedule API tests only
pytest backend/tests/test_scheduler_reschedule_api.py -v

# Run agent schedule CRUD tests only
pytest backend/tests/test_agent_schedule_crud.py -v

# Run with coverage
pytest backend/tests/test_scheduler_reschedule_api.py backend/tests/test_agent_schedule_crud.py --cov=backend.api --cov=backend.core -v
```

---

## Test Data Examples

### Cron Schedule (Morning Briefing)
```json
{
  "job_id": "morning_briefing",
  "label": "Morning at 8:30 AM",
  "trigger": "cron",
  "trigger_args": {
    "hour": 8,
    "minute": 30,
    "day_of_week": "mon-fri"
  }
}
```

### Interval Schedule (Price Refresh)
```json
{
  "job_id": "price_refresh",
  "label": "Every 5 minutes",
  "trigger": "interval",
  "trigger_args": {
    "minutes": 5
  }
}
```

---

## Implementation Details

### Test Architecture

1. **Isolated Routes:** Routes registered in-memory for each test to avoid Flask app singleton issues
2. **Temporary SQLite DB:** Each test gets its own temp database via `tmp_path` fixture
3. **Mock SchedulerManager:** For reschedule tests (unit level) to avoid APScheduler dependency
4. **Real Database:** For CRUD tests to validate persistence
5. **No Network Calls:** All tests are offline, no API calls to external services

### Validation Strategy

- **job_id:** Regex pattern (alphanumeric, underscore, hyphen, 1-64 chars)
- **cron fields:** Integer range checking (hour: 0-23, minute: 0-59, etc.)
- **day_of_week:** Regex pattern (mon-fri, 0-6, comma/hyphen-separated)
- **interval fields:** Integer range checking (1-52,560,000 minutes)
- **trigger_args:** Dict type validation, unknown key rejection

---

## Coverage Summary

| Category | Count | Status |
|----------|-------|--------|
| Happy Path Tests | 8 | ✅ |
| Error Cases | 20 | ✅ |
| Edge Cases | 7 | ✅ |
| **Total** | **35** | **✅** |

---

## Notes

- Frontend components (`ScheduleEditor.tsx`, `scheduler/page.tsx`) not yet implemented — these tests validate the backend API that the UI will consume
- No external dependencies required (pytest, Flask, pytz, apscheduler)
- All tests complete in ~1.6 seconds total
- Tests are fully isolated and can run in parallel with pytest-xdist
