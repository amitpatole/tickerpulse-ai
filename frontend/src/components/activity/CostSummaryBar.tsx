```tsx
'use client';

import React, { useState } from 'react';
import type { DailyCost } from '@/lib/types';

interface Props {
  dailyCosts: DailyCost[];
  days: number;
}

function fmtCost(value: number): string {
  if (value === 0) return '$0.00';
  if (value < 0.0001) return '<$0.0001';
  return `$${value.toFixed(4)}`;
}

function buildDateRange(days: number): string[] {
  const displayDays = Math.min(days, 7);
  const dates: string[] = [];
  for (let i = displayDays - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export default function CostSummaryBar({ dailyCosts, days }: Props) {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const costMap = new Map(dailyCosts.map((d) => [d.date, d]));
  const dateRange = buildDateRange(days);
  const buckets = dateRange.map(
    (date) => costMap.get(date) ?? { date, total_cost: 0, run_count: 0 },
  );
  const maxCost = Math.max(...buckets.map((b) => b.total_cost), 0.0001);

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">Daily Costs</h3>
        <span className="text-xs text-slate-500">Last {dateRange.length} days</span>
      </div>

      <div className="flex h-16 items-end gap-1">
        {buckets.map(({ date, total_cost, run_count }) => {
          const heightPct = (total_cost / maxCost) * 100;
          const isHovered = hoveredDate === date;
          return (
            <div
              key={date}
              className="group relative flex-1"
              onMouseEnter={() => setHoveredDate(date)}
              onMouseLeave={() => setHoveredDate(null)}
            >
              <div
                className={`w-full rounded-sm transition-colors ${
                  total_cost > 0 ? 'bg-blue-500 hover:bg-blue-400' : 'bg-slate-700/40'
                }`}
                style={{ height: `${Math.max(heightPct, total_cost > 0 ? 8 : 4)}%` }}
              />
              {isHovered && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs shadow-lg">
                  <p className="font-medium text-white">{date}</p>
                  <p className="text-slate-300">{fmtCost(total_cost)}</p>
                  <p className="text-slate-400">{run_count} run{run_count !== 1 ? 's' : ''}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between text-[10px] text-slate-500">
        <span>{buckets[0]?.date?.slice(5) ?? ''}</span>
        <span>{buckets[buckets.length - 1]?.date?.slice(5) ?? ''}</span>
      </div>
    </div>
  );
}
```