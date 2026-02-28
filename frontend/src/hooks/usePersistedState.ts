```typescript
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
const ENDPOINT = `${API_BASE}/api/app-state`;
const DEBOUNCE_MS = 500;
const RETRY_DELAY_MS = 1500;

// ---------------------------------------------------------------------------
// Module-level cache — shared across all hook instances in the same process.
// A single GET /api/app-state is made on first mount; subsequent mounts read
// synchronously from the cache and skip the network round-trip.
// ---------------------------------------------------------------------------

let _cache: Record<string, unknown> | null = null;
let _loadPromise: Promise<Record<string, unknown>> | null = null;

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

async function _patchState(
  updates: Record<string, unknown>,
  retries = 1,
): Promise<void> {
  try {
    const r = await fetch(ENDPOINT, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    // Keep module-level cache in sync
    if (_cache !== null) {
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === undefined) {
          delete _cache[k];
        } else {
          _cache[k] = v;
        }
      }
    }
  } catch (err) {
    if (retries > 0) {
      await new Promise<void>((res) => setTimeout(res, RETRY_DELAY_MS));
      return _patchState(updates, retries - 1);
    }
    throw err;
  }
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

  // Load from server on mount (no-op if cache is already populated)
  useEffect(() => {
    mountedRef.current = true;

    if (_cache !== null) {
      setLocalState(_cache);
      setIsLoading(false);
      return;
    }

    _loadState()
      .then((data) => {
        if (mountedRef.current) {
          setLocalState(data);
          setIsLoading(false);
          setError(null);
        }
      })
      .catch((err) => {
        if (mountedRef.current) {
          setIsLoading(false);
          setError(err instanceof Error ? err.message : 'Failed to load state');
        }
      });

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Flush pending PATCH updates (called after debounce)
  const flushPending = useCallback(() => {
    const updates = { ...pendingRef.current };
    pendingRef.current = {};
    if (Object.keys(updates).length === 0) return;

    _patchState(updates).catch((err) => {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to save state');
      }
    });
  }, []);

  // Cancel debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const setState = useCallback(
    (key: string, value: unknown) => {
      // Optimistic local update
      setLocalState((prev) => ({ ...prev, [key]: value }));
      setError(null);

      // Keep module-level cache in sync so other hook instances benefit
      if (_cache !== null) {
        _cache[key] = value;
      }

      // Batch into pending and debounce the PATCH
      pendingRef.current[key] = value;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(flushPending, DEBOUNCE_MS);
    },
    [flushPending],
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