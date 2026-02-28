'use client';

import { useState, useEffect } from 'react';
import { getRatings } from '@/lib/api';
import type { AIRating } from '@/lib/types';

// ---------------------------------------------------------------------------
// Module-level singleton state — shared across all component instances.
// Only a single fetch cycle runs regardless of how many components mount.
// ---------------------------------------------------------------------------

let _ratings: AIRating[] | null = null;
let _loading = true;
let _error: string | null = null;
let _listeners = new Set<() => void>();
let _timerRef: ReturnType<typeof setInterval> | null = null;
let _refCount = 0;
let _fetchInFlight = false;

async function _doFetch(): Promise<void> {
  if (_fetchInFlight) return;
  _fetchInFlight = true;
  try {
    const data = await getRatings();
    _ratings = data;
    _loading = false;
    _error = null;
  } catch (err) {
    _error = err instanceof Error ? err.message : 'Failed to load ratings';
    _loading = false;
  } finally {
    _fetchInFlight = false;
  }
  _listeners.forEach((fn) => fn());
}

function _subscribe(listener: () => void): () => void {
  _listeners.add(listener);
  _refCount++;
  if (_refCount === 1) {
    _doFetch();
    _timerRef = setInterval(_doFetch, 30_000);
  }
  return () => {
    _listeners.delete(listener);
    _refCount--;
    if (_refCount === 0 && _timerRef !== null) {
      clearInterval(_timerRef);
      _timerRef = null;
      _ratings = null;
      _loading = true;
      _error = null;
    }
  };
}

export interface UseRatingsResult {
  data: AIRating[] | null;
  loading: boolean;
  error: string | null;
}

/**
 * Shared hook that provides AI ratings data via a module-level singleton.
 * Only one fetch cycle is active regardless of how many components call this hook.
 *
 * @param options.enabled - Set to false to skip fetching (for prop-driven components).
 *   Defaults to true.
 */
export function useRatings(options?: { enabled?: boolean }): UseRatingsResult {
  const enabled = options?.enabled !== false;
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = _subscribe(() => forceUpdate((n) => n + 1));
    return unsubscribe;
  }, [enabled]);

  if (!enabled) {
    return { data: null, loading: false, error: null };
  }

  return { data: _ratings, loading: _loading, error: _error };
}

/** @internal Exposed for unit tests only — resets module-level singleton state. */
export function _resetForTesting(): void {
  if (_timerRef !== null) {
    clearInterval(_timerRef);
    _timerRef = null;
  }
  _ratings = null;
  _loading = true;
  _error = null;
  _listeners = new Set();
  _refCount = 0;
  _fetchInFlight = false;
}
