```tsx
'use client';

import { useState, useCallback } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import Header from '@/components/layout/Header';
import ActivityTimeline from '@/components/activity/ActivityTimeline';
import CostSummaryBar from '@/components/activity/CostSummaryBar';
import ActivityFilters from '@/components/activity/ActivityFilters';
import { useApi } from '@/hooks/useApi';
import { useSSE } from '@/hooks/useSSE';
import { getActivityFeed } from '@/lib/api';
import type { ActivityEvent, ActivityFeedResponse, ActivityFilterType, ActivityDayOption } from '@/lib/types';

function fmtCost(value: number): string {
  if (value === 0) return '$0.0000';
  if (value < 0.0001) return '<$0.0001';
  return `$${value.toFixed(4)}`;
}

export default function ActivityPage() {
  const [filterType, setFilterType] = useState<ActivityFilterType>('all');
  const [days, setDays]             = useState<ActivityDayOption>(7);
  const [refreshKey, setRefreshKey] = useState(0);

  const feedResult = useApi<ActivityFeedResponse>(
    () => getActivityFeed({ days, type: filterType }),
    [days, filterType, refreshKey],
  );

  const { recentJobCompletes } = useSSE();

  const events = feedResult.data?.events ?? [];

  // Prepend SSE job_completed events that aren't already in the fetched list
  const sseEvents: ActivityEvent[] = recentJobCompletes
    .filter((jc) => !events.some((e) => e.name === jc.job_name && e.type === 'job'))
    .slice(0, 5)
    .map((jc, i) => ({
      id: `sse_job_${i}`,
      type: 'job' as const,
      name: jc.job_name,
      status: jc.status === 'success' ? 'success' : 'error',
      cost: 0,
      duration_ms: jc.duration_ms ?? null,
      timestamp: new Date().toISOString(),
      summary: null,
    }));

  const mergedEvents = [...sseEvents, ...events];
  const dailyCosts   = feedResult.data?.daily_costs ?? [];
  const totals       = feedResult.data?.totals;

  const handleTypeChange = useCallback((t: ActivityFilterType) => setFilterType(t), []);
  const handleDaysChange = useCallback((d: ActivityDayOption) => setDays(d), []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* ── Page header ─────────────────────────────────────────── */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Activity</h1>
            <p className="mt-1 text-sm text-slate-400">
              Recent agent runs, jobs, and system events
            </p>
          </div>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 px-3 py-1.5 text-sm text-slate-400 transition-colors hover:text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {/* ── Summary stat cards ───────────────────────────────────── */}
        {totals && (
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {([
              { label: 'Total Runs',    value: String(totals.runs)                          },
              { label: 'Total Cost',    value: fmtCost(totals.cost)                         },
              { label: 'Errors',        value: String(totals.errors)                        },
              { label: 'Success Rate',  value: `${(totals.success_rate * 100).toFixed(1)}%` },
            ] as const).map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3"
              >
                <p className="text-lg font-bold text-white">{value}</p>
                <p className="text-xs text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Cost bar + filters ───────────────────────────────────── */}
        <div className="mb-6 space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[1fr_auto] lg:gap-6 lg:items-end">
          <CostSummaryBar dailyCosts={dailyCosts} days={days} />
          <ActivityFilters
            type={filterType}
            days={days}
            onTypeChange={handleTypeChange}
            onDaysChange={handleDaysChange}
          />
        </div>

        {/* ── Timeline ─────────────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-medium text-slate-300">Timeline</h2>
            {!feedResult.loading && (
              <span className="text-xs text-slate-500">
                {mergedEvents.length} event{mergedEvents.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <ActivityTimeline
            events={mergedEvents}
            loading={feedResult.loading}
            error={feedResult.error}
          />
        </div>

      </main>
    </div>
  );
}
```