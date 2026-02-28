```typescript
/**
 * TickerPulse AI v3.0 - useErrorReporter
 *
 * Fire-and-forget helper for posting error reports to POST /api/errors.
 * Failures are silently swallowed so error reporting never disrupts the UI.
 *
 * Features:
 * - Session-level dedup: identical type+message suppressed within 30s
 * - Batching: errors buffered and flushed every 2s or when buffer reaches 10
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

const _DEDUP_TTL_MS = 30_000;
const _BATCH_SIZE = 10;
const _FLUSH_INTERVAL_MS = 2_000;

export interface ErrorReport {
  type: 'react_error' | 'unhandled_rejection' | 'unhandled_exception';
  message: string;
  timestamp: string;
  severity?: 'error' | 'warning' | 'critical';
  source?: string;
  stack?: string;
  component_stack?: string;
  context?: Record<string, unknown>;
}

// Module-level state (shared across all callers in the same browser session)
const _seen = new Map<string, number>(); // dedup: hash → last-reported timestamp
const _buffer: ErrorReport[] = [];      // batch buffer

function _hash(r: ErrorReport): string {
  return `${r.type}:${r.message}`;
}

function _flush(): void {
  if (_buffer.length === 0) return;
  const batch = _buffer.splice(0);
  for (const payload of batch) {
    fetch(`${API_BASE}/api/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }
}

// Start periodic flush in browser environments only
if (typeof window !== 'undefined') {
  setInterval(_flush, _FLUSH_INTERVAL_MS);
}

/**
 * Post an error report to the backend. Fire-and-forget: never throws.
 * Deduplicates identical type+message pairs within a 30s window.
 * Batches reports and flushes every 2s or when 10 items accumulate.
 */
export function reportError(payload: ErrorReport): void {
  const hash = _hash(payload);
  const now = Date.now();
  const lastSeen = _seen.get(hash);
  if (lastSeen !== undefined && now - lastSeen < _DEDUP_TTL_MS) return;
  _seen.set(hash, now);

  _buffer.push(payload);
  if (_buffer.length >= _BATCH_SIZE) _flush();
}

/**
 * Hook wrapper around reportError for components that prefer hook style.
 */
export function useErrorReporter() {
  return { reportError };
}
```