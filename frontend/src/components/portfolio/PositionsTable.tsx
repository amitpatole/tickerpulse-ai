'use client';

import { memo, useState } from 'react';
import { clsx } from 'clsx';
import { Pencil, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import type { PortfolioPosition } from '@/lib/types';

interface PositionsTableProps {
  positions: PortfolioPosition[];
  loading: boolean;
  onEdit: (position: PortfolioPosition) => void;
  onDelete: (id: number) => void;
}

function fmtPrice(value: number | null | undefined, currency = 'USD'): string {
  if (value == null) return '—';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

const PositionsTable = memo(function PositionsTable({
  positions,
  loading,
  onEdit,
  onDelete,
}: PositionsTableProps) {
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  if (loading && positions.length === 0) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-slate-700/50" />
        ))}
      </div>
    );
  }

  if (!loading && positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm font-medium text-slate-400">No positions yet</p>
        <p className="mt-1 text-xs text-slate-500">Add your first position to start tracking P&amp;L.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/50">
            {['Ticker', 'Qty', 'Avg Cost', 'Price', 'Market Value', 'P&L', 'P&L %', 'Day Chg', 'Alloc', ''].map(
              (h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 first:pl-4"
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => {
            const isPnlPositive = pos.pnl != null ? pos.pnl >= 0 : null;
            const isDayPositive =
              pos.price_change_pct != null ? pos.price_change_pct >= 0 : null;
            const isConfirming = confirmDelete === pos.id;

            return (
              <tr
                key={pos.id}
                className="border-b border-slate-700/30 transition-colors hover:bg-slate-800/30"
              >
                {/* Ticker */}
                <td className="px-4 py-3">
                  <span className="font-mono text-sm font-semibold text-white">{pos.ticker}</span>
                  {pos.currency !== 'USD' && (
                    <span className="ml-1.5 text-xs text-slate-500">{pos.currency}</span>
                  )}
                </td>

                {/* Quantity */}
                <td className="px-4 py-3 font-mono text-slate-300">
                  {pos.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                </td>

                {/* Avg Cost */}
                <td className="px-4 py-3 font-mono text-slate-300">
                  {fmtPrice(pos.avg_cost, pos.currency)}
                </td>

                {/* Current Price */}
                <td className="px-4 py-3 font-mono text-slate-300">
                  {fmtPrice(pos.current_price, pos.currency)}
                </td>

                {/* Market Value */}
                <td className="px-4 py-3 font-mono text-white">
                  {fmtPrice(pos.market_value, pos.currency)}
                </td>

                {/* P&L */}
                <td className="px-4 py-3">
                  {pos.pnl != null ? (
                    <span
                      className={clsx(
                        'flex items-center gap-1 font-mono text-sm font-semibold',
                        isPnlPositive ? 'text-emerald-400' : 'text-red-400'
                      )}
                    >
                      {isPnlPositive ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {fmtPrice(pos.pnl, pos.currency)}
                    </span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>

                {/* P&L % */}
                <td className="px-4 py-3">
                  {pos.pnl_pct != null ? (
                    <span
                      className={clsx(
                        'font-mono text-sm font-semibold',
                        isPnlPositive ? 'text-emerald-400' : 'text-red-400'
                      )}
                    >
                      {fmtPct(pos.pnl_pct)}
                    </span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>

                {/* Day Change */}
                <td className="px-4 py-3">
                  {pos.price_change_pct != null ? (
                    <span
                      className={clsx(
                        'font-mono text-xs',
                        isDayPositive ? 'text-emerald-400' : 'text-red-400'
                      )}
                    >
                      {fmtPct(pos.price_change_pct)}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">—</span>
                  )}
                </td>

                {/* Allocation */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-700">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${Math.min(pos.allocation_pct ?? 0, 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-slate-400">
                      {pos.allocation_pct != null ? `${pos.allocation_pct.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  {isConfirming ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          onDelete(pos.id);
                          setConfirmDelete(null);
                        }}
                        className="rounded px-2 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="rounded px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onEdit(pos)}
                        className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
                        aria-label={`Edit ${pos.ticker}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(pos.id)}
                        className="rounded p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                        aria-label={`Remove ${pos.ticker}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

export default PositionsTable;
