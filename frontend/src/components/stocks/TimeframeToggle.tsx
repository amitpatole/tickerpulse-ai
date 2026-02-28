'use client';

import { clsx } from 'clsx';
import type { Timeframe } from '@/lib/types';

export const STOCK_CHART_TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'All'];
export const COMPARISON_TIMEFRAMES: Timeframe[] = ['1W', '1M', '3M', '6M', '1Y', '5Y'];

type SingleSelectProps = {
  multiSelect?: false;
  selected: Timeframe;
  onChange: (tf: Timeframe) => void;
};

type MultiSelectProps = {
  multiSelect: true;
  selected: Timeframe[];
  onChange: (tfs: Timeframe[]) => void;
};

type TimeframeToggleProps = (SingleSelectProps | MultiSelectProps) & {
  timeframes?: Timeframe[];
  /** Renders smaller buttons suited for compact chart headers. */
  compact?: boolean;
};

export default function TimeframeToggle(props: TimeframeToggleProps) {
  const { timeframes = STOCK_CHART_TIMEFRAMES, compact = false } = props;

  function handleClick(tf: Timeframe) {
    if (props.multiSelect) {
      const current = props.selected;
      if (current.includes(tf)) {
        if (current.length <= 2) return; // enforce minimum two selected
        props.onChange(current.filter((t) => t !== tf));
      } else {
        if (current.length >= 4) return; // enforce maximum four selected
        props.onChange([...current, tf]);
      }
    } else {
      props.onChange(tf);
    }
  }

  function isSelected(tf: Timeframe): boolean {
    if (props.multiSelect) return props.selected.includes(tf);
    return props.selected === tf;
  }

  function isDisabled(tf: Timeframe): boolean {
    if (!props.multiSelect) return false;
    // Disable deselection when it would drop below the two-item minimum
    if (props.selected.includes(tf) && props.selected.length <= 2) return true;
    // Disable selection when already at the four-item maximum
    if (!props.selected.includes(tf) && props.selected.length >= 4) return true;
    return false;
  }

  return (
    <div role="group" aria-label="Chart timeframe" className="flex flex-wrap gap-1">
      {timeframes.map((tf) => {
        const selected = isSelected(tf);
        const disabled = isDisabled(tf);
        return (
          <button
            key={tf}
            onClick={() => handleClick(tf)}
            aria-pressed={selected}
            disabled={disabled}
            className={clsx(
              'font-semibold transition-colors focus:outline-none',
              compact
                ? 'rounded px-2 py-1 text-[11px] focus:ring-1 focus:ring-blue-500/50'
                : 'min-h-[44px] min-w-[44px] rounded-md px-3 text-xs focus:ring-2 focus:ring-blue-500/50',
              selected
                ? 'bg-blue-600 text-white ring-2 ring-blue-500/50'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white',
              disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            {tf}
          </button>
        );
      })}
    </div>
  );
}
