'use client';

/**
 * usePersistedState — global UI state store backed by GET/PATCH /api/state.
 *
 * Design:
 *  1. On mount, fetches all state from the server; server is source of truth.
 *  2. setState(key, value) updates local state immediately for a snappy UI,
 *     then schedules a debounced PATCH so rapid successive calls are batched
 *     into a single request.
 *  3. On PATCH failure, one retry is attempted after RETRY_DELAY_MS.
 *     After a second failure the error is surfaced via the returned `error` field.
 *  4. Local state is never rolled back on sync failure — the write is
 *     optimistic and the UI stays responsive even when offline.
 *
 * Usage:
 *   const { state, setState, getState, isLoading, error } = usePersistedState();
 *   setState('dashboard', { watchlist_id: 1 });
 *   const dash = getState('dashboard'); // { watchlist_id: 1 }
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getState as apiGetState, patchState as apiPatchState } from '@/lib/api';

type AppState = Record<string, Record<string, unknown>>;

export interface UsePersistedStateReturn {
  state: AppState;
  setState: (key: string, value: Record<string, unknown>) => void;
  getState: (key: string) => Record<string, unknown> | undefined;
  isLoading: boolean;
  error: Error | null;
}

const DEBOUNCE_MS = 500;
const RETRY_DELAY_MS = 1500;

export function usePersistedState(): UsePersistedStateReturn {
  const [state, setStateInternal] = useState<AppState>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Accumulates keys written since the last debounced flush.
  const pendingRef = useRef<AppState>({});
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Sync pending changes to backend with one retry on failure.
  const syncPending = useCallback((changes: AppState, attempt = 0) => {
    apiPatchState(changes).catch((err: unknown) => {
      if (!mountedRef.current) return;
      const errorObj = err instanceof Error ? err : new Error(String(err));
      if (attempt === 0) {
        // Schedule one retry with backoff; do not surface error yet.
        setTimeout(() => {
          if (!mountedRef.current) return;
          syncPending(changes, 1);
        }, RETRY_DELAY_MS);
      } else {
        // Final failure — surface to caller.
        setError(errorObj);
      }
    });
  }, []);

  // Load full state from backend on mount.
  useEffect(() => {
    mountedRef.current = true;

    apiGetState()
      .then(({ state: serverState }) => {
        if (!mountedRef.current) return;
        setStateInternal(serverState ?? {});
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err : new Error('Failed to load state'));
        setIsLoading(false);
      });

    return () => {
      mountedRef.current = false;
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const setState = useCallback(
    (key: string, value: Record<string, unknown>) => {
      // Optimistic local update — no waiting for the server.
      setStateInternal((prev) => ({ ...prev, [key]: value }));
      setError(null);

      // Merge into pending batch.
      pendingRef.current = { ...pendingRef.current, [key]: value };

      // Debounce: reset the timer on every call so rapid writes are coalesced.
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        const toSync = { ...pendingRef.current };
        pendingRef.current = {};
        debounceTimerRef.current = null;
        syncPending(toSync);
      }, DEBOUNCE_MS);
    },
    [syncPending]
  );

  const getStateKey = useCallback(
    (key: string): Record<string, unknown> | undefined => state[key],
    [state]
  );

  return {
    state,
    setState,
    getState: getStateKey,
    isLoading,
    error,
  };
}