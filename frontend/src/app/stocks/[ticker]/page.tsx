'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import Header from '@/components/layout/Header';
import StockPriceChart from '@/components/stocks/StockPriceChart';
import SentimentBadge from '@/components/stocks/SentimentBadge';
import { useApi } from '@/hooks/useApi';
import { useSSE } from '@/hooks/useSSE';
import { getStockDetail } from '@/lib/api';
import type { PriceUpdateEvent } from '@/lib/types';

interface StockDetailPageProps {
  params: Promise<{ ticker: string }>;
}

function formatLargeNumber(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

export default function StockDetailPage({ params }: StockDetailPageProps) {
  const router = useRouter();
  const { ticker } = use(params);
  const isInvalidTicker = !ticker || !ticker.trim();
  const upperTicker = isInvalidTicker ? '' : ticker.toUpperCase();

  // Redirect to home with error when ticker param is empty or whitespace.
  useEffect(() => {
    if (isInvalidTicker) {
      router.replace('/?error=missing-ticker');
    }
  }, [isInvalidTicker, router]);

  // Fetch with default 1M timeframe for the quote stats at the top.
  // StockPriceChart manages its own timeframe state independently.
  const fetcher = useCallback(() => getStockDetail(upperTicker, '1M'), [upperTicker]);
  const { data, loading, error, refetch } = useApi(fetcher, [upperTicker], {
    enabled: !isInvalidTicker,
  });

  // Live price overlay from SSE — applied without triggering a full refetch.
  const [livePriceData, setLivePriceData] = useState<PriceUpdateEvent | null>(null);

  // Refetch stock detail on snapshot/news events; apply live price on price_update.
  const { lastEvent } = useSSE();
  useEffect(() => {
    if (isInvalidTicker || !lastEvent) return;
    if (lastEvent.type === 'snapshot') {
      refetch();
      return;
    }
    if (lastEvent.type === 'news') {
      const eventTicker = (lastEvent.data?.ticker as string | undefined)?.toUpperCase();
      if (eventTicker === upperTicker) {
        refetch();
      }
      return;
    }
    if (lastEvent.type === 'price_update') {
      const eventTicker = (lastEvent.data?.ticker as string | undefined)?.toUpperCase();
      if (eventTicker === upperTicker) {
        setLivePriceData(lastEvent.data as unknown as PriceUpdateEvent);
      }
    }
  }, [lastEvent, refetch, upperTicker, isInvalidTicker]);

  // Clear live price overlay when the underlying data is refreshed.
  useEffect(() => {
    setLivePriceData(null);
  }, [data]);

  if (isInvalidTicker) {
    return null;
  }

  const quote = data?.quote;
  const displayPrice = livePriceData?.price ?? quote?.price;
  const displayChangePct = livePriceData?.change_pct ?? quote?.change_pct ?? 0;
  const isPositive = displayChangePct > 0;
  const isNegative = displayChangePct < 0;
  const currencyPrefix = quote?.currency === 'USD' ? '$' : '';

  return (
    <div className="flex flex-col">
      <Header
        title={quote?.name ?? upperTicker}
        subtitle={quote?.name ? upperTicker : 'Stock detail'}
      />

      <div className="flex-1 p-4 md:p-6">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Dashboard
        </Link>

        {/* Quote stats */}
        {loading && !data && (
          <div className="mb-6 flex items-center gap-3" aria-busy="true">
            <div className="h-10 w-36 animate-pulse rounded-lg bg-slate-800" />
            <div className="h-7 w-20 animate-pulse rounded-lg bg-slate-800" />
          </div>
        )}

        {error && !data && (
          <div
            className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
            role="alert"
          >
            {error}
          </div>
        )}

        {quote && displayPrice != null && (
          <div className="mb-6">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-3xl md:text-4xl font-bold text-white">
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

              <SentimentBadge ticker={upperTicker} />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:gap-6">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-slate-500">Volume</dt>
                <dd className="font-mono text-sm font-semibold text-white">
                  {formatVolume(quote.volume)}
                </dd>
              </div>

              {quote.market_cap != null && (
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-500">
                    Market Cap
                  </dt>
                  <dd className="font-mono text-sm font-semibold text-white">
                    {formatLargeNumber(quote.market_cap)}
                  </dd>
                </div>
              )}

              {quote.week_52_high != null && quote.week_52_low != null && (
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-500">
                    52W Range
                  </dt>
                  <dd className="font-mono text-sm font-semibold text-white">
                    {quote.week_52_low.toFixed(2)} – {quote.week_52_high.toFixed(2)}
                  </dd>
                </div>
              )}

              {quote.pe_ratio != null && (
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-500">P/E</dt>
                  <dd className="font-mono text-sm font-semibold text-white">
                    {quote.pe_ratio.toFixed(1)}
                  </dd>
                </div>
              )}

              {quote.eps != null && (
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-500">EPS</dt>
                  <dd className="font-mono text-sm font-semibold text-white">
                    {quote.eps.toFixed(2)}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Multi-timeframe chart — owns its own timeframe state */}
        <div className="min-w-0 overflow-hidden">
          <StockPriceChart ticker={upperTicker} />
        </div>

        {/* Loading placeholder when we have no quote yet */}
        {loading && !data && (
          <div className="mt-6 flex items-center justify-center py-20 rounded-xl border border-slate-700/50 bg-slate-900">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden="true" />
            <span className="sr-only">Loading stock data…</span>
          </div>
        )}
      </div>
    </div>
  );
}