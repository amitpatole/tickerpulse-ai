'use client';

import { memo } from 'react';
import { clsx } from 'clsx';
import { TrendingUp, TrendingDown, DollarSign, Briefcase } from 'lucide-react';
import type { PortfolioSummary } from '@/lib/types';

interface SummaryCardsProps {
  summary: PortfolioSummary | null;
  loading: boolean;
}

function fmt(value: number | null | undefined, decimals = 2): string {
  if (value == null) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

interface CardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  positive?: boolean | null;
  loading?: boolean;
}

function Card({ icon: Icon, label, value, sub, positive, loading }: CardProps) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-700/50">
          <Icon className="h-3.5 w-3.5 text-slate-400" />
        </div>
      </div>
      {loading ? (
        <div className="h-6 w-24 animate-pulse rounded bg-slate-700" />
      ) : (
        <p
          className={clsx(
            'text-lg font-bold',
            positive === true && 'text-emerald-400',
            positive === false && 'text-red-400',
            positive == null && 'text-white'
          )}
        >
          {value}
        </p>
      )}
      {sub && !loading && (
        <p className="mt-1 text-xs text-slate-500">{sub}</p>
      )}
    </div>
  );
}

const SummaryCards = memo(function SummaryCards({ summary, loading }: SummaryCardsProps) {
  const pnl = summary?.total_pnl ?? null;
  const pnlPct = summary?.total_pnl_pct ?? null;
  const isPnlPositive = pnl != null ? pnl >= 0 : null;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Card
        icon={Briefcase}
        label="Portfolio Value"
        value={fmtCurrency(summary?.total_value)}
        sub={`${summary?.position_count ?? 0} position${(summary?.position_count ?? 0) !== 1 ? 's' : ''}`}
        loading={loading}
      />
      <Card
        icon={DollarSign}
        label="Total Cost Basis"
        value={fmtCurrency(summary?.total_cost)}
        loading={loading}
      />
      <Card
        icon={isPnlPositive === false ? TrendingDown : TrendingUp}
        label="Unrealised P&L"
        value={pnl != null ? `${pnl >= 0 ? '+' : ''}${fmtCurrency(pnl)}` : '—'}
        positive={isPnlPositive}
        loading={loading}
      />
      <Card
        icon={isPnlPositive === false ? TrendingDown : TrendingUp}
        label="P&L %"
        value={pnlPct != null ? `${pnlPct >= 0 ? '+' : ''}${fmt(pnlPct)}%` : '—'}
        positive={isPnlPositive}
        loading={loading}
      />
    </div>
  );
});

export default SummaryCards;
