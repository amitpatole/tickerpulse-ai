'use client';

import { clsx } from 'clsx';
import type { Timeframe } from '@/lib/types';

const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', '6M', '1Y', 'All'];
const COMPACT_TIMEFRAMES: Timeframe[] = ['1W', '1M', '3M'];

interface TimeframeToggleProps {
  selected: Timeframe;
  onChange: (tf: Timeframe) => void;
  compact?: boolean;
}

export default function TimeframeToggle({ selected, onChange, compact = false }: TimeframeToggleProps) {
  const options = compact ? COMPACT_TIMEFRAMES : TIMEFRAMES;
  return (
    <div role="group" aria-label="Chart timeframe" className="flex flex-wrap gap-1">
      {options.map((tf) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          aria-pressed={selected === tf}
          className={clsx(
            'rounded-md font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50',
            compact
              ? 'min-h-[32px] min-w-[32px] px-2 text-[11px]'
              : 'min-h-[44px] min-w-[44px] px-3 text-xs',
            selected === tf
              ? 'bg-blue-600 text-white ring-2 ring-blue-500/50'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
          )}
        >
          {tf}
        </button>
      ))}
    </div>
  );
}
