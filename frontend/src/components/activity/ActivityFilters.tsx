'use client';

import React from 'react';
import type { ActivityFilterType } from '@/lib/types';

const TYPE_OPTIONS: { label: string; value: ActivityFilterType }[] = [
  { label: 'All',    value: 'all'   },
  { label: 'Agents', value: 'agent' },
  { label: 'Jobs',   value: 'job'   },
  { label: 'Errors', value: 'error' },
];

const PERIOD_OPTIONS: { label: string; value: string }[] = [
  { label: '1d',  value: '1d'  },
  { label: '7d',  value: '7d'  },
  { label: '30d', value: '30d' },
];

interface Props {
  type: ActivityFilterType;
  period: string;
  onTypeChange?: (type: ActivityFilterType) => void;
  onPeriodChange?: (period: string) => void;
}

export default function ActivityFilters({ type, period, onTypeChange, onPeriodChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Type</span>
        <div className="flex rounded-lg border border-slate-700/50 p-0.5">
          {TYPE_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => onTypeChange?.(value)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                type === value
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Period</span>
        <div className="flex rounded-lg border border-slate-700/50 p-0.5">
          {PERIOD_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => onPeriodChange?.(value)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                period === value
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
