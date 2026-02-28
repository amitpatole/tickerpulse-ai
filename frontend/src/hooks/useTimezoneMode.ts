'use client';

import { useCallback } from 'react';
import type { TimezoneMode } from '@/lib/types';
import { usePersistedState } from './usePersistedState';

const STATE_KEY = 'timezone';
const DEFAULT_MODE: TimezoneMode = 'local';
const VALID_MODES: readonly TimezoneMode[] = ['ET', 'local'];

function isValidMode(val: unknown): val is TimezoneMode {
  return typeof val === 'string' && (VALID_MODES as string[]).includes(val);
}

export interface UseTimezoneModeResult {
  mode: TimezoneMode;
  setMode: (mode: TimezoneMode) => void;
  isLoading: boolean;
}

export function useTimezoneMode(): UseTimezoneModeResult {
  const { getState, setState, isLoading } = usePersistedState();

  const persisted = getState<{ mode: string }>(STATE_KEY);
  const mode: TimezoneMode = isValidMode(persisted?.mode) ? persisted.mode : DEFAULT_MODE;

  const setMode = useCallback(
    (m: TimezoneMode) => setState(STATE_KEY, { mode: m }),
    [setState],
  );

  return { mode, setMode, isLoading };
}
