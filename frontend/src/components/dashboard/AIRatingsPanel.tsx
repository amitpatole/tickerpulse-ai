```typescript
'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Brain } from 'lucide-react';
import { clsx } from 'clsx';
import type { AIRating, PriceUpdate } from '@/lib/types';
import { RATING_BG_CLASSES } from '@/lib/types';

type SortKey = 'score' | 'confidence' | 'price_change_pct';

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'Score', value: 'score' },
  { label: 'Confidence', value: 'confidence' },
  { label: '% Change', value: 'price_change_pct' },
];

interface ScoreBarProps {
  value: number;
  colorClass: string;
  ariaLabel: string;
}

function ScoreBar({ value, colorClass, ariaLabel }: ScoreBarProps) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      className="h-1.5 flex-1 rounded-full bg-slate-700"
    >
      <div
        className={clsx('h-full rounded-full', colorClass)}
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 65) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function formatPrice(price: number | null | undefined): string {
  if (price == null) return '—';
  return `$${price.toFixed(2)}`;
}

interface RatingRowProps {
  rating: AIRating;
  rank: number;
  flashing?: boolean;
}

function RatingRow({ rating, rank, flashing }: RatingRowProps) {
  const badgeClass =
    RATING_BG_CLASSES[rating.rating] ??
    'bg-slate-500/20 text-slate-400 border-slate-500/30';
  const pct = rating.price_change_pct ?? 0;
  const score = Math.min(100, Math.max(0, rating.score));
  const conf = Math.round(rating.confidence * 100);

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-700/20"
      aria-label={`${rating.ticker}, ${rating.rating.replace(/_/g, ' ')}, score ${score}, confidence ${conf}%`}
    >
      <span className="w-4 shrink-0 text-right text-[10px] text-slate-600" aria-hidden="true">
        {rank}
      </span>
      <Link
        href={`/stocks/${rating.ticker}`}
        className="w-14 shrink-0 text-sm font-semibold text-white hover:underline"
      >
        {rating.ticker}
      </Link>
      <span
        className={clsx(
          'shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide',
          badgeClass,
        )}
      >
        {rating.rating.replace(/_/g, ' ')}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <ScoreBar
          value={score}
          colorClass={scoreColor(score)}
          ariaLabel={`AI score: ${score} out of 100`}
        />
        <span className="w-6 shrink-0 text-right font-mono text-[10px] text-slate-300">
          {score}
        </span>
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-[10px] text-slate-400">
        {conf}%
      </span>
      <span
        className={clsx(
          'w-16 shrink-0 text-right font-mono text-[10px] text-slate-300',
          flashing && 'animate-price-flash rounded',
        )}
      >
        {formatPrice(rating.current_price)}
      </span>
      <span
        className={clsx(
          'w-14 shrink-0 text-right font-mono text-xs font-semibold',
          pct >= 0 ? 'text-emerald-400' : 'text-red-400',
        )}
      >
        {pct >= 0 ? '+' : ''}
        {pct.toFixed(2)}%
      </span>
    </div>
  );
}

interface AIRatingsPanelProps {
  /** Base ratings from useDashboardData. null = loading. */
  ratings: AIRating[] | null;
  /**
   * Optional live price map keyed by ticker, sourced from useWSPrices.
   *
   * When supplied, price fields (current_price, price_change, price_change_pct)
   * are overlaid onto display rows WITHOUT affecting sort order — sort is always
   * computed from the base `ratings` values so WS ticks never re-order the table.
   * The flash animation is also driven by changes in this map.
   *
   * When omitted the component falls back to detecting price changes directly
   * from the `ratings` prop (pre-merged by useDashboardData) — backward compat.
   */
  wsPrices?: Record<string, PriceUpdate>;
}

export default function AIRatingsPanel({ ratings, wsPrices }: AIRatingsPanelProps) {
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const isLoading = ratings === null;

  // Price flash: track which tickers had a recent price change
  const [flashSet, setFlashSet] = useState<Set<string>>(new Set());
  const prevPricesRef = useRef<Record<string, number | null | undefined>>({});
  const flashTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function triggerFlash(tickers: Set<string>) {
    if (tickers.size === 0) return;
    setFlashSet((prev) => new Set([...prev, ...tickers]));
    for (const ticker of tickers) {
      if (flashTimersRef.current[ticker]) clearTimeout(flashTimersRef.current[ticker]);
      flashTimersRef.current[ticker] = setTimeout(() => {
        setFlashSet((prev) => {
          const next = new Set(prev);
          next.delete(ticker);
          return next;
        });
        delete flashTimersRef.current[ticker];
      }, 800);
    }
  }

  // Flash driven by wsPrices changes (when separate WS map is provided)
  useEffect(() => {
    if (!wsPrices) return;
    const updated = new Set<string>();
    for (const [ticker, priceData] of Object.entries(wsPrices)) {
      const prev = prevPricesRef.current[ticker];
      if (prev !== undefined && prev !== priceData.price) {
        updated.add(ticker);
      }
      prevPricesRef.current[ticker] = priceData.price;
    }
    triggerFlash(updated);
  }, [wsPrices]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flash driven by ratings price changes (backward-compat when wsPrices not provided)
  useEffect(() => {
    if (wsPrices !== undefined || !ratings) return;
    const updated = new Set<string>();
    for (const rating of ratings) {
      const prev = prevPricesRef.current[rating.ticker];
      if (prev !== undefined && prev !== rating.current_price) {
        updated.add(rating.ticker);
      }
      prevPricesRef.current[rating.ticker] = rating.current_price;
    }
    triggerFlash(updated);
  }, [ratings, wsPrices]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup flash timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of Object.values(flashTimersRef.current)) clearTimeout(timer);
    };
  }, []);

  // Sort order is determined by BASE rating values only.
  // WS price updates (via wsPrices prop) never cause a re-sort.
  const sorted = useMemo(() => {
    return [...(ratings ?? [])].sort((a, b) => {
      if (sortKey === 'score') return b.score - a.score;
      if (sortKey === 'confidence') return b.confidence - a.confidence;
      return (b.price_change_pct ?? 0) - (a.price_change_pct ?? 0);
    });
  }, [ratings, sortKey]);

  // Apply WS price overlay for display — preserves sort order from base ratings
  const displayRows = useMemo(() => {
    if (!wsPrices) return sorted;
    return sorted.map((r) => {
      const ws = wsPrices[r.ticker];
      if (!ws) return r;
      return {
        ...r,
        current_price: ws.price,
        price_change: ws.change,
        price_change_pct: ws.change_pct,
      };
    });
  }, [sorted, wsPrices]);

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/50 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Brain className="h-3.5 w-3.5 text-purple-400" aria-hidden="true" />
          AI Ratings
        </h2>

        <div role="group" aria-label="Sort ratings by" className="flex gap-1">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSortKey(opt.value)}
              className={clsx(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                sortKey === opt.value
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Column legend */}
      {ratings && ratings.length > 0 && (
        <div className="flex items-center gap-3 border-b border-slate-700/30 px-4 py-1">
          <span className="w-4 shrink-0" aria-hidden="true" />
          <span className="w-14 shrink-0 text-[9px] uppercase tracking-wider text-slate-500">
            Ticker
          </span>
          <span className="w-16 shrink-0 text-[9px] uppercase tracking-wider text-slate-500">
            Rating
          </span>
          <span className="flex-1 text-[9px] uppercase tracking-wider text-slate-500">
            AI Score
          </span>
          <span className="w-9 shrink-0 text-right text-[9px] uppercase tracking-wider text-slate-500">
            Conf.
          </span>
          <span className="w-16 shrink-0 text-right text-[9px] uppercase tracking-wider text-slate-500">
            Price
          </span>
          <span className="w-14 shrink-0 text-right text-[9px] uppercase tracking-wider text-slate-500">
            Chg %
          </span>
        </div>
      )}

      {/* Body */}
      <div aria-live="polite" aria-busy={isLoading}>
        {isLoading && (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-slate-700" />
            ))}
          </div>
        )}

        {ratings !== null && ratings.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-500">
            No stocks in watchlist.
          </div>
        )}

        {displayRows.length > 0 && (
          <div className="divide-y divide-slate-700/30">
            {displayRows.map((r, i) => (
              <RatingRow
                key={r.ticker}
                rating={r}
                rank={i + 1}
                flashing={flashSet.has(r.ticker)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```