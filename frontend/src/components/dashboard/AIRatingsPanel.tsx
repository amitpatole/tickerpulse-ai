'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Brain } from 'lucide-react';
import { clsx } from 'clsx';
import { useRatings } from '@/hooks/useRatings';
import { useSSERatings } from '@/hooks/useSSERatings';
import type { AIRating } from '@/lib/types';
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

interface RatingRowProps {
  rating: AIRating;
  rank: number;
}

function RatingRow({ rating, rank }: RatingRowProps) {
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
  /** Pre-fetched ratings from a parent useDashboardData call.
   *  Pass null while loading, AIRating[] when ready.
   *  Omit entirely to have the component self-fetch. */
  ratings?: AIRating[] | null;
}

export default function AIRatingsPanel({ ratings: ratingsProp }: AIRatingsPanelProps = {}) {
  const [sortKey, setSortKey] = useState<SortKey>('score');

  const selfFetch = ratingsProp === undefined;
  const { data: hookRatings, loading, error } = useRatings({ enabled: selfFetch });

  const baseRatings = selfFetch ? hookRatings : ratingsProp;
  const ratings = useSSERatings(baseRatings ?? null);
  const isLoading = selfFetch ? (loading && !hookRatings) : ratingsProp === null;
  const displayError = selfFetch ? error : null;

  const sorted = [...(ratings ?? [])].sort((a, b) => {
    if (sortKey === 'score') return b.score - a.score;
    if (sortKey === 'confidence') return b.confidence - a.confidence;
    return (b.price_change_pct ?? 0) - (a.price_change_pct ?? 0);
  });

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

        {displayError && !ratings && (
          <div className="p-4 text-center text-sm text-red-400">{displayError}</div>
        )}

        {ratings && ratings.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-500">
            No stocks in watchlist.
          </div>
        )}

        {sorted.length > 0 && (
          <div className="divide-y divide-slate-700/30">
            {sorted.map((r, i) => (
              <RatingRow key={r.ticker} rating={r} rank={i + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
