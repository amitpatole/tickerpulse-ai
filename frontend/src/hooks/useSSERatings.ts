'use client';

import { useState, useEffect, useRef } from 'react';
import type { AIRating } from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

// ---------------------------------------------------------------------------
// Module-level singleton SSE connection — shared across all component instances.
// Only one EventSource is created regardless of how many components call this hook.
// ---------------------------------------------------------------------------

type RatingUpdateHandler = (update: Partial<AIRating>) => void;

let _es: EventSource | null = null;
let _handlers = new Set<RatingUpdateHandler>();
let _sseRefCount = 0;

function _subscribeSSE(onUpdate: RatingUpdateHandler): () => void {
  _handlers.add(onUpdate);
  _sseRefCount++;

  if (_sseRefCount === 1) {
    const es = new EventSource(`${API_BASE}/api/stream`);
    _es = es;
    es.addEventListener('rating_update', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as Partial<AIRating>;
        if (!data.ticker) return;
        _handlers.forEach((fn) => fn(data));
      } catch {
        // Ignore malformed events
      }
    });
  }

  return () => {
    _handlers.delete(onUpdate);
    _sseRefCount--;
    if (_sseRefCount === 0 && _es !== null) {
      _es.close();
      _es = null;
    }
  };
}

/**
 * Merges live `rating_update` SSE events into a base ratings array by ticker key.
 *
 * Uses a module-level singleton EventSource so only one SSE connection is open
 * regardless of how many components call this hook.
 *
 * When `baseRatings` changes (next poll cycle), local state resets to the fresh
 * data so stale SSE overrides don't accumulate.
 */
export function useSSERatings(baseRatings: AIRating[] | null): AIRating[] | null {
  const [mergedRatings, setMergedRatings] = useState<AIRating[] | null>(baseRatings);
  const baseRef = useRef(baseRatings);

  // Reset merged state when the polling hook delivers a fresh base dataset
  useEffect(() => {
    if (baseRatings !== baseRef.current) {
      baseRef.current = baseRatings;
      setMergedRatings(baseRatings);
    }
  }, [baseRatings]);

  useEffect(() => {
    const unsubscribe = _subscribeSSE((update) => {
      setMergedRatings((prev) => {
        if (!prev) return prev;
        const idx = prev.findIndex((r) => r.ticker === update.ticker);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], ...update };
        return next;
      });
    });
    return unsubscribe;
  }, []);

  return mergedRatings;
}

/** @internal Exposed for unit tests only — resets module-level SSE singleton state. */
export function _resetSSEForTesting(): void {
  if (_es !== null) {
    _es.close();
    _es = null;
  }
  _handlers = new Set();
  _sseRefCount = 0;
}
