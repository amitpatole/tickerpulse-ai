```typescript
'use client';

import React from 'react';
import type { SystemMetricsResponse } from '@/lib/types';

interface Props {
  data: SystemMetricsResponse | null;
  loading: boolean;
  error: string | null;
}

// Render integer values with an explicit ".0" so table cells display
// consistently (backend Python round() serialises 5000.0 to JSON as 5000).
function fmtLatency(ms: number): string {
  return Number.isInteger(ms) ? `${ms}.0` : String(ms);
}

function GaugeBar({ value, color }: { value: number; color: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-700">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatusBadge({ statusClass }: { statusClass: '2xx' | '4xx' | '5xx' }) {
  const styles: Record<string, string> = {
    '2xx': 'bg-emerald-500/15 text-emerald-400',
    '4xx': 'bg-amber-500/15  text-amber-400',
    '5xx': 'bg-red-500/15    text-red-400',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[statusClass]}`}>
      {statusClass}
    </span>
  );
}

export default React.memo(function SystemPanel({ data, loading, error }: Props) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-800/60" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-slate-800/60" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const latest = data.snapshots.length > 0
    ? data.snapshots[data.snapshots.length - 1]
    : null;

  return (
    <div className="space-y-6">

      {/* ── Gauge cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">

        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
          <p className="text-xs font-medium text-slate-400">CPU</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {latest != null ? `${latest.cpu_pct}%` : '—'}
          </p>
          {latest != null && <GaugeBar value={latest.cpu_pct} color="bg-blue-500" />}
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
          <p className="text-xs font-medium text-slate-400">Memory</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {latest != null ? `${latest.mem_pct}%` : '—'}
          </p>
          {latest != null && <GaugeBar value={latest.mem_pct} color="bg-violet-500" />}
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
          <p className="text-xs font-medium text-slate-400">DB Active</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {latest != null ? latest.db_pool_active : '—'}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">pool connections</p>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
          <p className="text-xs font-medium text-slate-400">DB Idle</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {latest != null ? latest.db_pool_idle : '—'}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">pool connections</p>
        </div>

      </div>

      {/* ── Endpoint latency table ───────────────────────────────────── */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-slate-400">API Endpoint Latency</h3>

        {data.endpoints.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl border border-slate-700/50 bg-slate-800/40 text-sm text-slate-500">
            No API endpoints recorded
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-700/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/60">
                  <th className="px-4 py-3 text-left   text-xs font-medium text-slate-400">Endpoint</th>
                  <th className="px-4 py-3 text-left   text-xs font-medium text-slate-400">Method</th>
                  <th className="px-4 py-3 text-right  text-xs font-medium text-slate-400">Calls</th>
                  <th className="px-4 py-3 text-right  text-xs font-medium text-slate-400">P95</th>
                  <th className="px-4 py-3 text-right  text-xs font-medium text-slate-400">Avg</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {data.endpoints.map((ep, i) => (
                  <tr key={i} className="bg-slate-800/20 transition-colors hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono text-xs text-white">{ep.endpoint}</td>
                    <td className="px-4 py-3 text-xs   text-slate-300">{ep.method}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{ep.call_count}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{fmtLatency(ep.p95_ms)}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{fmtLatency(ep.avg_ms)}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge statusClass={ep.status_class} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
});
```