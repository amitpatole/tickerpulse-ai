'use client';

import { memo } from 'react';
import type { PortfolioPosition } from '@/lib/types';

const CHART_COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#6366f1', // indigo-500
];

interface AllocationChartProps {
  positions: PortfolioPosition[];
}

interface Segment {
  ticker: string;
  pct: number;
  color: string;
  startAngle: number;
  endAngle: number;
}

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function buildArcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const clamped = Math.min(endAngle, startAngle + 359.99);
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, clamped);
  const largeArc = clamped - startAngle > 180 ? 1 : 0;
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

const AllocationChart = memo(function AllocationChart({ positions }: AllocationChartProps) {
  const active = positions.filter((p) => (p.allocation_pct ?? 0) > 0);

  if (active.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-slate-500">No allocation data yet.</p>
      </div>
    );
  }

  const cx = 80;
  const cy = 80;
  const outerR = 68;
  const innerR = 46;
  const midR = (outerR + innerR) / 2;
  const strokeWidth = outerR - innerR;

  const segments: Segment[] = [];
  let cumulative = 0;
  active.forEach((pos, i) => {
    const pct = pos.allocation_pct!;
    const startAngle = (cumulative / 100) * 360;
    const endAngle = ((cumulative + pct) / 100) * 360;
    segments.push({
      ticker: pos.ticker,
      pct,
      color: CHART_COLORS[i % CHART_COLORS.length],
      startAngle,
      endAngle,
    });
    cumulative += pct;
  });

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {/* SVG donut */}
      <div className="flex-shrink-0 self-center">
        <svg
          width={160}
          height={160}
          viewBox="0 0 160 160"
          role="img"
          aria-label="Portfolio allocation donut chart"
        >
          {/* Background ring */}
          <circle
            cx={cx}
            cy={cy}
            r={midR}
            fill="none"
            stroke="#1e293b"
            strokeWidth={strokeWidth}
          />

          {segments.map((seg) => {
            if (seg.endAngle - seg.startAngle >= 359.99) {
              // Full circle — use <circle> to avoid degenerate arc
              return (
                <circle
                  key={seg.ticker}
                  cx={cx}
                  cy={cy}
                  r={midR}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={strokeWidth}
                />
              );
            }
            return (
              <path
                key={seg.ticker}
                d={buildArcPath(cx, cy, midR, seg.startAngle, seg.endAngle)}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeLinecap="butt"
              />
            );
          })}

          {/* Centre label */}
          <text
            x={cx}
            y={cy - 7}
            textAnchor="middle"
            fill="#f1f5f9"
            fontSize="14"
            fontWeight="700"
          >
            {segments.length}
          </text>
          <text x={cx} y={cy + 9} textAnchor="middle" fill="#94a3b8" fontSize="9.5">
            {segments.length === 1 ? 'position' : 'positions'}
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-1 flex-col gap-2 overflow-hidden">
        {segments.map((seg) => (
          <div key={seg.ticker} className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                style={{ backgroundColor: seg.color }}
              />
              <span className="truncate text-xs font-medium text-slate-300">{seg.ticker}</span>
            </div>
            <span className="flex-shrink-0 font-mono text-xs text-slate-400">
              {seg.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

export default AllocationChart;
