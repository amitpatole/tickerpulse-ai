'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { clsx } from 'clsx';
import { useRatings } from '@/hooks/useRatings';
import { useSSERatings } from '@/hooks/useSSERatings';
import type { AIRating } from '@/lib/types';

const MAX_MOVERS = 5;

interface MoverRowProps {
  rating: AIRating;
  rank: number;
  direction: 'gain' | 'loss';
}

function MoverRow({ rating, rank, direction }: MoverRowProps) {
  const pct = rating.price_change_pct ?? 0;

  return (
    <div
      className="flex items-center justify-between px-3 py-2.5"
      aria-label={`${rating.ticker}, ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% today`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-4 shrink-0 text-right text-[10px] text-slate-600" aria-hidden="true">
          {rank}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{rating.ticker}</p>
          {rating.current_price != null && (
            <p className="text-[10px] font-mono text-slate-400">
              ${rating.current_price.toFixed(2)}
            </p>
          )}
        </div>
      </div>
      <span
        className={clsx(
          'shrink-0 text-xs font-bold font-mono',
          direction === 'gain' ? 'text-emerald-400' : 'text-red-400'
        )}
      >
        {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
      </span>
    </div>
  );
}

interface MoverColumnProps {
  label: string;
  direction: 'gain' | 'loss';
  items: AIRating[];
}

function MoverColumn({ label, direction, items }: MoverColumnProps) {
  const Icon = direction === 'gain' ? TrendingUp : TrendingDown;
  const colorClass = direction === 'gain' ? 'text-emerald-400' : 'text-red-400';

  return (
    <div>
      <div className="border-b border-slate-700/30 px-3 py-1.5">
        <p className={clsx('flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider', colorClass)}>
          <Icon className="h-3 w-3" aria-hidden="true" />
          {label}
        </p>
      </div>
      <div className="divide-y divide-slate-700/30">
        {items.length === 0 ? (
          <p className="px-3 py-4 text-center text-[10px] text-slate-500">
            No {label.toLowerCase()}
          </p>
        ) : (
          items.map((r, i) => (
            <MoverRow key={r.ticker} rating={r} rank={i + 1} direction={direction} />
          ))
        )}
      </div>
    </div>
  );
}

export default function TopMovers() {
  const { data: baseRatings, loading, error } = useRatings();
  const ratings = useSSERatings(baseRatings);

  const gainers = [...(ratings ?? [])]
    .filter((r) => (r.price_change_pct ?? 0) > 0)
    .sort((a, b) => (b.price_change_pct ?? 0) - (a.price_change_pct ?? 0))
    .slice(0, MAX_MOVERS);

  const losers = [...(ratings ?? [])]
    .filter((r) => (r.price_change_pct ?? 0) < 0)
    .sort((a, b) => (a.price_change_pct ?? 0) - (b.price_change_pct ?? 0))
    .slice(0, MAX_MOVERS);

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50">
      <div className="border-b border-slate-700/50 px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Top Movers</h2>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-emerald-400" aria-hidden="true" />
            Gainers
          </span>
          <span className="flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-red-400" aria-hidden="true" />
            Losers
          </span>
        </div>
      </div>

      {loading && !ratings && (
        <div className="grid grid-cols-2 gap-2 p-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-slate-700" />
          ))}
        </div>
      )}

      {error && !ratings && (
        <div className="p-4 text-center text-sm text-red-400">{error}</div>
      )}

      {ratings && ratings.length === 0 && (
        <div className="p-6 text-center text-sm text-slate-500">
          No stocks in watchlist.
        </div>
      )}

      {ratings && ratings.length > 0 && (
        <div className="grid grid-cols-2 divide-x divide-slate-700/50">
          <MoverColumn label="Gainers" direction="gain" items={gainers} />
          <MoverColumn label="Losers" direction="loss" items={losers} />
        </div>
      )}
    </div>
  );
}
