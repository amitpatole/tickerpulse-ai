'use client';

import { useCallback } from 'react';
import { usePersistedState } from './usePersistedState';

const STATE_KEY = 'dashboard.refreshInterval';

export interface UseRefreshIntervalResult {
  seconds: number | undefined;
  setSeconds: (s: number) => void;
  isLoading: boolean;
}

export function useRefreshInterval(): UseRefreshIntervalResult {
  const { getState, setState, isLoading } = usePersistedState();

  const persisted = getState<{ seconds: number }>(STATE_KEY);
  const seconds = persisted?.seconds;

  const setSeconds = useCallback(
    (s: number) => setState(STATE_KEY, { seconds: s }),
    [setState],
  );

  return { seconds, setSeconds, isLoading };
}
