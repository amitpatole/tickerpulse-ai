'use client';

import { BarChart3, Bell, Activity, TrendingUp } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { getStocks, getAlerts, getAgents } from '@/lib/api';
import type { Stock, Alert, Agent, DashboardSummary } from '@/lib/types';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  loading?: boolean;
}

function KPICard({ title, value, subtitle, icon, color, loading }: KPICardProps) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{title}</p>
          {loading ? (
            <div className="mt-2 h-8 w-20 animate-pulse rounded bg-slate-700" />
          ) : (
            <p className="mt-1 text-2xl font-bold text-white font-mono">{value}</p>
          )}
          {subtitle && !loading && (
            <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
          )}
        </div>
        <div className={`rounded-lg p-2.5 ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

interface KPICardsProps {
  /**
   * Pre-fetched dashboard summary from useDashboardData.
   * - undefined: prop not passed → component self-fetches via useApi (default behaviour)
   * - null:      prop passed but parent is still loading → show skeleton
   * - DashboardSummary: prop has data → use it, independent fetches are disabled
   */
  summary?: DashboardSummary | null;
}

export default function KPICards({ summary }: KPICardsProps = {}) {
  // When the caller passes the summary prop (even null), we disable the
  // three independent API calls to avoid duplicate requests on the dashboard.
  const hasSummary = summary !== undefined;

  const { data: stocks, loading: stocksLoading } = useApi<Stock[]>(
    getStocks, [], { refreshInterval: 30000, enabled: !hasSummary }
  );
  const { data: alertsData, loading: alertsLoading } = useApi<Alert[]>(
    getAlerts, [], { refreshInterval: 15000, enabled: !hasSummary }
  );
  const { data: agents, loading: agentsLoading } = useApi<Agent[]>(
    getAgents, [], { refreshInterval: 10000, enabled: !hasSummary }
  );

  // Determine loading state per card
  const summaryLoading = hasSummary && summary === null;
  const stocksLoadingFinal  = hasSummary ? summaryLoading : stocksLoading;
  const alertsLoadingFinal  = hasSummary ? summaryLoading : alertsLoading;
  const regimeLoadingFinal  = hasSummary ? summaryLoading : false;
  const agentsLoadingFinal  = hasSummary ? summaryLoading : agentsLoading;

  // Derive values from summary prop (when provided) or from independent fetches
  const totalStocks = hasSummary
    ? (summary?.active_stock_count ?? 0)
    : (stocks?.filter(s => s.active)?.length ?? 0);

  const totalTracked = hasSummary
    ? (summary?.stock_count ?? 0)
    : (stocks?.length ?? 0);

  const activeAlerts = hasSummary
    ? (summary?.active_alert_count ?? 0)
    : (alertsData?.length ?? 0);

  const marketRegime = hasSummary
    ? (summary?.market_regime ?? 'Normal')
    : 'Normal';

  const totalAgents = hasSummary
    ? (summary?.agent_status?.total ?? 0)
    : (agents?.length ?? 0);

  const agentCounts = hasSummary
    ? (summary?.agent_status ?? { running: 0, idle: 0, error: 0 })
    : (agents?.reduce(
        (acc, a) => {
          if (a.status === 'running') acc.running++;
          else if (a.status === 'error') acc.error++;
          else acc.idle++;
          return acc;
        },
        { running: 0, idle: 0, error: 0 }
      ) ?? { running: 0, idle: 0, error: 0 });

  const agentStatusText = `${agentCounts.running} running, ${agentCounts.idle} idle${agentCounts.error > 0 ? `, ${agentCounts.error} error` : ''}`;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KPICard
        title="Stocks Monitored"
        value={totalStocks}
        subtitle={`${totalTracked} total tracked`}
        icon={<BarChart3 className="h-5 w-5 text-blue-400" />}
        color="bg-blue-500/10"
        loading={stocksLoadingFinal}
      />
      <KPICard
        title="Active Alerts"
        value={activeAlerts}
        subtitle="Last 24 hours"
        icon={<Bell className="h-5 w-5 text-amber-400" />}
        color="bg-amber-500/10"
        loading={alertsLoadingFinal}
      />
      <KPICard
        title="Market Regime"
        value={marketRegime}
        subtitle="Assessed by regime agent"
        icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
        color="bg-emerald-500/10"
        loading={regimeLoadingFinal}
      />
      <KPICard
        title="Agent Status"
        value={totalAgents}
        subtitle={agentStatusText}
        icon={<Activity className="h-5 w-5 text-purple-400" />}
        color="bg-purple-500/10"
        loading={agentsLoadingFinal}
      />
    </div>
  );
}
