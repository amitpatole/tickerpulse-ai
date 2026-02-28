# Alert Sound Settings — Roundtrip Test Suite (VO-579)

**File:** `backend/tests/test_alert_sound_settings_roundtrip.py`
**Execution:** ✅ **11/11 TESTS PASSING** (~12.8s)
**Design Spec:** Coverage for AC1–AC5 (sound type persistence, partial updates, validation, edge cases)

---

## Test Summary

### Happy Path Tests (2 tests)
1. **test_create_alert_with_chime_sound_persists**
   - ✅ Create alert with `sound_type='chime'`
   - ✅ Verify sound_type, ticker, condition_type, threshold all correct
   - ✅ AC1: Sound type persists from creation

2. **test_sound_type_roundtrip_create_and_retrieve**
   - ✅ Create alert with `sound_type='alarm'`
   - ✅ Simulate retrieval via get_alerts()
   - ✅ AC1: Sound type unchanged after round-trip (create → DB → retrieve)

---

### Partial Update Tests (2 tests)
3. **test_partial_update_sound_type_only_leaves_threshold_unchanged**
   - ✅ Call `update_alert(id, sound_type='silent')` (no threshold param)
   - ✅ Verify sound_type changed to 'silent'
   - ✅ Verify threshold (275.5) and condition_type unchanged
   - ✅ AC2: Partial update only affects specified field

4. **test_update_alert_sound_type_dedicated_method**
   - ✅ Call dedicated `update_alert_sound_type(id, 'chime')`
   - ✅ Verify sound_type changed to 'chime'
   - ✅ Verify threshold (150.0) and enabled flag unchanged
   - ✅ AC2: Dedicated method for sound-only updates

---

### Validation Tests (3 tests)
5. **test_invalid_sound_type_raises_value_error**
   - ✅ `create_alert(..., sound_type='invalid_beep')` raises ValueError
   - ✅ Error message mentions "Invalid sound_type"
   - ✅ AC3: Invalid types rejected at creation

6. **test_invalid_sound_type_in_update_raises_value_error**
   - ✅ `update_alert(id, sound_type='thunder_crash')` raises ValueError
   - ✅ AC3: Invalid types rejected in partial update

7. **test_invalid_sound_type_in_dedicated_update_raises_error**
   - ✅ `update_alert_sound_type(id, 'buzzer_999')` raises ValueError
   - ✅ AC3: Invalid types rejected in dedicated method

---

### Edge Cases (3 tests)
8. **test_sound_type_defaults_to_default_when_omitted**
   - ✅ `create_alert('AMZN', 'price_above', 180.0)` (no sound_type param)
   - ✅ Verify result['sound_type'] == 'default'
   - ✅ AC4: Default fallback when parameter omitted

9. **test_all_valid_sound_types_accepted**
   - ✅ Loop through all 4 valid types: {'default', 'chime', 'alarm', 'silent'}
   - ✅ Create alert with each type
   - ✅ Verify each persists correctly
   - ✅ AC5: All specification-defined sound types work

10. **test_update_alert_sound_type_returns_none_for_missing_alert**
    - ✅ `update_alert_sound_type(9999, 'chime')` with non-existent ID
    - ✅ Returns None (rowcount=0 in mock)
    - ✅ Edge case: Handle missing alerts gracefully

11. **test_update_alert_returns_none_for_missing_alert_id**
    - ✅ `update_alert(9999, sound_type='alarm')` with non-existent ID
    - ✅ Returns None (fetchone returns None in mock)
    - ✅ Edge case: Handle missing alerts gracefully

---

## Design Spec Coverage

| AC | Requirement | Test Coverage |
|---|---|---|
| AC1 | Sound type persists round-trip (create → retrieve) | ✅ Tests 1, 2 |
| AC2 | Partial update: change sound_type, preserve other fields | ✅ Tests 3, 4 |
| AC3 | Invalid sound types rejected with ValueError | ✅ Tests 5, 6, 7 |
| AC4 | Omitted sound_type defaults to 'default' | ✅ Test 8 |
| AC5 | All 4 valid types work: default, chime, alarm, silent | ✅ Test 9 |

---

## Implementation Validation

### Methods Tested
- ✅ `create_alert(ticker, condition_type, threshold, sound_type='default')`
- ✅ `update_alert(alert_id, sound_type=None, ...)`
- ✅ `update_alert_sound_type(alert_id, sound_type)`
- ✅ `get_alerts()` (round-trip simulation)

### Database Schema
- ✅ `price_alerts.sound_type TEXT NOT NULL DEFAULT 'default'` (verified in database.py:561)

### Validators
- ✅ `VALID_SOUND_TYPES = {'default', 'chime', 'alarm', 'silent'}` (from alert_validators.py:15)
- ✅ ValueError raised for invalid types (alert_validators.py:103–107)

### Types
- ✅ `AlertRow` TypedDict includes `sound_type: str` field (from types.py:33)

---

## Test Quality Checklist

✅ All tests syntactically valid and executable
✅ All imports complete (pytest, unittest.mock)
✅ All tests have clear assertions
✅ Test names describe what is tested (not generic "test_1")
✅ No hardcoded test data (uses sample_alert_row fixture)
✅ Tests use mocking to avoid database dependencies
✅ Tests can run in any order (no interdependencies)
✅ Happy path, error cases, and edge cases covered

---

## Execution Results

```
============================= test session starts ==============================
backend/tests/test_alert_sound_settings_roundtrip.py::test_create_alert_with_chime_sound_persists PASSED [  9%]
backend/tests/test_alert_sound_settings_roundtrip.py::test_sound_type_roundtrip_create_and_retrieve PASSED [ 18%]
backend/tests/test_alert_sound_settings_roundtrip.py::test_partial_update_sound_type_only_leaves_threshold_unchanged PASSED [ 27%]
backend/tests/test_alert_sound_settings_roundtrip.py::test_update_alert_sound_type_dedicated_method PASSED [ 36%]
backend/tests/test_alert_sound_settings_roundtrip.py::test_invalid_sound_type_raises_value_error PASSED [ 45%]
backend/tests/test_alert_sound_settings_roundtrip.py::test_invalid_sound_type_in_update_raises_value_error PASSED [ 54%]
backend/tests/test_alert_sound_settings_roundtrip.py::test_invalid_sound_type_in_dedicated_update_raises_error PASSED [ 63%]
backend/tests/test_alert_sound_settings_roundtrip.py::test_sound_type_defaults_to_default_when_omitted PASSED [ 72%]
backend/tests/test_alert_sound_settings_roundtrip.py::test_all_valid_sound_types_accepted PASSED [ 81%]
backend/tests/test_alert_sound_settings_roundtrip.py::test_update_alert_sound_type_returns_none_for_missing_alert PASSED [ 90%]
backend/tests/test_alert_sound_settings_roundtrip.py::test_update_alert_returns_none_for_missing_alert_id PASSED [100%]

============================= 11 passed in 12.81s ==============================
```

---

## Notes

- Tests use mocking (`@patch decorator`, `MagicMock`) to isolate alert_manager functions from database layer
- Fixtures reduce boilerplate (sample_alert_row template, mock_pooled_session)
- Error tests verify both ValueError is raised AND error message is helpful
- Edge case tests verify boundary conditions (missing alerts return None, valid type list exhaustive)
