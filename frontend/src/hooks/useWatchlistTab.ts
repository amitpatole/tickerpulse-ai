'use client';

import { useCallback } from 'react';
import { usePersistedState } from './usePersistedState';

const STATE_KEY = 'watchlist.activeTab';

export interface UseWatchlistTabResult {
  tabId: number | undefined;
  setTabId: (id: number) => void;
  isLoading: boolean;
}

export function useWatchlistTab(): UseWatchlistTabResult {
  const { getState, setState, isLoading } = usePersistedState();

  const persisted = getState<{ id: number }>(STATE_KEY);
  const tabId = persisted?.id;

  const setTabId = useCallback(
    (id: number) => setState(STATE_KEY, { id }),
    [setState],
  );

  return { tabId, setTabId, isLoading };
}
