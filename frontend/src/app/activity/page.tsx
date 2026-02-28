'use client';

import React from 'react';
import {
  RefreshCw,
  DollarSign,
  Activity,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import CostSummaryBar from '@/components/activity/CostSummaryBar';
import ActivityFilters from '@/components/activity/ActivityFilters';
import ActivityTimeline from '@/components/activity/ActivityTimeline';
import { useApi } from '@/hooks/useApi';
import { usePersistedState } from '@/hooks/usePersistedState';
import { getActivityFeed } from '@/lib/api';
import type { ActivityFilterType, ActivityTotals } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERIOD_TO_DAYS: Record<string, number> = { '1d': 1, '7d': 7, '30d': 30 };

// ---------------------------------------------------------------------------
// Stat cards
// ---------------------------------------------------------------------------

function fmtCost(value: number): string {
  if (value === 0) return '$0.0000';
  if (value < 0.0001) return '<$0.0001';
  return `$${value.toFixed(4)}`;
}

function StatCards({ totals, loading }: { totals: ActivityTotals | undefined; loading: boolean }) {
  const SKELETON = <div className="h-24 animate-pulse rounded-xl bg-slate-800/60" />;

  if (loading || !totals) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i}>{SKELETON}</div>)}
      </div>
    );
  }

  const successRatePct = (totals.success_rate * 100).toFixed(1);
  const successColor =
    totals.success_rate >= 0.9
      ? 'text-emerald-400'
      : totals.success_rate >= 0.7
      ? 'text-amber-400'
      : 'text-red-400';

  const cards = [
    {
      label: 'Total Cost',
      value: fmtCost(totals.cost),
      Icon: DollarSign,
      iconColor: 'text-violet-400',
      iconBg: 'bg-violet-500/10',
    },
    {
      label: 'Total Runs',
      value: totals.runs.toLocaleString(),
      Icon: Activity,
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-500/10',
    },
    {
      label: 'Errors',
      value: totals.errors.toLocaleString(),
      Icon: AlertTriangle,
      iconColor: 'text-red-400',
      iconBg: 'bg-red-500/10',
    },
    {
      label: 'Success Rate',
      value: `${successRatePct}%`,
      Icon: CheckCircle2,
      iconColor: successColor,
      iconBg: 'bg-emerald-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map(({ label, value, Icon, iconColor, iconBg }) => (
        <div
          key={label}
          className="flex flex-col gap-3 rounded-xl border border-slate-700/50 bg-slate-800/40 p-4"
        >
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div>
            <p className="text-lg font-bold text-white">{value}</p>
            <p className="text-xs text-slate-400">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ActivityPage() {
  const { getState, setState } = usePersistedState();

  const type = (getState<ActivityFilterType>('activity_filter') ?? 'all') as ActivityFilterType;
  const period = (getState<string>('activity_period') ?? '7d') as string;
  const days = PERIOD_TO_DAYS[period] ?? 7;

  const feedResult = useApi(
    () => getActivityFeed({ type, days }),
    [type, days],
    { refreshInterval: 60_000 },
  );

  const totals = feedResult.data?.totals;
  const dailyCosts = feedResult.data?.daily_costs ?? [];
  const events = feedResult.data?.events ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header title="Activity" subtitle="Agent runs, job executions, and system events" />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* ── Page header ───────────────────────────────────────────── */}
        <div className="mb-6 flex justify-end">
          <button
            onClick={feedResult.refetch}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 px-3 py-1.5 text-sm text-slate-400 transition-colors hover:text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {/* ── Summary stat cards ────────────────────────────────────── */}
        <div className="mb-6">
          <StatCards totals={totals} loading={feedResult.loading} />
        </div>

        {/* ── Cost bar chart ────────────────────────────────────────── */}
        <div className="mb-6 rounded-xl border border-slate-700/50 bg-slate-800/40 p-5">
          <CostSummaryBar dailyCosts={dailyCosts} />
        </div>

        {/* ── Filters ───────────────────────────────────────────────── */}
        <div className="mb-4">
          <ActivityFilters
            type={type}
            period={period}
            onTypeChange={(t) => setState('activity_filter', t)}
            onPeriodChange={(p) => setState('activity_period', p)}
          />
        </div>

        {/* ── Timeline ──────────────────────────────────────────────── */}
        <ActivityTimeline
          events={events}
          loading={feedResult.loading}
          error={feedResult.error}
        />

      </main>
    </div>
  );
}
