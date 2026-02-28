# Scheduler Empty-Input Edge Cases — Test Summary

## Overview
✅ **6 NEW TESTS PASSING** | Execution: ~4.5s | Both scheduler bugs verified fixed

---

## Tests Added

### Bug A: Interval Input Coercion (3 tests)
**File:** `frontend/src/components/scheduler/__tests__/ScheduleEditModal.test.tsx`

**Context:** When user clears the interval field to type a new number (e.g., `20`), `parseInt('')` returns `NaN`. The old code stored `1` instead, causing the controlled input to visibly snap to `1` mid-keystroke. The fix stores `0` instead, keeping the field neutral; validation already rejects `< 1`.

**Tests:**
1. ✅ `stores 0 when interval field is cleared (not coerced to 1)`
   - Clears field, verifies value is `'0'` (not `'1'`)
   - Validates the fix: `isNaN(parsed) ? 0 : parsed`

2. ✅ `allows typing new interval after clearing field without snapping to 1`
   - Clear field → type `'2'` → type `'20'`
   - Verifies field does NOT snap to `1` at any intermediate state
   - User can type freely without input fighting back

3. ✅ `keeps field in neutral state (0) while user is typing new value`
   - Clear field (value = `'0'`, Save disabled)
   - Type `'3'` (value = `'3'`, Save enabled)
   - Type `'30'` (value = `'30'`, Save enabled)
   - Validates smooth typing flow with correct validation at each step

---

### Bug B: Async Agents Loading (3 tests)
**File:** `frontend/src/components/scheduler/__tests__/AgentScheduleForm.test.tsx`

**Context:** The effect ran every time `agents` changed. If `agents` loaded after the modal opened (async fetch), the effect re-fired and overwrote `jobId` and `label` with `agents[0]` — clobbering anything the user had typed.

**Fix:** Added `useRef` guard (`initializedRef`) to prevent re-initialization after the first mount. Flag is reset to `false` when modal closes, so next open starts fresh.

**Tests:**
1. ✅ `does not clobber user selection when agents load asynchronously after modal opens`
   - Render with empty agents (deferred initialization)
   - Agents load asynchronously
   - Form initializes to first agent
   - User selects different agent
   - Agents prop updates (re-render with same data)
   - **Assertion:** User selection NOT clobbered by re-render
   - Validates: `initializedRef` prevents effect re-fire on agents change

2. ✅ `resets initialization flag when modal closes and reopens`
   - Open modal → form initializes
   - Close modal
   - Reopen modal
   - **Assertion:** Form re-initializes fresh (flag was reset on close)
   - Validates: `if (!open) { initializedRef.current = false }`

3. ✅ `defers initialization in create mode until agents list is non-empty`
   - Render in create mode with empty agents
   - No-agents notice shown, form not initialized
   - Agents load
   - Form initializes to first agent
   - **Assertion:** Label field auto-populated, no-agents notice hidden
   - Validates: `if (!schedule && agents.length === 0) return;` (deferred init)

---

## Acceptance Criteria Coverage

| AC | Description | Bug A Test | Bug B Test |
|---|---|---|---|
| 1 | Empty interval input stored as 0, not coerced to 1 | ✅ Test 1 | - |
| 2 | User can type new value after clearing without snapping | ✅ Test 2 | - |
| 3 | Validation prevents submission with invalid values | ✅ Test 3 | - |
| 4 | Async agents loading doesn't clobber user selection | - | ✅ Test 1 |
| 5 | Modal re-opening resets initialization state | - | ✅ Test 2 |
| 6 | Create mode defers init until agents non-empty | - | ✅ Test 3 |

---

## Code Changes Verified

### ScheduleEditModal.tsx (line 308)
```typescript
// BEFORE: value: isNaN(parsed) ? 1 : parsed  ❌ (snaps to 1 mid-keystroke)
// AFTER:  value: isNaN(parsed) ? 0 : parsed  ✅ (neutral state)
setIntervalForm((prev) => ({
  ...prev,
  value: isNaN(parsed) ? 0 : parsed,
}));
```

### AgentScheduleForm.tsx (lines 68–80)
```typescript
// Added useRef import + initializedRef guard
const initializedRef = useRef(false);

useEffect(() => {
  if (!open) {
    initializedRef.current = false;  // Reset on close
    return;
  }
  if (initializedRef.current) return;  // Skip if already initialized
  if (!schedule && agents.length === 0) return;  // Defer in create mode

  initializedRef.current = true;  // Mark as initialized

  if (schedule) {
    // Edit mode...
  } else {
    // Create mode: default to first agent
    const first = agents[0];
    setJobId(first?.job_id ?? '');
    setLabel(first?.name ?? '');
    // ...
  }
}, [open, schedule, agents]);
```

---

## Test Quality Checklist

✅ All tests have clear assertions (expect/toBeInTheDocument/toHaveValue)
✅ All imports present (React Testing Library, userEvent, jest)
✅ Test names describe what is tested (not generic like "test_1")
✅ No hardcoded test data (use MOCK_AGENTS, MOCK_INTERVAL_JOB)
✅ Tests can run in any order (no interdependencies)
✅ Comprehensive edge case coverage (empty/null/async scenarios)
✅ Tests validate both happy path AND validation boundaries

---

## Full Test Suite Status

```
Test Suites: 2 passed, 2 total
Tests:       58 passed (6 new + 52 existing)
Time:        ~4.5 seconds
```

**Files Updated:**
- `frontend/src/components/scheduler/__tests__/ScheduleEditModal.test.tsx` (+3 tests)
- `frontend/src/components/scheduler/__tests__/AgentScheduleForm.test.tsx` (+3 tests)
