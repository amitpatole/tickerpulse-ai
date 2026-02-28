```typescript
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
 * Unknown values are silently dropped on read; if the resulting list would be
 * empty the defaults are restored instead.
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
      const valid = parsed.filter((v): v is Timeframe =>
        validTimeframes.includes(v as Timeframe),
      );
      return valid.length > 0 ? valid : defaultTimeframes;
    } catch {
      return defaultTimeframes;
    }
  });

  const setTimeframes = useCallback(
    (tfs: Timeframe[]) => {
      localStorage.setItem(storageKey, JSON.stringify(tfs));
      setTimeframesState(tfs);
    },
    [storageKey],
  );

  return [timeframes, setTimeframes];
}
```