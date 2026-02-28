# Price Alert System — Test Suite Summary

**Test Date:** 2026-02-27
**QA Engineer:** Jordan Blake
**Status:** ✅ ALL TESTS PASSING

---

## Overview

Created focused, high-quality tests for the **Price Alert System** covering the three-layer pipeline: backend evaluation → SSE events → frontend notification delivery.

Tests validate key design requirements:
1. **Cooldown suppression** — alerts respect 15-minute cooldown between firings
2. **Fire count tracking** — persistent tracking of alert firing history
3. **Percentage change absolute value** — pct_change uses abs() for both +/- changes
4. **Race condition guard** — conditional UPDATE prevents concurrent thread conflicts

---

## Test File: `backend/core/test_alert_cooldown_and_fire_tracking.py`

**Location:** `backend/core/test_alert_cooldown_and_fire_tracking.py`
**Total Tests:** 8
**Status:** ✅ ALL PASSING (0.48s execution time)

### Test Breakdown

#### Class: TestAlertCooldownSuppression (2 tests)

##### ✅ test_alert_suppressed_within_cooldown_period
**Acceptance Criteria:**
- Alert fired 5 minutes ago (within 15-min default cooldown)
- Price condition still met
- Alert does NOT fire again
- fire_count remains unchanged (1 → 1)

**Test Steps:**
1. Insert alert with `fired_at = 5 minutes ago`, `fire_count = 1`
2. Insert current price that meets condition (`price = 150, threshold = 140`)
3. Call `evaluate_price_alerts(['AAPL'])`
4. Assert: `fire_count == 1`, SSE not called

---

##### ✅ test_alert_fires_after_cooldown_expires
**Acceptance Criteria:**
- Alert fired 20 minutes ago (PAST 15-min cooldown)
- Price condition still met
- Alert DOES fire again
- fire_count increments (1 → 2)

**Test Steps:**
1. Insert alert with `fired_at = 20 minutes ago`, `fire_count = 1`
2. Insert current price that meets condition
3. Call `evaluate_price_alerts(['AAPL'])`
4. Assert: `fire_count == 2`, SSE called, `fired_at` updated

---

#### Class: TestAlertFireCountTracking (2 tests)

##### ✅ test_fire_count_increments_on_each_firing
**Acceptance Criteria:**
- fire_count starts at 0
- First firing → fire_count = 1
- Second firing (after cooldown) → fire_count = 2
- Persistent across multiple evaluations

**Test Steps:**
1. Create alert with `fire_count = 0`
2. Call `evaluate_price_alerts()` → Assert `fire_count = 1`
3. Manually update `fired_at` to 20 minutes ago
4. Call `evaluate_price_alerts()` again → Assert `fire_count = 2`

---

##### ✅ test_fire_count_in_sse_event_payload
**Acceptance Criteria:**
- SSE event includes current `fire_count`
- fire_count = previous count + 1
- Frontend can display "Alert fired 4 times" etc.

**Test Steps:**
1. Create alert with `fire_count = 3`
2. Call `evaluate_price_alerts()`
3. Assert SSE payload includes `fire_count: 4`

---

#### Class: TestAlertPercentageChangeAbsoluteValue (3 tests)

##### ✅ test_negative_price_change_triggers_pct_change_alert
**Acceptance Criteria:**
- Alert condition: `pct_change` with threshold 5%
- Price change: -6% (NEGATIVE)
- Alert fires because abs(-6) >= 5
- Message shows: "moved -6.00%"

**Test Steps:**
1. Create `pct_change` alert with threshold = 5.0
2. Set `price_change_pct = -6.0` in ai_ratings
3. Call `evaluate_price_alerts()`
4. Assert: `fire_count = 1`, SSE message contains "-6.00%"

---

##### ✅ test_positive_price_change_triggers_pct_change_alert
**Acceptance Criteria:**
- Alert condition: `pct_change` with threshold 5%
- Price change: +7% (POSITIVE)
- Alert fires because 7 >= 5

**Test Steps:**
1. Create `pct_change` alert with threshold = 5.0
2. Set `price_change_pct = 7.0`
3. Call `evaluate_price_alerts()`
4. Assert: `fire_count = 1`, SSE called

---

##### ✅ test_pct_change_does_not_fire_below_threshold
**Acceptance Criteria:**
- Alert condition: `pct_change` with threshold 5%
- Price change: -3% (below threshold)
- Alert does NOT fire because abs(-3) < 5

