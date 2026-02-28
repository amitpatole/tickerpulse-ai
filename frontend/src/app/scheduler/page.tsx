'use client';

import { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Calendar,
  AlertTriangle,
  Settings2,
  History,
} from 'lucide-react';
import { clsx } from 'clsx';
import Header from '@/components/layout/Header';
import { useApi } from '@/hooks/useApi';
import { getSchedulerJobs, triggerJob, pauseJob, resumeJob, getAgentRuns } from '@/lib/api';
import type { ScheduledJob } from '@/lib/types';
import JobCard from '@/components/scheduler/JobCard';
import ScheduleEditor from '@/components/scheduler/ScheduleEditor';
import NextRunsPreview from '@/components/scheduler/NextRunsPreview';
import AgentScheduleManager from '@/components/scheduler/AgentScheduleManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dateStr));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

type Tab = 'jobs' | 'custom' | 'history';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SchedulerPage() {
  const [activeTab, setActiveTab] = useState<Tab>('jobs');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});

  const {
    data: jobs,
    loading: jobsLoading,
    error: jobsError,
    refetch: refetchJobs,
  } = useApi<ScheduledJob[]>(getSchedulerJobs, [refreshKey], { refreshInterval: 15000 });

  const { data: runsData } = useApi(
    () => getAgentRuns(20),
    [refreshKey],
    { refreshInterval: 30000 },
  );

  const runs = runsData?.runs ?? [];
  const selectedJob = jobs?.find((j) => j.id === selectedJobId) ?? null;

  const handleAction = async (jobId: string, action: 'trigger' | 'pause' | 'resume') => {
    setActionLoading((prev) => ({ ...prev, [jobId]: action }));
    try {
      if (action === 'trigger') await triggerJob(jobId);
      else if (action === 'pause') await pauseJob(jobId);
      else await resumeJob(jobId);
      setRefreshKey((k) => k + 1);
      refetchJobs();
    } catch {
      // silent — actionLoading is cleared in finally
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
    }
  };

  const TABS: { id: Tab; label: string; icon?: React.ReactNode }[] = [
    { id: 'jobs', label: 'Live Jobs' },
    { id: 'custom', label: 'Custom Schedules' },
    { id: 'history', label: 'History', icon: <History className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex flex-col">
      <Header title="Job Scheduler" subtitle="Manage scheduled tasks and automation" />

      <div className="flex-1 space-y-6 p-6">
        {/* Tabs */}
        <div className="flex w-fit gap-1 rounded-lg bg-slate-800/60 p-1">
          {TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={clsx(
                'flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                activeTab === id
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Live Jobs Tab                                                        */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'jobs' && (
          <>
            {jobsLoading && !jobs && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-700/30" />
                ))}
              </div>
            )}

            {jobsError && !jobs && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Failed to load jobs: {jobsError}
              </div>
            )}

            {jobs && (
              <div className={clsx(
                'grid gap-6',
                selectedJob ? 'lg:grid-cols-[1fr_360px]' : 'grid-cols-1',
              )}>
                {/* Left: job card list */}
                <div className="space-y-3">
                  {jobs.length === 0 ? (
                    <p className="text-sm text-slate-500">No scheduled jobs found.</p>
                  ) : (
                    jobs.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        selected={selectedJobId === job.id}
                        actionLoading={actionLoading[job.id] ?? null}
                        onClick={() =>
                          setSelectedJobId((prev) => (prev === job.id ? null : job.id))
                        }
                        onTrigger={(e) => {
                          e.stopPropagation();
                          handleAction(job.id, 'trigger');
                        }}
                        onToggle={(e) => {
                          e.stopPropagation();
                          handleAction(job.id, job.enabled ? 'pause' : 'resume');
                        }}
                      />
                    ))
                  )}
                </div>

                {/* Right: detail panel */}
                {selectedJob && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-2.5">
                      <Settings2 className="h-4 w-4 text-blue-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{selectedJob.name}</p>
                        {selectedJob.description && (
                          <p className="truncate text-xs text-slate-400">{selectedJob.description}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedJobId(null)}
                        className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
                        aria-label="Close panel"
                      >
                        <span className="text-xs">✕</span>
                      </button>
                    </div>

                    <ScheduleEditor
                      job={selectedJob}
                      onSave={() => {
                        setRefreshKey((k) => k + 1);
                        refetchJobs();
                      }}
                    />

                    <NextRunsPreview jobId={selectedJob.id} refreshKey={refreshKey} />
                  </div>
                )}

                {!selectedJob && jobs.length > 0 && (
                  <div className="hidden items-center justify-center rounded-xl border border-dashed border-slate-700/50 py-16 text-center lg:flex">
                    <div>
                      <Settings2 className="mx-auto h-8 w-8 text-slate-600" />
                      <p className="mt-2 text-sm text-slate-500">Select a job to edit its schedule</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Custom Schedules Tab                                                 */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'custom' && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
            <div className="mb-4 border-b border-slate-700/50 pb-4">
              <h2 className="text-sm font-semibold text-white">Custom Agent Schedules</h2>
              <p className="mt-1 text-xs text-slate-400">
                User-defined schedule overrides. These are applied on top of default job triggers.
              </p>
            </div>
            <AgentScheduleManager />
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* History Tab                                                          */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'history' && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50">
            <div className="border-b border-slate-700/50 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">Recent Executions</h2>
              <p className="mt-0.5 text-xs text-slate-400">Last 20 agent run results</p>
            </div>

            {runs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Agent</th>
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Duration</th>
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Started</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {runs.map((run, idx) => (
                      <tr key={run.id ?? idx} className="transition-colors hover:bg-slate-700/20">
                        <td className="px-4 py-3 font-medium capitalize text-white">{run.agent_name}</td>
                        <td className="px-4 py-3">
                          <span
                            className={clsx(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                              run.status === 'completed' || run.status === 'success'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : run.status === 'running'
                                ? 'bg-blue-500/10 text-blue-400'
                                : 'bg-red-500/10 text-red-400',
                            )}
                          >
                            {run.status === 'completed' || run.status === 'success' ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : run.status === 'running' ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {run.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-300">{formatDuration(run.duration_ms)}</td>
                        <td className="px-4 py-3 text-slate-400">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span className="text-xs">{formatDate(run.started_at)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-slate-500">No recent executions.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
