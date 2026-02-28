```tsx
'use client';

import React from 'react';
import type { JobMetric } from '@/lib/types';

interface Props {
  jobs: JobMetric[];
  loading: boolean;
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

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function SuccessBadge({ rate }: { rate: number }) {
  const pct = rate * 100;
  const color =
    pct >= 90 ? 'text-emerald-400 bg-emerald-500/10' :
    pct >= 70 ? 'text-amber-400 bg-amber-500/10' :
                'text-red-400 bg-red-500/10';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

export default React.memo(function JobsTable({ jobs, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-800/60" />
        ))}
      </div>
    );
  }

  if (!jobs.length) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-slate-700/50 bg-slate-800/40 text-sm text-slate-500">
        No job data for selected period
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700/50">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/50 bg-slate-800/60">
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Job</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">Executions</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">Success</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">Avg Duration</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">Max Duration</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">Total Cost</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">Last Run</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/30">
          {jobs.map((job) => (
            <tr key={job.job_id} className="bg-slate-800/20 hover:bg-slate-800/40 transition-colors">
              <td className="px-4 py-3">
                <p className="font-medium text-white">{job.job_name}</p>
                <p className="text-[10px] text-slate-500">{job.job_id}</p>
              </td>
              <td className="px-4 py-3 text-right text-slate-300">{job.total_executions.toLocaleString()}</td>
              <td className="px-4 py-3 text-right">
                <SuccessBadge rate={job.success_rate} />
              </td>
              <td className="px-4 py-3 text-right text-slate-300">{fmtMs(job.avg_duration_ms)}</td>
              <td className="px-4 py-3 text-right text-slate-400">{fmtMs(job.max_duration_ms)}</td>
              <td className="px-4 py-3 text-right text-slate-300">{fmtCost(job.total_cost)}</td>
              <td className="px-4 py-3 text-right text-slate-500 text-xs">{fmtDate(job.last_executed_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
```