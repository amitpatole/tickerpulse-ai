'use client';

import { useCallback } from 'react';
import type React from 'react';
import { clsx } from 'clsx';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { getStockSentiment } from '@/lib/api';
import { formatDate } from '@/lib/formatTime';
import type { SentimentData, TimezoneMode } from '@/lib/types';

interface SentimentBadgeProps {
  ticker: string;
  tz?: TimezoneMode;
}

const LABEL_CLASSES: Record<SentimentData['label'], string> = {
  bullish: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  neutral: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  bearish: 'bg-red-500/15 text-red-400 border-red-500/30',
};

function formatScore(score: number | null): string {
  if (score == null) return '—';
  return (score >= 0 ? '+' : '') + score.toFixed(2);
}

function isStaleData(data: SentimentData): boolean {
  if (data.stale) return true;
  const ageMs = Date.now() - new Date(data.updated_at).getTime();
  return ageMs > 15 * 60 * 1000;
}

const TREND_ICON: Record<NonNullable<SentimentData['trend']>, React.ReactNode> = {
  up: <TrendingUp size={12} aria-hidden="true" />,
  flat: <Minus size={12} aria-hidden="true" />,
  down: <TrendingDown size={12} aria-hidden="true" />,
};

const TREND_CLASSES: Record<NonNullable<SentimentData['trend']>, string> = {
  up: 'text-emerald-400',
  flat: 'text-slate-400',
  down: 'text-red-400',
};

function buildSourceLine(sources: SentimentData['sources']): string {
  const parts: string[] = [];
  if (sources.news > 0) parts.push(`${sources.news} News`);
  if (sources.reddit > 0) parts.push(`${sources.reddit} Reddit`);
  if (sources.stocktwits > 0) parts.push(`${sources.stocktwits} StockTwits`);
  return parts.join(' · ');
}

export default function SentimentBadge({ ticker, tz = 'local' }: SentimentBadgeProps) {
  const fetcher = useCallback(() => getStockSentiment(ticker), [ticker]);
  const { data, loading } = useApi(fetcher, [ticker]);

  if (loading) {
    return (
      <div
        className="h-7 w-28 animate-pulse rounded-full bg-slate-800"
        aria-label="Loading sentiment"
      />
    );
  }

  if (!data) {
    return <span className="text-sm text-slate-500">No sentiment data</span>;
  }

  const stale = isStaleData(data);
  const labelText = data.label.charAt(0).toUpperCase() + data.label.slice(1);
  const sourceLine = buildSourceLine(data.sources);
  const trend = data.trend ?? 'flat';
  const tooltip = [
    `${data.signal_count} signals`,
    `News: ${data.sources.news}, Reddit: ${data.sources.reddit}, StockTwits: ${data.sources.stocktwits}`,
    `Score: ${formatScore(data.score)}`,
    `Trend (24h): ${trend}`,
    `Updated: ${formatDate(data.updated_at, tz)}`,
    stale ? 'Data may be stale' : '',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    // suppressHydrationWarning: tooltip contains a local-timezone date string;
    // SSR (UTC) and browser (user TZ) may produce different values (VO-786).
    <div className="flex items-center gap-2" title={tooltip} suppressHydrationWarning>
      <span
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
          LABEL_CLASSES[data.label]
        )}
        aria-label={`Sentiment: ${labelText}, trend ${trend}`}
      >
        {stale && <span aria-hidden="true">⚠</span>}
        <span className={TREND_CLASSES[trend]}>{TREND_ICON[trend]}</span>
        {labelText}
        <span className="font-mono opacity-80">{formatScore(data.score)}</span>
      </span>
      {sourceLine && (
        <span className="text-xs text-slate-500">{sourceLine}</span>
      )}
    </div>
  );
}