**Test Steps:**
1. Create `pct_change` alert with threshold = 5.0
2. Set `price_change_pct = -3.0`
3. Call `evaluate_price_alerts()`
4. Assert: `fire_count = 0`, SSE not called

---

#### Class: TestAlertRaceConditionGuard (1 test)

##### ✅ test_conditional_update_prevents_race_condition
**Acceptance Criteria:**
- Conditional UPDATE uses `WHERE id = ? AND (fired_at IS NULL OR fired_at = ?)`
- Only one thread wins the race
- Prevents duplicate SSE events from concurrent evaluation

**Design Pattern Validated:**
```sql
UPDATE price_alerts
SET fired_at = ?, fire_count = ?, triggered_at = ?
WHERE id = ? AND (fired_at IS NULL OR fired_at = ?)
```

This ensures that:
- First thread to update wins (rowcount = 1)
- Subsequent threads lose (rowcount = 0)
- Only the winning thread sends SSE event

---

## Code Quality Metrics

### Test Structure
- ✅ All tests syntactically valid and executable
- ✅ Complete imports (pytest, patch, datetime, timezone)
- ✅ Clear test names describing behavior, not implementation
- ✅ Fixtures eliminate hardcoded test data
- ✅ Tests run independently (no shared state)

### Database Setup
- ✅ In-memory SQLite database for isolation
- ✅ Schema includes all required fields: `fired_at`, `fire_count`, `triggered_at`
- ✅ Proper datetime handling with timezone-aware ISO format
- ✅ Config patching for temp database path

### Mocking Strategy
- ✅ `backend.app.send_sse_event` properly mocked
- ✅ `backend.config.Config.DB_PATH` patched for test isolation
- ✅ Assertions on mock call args validate SSE payloads

---

## Integration with Existing Tests

This test suite complements existing alert tests:

| Suite | Focus | Location | Tests |
|-------|-------|----------|-------|
| **CRUD Operations** | Create, read, update, delete | `test_alert_manager_evaluation.py` | ~10 |
| **Condition Evaluation** | price_above, price_below | `test_alert_evaluation.py` | ~8 |
| **Cooldown & Fire Tracking** | **NEW** Cooldown suppression, fire_count persistence | `test_alert_cooldown_and_fire_tracking.py` | **8** |
| **API Endpoints** | POST /api/alerts, PUT, DELETE | `test_alerts_management.py` | ~20 |

**Total Coverage:** 46+ tests across all alert subsystems

---

## Design Spec Compliance

From **Price Alert System — Technical Design Spec**:

✅ **Harden `evaluate_price_alerts` race-condition guard**
- Conditional UPDATE prevents duplicate fires
- Test validates: `WHERE id = ? AND (fired_at IS NULL OR fired_at = ?)`

✅ **Add `pct_change` absolute-value fix**
- Tests verify: abs(negative_change) >= threshold triggers
- Handles both positive and negative price movements

✅ **Cooldown mechanism (15 min default)**
- Tests verify alerts suppressed within cooldown
- Tests verify alerts fire after cooldown expires

✅ **Fire count tracking**
- Tests verify fire_count increments on each firing
- SSE payloads include fire_count for frontend

---

## How to Run

```bash
# Run all price alert cooldown tests
python3 -m pytest backend/core/test_alert_cooldown_and_fire_tracking.py -v

# Run specific test class
python3 -m pytest backend/core/test_alert_cooldown_and_fire_tracking.py::TestAlertCooldownSuppression -v

# Run with coverage
python3 -m pytest backend/core/test_alert_cooldown_and_fire_tracking.py --cov=backend.core.alert_manager
```

---

## Notes for Developers

### Key Implementation Details Validated

1. **Cooldown Check** (lines 330-345 in alert_manager.py)
   - Parses `fired_at` ISO timestamp
   - Calculates elapsed time in minutes
   - Skips alert if `elapsed < cooldown_minutes`

2. **Conditional Update** (lines 366-374)
   - Uses `fired_at IS NULL OR fired_at = ?` guard
   - Prevents concurrent thread race conditions
   - Only winning thread's SSE event is sent

3. **Fire Count Payload** (line 401)
   - SSE event includes `fire_count: current_fire_count + 1`
   - Frontend can track and display firing history

4. **Percentage Change** (line 356)
   - Uses `abs(pct_change) >= threshold`
   - Correctly handles negative price movements

---

**Next Steps:**
- Consider adding `GET /api/alerts/history` endpoint (mentioned in design spec)
- Monitor fire_count trends in production
- Validate cooldown period is appropriate for different alert types
