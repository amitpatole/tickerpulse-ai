'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
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
  Activity,
  Newspaper,
  BarChart2,
} from 'lucide-react';
import { clsx } from 'clsx';
import Header from '@/components/layout/Header';
import StockPriceChart from '@/components/stocks/StockPriceChart';
import SentimentBadge from '@/components/stocks/SentimentBadge';
import FinancialsCard from '@/components/stocks/FinancialsCard';
import EarningsCard from '@/components/stocks/EarningsCard';
import ComparisonModePanel from '@/components/stocks/ComparisonModePanel';
import ComparisonChart from '@/components/stocks/ComparisonChart';
import AIAnalysisPanel from '@/components/stocks/AIAnalysisPanel';
import { useApi } from '@/hooks/useApi';
import { useStockDetail } from '@/hooks/useStockDetail';
import { getCompareData, patchState } from '@/lib/api';
import type {
  StockDetailNewsItem,
  StockDetailIndicators,
  ComparisonSeries,
  ComparisonTicker,
  Timeframe,
} from '@/lib/types';

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
                  <p className="flex-1 line-clamp-2 text-sm text-slate-200 transition-colors group-hover:text-blue-400">
                    {item.title}
                  </p>
                  <ExternalLink
                    className="mt-0.5 h-3 w-3 shrink-0 text-slate-600 transition-colors group-hover:text-blue-400"
                    aria-hidden="true"
                  />
                </a>
              ) : (
                <p className="line-clamp-2 text-sm text-slate-200">{item.title}</p>
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

  // Persist the last-viewed ticker so it can be restored across restarts.
  useEffect(() => {
    if (!upperTicker) return;
    patchState({ navigation: { last_viewed_ticker: upperTicker } }).catch(() => {});
  }, [upperTicker]);

  // Stock detail data via dedicated hook (includes SSE overlay)
  const { data, loading, error, livePrice: livePriceData, aiRating } = useStockDetail(
    isInvalidTicker ? '' : upperTicker,
  );

  // ---- Comparison state -------------------------------------------------------

  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const [comparisonTickers, setComparisonTickers] = useState<ComparisonTicker[]>([]);
  const [compareTimeframe, setCompareTimeframe] = useState<Timeframe>('1M');

  function handleComparisonAdd(ct: ComparisonTicker) {
    setComparisonTickers((prev) => [...prev, ct]);
  }

  function handleComparisonRemove(t: string) {
    setComparisonTickers((prev) => prev.filter((ct) => ct.ticker !== t));
  }

  // Build the symbols key used as a stable dep string for the compare fetch
  const compareSymbolsKey = useMemo(() => {
    if (!comparisonEnabled || comparisonTickers.length === 0 || !upperTicker) return '';
    return [upperTicker, ...comparisonTickers.map((ct) => ct.ticker)].join(',');
  }, [comparisonEnabled, comparisonTickers, upperTicker]);

  const compareFetcher = useCallback(
    () => getCompareData(compareSymbolsKey.split(',').filter(Boolean), compareTimeframe),
    [compareSymbolsKey, compareTimeframe],
  );

  const { data: compareData, loading: compareLoading } = useApi(
    compareFetcher,
    [compareSymbolsKey, compareTimeframe],
    { enabled: comparisonEnabled && comparisonTickers.length > 0 },
  );

  // Transform compare API result into chart series
  const comparisonChartSeries = useMemo<ComparisonSeries[]>(() => {
    if (!compareData || !comparisonEnabled) return [];
    return compareSymbolsKey
      .split(',')
      .filter(Boolean)
      .map((sym) => {
        const entry = compareData[sym];
        if (!entry || 'error' in entry) {
          return {
            ticker: sym,
            candles: [],
            delta_pct: 0,
            error: 'error' in (entry ?? {}) ? (entry as { error: string }).error : 'No data',
          };
        }
        return {
          ticker: sym,
          candles: entry.points,
          delta_pct: entry.current_pct,
        };
      });
  }, [compareData, compareSymbolsKey, comparisonEnabled]);

  // Sync per-ticker errors from compare response back into ComparisonModePanel pills
  useEffect(() => {
    if (!compareData) return;
    setComparisonTickers((prev) => {
      let changed = false;
      const next = prev.map((ct) => {
        const entry = compareData[ct.ticker];
        const newError =
          entry && 'error' in entry ? (entry as { error: string }).error : null;
        if (newError === ct.error) return ct;
        changed = true;
        return { ...ct, error: newError };
      });
      return changed ? next : prev;
    });
  }, [compareData]);

  // ---- Derived display values -------------------------------------------------

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

          <div className="space-y-4">
            {quote ? (
              <FinancialsCard quote={quote} />
            ) : (
              <div
                className="h-64 animate-pulse rounded-xl bg-slate-800"
                aria-hidden="true"
              />
            )}
            <EarningsCard ticker={upperTicker} />
          </div>
        </div>

        {/* News + AI Analysis */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <NewsCard news={news} loading={loading && !data} />
          </div>

          <div className="space-y-4">
            <AIAnalysisPanel aiRating={aiRating} loading={loading && !data} />
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

        {/* Performance Comparison */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-700/50 px-5 py-3">
            <BarChart2 className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Performance Comparison</h2>
          </div>

          <div className="p-5">
            <ComparisonModePanel
              primaryTicker={upperTicker}
              comparisonTickers={comparisonTickers}
              onAdd={handleComparisonAdd}
              onRemove={handleComparisonRemove}
              onToggle={setComparisonEnabled}
              enabled={comparisonEnabled}
            />

            {comparisonEnabled && comparisonTickers.length === 0 && (
              <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-700 py-10 text-center">
                <BarChart2 className="h-8 w-8 text-slate-700" aria-hidden="true" />
                <p className="text-sm text-slate-500">
                  Search for a ticker above to start comparing
                </p>
              </div>
            )}

            {comparisonEnabled && comparisonTickers.length > 0 && (
              <div className="mt-4">
                {compareLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-hidden="true" />
                    <span className="sr-only">Loading comparison…</span>
                  </div>
                ) : comparisonChartSeries.length > 0 ? (
                  <ComparisonChart
                    series={comparisonChartSeries}
                    timeframe={compareTimeframe}
                    onTimeframeChange={setCompareTimeframe}
                  />
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
