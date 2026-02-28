'use client';

import React, { useMemo } from 'react';
import type { HealthStatusResponse, SystemMetricsResponse, SystemMetricsSnapshot } from '@/lib/types';

interface Props {
  data: SystemMetricsResponse | null;
  loading: boolean;
  error: string | null;
  healthStatus?: HealthStatusResponse | null;
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

function StatusBadge({ statusClass }: { statusClass: string }) {
  const styles: Record<string, string> = {
    '2xx': 'bg-emerald-500/15 text-emerald-400',
    '4xx': 'bg-amber-500/15  text-amber-400',
    '5xx': 'bg-red-500/15    text-red-400',
  };
  const style = styles[statusClass] ?? 'bg-slate-500/15 text-slate-400';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {statusClass}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inline sparkline — pure SVG, no extra dependencies
// ---------------------------------------------------------------------------

interface SparklineProps {
  snapshots: SystemMetricsSnapshot[];
}

function Sparkline({ snapshots }: SparklineProps) {
  const { cpuPoints, memPoints, xLabels } = useMemo(() => {
    if (snapshots.length < 2) return { cpuPoints: '', memPoints: '', xLabels: [] };

    const W = 708;
    const H = 80;
    const PAD = { top: 8, right: 8, bottom: 24, left: 36 };
    const CW = W - PAD.left - PAD.right;
    const CH = H - PAD.top - PAD.bottom;

    const xScale = (i: number) =>
      snapshots.length > 1 ? (i / (snapshots.length - 1)) * CW : CW / 2;
    const yScale = (v: number) => CH - (v / 100) * CH;

    const pts = (field: 'cpu_pct' | 'mem_pct') =>
      snapshots
        .map((s, i) => `${xScale(i).toFixed(1)},${yScale(s[field]).toFixed(1)}`)
        .join(' ');

    // Show at most 6 x-axis labels
    const step = Math.max(1, Math.ceil(snapshots.length / 6));
    const xLabels = snapshots
      .map((s, i) => ({ i, label: s.recorded_at.slice(11, 16) }))
      .filter(({ i }) => i % step === 0 || i === snapshots.length - 1);

    return { cpuPoints: pts('cpu_pct'), memPoints: pts('mem_pct'), xLabels, W, H, PAD, CW, CH, xScale, yScale };
  }, [snapshots]);

  if (!cpuPoints) {
    return (
      <div className="flex h-24 items-center justify-center text-xs text-slate-500">
        Collecting snapshots — first data arrives after 5 min
      </div>
    );
  }

  const W = 708;
  const H = 80;
  const PAD = { top: 8, right: 8, bottom: 24, left: 36 };
  const CW = W - PAD.left - PAD.right;
  const CH = H - PAD.top - PAD.bottom;
  const xScale = (i: number) =>
    snapshots.length > 1 ? (i / (snapshots.length - 1)) * CW : CW / 2;
  const yScale = (v: number) => CH - (v / 100) * CH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 88 }} aria-label="CPU and memory sparkline">
      <g transform={`translate(${PAD.left},${PAD.top})`}>
        {/* Y-axis ticks at 0, 50, 100 */}
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={0} y1={yScale(v).toFixed(1)} x2={CW} y2={yScale(v).toFixed(1)} stroke="#1e293b" strokeWidth={1} />
            <text x={-6} y={yScale(v)} dominantBaseline="middle" textAnchor="end" fill="#64748b" fontSize={9}>
              {v}%
            </text>
          </g>
        ))}

        {/* Memory line — violet */}
        <polyline points={memPoints} fill="none" stroke="#8b5cf6" strokeWidth={1.5} strokeOpacity={0.7} />

        {/* CPU line — blue */}
        <polyline points={cpuPoints} fill="none" stroke="#3b82f6" strokeWidth={2} />

        {/* X-axis labels */}
        {xLabels.map(({ i, label }) => (
          <text
            key={i}
            x={xScale(i).toFixed(1)}
            y={CH + 16}
            textAnchor="middle"
            fill="#64748b"
            fontSize={9}
          >
            {label}
          </text>
        ))}
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Service health status row
// ---------------------------------------------------------------------------

const SERVICE_LABELS: Record<string, string> = {
  db: 'Database',
  scheduler: 'Scheduler',
  job_health: 'Jobs',
  ai_provider: 'AI Provider',
};

function ServiceChip({ label, value }: { label: string; value: string }) {
  const isOk = value === 'ok';
  const isWarn = value === 'degraded' || value === 'unconfigured' || value === 'not_configured';
  const colorClass = isOk
    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    : isWarn
      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
      : 'bg-red-500/15 text-red-400 border-red-500/30';

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-800/40 px-3 py-2">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${colorClass}`}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default React.memo(function SystemPanel({ data, loading, error, healthStatus }: Props) {
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
            {latest != null ? latest.db_pool_in_use : '—'}
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

      {/* ── Service health status chips ──────────────────────────────── */}
      {healthStatus && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-400">Service Status</h3>
            <span className="text-[10px] text-slate-500">
              {healthStatus.ts ? new Date(healthStatus.ts).toLocaleTimeString() : ''}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SERVICE_LABELS) as (keyof typeof SERVICE_LABELS)[]).map((key) => (
              <ServiceChip
                key={key}
                label={SERVICE_LABELS[key]}
                value={healthStatus[key as keyof HealthStatusResponse] as string}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── CPU / Memory history sparkline ───────────────────────────── */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-400">CPU &amp; Memory History</h3>
          <div className="flex gap-3">
            <div className="flex items-center gap-1.5">
              <div className="h-px w-4 bg-blue-500" style={{ height: 2 }} />
              <span className="text-[10px] text-slate-400">CPU</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-px w-4 bg-violet-500" style={{ height: 2 }} />
              <span className="text-[10px] text-slate-400">Memory</span>
            </div>
          </div>
        </div>
        <Sparkline snapshots={data.snapshots} />
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