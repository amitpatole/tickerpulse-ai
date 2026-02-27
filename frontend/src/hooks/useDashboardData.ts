```typescript
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getDashboardSummary, getRatings, getAlerts, getNews, getRefreshInterval } from '@/lib/api';
import type { AIRating, Alert, NewsArticle, DashboardSummary, PriceUpdate } from '@/lib/types';
import { useWSPrices } from './useWSPrices';
import type { WSStatus } from './useWSPrices';

export interface DashboardData {
  ratings: AIRating[] | null;
  alerts: Alert[] | null;
  news: NewsArticle[] | null;
  summary: DashboardSummary | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  wsStatus?: WSStatus;
  wsConnected?: boolean;
  lastPriceAt?: string | null;
}

/**
 * Shared hook that batch-fetches /api/ai/ratings, /api/alerts, /api/news,
 * and /api/dashboard/summary in a single coordinated round-trip on mount,
 * then refreshes each dataset on its own interval.  Components that consume
 * this hook receive pre-fetched data as props instead of making their own
 * redundant API calls.
 *
 * Live price updates are delivered via WebSocket (/api/ws/prices) and merged
 * into the ratings array in-place (by ticker) without a full refetch.
 * Sort order is never disturbed — only price fields are overwritten.
 *
 * @param activeWatchlistId - Optional watchlist ID to scope ratings fetch.
 *   When changed, only ratings are re-fetched (not alerts/news/summary),
 *   so tab switches are fast and don't reload the entire dashboard.
 *
 * Refresh intervals:
 *   ratings  → server-configured (default 30s) — full AI score sync
 *   alerts   → 30s
 *   news     → 60s
 *   summary  → 60s (KPI counts change infrequently)
 */
export function useDashboardData(activeWatchlistId?: number): DashboardData {
  const [ratings, setRatings] = useState<AIRating[] | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [news, setNews] = useState<NewsArticle[] | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastPriceAt, setLastPriceAt] = useState<string | null>(null);
  // Separate ticker list for WebSocket subscription; only updated on full ratings sync
  // so live price merges never trigger re-subscriptions.
  const [wsTickers, setWsTickers] = useState<string[]>([]);
  // Server-driven polling interval for ratings; separate state so timers re-create on change
  const [ratingsInterval, setRatingsInterval] = useState(30_000);
  const mountedRef = useRef(true);
  // Keep latest watchlistId accessible inside polling timer closure without recreating the timer
  const watchlistIdRef = useRef(activeWatchlistId);

  // Sync watchlistIdRef to the latest prop value
  useEffect(() => {
    watchlistIdRef.current = activeWatchlistId;
  });

  const fetchAll = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);

    // Fire all four in parallel; treat alerts/news/summary failures as non-fatal
    const [ratingsResult, alertsResult, newsResult, summaryResult] = await Promise.allSettled([
      getRatings(watchlistIdRef.current),
      getAlerts(),
      getNews(),
      getDashboardSummary(),
    ]);

    if (!mountedRef.current) return;

    if (ratingsResult.status === 'fulfilled') {
      setRatings(ratingsResult.value);
      setWsTickers(ratingsResult.value.map((r) => r.ticker));
    } else {
      const msg = ratingsResult.reason instanceof Error
        ? ratingsResult.reason.message
        : 'Failed to load ratings';
      setError(msg);
    }

    if (alertsResult.status === 'fulfilled') {
      setAlerts(alertsResult.value);
    }

    if (newsResult.status === 'fulfilled') {
      setNews(newsResult.value);
    }

    if (summaryResult.status === 'fulfilled') {
      setSummary(summaryResult.value);
    }

    setLoading(false);
  }, []);

  // Merge a live price_update from WebSocket into the matching ratings entry.
  // Only price fields are replaced — score, confidence, rating, and all other
  // AI fields are untouched so sort order computed from base values is preserved.
  const handlePriceUpdate = useCallback((update: PriceUpdate) => {
    if (!mountedRef.current) return;
    setLastPriceAt(update.timestamp);
    setRatings((prev) => {
      if (!prev) return prev;
      const idx = prev.findIndex((r) => r.ticker === update.ticker);
      if (idx === -1) return prev; // Unknown ticker — do not mutate
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        current_price: update.price,
        price_change: update.change,
        price_change_pct: update.change_pct,
        updated_at: update.timestamp,
      };
      return next;
    });
  }, []);

  // WebSocket subscription — uses stable wsTickers list so price merges don't
  // trigger re-subscriptions on every update
  const { status: wsStatus } = useWSPrices({ tickers: wsTickers, onPriceUpdate: handlePriceUpdate });
  const wsConnected = wsStatus === 'open';

  // Mount: initial fetch + read server-configured refresh interval
  useEffect(() => {
    mountedRef.current = true;
    fetchAll();

    getRefreshInterval()
      .then((config) => {
        if (mountedRef.current && config.interval > 0) {
          setRatingsInterval(config.interval * 1_000);
        }
      })
      .catch(() => {});

    return () => {
      mountedRef.current = false;
    };
  }, [fetchAll]);

  // When activeWatchlistId changes after the initial mount, re-fetch ratings
  // only — not the full 4-endpoint suite.  This makes watchlist tab switches
  // fast without disrupting alerts, news, or summary panels.
  const skipFirstWatchlistEffect = useRef(true);
  useEffect(() => {
    if (skipFirstWatchlistEffect.current) {
      skipFirstWatchlistEffect.current = false;
      return;
    }
    if (!mountedRef.current) return;
    getRatings(activeWatchlistId)
      .then((data) => {
        if (mountedRef.current) {
          setRatings(data);
          setWsTickers(data.map((r) => r.ticker));
        }
      })
      .catch((err) => {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to load ratings');
        }
      });
  }, [activeWatchlistId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling timers — re-created when ratingsInterval changes (server config update)
  useEffect(() => {
    const ratingsTimer = setInterval(() => {
      if (!mountedRef.current) return;
      getRatings(watchlistIdRef.current)
        .then((data) => {
          if (mountedRef.current) {
            setRatings(data);
            setWsTickers(data.map((r) => r.ticker));
          }
        })
        .catch(() => {});
    }, ratingsInterval);

    const alertsTimer = setInterval(() => {
      if (!mountedRef.current) return;
      getAlerts()
        .then((data) => { if (mountedRef.current) setAlerts(data); })
        .catch(() => {});
    }, 30_000);

    const newsTimer = setInterval(() => {
      if (!mountedRef.current) return;
      getNews()
        .then((data) => { if (mountedRef.current) setNews(data); })
        .catch(() => {});
    }, 60_000);

    const summaryTimer = setInterval(() => {
      if (!mountedRef.current) return;
      getDashboardSummary()
        .then((data) => { if (mountedRef.current) setSummary(data); })
        .catch(() => {});
    }, 60_000);

    return () => {
      clearInterval(ratingsTimer);
      clearInterval(alertsTimer);
      clearInterval(newsTimer);
      clearInterval(summaryTimer);
    };
  }, [ratingsInterval]);

  return {
    ratings,
    alerts,
    news,
    summary,
    loading,
    error,
    refetch: fetchAll,
    wsStatus,
    wsConnected,
    lastPriceAt,
  };
}
```