'use client';

import { useState } from 'react';
import { DollarSign, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import Header from '@/components/layout/Header';
import AgentCard from '@/components/agents/AgentCard';
import ActivityFeed from '@/components/agents/ActivityFeed';
import PriceChart from '@/components/charts/PriceChart';
import { useApi } from '@/hooks/useApi';
import { getAgents, getAgentRuns, getCostSummary } from '@/lib/api';
import type { Agent, AgentRun, CostSummary } from '@/lib/types';
import { formatLocalDate } from '@/lib/formatTime';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

const AGENT_DATE_OPTS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

function RunStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: 'bg-emerald-500/10 text-emerald-400',
    running: 'bg-blue-500/10 text-blue-400',
    failed: 'bg-red-500/10 text-red-400',
    error: 'bg-red-500/10 text-red-400',
  };

  const icons: Record<string, React.ReactNode> = {
    completed: <CheckCircle className="h-3 w-3" aria-hidden="true" />,
    running: <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />,
    failed: <XCircle className="h-3 w-3" aria-hidden="true" />,
    error: <XCircle className="h-3 w-3" aria-hidden="true" />,
  };

  return (
    <span
      aria-label={`Status: ${status}`}
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        styles[status] || 'bg-slate-500/10 text-slate-400'
      )}
    >
      {icons[status]}
      <span className="sr-only">{status}</span>
      <span aria-hidden="true">{status}</span>
    </span>
  );
}

export default function AgentsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: agents, loading: agentsLoading, error: agentsError } = useApi<Agent[]>(
    getAgents,
    [refreshKey],
    { refreshInterval: 10000 }
  );
  const { data: runs, loading: runsLoading } = useApi<AgentRun[]>(
    () => getAgentRuns(20),
    [refreshKey],
    { refreshInterval: 15000 }
  );
  const { data: costs } = useApi<CostSummary>(
    () => getCostSummary(30),
    [refreshKey],
    { refreshInterval: 60000 }
  );

  const handleRunComplete = () => {
    setRefreshKey((k) => k + 1);
  };

  // Prepare daily cost chart data
  const costChartData = (costs?.daily_costs ?? []).map((d) => ({
    time: d.date,
    value: d.cost,
  }));

  return (
    <div className="flex flex-col">
      <Header title="Agent Mission Control" subtitle="Monitor and manage AI agents" />

      <div className="flex-1 p-6">
        {/* Agent Cards Grid */}
        <div className="mb-6">
          <h2 className="mb-4 text-sm font-semibold text-white">Agents</h2>

          {agentsLoading && !agents && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-72 animate-pulse rounded-xl border border-slate-700/50 bg-slate-800/30" />
              ))}
            </div>
          )}

          {agentsError && !agents && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-400">
              {agentsError}
            </div>
          )}

          {agents && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {agents.map((agent) => (
                <AgentCard key={agent.name} agent={agent} onRunComplete={handleRunComplete} />
              ))}
            </div>
          )}
        </div>

        {/* Activity Feed + Cost Summary */}
        <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ActivityFeed />

          {/* Cost Summary */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
            <h2 className="mb-4 text-sm font-semibold text-white">Cost Summary (30 Days)</h2>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-900/50 p-3">
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                  <DollarSign className="h-3 w-3" />
                  Total Cost
                </div>
                <p className="mt-1 text-lg font-bold text-white font-mono">
                  {costs ? `$${(costs.total_cost ?? costs.total_cost_usd ?? 0).toFixed(2)}` : '—'}
                </p>
              </div>
              <div className="rounded-lg bg-slate-900/50 p-3">
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                  <Clock className="h-3 w-3" />
                  Period
                </div>
                <p className="mt-1 text-lg font-bold text-white">
                  {costs ? (costs.range_label || `${costs.period_days ?? 30} days`) : '—'}
                </p>
              </div>
            </div>

            {/* Cost by agent */}
            {costs?.by_agent && Object.keys(costs.by_agent).length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs text-slate-400">Cost by Agent</p>
                <div className="space-y-1.5">
                  {Object.entries(costs.by_agent).map(([agentName, cost]) => {
                    const costValue = typeof cost === 'number' ? cost : (cost as { cost_usd?: number })?.cost_usd ?? 0;
                    return (
                      <div key={agentName} className="flex items-center justify-between">
                        <span className="text-xs text-slate-300 capitalize">{agentName.replace(/_/g, ' ')}</span>
                        <span className="text-xs font-mono text-slate-400">{formatCost(costValue)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Daily cost chart */}
            {costChartData.length > 0 && (
              <PriceChart data={costChartData} title="Daily Spend" height={180} color="#f59e0b" />
            )}
          </div>
        </div>

        {/* Run History Table */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50">
          <div className="border-b border-slate-700/50 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Run History</h2>
          </div>

          <div
            className="overflow-x-auto"
            aria-live="polite"
            aria-atomic="false"
            aria-busy={runsLoading && !runs}
          >
            {runsLoading && !runs && (
              <div className="p-6 text-center text-sm text-slate-500">Loading runs...</div>
            )}

            {runs && runs.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-500">No agent runs recorded yet.</div>
            )}

            {runs && runs.length > 0 && (
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Agent run history</caption>
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Agent</th>
                    <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                    <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Duration</th>
                    <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Cost</th>
                    <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {runs.map((run, idx) => (
                    <tr
                      key={run.id ?? idx}
                      tabIndex={0}
                      aria-label={`${run.agent_name}, status: ${run.status}, duration: ${formatDuration(run.duration_ms)}, cost: ${formatCost(run.estimated_cost)}, started ${formatLocalDate(run.started_at, AGENT_DATE_OPTS)}`}
                      className="transition-colors hover:bg-slate-700/20 focus:outline-none focus:bg-slate-700/30"
                    >
                      <td className="px-4 py-3 font-medium text-white capitalize">{run.agent_name}</td>
                      <td className="px-4 py-3">
                        <RunStatusBadge status={run.status} />
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-300">{formatDuration(run.duration_ms)}</td>
                      <td className="px-4 py-3 font-mono text-slate-300">{formatCost(run.estimated_cost)}</td>
                      <td className="px-4 py-3 text-slate-400">{formatLocalDate(run.started_at, AGENT_DATE_OPTS)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
