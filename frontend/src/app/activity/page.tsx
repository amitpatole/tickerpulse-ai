'use client';

import { useState } from 'react';
import { Bot, CheckCircle, DollarSign, Zap } from 'lucide-react';
import { clsx } from 'clsx';
import Header from '@/components/layout/Header';
import ActivityFeed from '@/components/agents/ActivityFeed';
import { useApi } from '@/hooks/useApi';
import { getMetricsSummary, getAgentMetrics, getJobMetrics } from '@/lib/api';
import type { MetricsSummary, AgentMetricsResponse, JobMetricsResponse } from '@/lib/types';

const PERIOD_OPTIONS = [
  { label: '7d', value: 7 },
  { label: '14d', value: 14 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
];

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

export default function ActivityPage() {
  const [days, setDays] = useState(7);

  const { data: summary } = useApi<MetricsSummary>(
    () => getMetricsSummary(days),
    [days],
    { refreshInterval: 60_000 }
  );

  const { data: agentMetrics } = useApi<AgentMetricsResponse>(
    () => getAgentMetrics(days),
    [days],
    { refreshInterval: 60_000 }
  );

  const { data: jobMetrics } = useApi<JobMetricsResponse>(
    () => getJobMetrics(days),
    [days],
    { refreshInterval: 60_000 }
  );

  const totalRuns = (summary?.agents.total_runs ?? 0) + (summary?.jobs.total_executions ?? 0);
  const successRuns = (summary?.agents.success_runs ?? 0) + (summary?.jobs.success_executions ?? 0);
  const overallRate = totalRuns > 0 ? successRuns / totalRuns : 0;
  const totalCost = (summary?.agents.total_cost ?? 0) + (summary?.jobs.total_cost ?? 0);
  const totalTokens = summary?.agents.total_tokens ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <Header />
      <main className="flex-1 px-6 py-6 space-y-6">
        {/* Page header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">Recent Activity</h1>
            <p className="text-xs text-slate-500">Live agent events &amp; AI cost overview</p>
          </div>

          {/* Period selector */}
          <div className="flex rounded-lg border border-slate-700/50 bg-slate-800/40 p-0.5">
            {PERIOD_OPTIONS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setDays(value)}
                className={clsx(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  days === value
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total Runs"
            value={formatNumber(totalRuns)}
            icon={<Bot className="h-4 w-4" />}
            sub={`${days}d window`}
          />
          <StatCard
            label="Success Rate"
            value={`${(overallRate * 100).toFixed(1)}%`}
            icon={<CheckCircle className="h-4 w-4" />}
            sub={`${summary?.agents.error_runs ?? 0} agent errors`}
            valueClass={successRateColor(overallRate)}
          />
          <StatCard
            label="AI Cost"
            value={formatCost(totalCost)}
            icon={<DollarSign className="h-4 w-4" />}
            sub={`Agents: ${formatCost(summary?.agents.total_cost ?? 0)}`}
          />
          <StatCard
            label="Tokens Used"
            value={formatNumber(totalTokens)}
            icon={<Zap className="h-4 w-4" />}
            sub={`Avg ${formatDuration(summary?.agents.avg_duration_ms ?? 0)} / run`}
          />
        </div>

        {/* Two-column layout: activity feed + top agents */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Activity feed — takes 2/3 width */}
          <div className="lg:col-span-2 rounded-xl border border-slate-700/50 bg-slate-800/40 p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-200">Live Events</h2>
            <ActivityFeed />
          </div>

          {/* Top agents sidebar */}
          <div className="space-y-4">
            {/* Top cost agents */}
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-200">Top Agents by Cost</h2>
              {!summary?.top_cost_agents.length ? (
                <p className="text-xs text-slate-500">No data for period</p>
              ) : (
                <div className="space-y-3">
                  {summary.top_cost_agents.map((agent, idx) => {
                    const maxCost = summary.top_cost_agents[0].total_cost;
                    const barPct = maxCost > 0 ? (agent.total_cost / maxCost) * 100 : 0;
                    return (
                      <div key={agent.agent_name}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="truncate text-slate-300 max-w-[120px]">{agent.agent_name}</span>
                          <span className="shrink-0 text-slate-400">
                            {formatCost(agent.total_cost)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-700/50">
                          <div
                            className="h-1.5 rounded-full bg-violet-500"
                            style={{ width: `${barPct}%`, opacity: 1 - idx * 0.15 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent agent runs */}
            {agentMetrics?.agents && agentMetrics.agents.length > 0 && (
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-5">
                <h2 className="mb-3 text-sm font-semibold text-slate-200">Agent Performance</h2>
                <div className="space-y-2">
                  {agentMetrics.agents.slice(0, 5).map((agent) => (
                    <div key={agent.agent_name} className="flex items-center justify-between text-xs">
                      <span className="truncate text-slate-300 max-w-[120px]">{agent.agent_name}</span>
                      <span className={clsx('font-medium', successRateColor(agent.success_rate))}>
                        {(agent.success_rate * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Job executions summary */}
            {jobMetrics?.jobs && jobMetrics.jobs.length > 0 && (
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-5">
                <h2 className="mb-3 text-sm font-semibold text-slate-200">Job Executions</h2>
                <div className="space-y-2">
                  {jobMetrics.jobs.slice(0, 4).map((job) => (
                    <div key={job.job_id} className="flex items-center justify-between text-xs">
                      <span className="truncate text-slate-300 max-w-[120px]">{job.job_name}</span>
                      <span className="text-slate-400">{job.total_executions}×</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
