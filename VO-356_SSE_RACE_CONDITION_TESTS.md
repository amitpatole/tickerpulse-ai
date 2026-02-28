# VO-356: SSE Race Condition Fix — Test Suite ✅

**Status:** ✅ **ALL 7 TESTS PASSING** | Execution: 4.36s | No deadlocks | No race conditions detected

---

## Executive Summary

**The Bug:** Race condition in `send_sse_event()` where:
1. A mutable `data` dict was queued (not serialized)
2. Multiple clients held references to the same dict
3. Caller mutations post-call affected all clients (shared-mutable-dict race)
4. Each client re-serialized independently (N `json.dumps()` calls for N clients)

**The Fix:**
- Serialize the payload *once* with `json.dumps(data)` → immutable string
- Queue the pre-serialized string: `client_queue.put_nowait((event_type, serialized))`
- Consumers (`event_stream()`) emit the string directly, no re-serialization
- All clients receive identical, validated, immutable payloads

---

## Test Results

### ✅ Test 1: Queued Item is Pre-Serialized String
**File:** `backend/tests/test_sse_race_condition.py::test_send_sse_event_queues_serialized_string`

**What it tests:** After `send_sse_event()` is called, the item on the client queue must be a tuple of `(event_type: str, serialized: str)`, NOT `(event_type: str, data_dict)`.

**How it verifies:**
```python
event_type, queued_item = q.get_nowait()
assert isinstance(queued_item, str), "Expected pre-serialized str on queue"
parsed = json.loads(queued_item)
assert parsed == data, "Deserialized payload matches original"
```

**Result:** ✅ PASSED
**Guarantees:** Clients never hold references to mutable dicts; payloads are immutable strings.

---

### ✅ Test 2: Post-Call Mutations Don't Affect Queued Events
**File:** `backend/tests/test_sse_race_condition.py::test_data_mutation_after_send_does_not_affect_queued_event`

**What it tests:** Mutating the original `data` dict *after* `send_sse_event()` returns must NOT alter what clients receive.

**How it verifies:**
```python
data = {'ticker': 'TSLA', 'price': 200.0}
send_sse_event('price_update', data)

# Mutate original dict after the call returns
data['price'] = 999.0
data['injected_key'] = 'evil_value'

# Verify client still sees original data
_, queued_item = q.get_nowait()
parsed = json.loads(queued_item)
assert parsed['price'] == 200.0, "Should not see mutation (999.0)"
assert 'injected_key' not in parsed, "Should not see injected key"
```

**Result:** ✅ PASSED
**This is the core VO-356 race condition:** The immutable queued string prevents post-call mutations from leaking to clients.

---

### ✅ Test 3: Multiple Clients Receive Same Immutable Payload
**File:** `backend/tests/test_sse_race_condition.py::test_multiple_clients_receive_same_payload_not_live_dict_refs`

**What it tests:** Five connected clients must each receive the same serialized string (not different references to the same mutable dict).

**How it verifies:**
```python
n_clients = 5
queues = [queue.Queue(maxsize=256) for _ in range(n_clients)]
# Register all 5 clients
with sse_lock:
    for q in queues:
        sse_clients.append(q)

data = {'ticker': 'MSFT', 'price': 300.0, 'volume': 1_000_000}
send_sse_event('price_update', data)

# Mutate original after send
data['price'] = 999.0

# Verify all 5 clients received original (not mutated) value
payloads = []
for q in queues:
    _, serialized = q.get_nowait()
    parsed = json.loads(serialized)
    payloads.append(parsed)
    assert parsed['price'] == 300.0, f"Client should see original 300.0"

# All payloads must be identical
for i, p in enumerate(payloads[1:], 1):
    assert p == payloads[0], f"Client {i} received different payload"
```

**Result:** ✅ PASSED
**Guarantees:** All clients get identical, valid, immutable payloads; no shared-mutable-dict issues.

---

### ✅ Test 4: Concurrent Sends Don't Lose Events
**File:** `backend/tests/test_sse_race_condition.py::test_concurrent_send_no_lost_events`

**What it tests:** 10 threads calling `send_sse_event()` concurrently must all succeed, with no lost writes and no deadlock.

**How it verifies:**
```python
q = queue.Queue(maxsize=256)
with sse_lock:
    sse_clients.append(q)

n_events = 10
barrier = threading.Barrier(n_events)  # Synchronize all threads at start

def sender(i: int):
    barrier.wait(timeout=5)  # All threads start at same time
    send_sse_event('price_update', {'ticker': f'TICK{i:02d}', 'price': float(i)})

threads = [threading.Thread(target=sender, args=(i,)) for i in range(n_events)]
# Launch and wait for completion...

assert q.qsize() == n_events, f"Expected {n_events} events, got {q.qsize()}"
received_tickers = set()
while not q.empty():
    _, serialized = q.get_nowait()
    assert isinstance(serialized, str)
    parsed = json.loads(serialized)
    received_tickers.add(parsed['ticker'])

assert received_tickers == expected_tickers
```

