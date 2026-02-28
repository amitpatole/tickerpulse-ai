'use client';

import { useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import { getEarnings } from '@/lib/api';
import type { EarningsEvent, EarningsResponse } from '@/lib/types';

const EARNINGS_REFRESH_MS = 15 * 60 * 1000; // 15 minutes

export interface UseEarningsResult {
  upcoming: EarningsEvent[];
  past: EarningsEvent[];
  stale: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches earnings calendar data split into upcoming and past arrays.
 * Refreshes every 15 minutes since earnings data is not real-time.
 *
 * @param watchlistId - Optional watchlist ID to scope results to that watchlist's tickers.
 * @param days - Number of calendar days to look ahead (upcoming) and back (past). Default 30.
 */
export function useEarnings(watchlistId?: number, days = 30): UseEarningsResult {
  const fetcher = useCallback(
    () => getEarnings({ days, watchlist_id: watchlistId }),
    [days, watchlistId],
  );

  const { data, loading, error, refetch } = useApi<EarningsResponse>(
    fetcher,
    [days, watchlistId],
    { refreshInterval: EARNINGS_REFRESH_MS },
  );

  return {
    upcoming: data?.upcoming ?? [],
    past: data?.past ?? [],
    stale: data?.stale ?? false,
    isLoading: loading,
    error,
    refetch,
  };
}