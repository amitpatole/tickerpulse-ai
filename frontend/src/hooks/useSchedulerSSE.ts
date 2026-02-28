'use client';

import { useEffect, useRef } from 'react';
import { useSSE } from '@/hooks/useSSE';
import type { JobCompleteEvent } from '@/lib/types';

export interface UseSchedulerSSEReturn {
  lastCompletedJob: JobCompleteEvent | null;
  recentJobCompletes: JobCompleteEvent[];
  connected: boolean;
}

/**
 * Wraps the shared useSSE hook to expose scheduler-relevant state and fire a
 * callback only for job_complete events that arrive *after* mount (skips the
 * pre-existing buffer that useSSE hydrates from on first render).
 *
 * Uses the same single EventSource connection as every other SSE consumer —
 * no duplicate connections are created.
 */
export function useSchedulerSSE(
  onJobComplete?: (event: JobCompleteEvent) => void
): UseSchedulerSSEReturn {
  const { recentJobCompletes, connected } = useSSE();

  // Keep a stable ref to the latest callback so the effect doesn't need to
  // re-run when the callback identity changes.
  const callbackRef = useRef(onJobComplete);
  callbackRef.current = onJobComplete;

  // Track whether we have seen the initial snapshot from useSSE.
  const initializedRef = useRef(false);
  // The set of events that were already present at mount time.
  const prevCompletesRef = useRef<JobCompleteEvent[]>([]);

  useEffect(() => {
    // On the first run, record the pre-existing events and mark as initialized.
    if (!initializedRef.current) {
      prevCompletesRef.current = recentJobCompletes;
      initializedRef.current = true;
      return;
    }

    // On subsequent runs, find events that weren't in the previous snapshot.
    const newEvents = recentJobCompletes.filter(
      (e) => !prevCompletesRef.current.includes(e)
    );
    prevCompletesRef.current = recentJobCompletes;

    for (const event of newEvents) {
      callbackRef.current?.(event);
    }
  }, [recentJobCompletes]);

  return {
    lastCompletedJob: recentJobCompletes[0] ?? null,
    recentJobCompletes,
    connected,
  };
}
