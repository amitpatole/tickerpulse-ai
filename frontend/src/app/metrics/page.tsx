```tsx
'use client';

import { useState, useCallback } from 'react';
import { BarChart2, RefreshCw, TrendingUp, Bot, Calendar } from 'lucide-react';
import { clsx } from 'clsx';
import Header from '@/components/layout/Header';
import SummaryCards from '@/components/metrics/SummaryCards';
import TimeseriesChart from '@/components/metrics/TimeseriesChart';
import AgentsTable from '@/components/metrics/AgentsTable';
import JobsTable from '@/components/metrics/JobsTable';
import { useApi } from '@/hooks/useApi';
import {
  getMetricsSummary,
  getAgentMetrics,
  getMetricsTimeseries,
  getJobMetrics,
} from '@/lib/api';
import type {
  MetricsSummary,
  AgentMetricsResponse,
  MetricsTimeseriesResponse,
  JobMetricsResponse,
} from '@/lib/types';

const PERIOD_OPTIONS = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
];

const METRIC_OPTIONS: Array<{ label: string; value: 'cost' | 'runs' | 'duration' | 'tokens' }> = [
  { label: 'Cost', value: 'cost' },
  { label: 'Runs', value: 'runs' },
  { label: 'Duration', value: 'duration' },
  { label: 'Tokens', value: 'tokens' },
];

type TabId = 'overview' | 'agents' | 'jobs';

const TABS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Overview', icon: TrendingUp },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'jobs', label: 'Jobs', icon: Calendar },
];

export default function MetricsPage() {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<TabId>('overview');
  const [chartMetric, setChartMetric] = useState<'cost' | 'runs' | 'duration' | 'tokens'>('cost');
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const { data: summary, loading: summaryLoading } = useApi<MetricsSummary>(
    () => getMetricsSummary(days),
    [days, refreshKey],
    { refreshInterval: 60_000 }
  );

  const { data: agentMetrics, loading: agentsLoading } = useApi<AgentMetricsResponse>(
    () => getAgentMetrics(days),
    [days, refreshKey],
    { refreshInterval: 60_000 }
  );

  const { data: timeseries, loading: timeseriesLoading } = useApi<MetricsTimeseriesResponse>(
    () => getMetricsTimeseries(chartMetric, days),
    [chartMetric, days, refreshKey],
    { refreshInterval: 60_000 }
  );

  const { data: jobMetrics, loading: jobsLoading } = useApi<JobMetricsResponse>(
    () => getJobMetrics(days),
    [days, refreshKey],
    { refreshInterval: 60_000 }
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <Header />
      <main className="flex-1 px-6 py-6 space-y-6">
        {/* Page header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <BarChart2 className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Performance Metrics</h1>
              <p className="text-xs text-slate-500">Agent runs, job executions, cost & token usage</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
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

            <button
              onClick={refresh}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-slate-800/40 px-3 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <SummaryCards summary={summary ?? null} loading={summaryLoading} />

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-700/50">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                tab === id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Chart metric selector + chart */}
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-200">Timeseries</h2>
                <div className="flex rounded-lg border border-slate-700/50 bg-slate-900/60 p-0.5">
                  {METRIC_OPTIONS.map(({ label, value }) => (
                    <button
                      key={value}
                      onClick={() => setChartMetric(value)}
                      className={clsx(
                        'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                        chartMetric === value
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <TimeseriesChart
                data={timeseries?.data ?? []}
                metric={chartMetric}
                loading={timeseriesLoading}
              />
            </div>

            {/* Error trend + top cost agents side by side */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Error trend table */}
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-5">
                <h2 className="mb-4 text-sm font-semibold text-slate-200">Error Trend (7d)</h2>
                {summaryLoading ? (
                  <div className="h-40 animate-pulse rounded-lg bg-slate-800/60" />
                ) : !summary?.error_trend.length ? (
                  <p className="text-sm text-slate-500">No data</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700/40">
                          <th className="pb-2 text-left text-xs text-slate-400">Date</th>
                          <th className="pb-2 text-right text-xs text-slate-400">Total</th>
                          <th className="pb-2 text-right text-xs text-slate-400">Errors</th>
                          <th className="pb-2 text-right text-xs text-slate-400">Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/20">
                        {summary.error_trend.map((row) => (
                          <tr key={row.day}>
                            <td className="py-2 text-slate-300">{row.day.slice(5)}</td>
                            <td className="py-2 text-right text-slate-400">{row.total}</td>
                            <td className="py-2 text-right text-slate-400">{row.errors}</td>
                            <td className={clsx(
                              'py-2 text-right text-xs font-medium',
                              row.error_rate === 0 ? 'text-emerald-400' :
                              row.error_rate < 0.1 ? 'text-amber-400' : 'text-red-400'
                            )}>
                              {(row.error_rate * 100).toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Top cost agents */}
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-5">
                <h2 className="mb-4 text-sm font-semibold text-slate-200">Top Cost Agents</h2>
                {summaryLoading ? (
                  <div className="h-40 animate-pulse rounded-lg bg-slate-800/60" />
                ) : !summary?.top_cost_agents.length ? (
                  <p className="text-sm text-slate-500">No data</p>
                ) : (
                  <div className="space-y-3">
                    {summary.top_cost_agents.map((agent, idx) => {
                      const maxCost = summary.top_cost_agents[0].total_cost;
                      const barPct = maxCost > 0 ? (agent.total_cost / maxCost) * 100 : 0;
                      return (
                        <div key={agent.agent_name}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="text-slate-300">{agent.agent_name}</span>
                            <span className="text-slate-400">
                              ${agent.total_cost.toFixed(4)} · {agent.run_count} runs
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
            </div>
          </div>
        )}

        {/* Agents tab */}
        {tab === 'agents' && (
          <AgentsTable
            agents={agentMetrics?.agents ?? []}
            loading={agentsLoading}
          />
        )}

        {/* Jobs tab */}
        {tab === 'jobs' && (
          <JobsTable
            jobs={jobMetrics?.jobs ?? []}
            loading={jobsLoading}
          />
        )}
      </main>
    </div>
  );
}
```