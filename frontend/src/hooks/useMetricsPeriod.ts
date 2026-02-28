'use client';

import { useCallback } from 'react';
import { usePersistedState } from './usePersistedState';

const STATE_KEY = 'metrics.period';
const DEFAULT_DAYS = 30;
const VALID_DAYS = [7, 14, 30, 90] as const;

type PeriodDays = (typeof VALID_DAYS)[number];

function isValidPeriod(v: number): v is PeriodDays {
  return (VALID_DAYS as readonly number[]).includes(v);
}

export interface UseMetricsPeriodResult {
  days: PeriodDays;
  setDays: (d: number) => void;
  isLoading: boolean;
}

export function useMetricsPeriod(): UseMetricsPeriodResult {
  const { getState, setState, isLoading } = usePersistedState();

  const persisted = getState<{ days: number }>(STATE_KEY);
  const raw = persisted?.days ?? DEFAULT_DAYS;
  const days: PeriodDays = isValidPeriod(raw) ? raw : DEFAULT_DAYS;

  const setDays = useCallback(
    (d: number) => {
      const safe: PeriodDays = isValidPeriod(d) ? d : DEFAULT_DAYS;
      setState(STATE_KEY, { days: safe });
    },
    [setState],
  );

  return { days, setDays, isLoading };
}
