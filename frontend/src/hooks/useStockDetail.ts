'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { useSSE } from '@/hooks/useSSE';
import { getStockDetail } from '@/lib/api';
import type { StockDetail, PriceUpdateEvent, Timeframe, AIRatingBlock } from '@/lib/types';

export interface UseStockDetailResult {
  data: StockDetail | null;
  loading: boolean;
  error: string | null;
  livePrice: PriceUpdateEvent | null;
  aiRating: AIRatingBlock | null;
  refetch: () => void;
}

/**
 * Encapsulates fetching a single stock's detail page data (quote, candles,
 * indicators, news) and layering live SSE price updates on top without
 * triggering a full refetch on every tick.
 *
 * - `snapshot` and relevant `news` events trigger a full refetch.
 * - `price_update` events for the watched ticker update `livePrice` in-place.
 * - `livePrice` is cleared whenever a full data refresh completes.
 */
export function useStockDetail(
  ticker: string,
  timeframe: Timeframe = '1M',
): UseStockDetailResult {
  const enabled = !!ticker.trim();
  const upperTicker = ticker.toUpperCase();

  const fetcher = useCallback(
    () => getStockDetail(upperTicker, timeframe),
    [upperTicker, timeframe],
  );

  const { data, loading, error, refetch } = useApi<StockDetail>(
    fetcher,
    [upperTicker, timeframe],
    { enabled },
  );

  const [livePrice, setLivePrice] = useState<PriceUpdateEvent | null>(null);
  const { lastEvent } = useSSE();

  useEffect(() => {
    if (!enabled || !lastEvent) return;

    if (lastEvent.type === 'snapshot') {
      refetch();
      return;
    }

    if (lastEvent.type === 'news') {
      const eventData = lastEvent.data as Record<string, unknown> | null | undefined;
      const eventTicker = (eventData?.ticker as string | undefined)?.toUpperCase();
      if (eventTicker === upperTicker) refetch();
      return;
    }

    if (lastEvent.type === 'price_update') {
      const eventData = lastEvent.data as Record<string, unknown> | null | undefined;
      const eventTicker = (eventData?.ticker as string | undefined)?.toUpperCase();
      if (eventTicker === upperTicker) {
        setLivePrice(lastEvent.data as unknown as PriceUpdateEvent);
      }
    }
  }, [lastEvent, refetch, upperTicker, enabled]);

  // Clear live price overlay when the underlying data refreshes
  useEffect(() => {
    setLivePrice(null);
  }, [data]);

  const aiRating = data?.ai_rating ?? null;

  return { data: data ?? null, loading, error, livePrice, aiRating, refetch };
}