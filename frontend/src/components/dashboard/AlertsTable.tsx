'use client';

import { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { useApi } from '@/hooks/useApi';
import { getAlerts } from '@/lib/api';
import type { Alert } from '@/lib/types';

type SeverityFilter = 'all' | 'critical' | 'warning' | 'info';

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

const SEVERITY_STYLES: Record<string, { badge: string; icon: React.ReactNode }> = {
  critical: {
    badge: 'bg-red-500/10 text-red-400 border-red-500/30',
    icon: <AlertCircle className="h-3 w-3" aria-hidden="true" />,
  },
  warning: {
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    icon: <AlertTriangle className="h-3 w-3" aria-hidden="true" />,
  },
  info: {
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    icon: <Info className="h-3 w-3" aria-hidden="true" />,
  },
};

function SeverityBadge({ severity }: { severity: string }) {
  const style = SEVERITY_STYLES[severity] ?? {
    badge: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    icon: <Info className="h-3 w-3" aria-hidden="true" />,
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize',
        style.badge
      )}
    >
      {style.icon}
      {severity}
    </span>
  );
}

const FILTERS: { label: string; value: SeverityFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Critical', value: 'critical' },
  { label: 'Warning', value: 'warning' },
  { label: 'Info', value: 'info' },
];

interface AlertsTableProps {
  /**
   * Pre-fetched alerts from useDashboardData passed as initial data
   * to eliminate the cold-start loading flash on page load.
   * The component still self-refreshes every 15s via useApi.
   * - undefined: not passed → show loading until first fetch completes
   * - null:      parent is loading → show loading
   * - Alert[]:   use as initial display until fresh fetch arrives
   */
  initialData?: Alert[] | null;
}

export default function AlertsTable({ initialData }: AlertsTableProps = {}) {
  const [filter, setFilter] = useState<SeverityFilter>('all');

  const { data: freshAlerts, loading, error } = useApi<Alert[]>(
    getAlerts,
    [],
    { refreshInterval: 15000 }
  );

  // Prefer freshly fetched data; fall back to initialData during the first load cycle
  const alerts = freshAlerts ?? initialData ?? null;

  const filtered = (alerts ?? []).filter(
    (a) => filter === 'all' || a.severity === filter
  );

  const counts = (alerts ?? []).reduce<Record<string, number>>((acc, a) => {
    acc[a.severity] = (acc[a.severity] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/50 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">
          Alerts
          {alerts && alerts.length > 0 && (
            <span className="ml-2 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
              {alerts.length}
            </span>
          )}
        </h2>

        {/* Severity filter tabs */}
        <div role="tablist" aria-label="Filter alerts by severity" className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={clsx(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                filter === f.value
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
              )}
            >
              {f.label}
              {f.value !== 'all' && counts[f.value] != null && (
                <span className="ml-1 text-slate-500">({counts[f.value]})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table body */}
      <div
        className="overflow-x-auto"
        aria-live="polite"
        aria-busy={loading && !alerts}
      >
        {loading && !alerts && (
          <div className="p-6 text-center text-sm text-slate-500">Loading alerts...</div>
        )}

        {error && !alerts && (
          <div className="p-4 text-center text-sm text-red-400">{error}</div>
        )}

        {alerts && filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-500">
            {filter === 'all' ? 'No alerts recorded yet.' : `No ${filter} alerts.`}
          </div>
        )}

        {alerts && filtered.length > 0 && (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Alerts list, filtered by {filter}</caption>
            <thead>
              <tr className="border-b border-slate-700/50">
                <th scope="col" className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  Ticker
                </th>
                <th scope="col" className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  Severity
                </th>
                <th scope="col" className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  Message
                </th>
                <th scope="col" className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  Type
                </th>
                <th scope="col" className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  Time
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filtered.map((alert, idx) => (
                <tr
                  key={alert.id ?? idx}
                  tabIndex={0}
                  aria-label={`${alert.ticker} ${alert.severity} alert: ${alert.message}`}
                  className="transition-colors hover:bg-slate-700/20 focus:bg-slate-700/30 focus:outline-none"
                >
                  <td className="px-4 py-3">
                    <span className="rounded bg-slate-700 px-1.5 py-0.5 text-xs font-medium text-slate-200">
                      {alert.ticker}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={alert.severity} />
                  </td>
                  <td className="max-w-xs px-4 py-3 text-slate-300">
                    <p className="truncate" title={alert.message}>{alert.message}</p>
                  </td>
                  <td className="px-4 py-3 text-xs capitalize text-slate-400">
                    {alert.type?.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {timeAgo(alert.created_at)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
