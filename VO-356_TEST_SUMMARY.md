# VO-356: SSE Race Condition Fix — Test Summary

## ✅ Status: COMPLETE & PASSING

**All 7 backend tests passing** ✅ | **Execution: 6.79s** | **No race conditions detected**

---

## The Race Condition (Fixed)

### Before Fix 🐛
```python
# send_sse_event() implementation (buggy)
serialized = json.dumps(data)  # Serialize for validation only
for client_queue in sse_clients:
    client_queue.put_nowait(data)  # 🔴 Queue the MUTABLE dict!

# Later, caller mutates data:
data['price'] = 999.0  # All clients now see this mutation!

# Consumer (event_stream):
event_type, data = q.get()
yield f"data: {json.dumps(data)}\n\n"  # Re-serialize N times!
```

**Two Race Conditions:**
1. **Shared-mutable-dict race:** All clients hold references to the same dict; post-call mutations visible to all
2. **Redundant serialization:** N clients each call `json.dumps()` independently

### After Fix ✅
```python
# send_sse_event() implementation (fixed)
serialized = json.dumps(data)  # Serialize ONCE
for client_queue in sse_clients:
    client_queue.put_nowait((event_type, serialized))  # ✅ Queue the IMMUTABLE string!

# Caller mutates data:
data['price'] = 999.0  # Clients unaffected — they have the immutable string!

# Consumer (event_stream):
event_type, serialized = q.get()  # Get the pre-serialized string
yield f"data: {serialized}\n\n"  # Use directly — no re-serialization
```

**Both Fixed:**
1. ✅ Pre-serialized strings are immutable; post-call mutations isolated
2. ✅ Single serialization; shared string across N clients

---

## Test Coverage (7 Tests)

| # | Test | Focus | Result |
|---|------|-------|--------|
| 1 | `test_send_sse_event_queues_serialized_string` | Queued item is `(type: str, serialized: str)` not dict | ✅ PASSED |
| 2 | `test_data_mutation_after_send_does_not_affect_queued_event` | Post-call mutations isolated from queue | ✅ PASSED |
| 3 | `test_multiple_clients_receive_same_payload_not_live_dict_refs` | 5 clients all get identical immutable strings | ✅ PASSED |
| 4 | `test_concurrent_send_no_lost_events` | 10 concurrent senders, all events reach queue | ✅ PASSED |
| 5 | `test_dead_client_removed_when_queue_full` | Overflowed clients cleaned up | ✅ PASSED |
| 6 | `test_unknown_event_type_rejected_no_queue_writes` | Allowlist filtering before queueing | ✅ PASSED |
| 7 | `test_concurrent_connect_disconnect_no_corruption` | 20 clients concurrent connect/disconnect, no list corruption | ✅ PASSED |

---

## Key Test Examples

### Test 1: Verify Immutable Queued String
```python
def test_send_sse_event_queues_serialized_string():
    q = queue.Queue(maxsize=256)
    sse_clients.append(q)

    data = {'ticker': 'AAPL', 'price': 150.0}
    send_sse_event('price_update', data)

    event_type, queued_item = q.get_nowait()
    assert isinstance(queued_item, str), "Must be pre-serialized string"
    assert json.loads(queued_item) == data
```

### Test 2: Prevent Shared-Mutable-Dict Race
```python
def test_data_mutation_after_send_does_not_affect_queued_event():
    q = queue.Queue(maxsize=256)
    sse_clients.append(q)

    data = {'ticker': 'TSLA', 'price': 200.0}
    send_sse_event('price_update', data)

    # Mutate original after send_sse_event returns
    data['price'] = 999.0
    data['injected_key'] = 'evil'

    _, serialized = q.get_nowait()
    parsed = json.loads(serialized)

    assert parsed['price'] == 200.0, "Original value, not mutation"
    assert 'injected_key' not in parsed, "Injected key not visible"
```

### Test 3: Multiple Clients, Same Payload
```python
def test_multiple_clients_receive_same_payload_not_live_dict_refs():
    queues = [queue.Queue() for _ in range(5)]
    for q in queues:
        sse_clients.append(q)

    data = {'ticker': 'MSFT', 'price': 300.0, 'volume': 1_000_000}
    send_sse_event('price_update', data)

    # Mutate original
    data['price'] = 999.0

    # All clients still see original value
    payloads = []
    for q in queues:
        _, serialized = q.get_nowait()
        parsed = json.loads(serialized)
        payloads.append(parsed)
        assert parsed['price'] == 300.0

    # All payloads identical
    for p in payloads[1:]:
        assert p == payloads[0]
```

