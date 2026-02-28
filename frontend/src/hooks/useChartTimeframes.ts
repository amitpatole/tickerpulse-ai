'use client';

import { useCallback } from 'react';
import type { Timeframe } from '@/lib/types';
import { usePersistedState } from './usePersistedState';

const STATE_KEY = 'vo_chart_multi_timeframes';
const MIN_SELECTED = 2;
const MAX_SELECTED = 4;
const DEFAULT_TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M'];

// Timeframes are persisted as { timeframes: Timeframe[] } so the value is
// always a JSON object — required by the PATCH /api/app-state API contract.
interface PersistedTimeframes {
  timeframes?: Timeframe[];
}

function isValidTimeframeArray(val: unknown): val is Timeframe[] {
  return Array.isArray(val) && val.length >= MIN_SELECTED;
}

export interface UseChartTimeframesResult {
  selected: Timeframe[];
  toggle: (tf: Timeframe) => void;
  canDeselect: (tf: Timeframe) => boolean;
  canSelect: (tf: Timeframe) => boolean;
  isLoading: boolean;
}

export function useChartTimeframes(): UseChartTimeframesResult {
  const { getState, setState, isLoading } = usePersistedState();

  const raw = getState<PersistedTimeframes>(STATE_KEY);
  const selected: Timeframe[] = isValidTimeframeArray(raw?.timeframes)
    ? raw!.timeframes!
    : DEFAULT_TIMEFRAMES;

  const toggle = useCallback(
    (tf: Timeframe) => {
      const stored = getState<PersistedTimeframes>(STATE_KEY);
      const current = isValidTimeframeArray(stored?.timeframes)
        ? stored!.timeframes!
        : DEFAULT_TIMEFRAMES;

      if (current.includes(tf)) {
        if (current.length <= MIN_SELECTED) return;
        setState(STATE_KEY, { timeframes: current.filter((t) => t !== tf) });
      } else {
        if (current.length >= MAX_SELECTED) return;
        setState(STATE_KEY, { timeframes: [...current, tf] });
      }
    },
    [getState, setState],
  );

  const canDeselect = useCallback(
    (tf: Timeframe) => selected.includes(tf) && selected.length > MIN_SELECTED,
    [selected],
  );

  const canSelect = useCallback(
    (tf: Timeframe) => !selected.includes(tf) && selected.length < MAX_SELECTED,
    [selected],
  );

  return { selected, toggle, canDeselect, canSelect, isLoading };
}
