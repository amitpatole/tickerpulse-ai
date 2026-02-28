```typescript
'use client';

import React from 'react';
import { Activity, CheckCircle2, DollarSign, Cpu, Timer, Database } from 'lucide-react';
import type { MetricsSummary, SystemMetricsSnapshot } from '@/lib/types';

interface Props {
  summary: MetricsSummary | null;
  loading: boolean;
  poolStats?: SystemMetricsSnapshot | null;
}

function fmtCost(value: number): string {
  if (value === 0) return '$0.0000';
  if (value < 0.0001) return '<$0.0001';
  return `$${value.toFixed(4)}`;
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function fmtTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

const SKELETON = <div className="h-28 animate-pulse rounded-xl bg-slate-800/60" />;

export default React.memo(function SummaryCards({ summary, loading, poolStats }: Props) {
  const skeletonCount = poolStats !== undefined ? 7 : 5;

  if (loading || !summary) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: skeletonCount }).map((_, i) => <div key={i}>{SKELETON}</div>)}
      </div>
    );
  }

  const { agents, jobs } = summary;
  const totalRuns = agents.total_runs + jobs.total_executions;
  const successRuns = agents.success_runs + jobs.success_executions;
  const overallSuccessRatePct = totalRuns > 0 ? (successRuns / totalRuns) * 100 : 0;
  const totalCost = agents.total_cost + jobs.total_cost;

  const successColor =
    overallSuccessRatePct >= 90
      ? 'text-emerald-400'
      : overallSuccessRatePct >= 70
      ? 'text-amber-400'
      : 'text-red-400';
  const successBg =
    overallSuccessRatePct >= 90
      ? 'bg-emerald-500/10'
      : overallSuccessRatePct >= 70
      ? 'bg-amber-500/10'
      : 'bg-red-500/10';

  const cards = [
    {
      label: 'Total Runs',
      value: totalRuns.toLocaleString(),
      sub: `${agents.total_runs} agent · ${jobs.total_executions} job`,
      Icon: Activity,
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-500/10',
    },
    {
      label: 'Success Rate',
      value: `${overallSuccessRatePct.toFixed(1)}%`,
      sub: `${agents.error_runs} agent errors`,
      Icon: CheckCircle2,
      iconColor: successColor,
      iconBg: successBg,
    },
    {
      label: 'Total Cost',
      value: fmtCost(totalCost),
      sub: `Agents: ${fmtCost(agents.total_cost)}`,
      Icon: DollarSign,
      iconColor: 'text-violet-400',
      iconBg: 'bg-violet-500/10',
    },
    {
      label: 'Tokens Used',
      value: fmtTokens(agents.total_tokens),
      sub: `${summary.period_days}d window`,
      Icon: Cpu,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10',
    },
    {
      label: 'Avg Duration',
      value: fmtMs(agents.avg_duration_ms),
      sub: 'successful agent runs',
      Icon: Timer,
      iconColor: 'text-cyan-400',
      iconBg: 'bg-cyan-500/10',
    },
  ];

  if (poolStats != null) {
    cards.push(
      {
        label: 'DB Active',
        value: String(poolStats.db_pool_active),
        sub: 'pool connections in use',
        Icon: Database,
        iconColor: 'text-teal-400',
        iconBg: 'bg-teal-500/10',
      },
      {
        label: 'DB Idle',
        value: String(poolStats.db_pool_idle),
        sub: 'pool connections free',
        Icon: Database,
        iconColor: 'text-slate-400',
        iconBg: 'bg-slate-500/10',
      },
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {cards.map(({ label, value, sub, Icon, iconColor, iconBg }) => (
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
            <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
});
```