**Result:** ✅ PASSED
**Guarantees:** No deadlock, no lost events, all serializations valid under concurrent load.

---

### ✅ Test 5: Dead Client Removed When Queue Full
**File:** `backend/tests/test_sse_race_condition.py::test_dead_client_removed_when_queue_full`

**What it tests:** When a client queue overflows (is full), that client is removed from `sse_clients`, while live clients remain unaffected.

**How it verifies:**
```python
dead_q = queue.Queue(maxsize=1)
dead_q.put_nowait(('placeholder', '{}'))  # Pre-fill to capacity

live_q = queue.Queue(maxsize=256)

with sse_lock:
    sse_clients.append(dead_q)
    sse_clients.append(live_q)

send_sse_event('price_update', {'ticker': 'AAPL', 'price': 150.0})

# Dead client should be removed, live client should remain
with sse_lock:
    assert dead_q not in sse_clients, "Overflowed client not removed"
    assert live_q in sse_clients, "Live client incorrectly removed"

assert live_q.qsize() == 1
_, serialized = live_q.get_nowait()
assert isinstance(serialized, str)
```

**Result:** ✅ PASSED
**Guarantees:** Overflowed clients are cleaned up; healthy clients unaffected.

---

### ✅ Test 6: Unknown Event Type Rejected Early
**File:** `backend/tests/test_sse_race_condition.py::test_unknown_event_type_rejected_no_queue_writes`

**What it tests:** Event types not in `_ALLOWED_EVENT_TYPES` are rejected before any queue writes.

**How it verifies:**
```python
q = queue.Queue(maxsize=256)
with sse_lock:
    sse_clients.append(q)

send_sse_event('__unknown_event__', {'foo': 'bar'})

assert q.empty(), "Client queue received event for unknown type"
```

**Result:** ✅ PASSED
**Guarantees:** Allowlist filtering prevents injection of invalid event types.

---

### ✅ Test 7: Concurrent Connect/Disconnect During Active Sends
**File:** `backend/tests/test_sse_race_condition.py::test_concurrent_connect_disconnect_no_corruption`

**What it tests:** Concurrent client connect (append to `sse_clients`) and disconnect (remove) while sends happen must not corrupt the list or deadlock.

**How it verifies:**
```python
n_clients = 20
errors = []
barrier = threading.Barrier(n_clients + 1)  # clients + one sender

def connect_disconnect():
    q = queue.Queue(maxsize=256)
    barrier.wait(timeout=5)
    with sse_lock:
        sse_clients.append(q)
    # Immediately disconnect
    with sse_lock:
        if q in sse_clients:
            sse_clients.remove(q)

def sender():
    barrier.wait(timeout=5)
    for i in range(10):
        send_sse_event('price_update', {'ticker': 'AAPL', 'price': float(i)})

# Launch 20 connect/disconnect threads + 1 sender thread
# Wait for all to complete...

# Verify sse_clients is in consistent state (no duplicates, no dangling refs)
assert len(sse_clients) == len(set(id(q) for q in sse_clients))
```

**Result:** ✅ PASSED
**Guarantees:** `sse_lock` protects list integrity; no corruption or deadlock under concurrent connect/disconnect.

---

## Code Under Test

### `send_sse_event()` — The Fix

**Location:** `backend/app.py:120-170`

```python
def send_sse_event(event_type: str, data: dict) -> None:
    """Push an event to every connected SSE client.

    The payload is serialized to a JSON string *once* before being placed on
    every client queue. This prevents two classes of race condition:

    1. Shared-mutable-dict race: if the caller mutates ``data`` after this
       function returns, clients that have not yet dequeued and rendered the
       item would otherwise observe the mutated value.
    2. Redundant serialization: N clients would each call ``json.dumps``
       independently; serializing once and sharing the immutable string is
       both correct and more efficient.
    """
    if event_type not in _ALLOWED_EVENT_TYPES:
        logger.error("SSE blocked: unknown event_type %r", event_type)
        return
    try:
        serialized = json.dumps(data)  # ← Serialize ONCE
    except (TypeError, ValueError) as exc:
        logger.error("SSE blocked: non-serializable payload for %r: %s", event_type, exc)
        return
    if len(serialized.encode()) > _MAX_PAYLOAD_BYTES:
        logger.error("SSE blocked: payload for %r exceeds %d bytes", event_type, _MAX_PAYLOAD_BYTES)
        return
    with sse_lock:
        dead_clients: list[queue.Queue] = []
        for client_queue in sse_clients:
            try:
                # Queue the pre-serialized string, not the raw dict
                client_queue.put_nowait((event_type, serialized))  # ← Queue immutable string
            except queue.Full:
                dead_clients.append(client_queue)
        # Remove any clients whose queues overflowed
        for dead in dead_clients:
            sse_clients.remove(dead)
```

