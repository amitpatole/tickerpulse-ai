'use client';

import { PieChart } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { getRatings } from '@/lib/api';
import type { AIRating } from '@/lib/types';

// Ordered for display priority
const RATING_ORDER = ['STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL'] as const;

const RATING_META: Record<string, { label: string; color: string }> = {
  STRONG_BUY: { label: 'Strong Buy', color: '#10b981' },
  BUY: { label: 'Buy', color: '#22c55e' },
  HOLD: { label: 'Hold', color: '#f59e0b' },
  SELL: { label: 'Sell', color: '#ef4444' },
  STRONG_SELL: { label: 'Strong Sell', color: '#dc2626' },
};

interface RatingDistribution {
  key: string;
  label: string;
  count: number;
  pct: number;
  color: string;
}

function buildDistribution(ratings: AIRating[]): RatingDistribution[] {
  const total = ratings.length;
  if (total === 0) return [];

  const counts: Record<string, number> = {};
  for (const r of ratings) {
    counts[r.rating] = (counts[r.rating] ?? 0) + 1;
  }

  return RATING_ORDER.filter((key) => (counts[key] ?? 0) > 0).map((key) => ({
    key,
    label: RATING_META[key]?.label ?? key,
    count: counts[key] ?? 0,
    pct: Math.round(((counts[key] ?? 0) / total) * 100),
    color: RATING_META[key]?.color ?? '#64748b',
  }));
}

// SVG donut chart: radius 54, stroke-width 20 → inner r 44, outer r 64
const RADIUS = 54;
const STROKE_WIDTH = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SIZE = (RADIUS + STROKE_WIDTH / 2 + 2) * 2;

interface DonutChartProps {
  sectors: RatingDistribution[];
}

function DonutChart({ sectors }: DonutChartProps) {
  let cumulative = 0;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-36 w-36 shrink-0 -rotate-90"
      aria-hidden="true"
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="#1e293b"
        strokeWidth={STROKE_WIDTH}
      />
      {sectors.map((s) => {
        const fraction = s.pct / 100;
        const dashArray = `${fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
        const dashOffset = -(cumulative * CIRCUMFERENCE);
        cumulative += fraction;

        return (
          <circle
            key={s.key}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={s.color}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={dashArray}
            strokeDashoffset={dashOffset}
            strokeLinecap="butt"
          />
        );
      })}
    </svg>
  );
}

interface LegendRowProps {
  sector: RatingDistribution;
}

function LegendRow({ sector }: LegendRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: sector.color }}
          aria-hidden="true"
        />
        <span className="truncate text-xs text-slate-300">{sector.label}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-xs text-slate-400">{sector.count}</span>
        <span className="w-7 text-right font-mono text-[10px] text-slate-500">
          {sector.pct}%
        </span>
      </div>
    </div>
  );
}

interface SectorBreakdownProps {
  /** Pre-fetched ratings from a parent useDashboardData call.
   *  Pass null while loading, AIRating[] when ready.
   *  Omit entirely to have the component self-fetch. */
  ratings?: AIRating[] | null;
}

export default function SectorBreakdown({ ratings: ratingsProp }: SectorBreakdownProps = {}) {
  const selfFetch = ratingsProp === undefined;
  const { data: fetchedRatings, loading, error } = useApi<AIRating[]>(getRatings, [], {
    refreshInterval: 30_000,
    enabled: selfFetch,
  });

  const ratings = selfFetch ? fetchedRatings : ratingsProp;
  const isLoading = selfFetch ? (loading && !fetchedRatings) : ratingsProp === null;
  const displayError = selfFetch ? error : null;

  const sectors = ratings ? buildDistribution(ratings) : [];
  const total = ratings?.length ?? 0;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
      <div className="mb-4 flex items-center gap-2">
        <PieChart className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-white">Rating Breakdown</h2>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <div className="mx-auto h-36 w-36 animate-pulse rounded-full bg-slate-700" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-slate-700" />
            ))}
          </div>
        </div>
      )}

      {displayError && !ratings && (
        <div className="text-center text-sm text-red-400">{displayError}</div>
      )}

      {ratings && ratings.length === 0 && (
        <div className="text-center text-sm text-slate-500">No stocks in watchlist.</div>
      )}

      {sectors.length > 0 && (
        <div
          role="img"
          aria-label={`Rating distribution across ${total} stocks`}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative">
            <DonutChart sectors={sectors} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-xl font-bold text-white">{total}</span>
              <span className="text-[9px] uppercase tracking-wider text-slate-500">
                {total === 1 ? 'stock' : 'stocks'}
              </span>
            </div>
          </div>

          <div className="w-full space-y-1.5">
            {sectors.map((s) => (
              <LegendRow key={s.key} sector={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
