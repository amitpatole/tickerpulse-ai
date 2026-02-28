```tsx
'use client';

import { useState } from 'react';
import { BarChart3, Bot, Briefcase, Server, RefreshCw } from 'lucide-react';
import Header from '@/components/layout/Header';
import SummaryCards from '@/components/metrics/SummaryCards';
import TimeseriesChart from '@/components/metrics/TimeseriesChart';
import AgentsTable from '@/components/metrics/AgentsTable';
import JobsTable from '@/components/metrics/JobsTable';
import SystemPanel from '@/components/metrics/SystemPanel';
import PeriodSelector from '@/components/metrics/PeriodSelector';
import { useApi } from '@/hooks/useApi';
import {
  getMetricsSummary,
  getAgentMetrics,
  getMetricsTimeseries,
  getJobMetrics,
  getSystemMetrics,
} from '@/lib/api';

// ---------------------------------------------------------------------------
// Types / constants
// ---------------------------------------------------------------------------

type TabId = 'overview' | 'agents' | 'jobs' | 'system';
type MetricId = 'cost' | 'runs' | 'duration' | 'tokens';

const TABS: { id: TabId; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', Icon: BarChart3 },
  { id: 'agents',   label: 'Agents',   Icon: Bot },
  { id: 'jobs',     label: 'Jobs',     Icon: Briefcase },
  { id: 'system',   label: 'System',   Icon: Server },
];

const METRICS: { id: MetricId; label: string }[] = [
  { id: 'cost',     label: 'Cost'     },
  { id: 'runs',     label: 'Runs'     },
  { id: 'duration', label: 'Duration' },
  { id: 'tokens',   label: 'Tokens'   },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MetricsPage() {
  const [days, setDays]             = useState(30);
  const [tab, setTab]               = useState<TabId>('overview');
  const [metric, setMetric]         = useState<MetricId>('cost');
  const [refreshKey, setRefreshKey] = useState(0);

  const summaryResult    = useApi(() => getMetricsSummary(days),            [days, refreshKey]);
  const agentsResult     = useApi(() => getAgentMetrics(days),              [days, refreshKey]);
  const timeseriesResult = useApi(() => getMetricsTimeseries(days, metric), [days, metric, refreshKey]);
  const jobsResult       = useApi(() => getJobMetrics(days),                [days, refreshKey]);
  const systemResult     = useApi(() => getSystemMetrics(),                 [refreshKey], { enabled: tab === 'system' });

  const agents     = agentsResult.data?.agents    ?? [];
  const timeseries = timeseriesResult.data?.data  ?? [];
  const jobs       = jobsResult.data?.jobs        ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* ── Page header ───────────────────────────────────────────── */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Performance Metrics</h1>
            <p className="mt-1 text-sm text-slate-400">Agent runs, costs, and system health</p>
          </div>

          <div className="flex items-center gap-3">
            <PeriodSelector value={days} onChange={setDays} />

            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 px-3 py-1.5 text-sm text-slate-400 transition-colors hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Summary cards ─────────────────────────────────────────── */}
        <div className="mb-6">
          <SummaryCards summary={summaryResult.data} loading={summaryResult.loading} />
        </div>

        {/* ── Tab navigation ────────────────────────────────────────── */}
        <div className="mb-6 flex border-b border-slate-700/50">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab panels ────────────────────────────────────────────── */}

        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Metric picker */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Chart:</span>
              <div className="flex rounded-lg border border-slate-700/50 p-0.5">
                {METRICS.map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setMetric(id)}
                    className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                      metric === id
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-5">
              <TimeseriesChart
                data={timeseries}
                metric={metric}
                loading={timeseriesResult.loading}
              />
            </div>
          </div>
        )}

        {tab === 'agents' && (
          <AgentsTable agents={agents} loading={agentsResult.loading} />
        )}

        {tab === 'jobs' && (
          <JobsTable jobs={jobs} loading={jobsResult.loading} />
        )}

        {tab === 'system' && (
          <SystemPanel
            data={systemResult.data}
            loading={systemResult.loading}
            error={systemResult.error}
          />
        )}

      </main>
    </div>
  );
}
```