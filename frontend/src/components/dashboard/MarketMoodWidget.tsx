'use client';

import { clsx } from 'clsx';
import { useApi } from '@/hooks/useApi';
import { getRatings } from '@/lib/api';
import type { AIRating } from '@/lib/types';

type Mood = 'bullish' | 'neutral' | 'bearish';

interface MoodSummary {
  score: number;
  mood: Mood;
  label: string;
  counts: { bullish: number; neutral: number; bearish: number };
}

function computeMoodSummary(ratings: AIRating[]): MoodSummary {
  const counts = { bullish: 0, neutral: 0, bearish: 0 };

  if (ratings.length === 0) {
    return { score: 50, mood: 'neutral', label: 'Neutral', counts };
  }

  let sum = 0;
  for (const r of ratings) {
    sum += r.score;
    if (r.score >= 65) counts.bullish++;
    else if (r.score <= 40) counts.bearish++;
    else counts.neutral++;
  }

  const score = Math.round(sum / ratings.length);
  const mood: Mood = score >= 65 ? 'bullish' : score <= 40 ? 'bearish' : 'neutral';
  const label = mood === 'bullish' ? 'Bullish' : mood === 'bearish' ? 'Bearish' : 'Neutral';

  return { score, mood, label, counts };
}

const MOOD_STYLES: Record<Mood, { text: string; badge: string; border: string }> = {
  bullish: {
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    border: 'border-emerald-500/20',
  },
  neutral: {
    text: 'text-amber-400',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    border: 'border-amber-500/20',
  },
  bearish: {
    text: 'text-red-400',
    badge: 'bg-red-500/10 text-red-400 border-red-500/30',
    border: 'border-red-500/20',
  },
};

interface MarketMoodWidgetProps {
  /** Pre-fetched ratings from a parent useDashboardData call.
   *  Pass null while loading, AIRating[] when ready.
   *  Omit entirely to have the component self-fetch. */
  ratings?: AIRating[] | null;
}

export default function MarketMoodWidget({ ratings: ratingsProp }: MarketMoodWidgetProps = {}) {
  const selfFetch = ratingsProp === undefined;
  const { data: fetchedRatings, loading, error } = useApi<AIRating[]>(getRatings, [], {
    refreshInterval: 30_000,
    enabled: selfFetch,
  });

  const ratings = selfFetch ? fetchedRatings : ratingsProp;
  const isLoading = selfFetch ? (loading && !fetchedRatings) : ratingsProp === null;
  const displayError = selfFetch ? error : null;

  const summary = ratings ? computeMoodSummary(ratings) : null;
  const styles = MOOD_STYLES[summary?.mood ?? 'neutral'];

  return (
    <div
      className={clsx(
        'rounded-xl border bg-slate-800/50 p-5',
        summary ? styles.border : 'border-slate-700/50',
      )}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Market Mood</h2>
        {summary && (
          <span
            className={clsx(
              'rounded border px-2 py-0.5 text-xs font-semibold',
              styles.badge,
            )}
          >
            {summary.label}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          <div className="h-9 animate-pulse rounded bg-slate-700" />
          <div className="h-3 animate-pulse rounded bg-slate-700" />
          <div className="h-6 animate-pulse rounded bg-slate-700" />
        </div>
      )}

      {displayError && !ratings && (
        <div className="text-center text-sm text-red-400">{displayError}</div>
      )}

      {ratings && ratings.length === 0 && (
        <div className="text-center text-sm text-slate-500">No stocks in watchlist.</div>
      )}

      {summary && ratings && ratings.length > 0 && (
        <div className="space-y-4">
          {/* Score readout */}
          <div className="flex items-baseline gap-1">
            <span className={clsx('font-mono text-3xl font-bold', styles.text)}>
              {summary.score}
            </span>
            <span className="text-xs text-slate-500">/ 100</span>
          </div>

          {/* Spectrum gauge */}
          <div>
            <div
              role="meter"
              aria-valuenow={summary.score}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Market mood score: ${summary.score} out of 100 — ${summary.label}`}
              className="relative h-3 overflow-hidden rounded-full"
              style={{
                background:
                  'linear-gradient(to right, #ef4444 0%, #f59e0b 40%, #10b981 100%)',
              }}
            >
              <div
                className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-white shadow"
                style={{ left: `${summary.score}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-slate-500">
              <span>Bearish</span>
              <span>Neutral</span>
              <span>Bullish</span>
            </div>
          </div>

          {/* Bucket breakdown */}
          <div className="grid grid-cols-3 gap-2 border-t border-slate-700/50 pt-3 text-center">
            <div>
              <p className="font-mono text-lg font-bold text-emerald-400">
                {summary.counts.bullish}
              </p>
              <p className="text-[9px] uppercase tracking-wider text-slate-500">Bullish</p>
            </div>
            <div>
              <p className="font-mono text-lg font-bold text-amber-400">
                {summary.counts.neutral}
              </p>
              <p className="text-[9px] uppercase tracking-wider text-slate-500">Neutral</p>
            </div>
            <div>
              <p className="font-mono text-lg font-bold text-red-400">
                {summary.counts.bearish}
              </p>
              <p className="text-[9px] uppercase tracking-wider text-slate-500">Bearish</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
