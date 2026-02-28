'use client';

import { useState, useCallback } from 'react';
import type { Timeframe } from '@/lib/types';

/**
 * Thin hook that reads/writes a chart timeframe selection to localStorage.
 * Falls back to `defaultTimeframe` if the stored value is absent or invalid.
 */
export function useChartTimeframe(
  storageKey: string,
  defaultTimeframe: Timeframe,
  validTimeframes: Timeframe[],
): [Timeframe, (tf: Timeframe) => void] {
  const [timeframe, setTimeframeState] = useState<Timeframe>(() => {
    if (typeof window === 'undefined') return defaultTimeframe;
    try {
      const stored = localStorage.getItem(storageKey);
      return validTimeframes.includes(stored as Timeframe)
        ? (stored as Timeframe)
        : defaultTimeframe;
    } catch {
      return defaultTimeframe;
    }
  });

  const setTimeframe = useCallback(
    (tf: Timeframe) => {
      localStorage.setItem(storageKey, tf);
      setTimeframeState(tf);
    },
    [storageKey],
  );

  return [timeframe, setTimeframe];
}

/**
 * Array variant of `useChartTimeframe` — reads/writes an ordered list of
 * timeframe selections persisted as a JSON array.
 * Unknown values are silently dropped on read; the resulting list is clamped
 * to min 2 / max 4 entries. If fewer than 2 valid values remain the defaults
 * are restored instead.
 */
export function useChartTimeframes(
  storageKey: string,
  defaultTimeframes: Timeframe[],
  validTimeframes: Timeframe[],
): [Timeframe[], (tfs: Timeframe[]) => void] {
  const [timeframes, setTimeframesState] = useState<Timeframe[]>(() => {
    if (typeof window === 'undefined') return defaultTimeframes;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return defaultTimeframes;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return defaultTimeframes;
      const valid = parsed
        .filter((v): v is Timeframe => validTimeframes.includes(v as Timeframe))
        .slice(0, 4); // clamp to max 4
      return valid.length >= 2 ? valid : defaultTimeframes; // enforce min 2
    } catch {
      return defaultTimeframes;
    }
  });

  const setTimeframes = useCallback(
    (tfs: Timeframe[]) => {
      const clamped = tfs.slice(0, 4); // clamp to max 4
      localStorage.setItem(storageKey, JSON.stringify(clamped));
      setTimeframesState(clamped);
    },
    [storageKey],
  );

  return [timeframes, setTimeframes];
}
