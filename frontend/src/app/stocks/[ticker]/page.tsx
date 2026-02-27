'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  ExternalLink,
  Clock,
  Brain,
  Activity,
  Newspaper,
} from 'lucide-react';
import { clsx } from 'clsx';
import Header from '@/components/layout/Header';
import StockPriceChart from '@/components/stocks/StockPriceChart';
import SentimentBadge from '@/components/stocks/SentimentBadge';
import FinancialsCard from '@/components/stocks/FinancialsCard';
import { useApi } from '@/hooks/useApi';
import { useSSE } from '@/hooks/useSSE';
import { getStockDetail, getRating } from '@/lib/api';
import type {
  PriceUpdateEvent,
  AIRating,
  StockDetailNewsItem,
  StockDetailIndicators,
} from '@/lib/types';
import { RATING_BG_CLASSES } from '@/lib/types';

interface StockDetailPageProps {
  params: Promise<{ ticker: string }>;
}

// ---- Helpers -----------------------------------------------------------------

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function rsiColor(rsi: number | null): string {
  if (rsi == null) return 'text-slate-500';
  if (rsi > 70) return 'text-red-400';
  if (rsi < 30) return 'text-emerald-400';
  return 'text-white';
}

function scoreBarColor(score: number): string {
  if (score >= 65) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

const SENTIMENT_BADGE_CLASSES: Record<string, string> = {
  positive: 'bg-emerald-500/15 text-emerald-400',
  bullish: 'bg-emerald-500/15 text-emerald-400',
  negative: 'bg-red-500/15 text-red-400',
  bearish: 'bg-red-500/15 text-red-400',
  neutral: 'bg-slate-500/15 text-slate-400',
};

const MACD_COLORS: Record<string, string> = {
  bullish: 'text-emerald-400',
  bearish: 'text-red-400',
  neutral: 'text-slate-400',
};

const BB_COLORS: Record<string, string> = {
  upper: 'text-emerald-400',
  lower: 'text-red-400',
  mid: 'text-slate-400',
};

// ---- Sub-components ----------------------------------------------------------

interface ScoreBarProps {
  label: string;
  value: number;
  colorClass?: string;
}

function ScoreBar({ label, value, colorClass }: ScoreBarProps) {
  const pct = Math.min(100, Math.max(0, value));
  const cls = colorClass ?? scoreBarColor(pct);
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-[10px] text-slate-400">{label}</span>
      <div
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${Math.round(pct)} out of 100`}
        className="h-1.5 flex-1 rounded-full bg-slate-700"
      >
        <div
          className={clsx('h-full rounded-full transition-[width]', cls)}
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
      <span className="w-6 shrink-0 text-right font-mono text-[10px] text-slate-300">
        {Math.round(pct)}
      </span>
    </div>
  );
}

interface NewsCardProps {
  news: StockDetailNewsItem[];
  loading: boolean;
}

function NewsCard({ news, loading }: NewsCardProps) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-700/50 px-5 py-3">
        <Newspaper className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-white">Recent News</h2>
      </div>

      {loading && (
        <div className="space-y-4 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse space-y-1.5">
              <div className="h-3 w-3/4 rounded bg-slate-800" />
              <div className="h-2.5 w-1/3 rounded bg-slate-800" />
            </div>
          ))}
        </div>
      )}

      {!loading && news.length === 0 && (
        <p className="px-5 py-8 text-center text-sm text-slate-500">No recent news found.</p>
      )}

      {!loading && news.length > 0 && (
        <div className="divide-y divide-slate-700/30">
          {news.map((item, i) => (
            <div
              key={i}
              className="px-5 py-3 transition-colors hover:bg-slate-800/40"
            >
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-1.5"
                >
                  <p className="flex-1 text-sm text-slate-200 line-clamp-2 transition-colors group-hover:text-blue-400">
                    {item.title}
                  </p>
                  <ExternalLink
                    className="mt-0.5 h-3 w-3 shrink-0 text-slate-600 transition-colors group-hover:text-blue-400"
                    aria-hidden="true"
                  />
                </a>
              ) : (
                <p className="text-sm text-slate-200 line-clamp-2">{item.title}</p>
              )}

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {item.sentiment_label && (
                  <span
                    className={clsx(
                      'rounded px-1.5 py-0.5 text-[10px] font-medium capitalize',
                      SENTIMENT_BADGE_CLASSES[item.sentiment_label] ??
                        'bg-slate-500/15 text-slate-400'
                    )}
                  >
                    {item.sentiment_label}
                  </span>
                )}
                {item.source && (
                  <span className="text-[10px] text-slate-500">{item.source}</span>
                )}
                {item.published_date && (
                  <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
                    <Clock className="h-2.5 w-2.5" aria-hidden="true" />
                    {timeAgo(item.published_date)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface AIAnalysisCardProps {
  ticker: string;
}

function AIAnalysisCard({ ticker }: AIAnalysisCardProps) {
  const fetcher = useCallback(() => getRating(ticker), [ticker]);
  const { data: rating, loading, error } = useApi<AIRating>(fetcher, [ticker]);

  const badgeClass =
    rating
      ? (RATING_BG_CLASSES[rating.rating] ?? 'bg-slate-500/20 text-slate-400 border-slate-500/30')
      : '';

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
        <Brain className="h-3.5 w-3.5 text-purple-400" aria-hidden="true" />
        AI Analysis
      </h2>

      {loading && (
        <div className="space-y-3" aria-busy="true">
          <div className="h-7 w-28 animate-pulse rounded-full bg-slate-800" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-slate-800" />
            ))}
          </div>
        </div>
      )}

      {!loading && (error || !rating) && (
        <p className="text-sm text-slate-500">Analysis unavailable.</p>
      )}

      {rating && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span
              className={clsx(
                'rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
                badgeClass
              )}
            >
              {rating.rating.replace(/_/g, ' ')}
            </span>
            {rating.updated_at && (
              <span className="text-[10px] text-slate-500">{timeAgo(rating.updated_at)}</span>
            )}
          </div>

          <div className="space-y-2.5">
            <ScoreBar
              label="AI Score"
              value={Math.min(100, Math.max(0, rating.score))}
            />
            <ScoreBar
              label="Confidence"
              value={Math.round(rating.confidence * 100)}
              colorClass="bg-blue-500"
            />
            {rating.technical_score != null && (
              <ScoreBar
                label="Technical"
                value={rating.technical_score}
                colorClass="bg-cyan-500"
              />
            )}
            {rating.fundamental_score != null && (
              <ScoreBar
                label="Fundamental"
                value={rating.fundamental_score}
                colorClass="bg-violet-500"
              />
            )}
          </div>

          {(rating.sentiment_label || rating.sector) && (
            <div className="grid grid-cols-2 gap-3 border-t border-slate-700/30 pt-3">
              {rating.sentiment_label && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Sentiment</p>
                  <p className="mt-0.5 text-sm font-semibold capitalize text-white">
                    {rating.sentiment_label}
                  </p>
                </div>
              )}
              {rating.sector && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Sector</p>
                  <p className="mt-0.5 truncate text-sm text-white">{rating.sector}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface TechnicalIndicatorsCardProps {
  indicators: StockDetailIndicators;
}

function TechnicalIndicatorsCard({ indicators }: TechnicalIndicatorsCardProps) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <Activity className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
        Technical Signals
      </h2>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">RSI</p>
          <p className={clsx('mt-0.5 font-mono text-sm font-semibold', rsiColor(indicators.rsi))}>
            {indicators.rsi != null ? indicators.rsi.toFixed(1) : '—'}
          </p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">MACD</p>
          <p
            className={clsx(
              'mt-0.5 text-sm font-semibold capitalize',
              MACD_COLORS[indicators.macd_signal] ?? 'text-slate-400'
            )}
          >
            {indicators.macd_signal}
          </p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">BB Band</p>
          <p
            className={clsx(
              'mt-0.5 text-sm font-semibold capitalize',
              BB_COLORS[indicators.bb_position] ?? 'text-slate-400'
            )}
          >
            {indicators.bb_position}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---- Page --------------------------------------------------------------------

export default function StockDetailPage({ params }: StockDetailPageProps) {
  const router = useRouter();
  const { ticker } = use(params);
  const isInvalidTicker = !ticker || !ticker.trim();
  const upperTicker = isInvalidTicker ? '' : ticker.toUpperCase();

  useEffect(() => {
    if (isInvalidTicker) {
      router.replace('/?error=missing-ticker');
    }
  }, [isInvalidTicker, router]);

  // Fetch quote + candles + indicators + news with default 1M timeframe.
  // StockPriceChart owns its own timeframe state independently.
  const fetcher = useCallback(() => getStockDetail(upperTicker, '1M'), [upperTicker]);
  const { data, loading, error, refetch } = useApi(fetcher, [upperTicker], {
    enabled: !isInvalidTicker,
  });

  // Live price overlay from SSE — applied without triggering a full refetch.
  const [livePriceData, setLivePriceData] = useState<PriceUpdateEvent | null>(null);

  const { lastEvent } = useSSE();
  useEffect(() => {
    if (isInvalidTicker || !lastEvent) return;
    if (lastEvent.type === 'snapshot') {
      refetch();
      return;
    }
    if (lastEvent.type === 'news') {
      const eventTicker = (lastEvent.data?.ticker as string | undefined)?.toUpperCase();
      if (eventTicker === upperTicker) refetch();
      return;
    }
    if (lastEvent.type === 'price_update') {
      const eventTicker = (lastEvent.data?.ticker as string | undefined)?.toUpperCase();
      if (eventTicker === upperTicker) {
        setLivePriceData(lastEvent.data as unknown as PriceUpdateEvent);
      }
    }
  }, [lastEvent, refetch, upperTicker, isInvalidTicker]);

  // Clear live price overlay when the underlying data refreshes.
  useEffect(() => {
    setLivePriceData(null);
  }, [data]);

  if (isInvalidTicker) return null;

  const quote = data?.quote;
  const displayPrice = livePriceData?.price ?? quote?.price;
  const displayChangePct = livePriceData?.change_pct ?? quote?.change_pct ?? 0;
  const isPositive = displayChangePct > 0;
  const isNegative = displayChangePct < 0;
  const currencyPrefix = quote?.currency === 'USD' ? '$' : '';
  const news = data?.news ?? [];

  return (
    <div className="flex flex-col">
      <Header
        title={quote?.name ?? upperTicker}
        subtitle={quote?.name ? upperTicker : 'Stock detail'}
      />

      <div className="flex-1 space-y-6 p-4 md:p-6">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Dashboard
        </Link>

        {/* Error banner */}
        {error && !data && (
          <div
            className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Price hero */}
        {loading && !data ? (
          <div className="flex items-center gap-3" aria-busy="true">
            <div className="h-10 w-36 animate-pulse rounded-lg bg-slate-800" />
            <div className="h-7 w-20 animate-pulse rounded-lg bg-slate-800" />
            <div className="h-6 w-28 animate-pulse rounded-full bg-slate-800" />
          </div>
        ) : quote && displayPrice != null ? (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-3xl font-bold text-white md:text-4xl">
                {currencyPrefix}
                {displayPrice.toFixed(2)}
                {quote.currency !== 'USD' && (
                  <span className="ml-1 text-sm text-slate-400">{quote.currency}</span>
                )}
              </span>

              <div
                className={clsx(
                  'flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold',
                  isPositive && 'bg-emerald-500/10 text-emerald-400',
                  isNegative && 'bg-red-500/10 text-red-400',
                  !isPositive && !isNegative && 'bg-slate-500/10 text-slate-400'
                )}
                aria-label={`${isPositive ? '+' : ''}${displayChangePct.toFixed(2)}% change`}
              >
                {isPositive ? (
                  <TrendingUp className="h-4 w-4" aria-hidden="true" />
                ) : isNegative ? (
                  <TrendingDown className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Minus className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="font-mono">
                  {isPositive ? '+' : ''}
                  {displayChangePct.toFixed(2)}%
                </span>
              </div>
            </div>

            <SentimentBadge ticker={upperTicker} />
          </div>
        ) : null}

        {/* Chart + Key Statistics */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="min-w-0 overflow-hidden lg:col-span-2">
            <StockPriceChart ticker={upperTicker} />
          </div>

          <div>
            {quote ? (
              <FinancialsCard quote={quote} />
            ) : (
              <div
                className="h-64 animate-pulse rounded-xl bg-slate-800"
                aria-hidden="true"
              />
            )}
          </div>
        </div>

        {/* News + AI Analysis */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <NewsCard news={news} loading={loading && !data} />
          </div>

          <div className="space-y-4">
            <AIAnalysisCard ticker={upperTicker} />
            {data?.indicators && (
              <TechnicalIndicatorsCard indicators={data.indicators} />
            )}
            {loading && !data && (
              <div className="flex items-center justify-center rounded-xl border border-slate-700/50 bg-slate-900 py-12">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-hidden="true" />
                <span className="sr-only">Loading analysis…</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
