```tsx
'use client';

import React from 'react';
import { clsx } from 'clsx';
import type { ActivityFilterType, ActivityDayOption } from '@/lib/types';

interface Props {
  type: ActivityFilterType;
  days: ActivityDayOption;
  onTypeChange: (type: ActivityFilterType) => void;
  onDaysChange: (days: ActivityDayOption) => void;
}

const TYPE_OPTIONS: { value: ActivityFilterType; label: string }[] = [
  { value: 'all',   label: 'All'    },
  { value: 'agent', label: 'Agents' },
  { value: 'job',   label: 'Jobs'   },
  { value: 'error', label: 'Errors' },
];

const DAY_OPTIONS: ActivityDayOption[] = [1, 7, 30];

export default function ActivityFilters({ type, days, onTypeChange, onDaysChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Type filter */}
      <div className="flex rounded-lg border border-slate-700/50 p-0.5">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onTypeChange(opt.value)}
            className={clsx(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              type === opt.value
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Days filter */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500">Last</span>
        <div className="flex rounded-lg border border-slate-700/50 p-0.5">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              className={clsx(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                days === d
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white',
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```