'use client';

import React from 'react';
import type { DailyCost } from '@/lib/types';

interface Props {
  dailyCosts: DailyCost[];
}

function fmtCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.0001) return '<$0.0001';
  return `$${cost.toFixed(4)}`;
}

const PAD = { top: 36, right: 12, bottom: 52, left: 12 };
const W = 800;
const H = 160;
const CW = W - PAD.left - PAD.right;
const CH = H - PAD.top - PAD.bottom;

export default function CostSummaryBar({ dailyCosts }: Props) {
  if (dailyCosts.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-slate-500">
        No cost data for the selected period
      </div>
    );
  }

  const maxCost = Math.max(...dailyCosts.map((d) => d.total_cost), 0.000001);
  const slotW = CW / dailyCosts.length;
  const barW = Math.max(4, slotW * 0.65);

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-400">Daily Cost</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 160 }}
        aria-label="Daily cost bar chart"
      >
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {/* Baseline */}
          <line x1={0} y1={CH} x2={CW} y2={CH} stroke="#334155" strokeWidth={1} />

          {dailyCosts.map((entry, i) => {
            const barH = Math.max(2, (entry.total_cost / maxCost) * CH);
            const cx = i * slotW + slotW / 2;
            const x = cx - barW / 2;
            const y = CH - barH;
            const costLabel = fmtCost(entry.total_cost);
            const runLabel = `${entry.run_count} run${entry.run_count !== 1 ? 's' : ''}`;

            return (
              <g key={entry.date}>
                {/* Bar */}
                <rect
                  x={x.toFixed(1)}
                  y={y.toFixed(1)}
                  width={barW.toFixed(1)}
                  height={barH.toFixed(1)}
                  fill="#3b82f6"
                  fillOpacity={0.7}
                  rx={2}
                  data-bar="true"
                />

                {/* Cost label above bar */}
                <text
                  x={cx.toFixed(1)}
                  y={Math.max(10, y - 3).toFixed(1)}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize={9}
                >
                  {costLabel}
                </text>

                {/* Date label */}
                <text
                  x={cx.toFixed(1)}
                  y={(CH + 14).toFixed(1)}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize={9}
                >
                  {entry.date}
                </text>

                {/* Run count label */}
                <text
                  x={cx.toFixed(1)}
                  y={(CH + 26).toFixed(1)}
                  textAnchor="middle"
                  fill="#475569"
                  fontSize={8}
                >
                  {runLabel}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
