'use client';

import { useState, useEffect } from 'react';
import { fetchHealth } from '@/lib/api';
import type { HealthResponse } from '@/lib/types';

const POLL_INTERVAL_MS = 30_000;

/**
 * Module-level singleton — shared across all component instances.
 * Only one fetch cycle and one interval timer run regardless of mount count.
 */
let _data: HealthResponse | null = null;
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
    _data = await fetchHealth();
    _loading = false;
    _error = null;
  } catch (err) {
    _error = err instanceof Error ? err.message : 'Health check failed';
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
    _timerRef = setInterval(_doFetch, POLL_INTERVAL_MS);
  }
  return () => {
    _listeners.delete(listener);
    _refCount--;
    if (_refCount === 0 && _timerRef !== null) {
      clearInterval(_timerRef);
      _timerRef = null;
      _data = null;
      _loading = true;
      _error = null;
    }
  };
}

export interface UseHealthResult {
  data: HealthResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Polls GET /api/health every 30 seconds and returns the latest result.
 * Uses a module-level singleton so only one request is in flight at a time,
 * and the timer is automatically cleared when the last subscriber unmounts.
 */
export function useHealth(): UseHealthResult {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const unsubscribe = _subscribe(() => forceUpdate((n) => n + 1));
    return unsubscribe;
  }, []);

  return { data: _data, loading: _loading, error: _error, refetch: _doFetch };
}

/** @internal Exposed for unit tests only — resets all module-level singleton state. */
export function _resetForTesting(): void {
  if (_timerRef !== null) {
    clearInterval(_timerRef);
    _timerRef = null;
  }
  _data = null;
  _loading = true;
  _error = null;
  _listeners = new Set();
  _refCount = 0;
  _fetchInFlight = false;
}
