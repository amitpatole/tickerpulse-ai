'use client';

import { useState, useEffect } from 'react';
import { getMetricsSummary, getSystemMetrics } from '@/lib/api';
import type { MetricsSummary, SystemMetricsSnapshot } from '@/lib/types';

/**
 * Module-level singleton state — shared across all component instances.
 * Only a single fetch cycle runs regardless of how many components mount.
 */
let _metrics: MetricsSummary | null = null;
let _latestSnapshot: SystemMetricsSnapshot | null = null;
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
    const [summaryData, sysData] = await Promise.allSettled([
      getMetricsSummary(),
      getSystemMetrics(),
    ]);

    if (summaryData.status === 'fulfilled') {
      _metrics = summaryData.value;
    }

    if (sysData.status === 'fulfilled' && sysData.value?.snapshots?.length) {
      _latestSnapshot = sysData.value.snapshots[sysData.value.snapshots.length - 1];
    }

    _loading = false;
    _error = null;
  } catch (err) {
    _error = err instanceof Error ? err.message : 'Failed to load metrics';
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
    // Refresh metrics every 60 seconds
    _timerRef = setInterval(_doFetch, 60_000);
  }
  return () => {
    _listeners.delete(listener);
    _refCount--;
    if (_refCount === 0 && _timerRef !== null) {
      clearInterval(_timerRef);
      _timerRef = null;
      _metrics = null;
      _latestSnapshot = null;
      _loading = true;
      _error = null;
    }
  };
}

export interface UseMetricsResult {
  data: MetricsSummary | null;
  latestSnapshot: SystemMetricsSnapshot | null;
  loading: boolean;
  error: string | null;
}

/**
 * Shared hook that provides performance metrics data via a module-level singleton.
 * Only one fetch cycle is active regardless of how many components call this hook.
 * Polls both /api/metrics/summary and /api/metrics/system on a 60s interval.
 *
 * @param options.enabled - Set to false to skip fetching (for prop-driven components).
 *   Defaults to true.
 */
export function useMetrics(options?: { enabled?: boolean }): UseMetricsResult {
  const enabled = options?.enabled !== false;
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = _subscribe(() => forceUpdate((n) => n + 1));
    return unsubscribe;
  }, [enabled]);

  if (!enabled) {
    return { data: null, latestSnapshot: null, loading: false, error: null };
  }

  return { data: _metrics, latestSnapshot: _latestSnapshot, loading: _loading, error: _error };
}

/** @internal Exposed for unit tests only — resets module-level singleton state. */
export function _resetForTesting(): void {
  if (_timerRef !== null) {
    clearInterval(_timerRef);
    _timerRef = null;
  }
  _metrics = null;
  _latestSnapshot = null;
  _loading = true;
  _error = null;
  _listeners = new Set();
  _refCount = 0;
  _fetchInFlight = false;
}
