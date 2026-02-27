'use client';

import { clsx } from 'clsx';
import { useRatings } from '@/hooks/useRatings';
import { useSSERatings } from '@/hooks/useSSERatings';
import type { AIRating } from '@/lib/types';

type SentimentBucket = 'bullish' | 'neutral' | 'bearish';

function classifyScore(score: number): SentimentBucket {
  if (score > 0.2) return 'bullish';
  if (score < -0.2) return 'bearish';
  return 'neutral';
}

const BUCKET_CONFIG: Record<
  SentimentBucket,
  { label: string; barColor: string; textColor: string; bgColor: string }
> = {
  bullish: {
    label: 'Bullish',
    barColor: 'bg-emerald-500',
    textColor: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
  },
  neutral: {
    label: 'Neutral',
    barColor: 'bg-amber-500',
    textColor: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
  },
  bearish: {
    label: 'Bearish',
    barColor: 'bg-red-500',
    textColor: 'text-red-400',
    bgColor: 'bg-red-500/10',
  },
};

const RATING_ORDER = ['STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL'] as const;

const RATING_COLORS: Record<string, { bar: string; text: string }> = {
  STRONG_BUY: { bar: 'bg-emerald-500', text: 'text-emerald-400' },
  BUY: { bar: 'bg-green-500', text: 'text-green-400' },
  HOLD: { bar: 'bg-amber-500', text: 'text-amber-400' },
  SELL: { bar: 'bg-red-500', text: 'text-red-400' },
  STRONG_SELL: { bar: 'bg-red-700', text: 'text-red-500' },
};

interface SentimentBarProps {
  bucket: SentimentBucket;
  count: number;
  total: number;
}

function SentimentBar({ bucket, count, total }: SentimentBarProps) {
  const config = BUCKET_CONFIG[bucket];
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className={config.textColor}>{config.label}</span>
        <span className="font-mono text-slate-300">
          {count}{' '}
          <span className="text-slate-500">({pct}%)</span>
        </span>
      </div>
      <div
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${config.label}: ${pct}% of watchlist`}
        className="h-2 rounded-full bg-slate-700"
      >
        <div
          className={clsx('h-full rounded-full transition-all duration-500', config.barColor)}
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function RatingDistribution({ ratings }: { ratings: AIRating[] }) {
  const total = ratings.length;
  const counts = ratings.reduce<Record<string, number>>((acc, r) => {
    acc[r.rating] = (acc[r.rating] ?? 0) + 1;
    return acc;
  }, {});

  const present = RATING_ORDER.filter((r) => (counts[r] ?? 0) > 0);
  if (present.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {present.map((rating) => {
        const count = counts[rating] ?? 0;
        const pct = Math.round((count / total) * 100);
        const colors = RATING_COLORS[rating] ?? { bar: 'bg-slate-500', text: 'text-slate-400' };

        return (
          <div key={rating} className="flex items-center gap-2">
            <span className={clsx('w-20 shrink-0 text-[10px]', colors.text)}>
              {rating.replace(/_/g, ' ')}
            </span>
            <div
              role="meter"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${rating.replace(/_/g, ' ')}: ${count} stock${count !== 1 ? 's' : ''} (${pct}%)`}
              className="h-1.5 flex-1 rounded-full bg-slate-700"
            >
              <div
                className={clsx('h-full rounded-full', colors.bar)}
                style={{ width: `${pct}%` }}
                aria-hidden="true"
              />
            </div>
            <span className="w-5 text-right text-[10px] font-mono text-slate-400">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function SentimentSummaryChart() {
  const { data: baseRatings, loading, error } = useRatings();
  const ratings = useSSERatings(baseRatings);

  const withSentiment = (ratings ?? []).filter((r) => r.sentiment_score != null);
  const total = withSentiment.length;

  const bucketCounts: Record<SentimentBucket, number> = {
    bullish: 0,
    neutral: 0,
    bearish: 0,
  };
  withSentiment.forEach((r) => {
    bucketCounts[classifyScore(r.sentiment_score!)]++;
  });

  const avgScore =
    total > 0
      ? withSentiment.reduce((sum, r) => sum + (r.sentiment_score ?? 0), 0) / total
      : null;

  const avgBucket = avgScore != null ? classifyScore(avgScore) : null;
  const avgConfig = avgBucket ? BUCKET_CONFIG[avgBucket] : null;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
      <h2 className="mb-4 text-sm font-semibold text-white">Market Sentiment</h2>

      {loading && !ratings && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-6 animate-pulse rounded bg-slate-700" />
          ))}
        </div>
      )}

      {error && !ratings && (
        <div className="text-center text-sm text-red-400">{error}</div>
      )}

      {ratings && ratings.length === 0 && (
        <div className="text-center text-sm text-slate-500">No stocks in watchlist.</div>
      )}

      {ratings && ratings.length > 0 && (
        <div className="space-y-5">
          {/* Portfolio average sentiment */}
          {avgScore != null && avgConfig && (
            <div
              className={clsx(
                'flex items-center justify-between rounded-lg p-3',
                avgConfig.bgColor
              )}
            >
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">
                  Portfolio Avg. Sentiment
                </p>
                <p className={clsx('mt-0.5 font-mono text-xl font-bold', avgConfig.textColor)}>
                  {avgScore > 0 ? '+' : ''}{avgScore.toFixed(2)}
                </p>
              </div>
              <span className={clsx('text-sm font-semibold', avgConfig.textColor)}>
                {avgConfig.label}
              </span>
            </div>
          )}

          {/* Sentiment distribution */}
          {total > 0 && (
            <div className="space-y-2.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                Sentiment Distribution
              </p>
              {(['bullish', 'neutral', 'bearish'] as SentimentBucket[]).map((bucket) => (
                <SentimentBar
                  key={bucket}
                  bucket={bucket}
                  count={bucketCounts[bucket]}
                  total={total}
                />
              ))}
            </div>
          )}

          {/* AI rating breakdown */}
          {ratings.length > 0 && (
            <div className="space-y-2 border-t border-slate-700/50 pt-4">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                AI Rating Distribution
              </p>
              <RatingDistribution ratings={ratings} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
