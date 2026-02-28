'use client';

import { clsx } from 'clsx';
import type { ComparisonResult } from '@/lib/types';

interface Props {
  results: ComparisonResult[];
}

const VERDICT_STYLES: Record<string, string> = {
  BUY:   'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  HOLD:  'text-amber-400  bg-amber-400/10  border-amber-400/30',
  SELL:  'text-red-400    bg-red-400/10    border-red-400/30',
  SPLIT: 'text-slate-400  bg-slate-700/50  border-slate-600/50',
};

export default function ConsensusBar({ results }: Props) {
  const rated = results.filter((r) => !r.error && r.rating);
  if (rated.length === 0) return null;

  const counts: Record<string, number> = { BUY: 0, HOLD: 0, SELL: 0 };
  for (const r of rated) {
    if (r.rating) counts[r.rating]++;
  }

  const topCount = Math.max(counts.BUY, counts.HOLD, counts.SELL);
  const winners = (['BUY', 'HOLD', 'SELL'] as const).filter(
    (r) => counts[r] === topCount && counts[r] > 0,
  );
  const verdict = winners.length > 1 ? 'SPLIT' : winners[0];

  const breakdown = (['BUY', 'HOLD', 'SELL'] as const)
    .filter((r) => counts[r] > 0)
    .map((r) => `${counts[r]} ${r}`)
    .join(' · ');

  return (
    <div
      className="mb-4 flex items-center gap-4 rounded-xl border border-slate-700/50 bg-slate-800/50 px-5 py-3"
      data-testid="consensus-bar"
    >
      <span className="text-xs text-slate-500">Consensus</span>
      <span
        className={clsx(
          'rounded-lg border px-2.5 py-0.5 text-xs font-bold',
          VERDICT_STYLES[verdict],
        )}
        data-testid="consensus-verdict"
      >
        {verdict}
      </span>
      <span className="text-xs text-slate-400" data-testid="consensus-breakdown">
        {breakdown}
      </span>
    </div>
  );
}
