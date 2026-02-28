"""
TickerPulse AI v3.0 - In-memory API Latency Buffer

Accumulates per-endpoint latency samples across requests and provides a
flush() function that drains the buffer into aggregated rows ready for
batch-insert into api_request_log.

Zero per-request DB writes: an @after_request hook calls record() and the
metrics_snapshot job (every 5 min) calls flush() to drain to the DB.
"""

import math
import threading
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List

_lock = threading.Lock()
# Key: (endpoint, method, status_class) → {day: [latency_ms, ...]}
_buffer: Dict[tuple, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(list))

# Public alias for test introspection
_BUFFER = _buffer


def record(endpoint: str, method: str, status_code: int, latency_ms: float) -> None:
    """Add one latency sample to the in-memory buffer (thread-safe)."""
    day = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    status_class = f"{status_code // 100}xx"
    with _lock:
        _buffer[(endpoint, method.upper(), status_class)][day].append(latency_ms)


def flush() -> List[Dict[str, Any]]:
    """Drain the buffer and return aggregated rows for api_request_log.

    Each row contains: endpoint, method, status_class, call_count,
    p95_ms, avg_ms, log_date.  Returns [] when the buffer is empty.
    """
    with _lock:
        snapshot = {k: dict(v) for k, v in _buffer.items()}
        _buffer.clear()

    rows = []
    for (endpoint, method, status_class), days_data in snapshot.items():
        for day, latencies in days_data.items():
            if not latencies:
                continue
            latencies_sorted = sorted(latencies)
            n = len(latencies_sorted)
            p95_idx = max(0, math.ceil(0.95 * n) - 1)
            rows.append({
                'endpoint': endpoint,
                'method': method,
                'status_class': status_class,
                'call_count': n,
                'p95_ms': round(latencies_sorted[p95_idx], 2),
                'avg_ms': round(sum(latencies_sorted) / n, 2),
                'log_date': day,
            })
    return rows
