# Health Endpoint Test Suite — TickerPulse AI v3.0

## Summary

**File:** `backend/tests/test_health_endpoint.py`
**Status:** ✅ **10/10 TESTS PASSING** | Execution: ~0.51s

## Test Coverage

### Integration Tests (5)

1. **test_health_happy_path_all_ok**
   - All subsystems report `ok`, response includes all required fields
   - **Covers:** AC1 (happy path), response structure
   - Assertions: status='ok', version='3.0.0', services & metrics present

2. **test_health_degraded_on_db_error**
   - DB check fails → overall status becomes `degraded`
   - **Covers:** AC3 (DB failure handling)
   - Assertions: status='degraded', db.error reported, scheduler still ok

3. **test_health_degraded_on_scheduler_stopped**
   - Scheduler.running=False → overall status becomes `degraded`
   - **Covers:** AC3 (scheduler failure handling)
   - Assertions: status='degraded', scheduler.status='stopped'

4. **test_health_agent_registry_not_configured_still_ok**
   - Agent registry not_configured does NOT change overall status
   - **Covers:** AC2 (non-critical subsystem failures)
   - Assertions: status='ok' (DB ok, scheduler ok), agent_registry='not_configured'

5. **test_health_error_log_table_missing_returns_negative_one**
   - When error_log table missing, _get_error_log_count_1h returns -1 (not exception)
   - **Covers:** AC4 (graceful error handling)
   - Assertions: error_log_count_1h=-1, status='ok'

### Unit Tests (5)

6. **test_derive_overall_status_db_error_is_degraded**
   - DB not ok → degraded

7. **test_derive_overall_status_scheduler_stopped_is_degraded**
   - Scheduler stopped → degraded

8. **test_derive_overall_status_scheduler_error_is_degraded**
   - Scheduler error → degraded

9. **test_derive_overall_status_scheduler_not_configured_is_ok**
   - Scheduler not_configured (but DB ok) → ok

10. **test_derive_overall_status_all_ok**
    - DB ok + scheduler ok → ok

## Design Coverage

| AC | Requirement | Test(s) |
|:--:|---|---|
| AC1 | Happy path: all subsystems ok, response includes version/timestamp/services/metrics | `test_health_happy_path_all_ok` |
| AC2 | Non-critical subsystem failures reported but don't affect status | `test_health_agent_registry_not_configured_still_ok` |
| AC3 | DB or scheduler failures → overall status='degraded' | `test_health_degraded_on_db_error`, `test_health_degraded_on_scheduler_stopped` |
| AC4 | Graceful error handling: error_log missing returns -1, not exception | `test_health_error_log_table_missing_returns_negative_one` |

## Response Shape Validation

All tests verify the response includes:
```json
{
  "status": "ok|degraded",
  "version": "3.0.0",
  "timestamp": "<ISO 8601>",
  "services": {
    "db": {...},
    "scheduler": {...},
    "agent_registry": {...},
    "data_providers": {...}
  },
  "metrics": {
    "error_log_count_1h": <int>,
    "sse_client_count": <int>
  }
}
```

## Key Testing Patterns

- **Mocking:** All probe functions mocked independently for isolation
- **Status Rules:** Overall status derived from DB + scheduler only
- **Error Handling:** Failures in non-critical subsystems (agent_registry, data_providers) don't affect top-level status
- **Edge Cases:** Missing tables return -1, not exception; not_configured is acceptable for optional subsystems

## Execution

```bash
pytest backend/tests/test_health_endpoint.py -v --no-cov
```

**Result:** 10 passed in 0.51s ✅