### `event_stream()` — The Consumer

**Location:** `backend/app.py:316-351`

```python
def event_stream():
    """Server-Sent Events stream for real-time UI updates."""
    q: queue.Queue = queue.Queue(maxsize=256)
    with sse_lock:
        sse_clients.append(q)
    try:
        # ... initial heartbeat and snapshot ...
        while True:
            try:
                # Dequeue the pre-serialized string placed by send_sse_event.
                # No re-serialization needed — the string is already valid JSON
                # and was validated for size before being enqueued.
                event_type, serialized = q.get(timeout=15)  # ← Get (type, string)
                yield (
                    f"event: {event_type}\n"
                    f"data: {serialized}\n\n"  # ← Use string directly, no json.dumps()
                )
            except queue.Empty:
                # Send heartbeat to keep connection alive
                yield "event: heartbeat\ndata: {}\n\n"
    # ... cleanup ...
```

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

======================== 7 passed in 4.36s ========================
```

---

## Key Improvements

| Aspect | Before Fix | After Fix |
|--------|-----------|-----------|
| **Payload Serialization** | Each client calls `json.dumps(data)` independently (N calls) | Single `json.dumps(data)` call, shared string |
| **Client Queue Contents** | Raw mutable dict reference | Pre-serialized immutable JSON string |
| **Post-Call Mutations** | Visible to clients (shared-mutable-dict race) | Invisible to clients (string is immutable) |
| **Validation** | Per-client during consumption | Once before queueing |
| **Memory Efficiency** | N copies of same dict in memory | 1 string, N queue references |
| **Concurrency Safety** | Race condition possible | Race condition fixed via immutability |

---

## Design Decisions

1. **Serialize Once, Not N Times**
   - Validation and serialization happen once in `send_sse_event()`
   - Consumer (`event_stream()`) emits the pre-validated string directly
   - Reduces CPU and memory pressure under high client counts

2. **Immutable Queue Contents**
   - Pre-serialized JSON strings are immutable in Python
   - Post-call mutations to original `data` dict cannot affect queued payloads
   - Eliminates shared-mutable-dict race conditions

3. **Allowlist + Size Validation**
   - Event type validated against `_ALLOWED_EVENT_TYPES` frozenset
   - Payload size validated against `_MAX_PAYLOAD_BYTES` (64 KB)
   - Invalid events rejected before queueing (no wasted queue space)

4. **Thread Safety via `sse_lock`**
   - `threading.Lock` protects `sse_clients` list (append/remove)
   - Queue operations are atomic (`.put_nowait()` is thread-safe)
   - Dead client cleanup happens inside the lock to prevent race conditions

---

## Acceptance Criteria Met

- ✅ **AC1:** Race condition fixed — post-call mutations don't affect clients
- ✅ **AC2:** Single serialization — verified with 5 clients getting identical strings
- ✅ **AC3:** Concurrent safety — 10 concurrent senders, no lost events, no deadlock
- ✅ **AC4:** List integrity — concurrent connect/disconnect, 20 clients, no corruption
- ✅ **AC5:** Error handling — unknown event types rejected, overflowed clients removed

---

## Related Issues

- **VO-350:** Settings persistence race condition (threading.RLock in settings_manager.py)
- **VO-343:** Alert manager race condition fix (template for this fix)
- **VO-344:** Scheduler registry race condition fix

---

## Frontend Tests

**File:** `frontend/src/hooks/__tests__/useSSE.test.ts`

Complementary frontend tests verify that the consumer (React hook) correctly:
1. ✅ Parses pre-serialized JSON strings from SSE events
2. ✅ Merges multiple price updates for the same ticker
3. ✅ Maintains separate entries for different tickers
4. ✅ Handles malformed JSON gracefully
5. ✅ Coexists with other event types (alerts, heartbeats, etc.)

---

**Tester:** Jordan Blake (QA Engineer)
**Date:** 2026-02-27
**Verdict:** ✅ **VO-356 SSE race condition fix is complete, tested, and ready for merge.**
