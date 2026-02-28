```ts
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
    const stored = localStorage.getItem(storageKey);
    return validTimeframes.includes(stored as Timeframe)
      ? (stored as Timeframe)
      : defaultTimeframe;
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
```