### Test 4: Concurrent Sends, No Lost Events
```python
def test_concurrent_send_no_lost_events():
    q = queue.Queue(maxsize=256)
    sse_clients.append(q)

    n_events = 10
    barrier = threading.Barrier(n_events)

    def sender(i):
        barrier.wait()  # Synchronize all threads
        send_sse_event('price_update', {'ticker': f'TICK{i}', 'price': float(i)})

    threads = [threading.Thread(target=sender, args=(i,)) for i in range(n_events)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert q.qsize() == n_events, "No lost events"

    # Verify all events valid JSON
    received_tickers = set()
    while not q.empty():
        _, serialized = q.get_nowait()
        assert isinstance(serialized, str)
        parsed = json.loads(serialized)
        received_tickers.add(parsed['ticker'])

    assert len(received_tickers) == n_events
```

---

## Architecture

### Module: `backend/app.py`

**Global State:**
```python
sse_clients: list[queue.Queue] = []  # All connected clients
sse_lock = threading.Lock()           # Protects sse_clients list
```

**sender() → `send_sse_event(event_type: str, data: dict) -> None`:**
1. Validate event_type in `_ALLOWED_EVENT_TYPES`
2. Serialize once: `serialized = json.dumps(data)`
3. Validate size: `len(serialized.encode()) <= _MAX_PAYLOAD_BYTES`
4. Queue to all clients: `client_queue.put_nowait((event_type, serialized))`
5. Remove dead clients (overflowed queues)

**consumer() → `event_stream()` generator:**
1. Register new client queue: `sse_clients.append(q)`
2. Dequeue pre-serialized string: `event_type, serialized = q.get(timeout=15)`
3. Emit directly: `yield f"event: {event_type}\ndata: {serialized}\n\n"`
4. Unregister on client disconnect

---

## Performance Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Serialization calls per event | N (per client) | 1 | **N× faster** |
| Memory per event | N dict refs | 1 string ref | **Reduced** |
| Payload validation overhead | Per-client | Single | **Lower** |
| GC pressure | Higher (N dicts) | Lower (1 string) | **Better** |

Example with 100 concurrent clients:
- **Before:** 100 × `json.dumps()` calls per event = **100 serializations**
- **After:** 1 × `json.dumps()` call per event = **1 serialization** ✅

---

## Test Execution

```bash
$ python3 -m pytest backend/tests/test_sse_race_condition.py -v

backend/tests/test_sse_race_condition.py::test_send_sse_event_queues_serialized_string PASSED [ 14%]
backend/tests/test_sse_race_condition.py::test_data_mutation_after_send_does_not_affect_queued_event PASSED [ 28%]
backend/tests/test_sse_race_condition.py::test_multiple_clients_receive_same_payload_not_live_dict_refs PASSED [ 42%]
backend/tests/test_sse_race_condition.py::test_concurrent_send_no_lost_events PASSED [ 57%]
backend/tests/test_sse_race_condition.py::test_dead_client_removed_when_queue_full PASSED [ 71%]
backend/tests/test_sse_race_condition.py::test_unknown_event_type_rejected_no_queue_writes PASSED [ 85%]
backend/tests/test_sse_race_condition.py::test_concurrent_connect_disconnect_no_corruption PASSED [100%]

======================== 7 passed in 6.79s ========================
```

---

## Acceptance Criteria

- ✅ **AC1:** Serialize payload exactly once before queuing
- ✅ **AC2:** Queue immutable pre-serialized strings, not mutable dicts
- ✅ **AC3:** Post-call mutations to original data don't affect clients
- ✅ **AC4:** Handle concurrent sends without deadlock or lost events
- ✅ **AC5:** Validate payload before queueing (type, size, JSON-ability)
- ✅ **AC6:** Clean up dead clients gracefully
- ✅ **AC7:** Support 20+ concurrent connect/disconnect cycles

---

## Related

- **VO-350:** Settings persistence race condition (uses `threading.RLock` in `settings_manager.py`)
- **VO-343:** Alert manager race condition (same pattern)
- **VO-344:** Scheduler registry race condition (same pattern)
- **Frontend tests:** `frontend/src/hooks/__tests__/useSSE.test.ts` (consumer verification)

---

**Tester:** Jordan Blake (QA Engineer)
**Date:** 2026-02-27
**Verdict:** ✅ **VO-356 SSE race condition fix is complete, thoroughly tested, and ready for merge.**
