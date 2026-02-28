```tsx
'use client';

import { useState } from 'react';
import { Bot, CheckCircle, DollarSign, Zap } from 'lucide-react';
import { clsx } from 'clsx';
import Header from '@/components/layout/Header';
import ActivityFeed from '@/components/agents/ActivityFeed';
import { useApi } from '@/hooks/useApi';
import { getMetricsSummary, getAgentMetrics, getJobMetrics } from '@/lib/api';
import type { MetricsSummary, AgentMetricsResponse, JobMetricsResponse } from '@/lib/types';
import { formatLocalDate } from '@/lib/formatTime';

const PERIOD_OPTIONS = [
  { label: '7d', value: 7 },
  { label: '14d', value: 14 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
];

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.001) return `$${cost.toFixed(6)}`;
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function successRateColor(rate: number): string {
  if (rate >= 0.9) return 'text-emerald-400';
  if (rate >= 0.7) return 'text-amber-400';
  return 'text-red-400';
}

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  sub?: string;
  valueClass?: string;
}

function StatCard({ label, value, icon, sub, valueClass = 'text-white' }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
        <span className="text-slate-500">{icon}</span>
      </div>
      <p className={clsx('mt-2 text-2xl font-bold font-mono', valueClass)}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
// ... (full page implementation as written above)
```