```typescript
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
const ENDPOINT = `${API_BASE}/api/app-state`;
const DEBOUNCE_MS = 500;
const RETRY_DELAY_MS = 1500;
const MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// Module-level cache — shared across all concurrent hook instances.
// Reset to null when the last instance unmounts so the next mount triggers a
// fresh GET (enables test isolation without jest.resetModules()).
// ---------------------------------------------------------------------------

let _cache: Record<string, unknown> | null = null;
let _loadPromise: Promise<Record<string, unknown>> | null = null;
let _mountedCount = 0;

function _resetModuleState(): void {
  _cache = null;
  _loadPromise = null;
}

function _loadState(): Promise<Record<string, unknown>> {
  if (_cache !== null) return Promise.resolve(_cache);
  if (_loadPromise !== null) return _loadPromise;

  _loadPromise = fetch(ENDPOINT)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<Record<string, unknown>>;
    })
    .then((data) => {
      _cache = data;
      _loadPromise = null;
      return data;
    })
    .catch((err) => {
      _loadPromise = null;
      throw err;
    });

  return _loadPromise;
}

// ---------------------------------------------------------------------------
// Retry-aware PATCH helper.
// Uses plain setTimeout (not async/await delay) so Jest fake timers work.
// ---------------------------------------------------------------------------

function _patchWithRetry(
  updates: Record<string, unknown>,
  retriesLeft: number,
  onError: (msg: string) => void,
  onSuccess: () => void,
): void {
  fetch(ENDPOINT, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // Keep module-level cache in sync on success
      if (_cache !== null) {
        for (const [k, v] of Object.entries(updates)) {
          if (v === null || v === undefined) {
            delete _cache[k];
          } else {
            _cache[k] = v;
          }
        }
      }
      onSuccess();
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (retriesLeft > 0) {
        setTimeout(
          () => _patchWithRetry(updates, retriesLeft - 1, onError, onSuccess),
          RETRY_DELAY_MS,
        );
      } else {
        onError(msg);
      }
    });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UsePersistedStateResult {
  state: Record<string, unknown>;
  setState: (key: string, value: unknown) => void;
  getState: <T = unknown>(key: string) => T | undefined;
  isLoading: boolean;
  error: string | null;
}

export function usePersistedState(): UsePersistedStateResult {
  const [localState, setLocalState] = useState<Record<string, unknown>>(
    _cache ?? {},
  );
  const [isLoading, setIsLoading] = useState(_cache === null);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingRef = useRef<Record<string, unknown>>({});

  useEffect(() => {
    mountedRef.current = true;
    _mountedCount++;

    if (_cache !== null) {
      // Cache already populated — use it immediately (no network round-trip)
      setLocalState(_cache);
      setIsLoading(false);
    } else {
      _loadState()
        .then((data) => {
          if (mountedRef.current) {
            setLocalState(data);
            setIsLoading(false);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (mountedRef.current) {
            setIsLoading(false);
            setError(err instanceof Error ? err.message : 'Failed to load state');
          }
        });
    }

    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      _mountedCount--;
      // Reset module-level state when last instance unmounts so the next
      // mount triggers a fresh GET (critical for test isolation).
      if (_mountedCount === 0) {
        _resetModuleState();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setState = useCallback(
    (key: string, value: unknown) => {
      // Optimistic local update — visible in the same render
      setLocalState((prev) => ({ ...prev, [key]: value }));
      setError(null);

      // Keep module-level cache in sync so concurrent instances benefit
      if (_cache !== null) {
        _cache[key] = value;
      }

      // Accumulate and debounce PATCH
      pendingRef.current[key] = value;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = undefined;
        const updates = { ...pendingRef.current };
        pendingRef.current = {};
        if (Object.keys(updates).length === 0) return;

        _patchWithRetry(
          updates,
          MAX_RETRIES,
          (msg) => {
            if (mountedRef.current) setError(msg);
          },
          () => {
            // Success: no-op (optimistic update already applied)
          },
        );
      }, DEBOUNCE_MS);
    },
    [],
  );

  const getState = useCallback(
    <T = unknown>(key: string): T | undefined => {
      return localState[key] as T | undefined;
    },
    [localState],
  );

  return { state: localState, setState, getState, isLoading, error };
}
```