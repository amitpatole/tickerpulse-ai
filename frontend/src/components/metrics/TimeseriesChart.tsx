'use client';

import React, { useMemo } from 'react';
import type { TimeseriesDataPoint } from '@/lib/types';

interface Props {
  data: TimeseriesDataPoint[];
  metric: string;
  loading: boolean;
}

const COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444',
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#6366f1',
];

const PAD = { top: 24, right: 24, bottom: 44, left: 68 };
const W = 800;
const H = 280;
const CW = W - PAD.left - PAD.right;
const CH = H - PAD.top - PAD.bottom;
const Y_TICKS = 4;
const MAX_X_LABELS = 8;

function metricLabel(metric: string): string {
  switch (metric) {
    case 'cost':     return 'Daily Cost ($)';
    case 'runs':     return 'Daily Run Count';
    case 'duration': return 'Avg Duration (ms)';
    case 'tokens':   return 'Daily Token Usage';
    default:         return metric;
  }
}

function fmtYLabel(value: number, metric: string): string {
  if (metric === 'cost') {
    if (value === 0) return '$0';
    if (value < 0.001) return `$${(value * 1000).toFixed(2)}m`;
    return `$${value.toFixed(3)}`;
  }
  if (metric === 'tokens') {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
    return String(Math.round(value));
  }
  if (metric === 'duration') {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
    return `${Math.round(value)}ms`;
  }
  return String(Math.round(value));
}

export default React.memo(function TimeseriesChart({ data, metric, loading }: Props) {
  const { days, agents, series, totals, maxY, p95Totals } = useMemo(() => {
    if (!data.length) {
      return { days: [], agents: [], series: {}, totals: {}, maxY: 0, p95Totals: {} };
    }

    const days = Array.from(new Set(data.map((d) => d.day))).sort();
    const agents = Array.from(new Set(data.map((d) => d.agent_name)));

    const series: Record<string, Record<string, number>> = {};
    for (const agent of agents) series[agent] = {};
    for (const point of data) series[point.agent_name][point.day] = point.value;

    const totals: Record<string, number> = {};
    for (const day of days) {
      totals[day] = agents.reduce((sum, ag) => sum + (series[ag][day] ?? 0), 0);
    }

    // Average p95 across agents per day — only populated for metric='duration'.
    const p95Totals: Record<string, number> = {};
    for (const day of days) {
      const pts = data.filter((d) => d.day === day && d.p95_duration_ms != null);
      if (pts.length > 0) {
        p95Totals[day] = pts.reduce((sum, d) => sum + (d.p95_duration_ms ?? 0), 0) / pts.length;
      }
    }

    const maxY = Math.max(
      ...days.map((d) => totals[d]),
      ...Object.values(p95Totals),
      0,
    );
    return { days, agents, series, totals, maxY, p95Totals };
  }, [data]);

  if (loading) {
    return <div className="h-[280px] animate-pulse rounded-xl bg-slate-800/60" />;
  }

  if (!days.length) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-xl border border-slate-700/50 bg-slate-800/40 text-sm text-slate-500">
        No data for selected period
      </div>
    );
  }

  const xScale = (i: number) =>
    days.length > 1 ? (i / (days.length - 1)) * CW : CW / 2;
  const yScale = (v: number) => CH - (maxY > 0 ? (v / maxY) * CH : 0);

  const labelInterval = Math.ceil(days.length / MAX_X_LABELS);

  const totalPolyline = days
    .map((day, i) => `${xScale(i).toFixed(1)},${yScale(totals[day]).toFixed(1)}`)
    .join(' ');

  return (
    <div>
      <p className="mb-3 text-xs font-medium text-slate-400">{metricLabel(metric)}</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 260 }}
        aria-label={`${metric} timeseries chart`}
      >
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {/* Y-axis grid + labels */}
          {Array.from({ length: Y_TICKS + 1 }).map((_, i) => {
            const y = (i / Y_TICKS) * CH;
            const val = maxY * (1 - i / Y_TICKS);
            return (
              <g key={i}>
                <line
                  x1={0} y1={y.toFixed(1)}
                  x2={CW} y2={y.toFixed(1)}
                  stroke="#1e293b" strokeWidth={1}
                />
                <text
                  x={-8} y={y}
                  dominantBaseline="middle"
                  textAnchor="end"
                  fill="#64748b"
                  fontSize={11}
                >
                  {fmtYLabel(val, metric)}
                </text>
              </g>
            );
          })}

          {/* X-axis baseline */}
          <line x1={0} y1={CH} x2={CW} y2={CH} stroke="#334155" strokeWidth={1} />

          {/* Per-agent lines (drawn below total) */}
          {agents.length > 1 && agents.map((agent, idx) => {
            const points = days
              .map((day, i) =>
                `${xScale(i).toFixed(1)},${yScale(series[agent][day] ?? 0).toFixed(1)}`
              )
              .join(' ');
            return (
              <polyline
                key={agent}
                points={points}
                fill="none"
                stroke={COLORS[idx % COLORS.length]}
                strokeWidth={1.5}
                strokeOpacity={0.55}
              />
            );
          })}

          {/* Total aggregate line */}
          <polyline
            points={totalPolyline}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={2.5}
          />

          {/* P95 duration line — dashed amber, only present when metric='duration' */}
          {Object.keys(p95Totals).length > 0 && (() => {
            const pts = days
              .map((day, i) =>
                p95Totals[day] != null
                  ? `${xScale(i).toFixed(1)},${yScale(p95Totals[day]).toFixed(1)}`
                  : null
              )
              .filter(Boolean)
              .join(' ');
            return pts ? (
              <polyline
                points={pts}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                aria-label="P95 duration"
              />
            ) : null;
          })()}

          {/* Data points on total line */}
          {days.map((day, i) => (
            <circle
              key={day}
              cx={xScale(i).toFixed(1)}
              cy={yScale(totals[day]).toFixed(1)}
              r={3}
              fill="#3b82f6"
            />
          ))}

          {/* X-axis labels */}
          {days.map((day, i) => {
            if (i % labelInterval !== 0 && i !== days.length - 1) return null;
            return (
              <text
                key={day}
                x={xScale(i).toFixed(1)}
                y={CH + 18}
                textAnchor="middle"
                fill="#64748b"
                fontSize={10}
              >
                {day.slice(5)}
              </text>
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      {(agents.length > 1 || Object.keys(p95Totals).length > 0) && (
        <div className="mt-3 flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-px w-5 bg-blue-500" style={{ height: 2 }} />
            <span className="text-[10px] text-slate-400">Total</span>
          </div>
          {Object.keys(p95Totals).length > 0 && (
            <div className="flex items-center gap-1.5">
              <svg width={20} height={10} aria-hidden>
                <line x1={0} y1={5} x2={20} y2={5} stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 2" />
              </svg>
              <span className="text-[10px] text-slate-400">P95</span>
            </div>
          )}
          {agents.length > 1 && agents.map((agent, i) => (
            <div key={agent} className="flex items-center gap-1.5">
              <div
                className="w-5"
                style={{ height: 2, backgroundColor: COLORS[i % COLORS.length], opacity: 0.55 }}
              />
              <span className="text-[10px] text-slate-500">{agent}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
