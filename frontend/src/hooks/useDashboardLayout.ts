'use client';

import { useCallback } from 'react';
import { usePersistedState } from './usePersistedState';

const STATE_KEY = 'dashboard.layout';

export interface DashboardLayout {
  columns?: 1 | 2 | 3;
  sortBy?: 'name' | 'price' | 'change' | 'rating';
  sortDir?: 'asc' | 'desc';
}

const DEFAULT_LAYOUT: Required<DashboardLayout> = {
  columns: 3,
  sortBy: 'rating',
  sortDir: 'desc',
};

export interface UseDashboardLayoutResult {
  layout: Required<DashboardLayout>;
  setLayout: (patch: Partial<DashboardLayout>) => void;
  isLoading: boolean;
}

export function useDashboardLayout(): UseDashboardLayoutResult {
  const { getState, setState, isLoading } = usePersistedState();

  const persisted = getState<DashboardLayout>(STATE_KEY);
  const layout: Required<DashboardLayout> = {
    ...DEFAULT_LAYOUT,
    ...(persisted ?? {}),
  };

  const setLayout = useCallback(
    (patch: Partial<DashboardLayout>) => {
      const current = getState<DashboardLayout>(STATE_KEY) ?? {};
      setState(STATE_KEY, { ...current, ...patch });
    },
    [getState, setState],
  );

  return { layout, setLayout, isLoading };
}
