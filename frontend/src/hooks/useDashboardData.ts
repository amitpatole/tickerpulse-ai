'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getDashboardSummary, getRatings, getAlerts, getNews } from '@/lib/api';
import type { AIRating, Alert, NewsArticle, DashboardSummary } from '@/lib/types';

export interface DashboardData {
  ratings: AIRating[] | null;
  alerts: Alert[] | null;
  news: NewsArticle[] | null;
  summary: DashboardSummary | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Shared hook that batch-fetches /api/ai/ratings, /api/alerts, /api/news,
 * and /api/dashboard/summary in a single coordinated round-trip on mount,
 * then refreshes each dataset on its own interval.  Components that consume
 * this hook receive pre-fetched data as props instead of making their own
 * redundant API calls.
 *
 * Refresh intervals:
 *   ratings  → 30s (driven by background price+rating job cadence)
 *   alerts   → 30s
 *   news     → 60s
 *   summary  → 60s (KPI counts change infrequently)
 */
export function useDashboardData(): DashboardData {
  const [ratings, setRatings] = useState<AIRating[] | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [news, setNews] = useState<NewsArticle[] | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);

    // Fire all four in parallel; treat alerts/news/summary failures as non-fatal
    const [ratingsResult, alertsResult, newsResult, summaryResult] = await Promise.allSettled([
      getRatings(),
      getAlerts(),
      getNews(),
      getDashboardSummary(),
    ]);

    if (!mountedRef.current) return;

    if (ratingsResult.status === 'fulfilled') {
      setRatings(ratingsResult.value);
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

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();

    const ratingsTimer = setInterval(() => {
      if (!mountedRef.current) return;
      getRatings()
        .then((data) => { if (mountedRef.current) setRatings(data); })
        .catch(() => {});
    }, 30_000);

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
      mountedRef.current = false;
      clearInterval(ratingsTimer);
      clearInterval(alertsTimer);
      clearInterval(newsTimer);
      clearInterval(summaryTimer);
    };
  }, [fetchAll]);

  return { ratings, alerts, news, summary, loading, error, refetch: fetchAll };
}
