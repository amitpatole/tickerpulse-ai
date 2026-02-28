'use client';

import { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCw,
  Settings2,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  AlertTriangle,
  Plus,
  Trash2,
} from 'lucide-react';
import { clsx } from 'clsx';
import Header from '@/components/layout/Header';
import ScheduleEditModal from '@/components/scheduler/ScheduleEditModal';
import AgentScheduleForm from '@/components/scheduler/AgentScheduleForm';
import { useApi } from '@/hooks/useApi';
import {
  getSchedulerJobs,
  triggerJob,
  pauseJob,
  resumeJob,
  updateJobSchedule,
  getAgentRuns,
  listAgentSchedules,
  createAgentSchedule,
  updateAgentSchedule,
  deleteAgentSchedule,
  listKnownAgents,
  triggerAgentSchedule,
} from '@/lib/api';
import type { KnownAgent } from '@/lib/api';
import type { ScheduledJob, AgentRun, AgentSchedule } from '@/lib/types';

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

function humanizeTrigger(trigger: string, args: Record<string, unknown>): string {
  if (trigger === 'interval') {
    const secs = Number(args.seconds ?? 0);
    if (secs >= 86400 && secs % 86400 === 0) return `Every ${secs / 86400}d`;
    if (secs >= 3600 && secs % 3600 === 0) return `Every ${secs / 3600}h`;
    return `Every ${Math.round(secs / 60)}m`;
  }
  if (trigger === 'cron') {
    const h = args.hour != null ? String(args.hour).padStart(2, '0') : '*';
    const m = args.minute != null ? String(args.minute).padStart(2, '0') : '*';
    const dow = args.day_of_week ? ` (${args.day_of_week})` : ' daily';
    return `${h}:${m}${dow}`;
  }
  return trigger;
}

function LastRunBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const styles: Record<string, string> = {
    completed: 'text-emerald-400',
    failed: 'text-red-400',
    error: 'text-red-400',
    running: 'text-blue-400',
  };
  return (
    <span className={clsx('text-[10px]', styles[status] ?? 'text-slate-500')}>
      ({status})
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = 'system' | 'agents';

export default function SchedulerPage() {
  const [activeTab, setActiveTab]       = useState<Tab>('system');
  const [refreshKey, setRefreshKey]     = useState(0);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [editJob, setEditJob]           = useState<ScheduledJob | null>(null);
  const [scheduleModal, setScheduleModal] = useState<{
    open: boolean;
    schedule: AgentSchedule | null;
  }>({ open: false, schedule: null });
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [agentActionLoading, setAgentActionLoading] = useState<Record<number, string>>({});

  const {
    data: jobs,
    loading: jobsLoading,
    error: jobsError,
    refetch: refetchJobs,
  } = useApi<ScheduledJob[]>(getSchedulerJobs, [refreshKey], { refreshInterval: 15000 });

  const { data: runs } = useApi<AgentRun[]>(
    () => getAgentRuns(20),
    [refreshKey],
    { refreshInterval: 30000 }
  );

  const {
    data: agentSchedules,
    loading: schedulesLoading,
    error: schedulesError,
    refetch: refetchSchedules,
  } = useApi<AgentSchedule[]>(listAgentSchedules, [refreshKey]);

  const { data: knownAgents } = useApi<KnownAgent[]>(listKnownAgents, []);

  // Fallback: if /agents endpoint not available, map system jobs to KnownAgent shape
  const agentChoices: KnownAgent[] = (knownAgents && knownAgents.length > 0)
    ? knownAgents
    : (jobs ?? []).map((j) => ({ job_id: j.id, name: j.name, description: j.description ?? '' }));

  // Reset delete confirm when switching tabs
  useEffect(() => {
    setDeleteConfirmId(null);
  }, [activeTab]);

  // ---- System job actions ----

  const handleAction = async (jobId: string, action: 'trigger' | 'pause' | 'resume') => {
    setActionLoading((prev) => ({ ...prev, [jobId]: action }));
    try {
      if (action === 'trigger') await triggerJob(jobId);
      else if (action === 'pause') await pauseJob(jobId);
      else await resumeJob(jobId);
      setRefreshKey((k) => k + 1);
      refetchJobs();
    } catch {
      // surfaced via error reporter
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
    }
  };

  const handleSaveSchedule = async (
    jobId: string,
    trigger: 'cron' | 'interval',
    args: Record<string, number | string>
  ) => {
    await updateJobSchedule(jobId, trigger, args);
    setRefreshKey((k) => k + 1);
    refetchJobs();
  };

  // ---- Agent schedule actions ----

  const handleScheduleSave = async (data: {
    job_id: string;
    label: string;
    description?: string;
    trigger: 'cron' | 'interval';
    trigger_args: Record<string, number | string>;
  }) => {
    const existing = scheduleModal.schedule;
    if (existing) {
      await updateAgentSchedule(existing.id, {
        label: data.label,
        description: data.description,
        trigger: data.trigger,
        trigger_args: data.trigger_args,
      });
    } else {
      await createAgentSchedule(data);
    }
    refetchSchedules();
  };

  const handleToggleSchedule = async (s: AgentSchedule) => {
    try {
      await updateAgentSchedule(s.id, { enabled: !s.enabled });
      refetchSchedules();
    } catch {
      // surfaced via error reporter
    }
  };

  const handleDeleteSchedule = async (id: number) => {
    try {
      await deleteAgentSchedule(id);
      setDeleteConfirmId(null);
      refetchSchedules();
    } catch {
      // surfaced via error reporter
    }
  };

  const handleTriggerAgentSchedule = async (s: AgentSchedule) => {
    setAgentActionLoading((prev) => ({ ...prev, [s.id]: 'trigger' }));
    try {
      await triggerAgentSchedule(s.id);
    } catch {
      // surfaced via error reporter
    } finally {
      setAgentActionLoading((prev) => {
        const next = { ...prev };
        delete next[s.id];
        return next;
      });
    }
  };

  // ---- Render ----

  return (
    <div className="flex flex-col">
      <Header title="Job Scheduler" subtitle="Manage scheduled tasks and automation" />

      <div className="flex-1 p-6">

        {/* Tab bar */}
        <div className="mb-5 flex items-center gap-1 rounded-xl border border-slate-700/50 bg-slate-800/50 p-1 w-fit">
          {(['system', 'agents'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={clsx(
                'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              {tab === 'system' ? 'System Jobs' : 'Agent Schedules'}
            </button>
          ))}
        </div>

        {/* ---- System Jobs tab ---- */}
        {activeTab === 'system' && (
          <>
            {/* Jobs Table */}
            <div className="mb-6 rounded-xl border border-slate-700/50 bg-slate-800/50">
              <div className="border-b border-slate-700/50 px-4 py-3">
                <h2 className="text-sm font-semibold text-white">Scheduled Jobs</h2>
              </div>

              {jobsLoading && !jobs && (
                <div className="p-6 text-center text-sm text-slate-500">Loading jobs…</div>
              )}

              {jobsError && !jobs && (
                <div className="p-6 text-center">
                  <AlertTriangle className="mx-auto h-6 w-6 text-red-400" />
                  <p className="mt-2 text-sm text-red-400">{jobsError}</p>
                </div>
              )}

              {jobs && jobs.length === 0 && (
                <div className="p-6 text-center text-sm text-slate-500">
                  No scheduled jobs found.
                </div>
              )}

              {jobs && jobs.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Scheduled jobs</caption>
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Job</th>
                        <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Schedule</th>
                        <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Next Run</th>
                        <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Last Run</th>
                        <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                        <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {jobs.map((job) => {
                        const isLoading = !!actionLoading[job.id];
                        const currentAction = actionLoading[job.id];

                        return (
                          <tr key={job.id} className="transition-colors hover:bg-slate-700/20">
                            <td className="px-4 py-3">
                              <p className="font-medium text-white">{job.name}</p>
                              {job.description && (
                                <p className="text-xs text-slate-500">{job.description}</p>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              <span className="rounded bg-slate-700 px-2 py-0.5 font-mono text-xs text-slate-300">
                                {job.trigger}
                              </span>
                            </td>

                            <td className="px-4 py-3 text-slate-300">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-slate-500" />
                                <span className="text-xs">{formatDate(job.next_run)}</span>
                              </div>
                            </td>

                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs text-slate-400">{formatDate(job.last_run)}</span>
                                <LastRunBadge status={job.last_run_status} />
                              </div>
                            </td>

                            <td className="px-4 py-3">
                              <span className={clsx(
                                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                                job.enabled
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-slate-500/10 text-slate-400'
                              )}>
                                <span className={clsx(
                                  'h-1.5 w-1.5 rounded-full',
                                  job.enabled ? 'bg-emerald-500' : 'bg-slate-500'
                                )} />
                                {job.enabled ? 'Active' : 'Paused'}
                              </span>
                            </td>

                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleAction(job.id, 'trigger')}
                                  disabled={isLoading}
                                  title="Run now"
                                  aria-label={`Run ${job.name} now`}
                                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-blue-500/20 hover:text-blue-400 disabled:opacity-50"
                                >
                                  {currentAction === 'trigger' ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Play className="h-4 w-4" />
                                  )}
                                </button>

                                {job.enabled ? (
                                  <button
                                    onClick={() => handleAction(job.id, 'pause')}
                                    disabled={isLoading}
                                    title="Pause"
                                    aria-label={`Pause ${job.name}`}
                                    className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-amber-500/20 hover:text-amber-400 disabled:opacity-50"
                                  >
                                    {currentAction === 'pause' ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Pause className="h-4 w-4" />
                                    )}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleAction(job.id, 'resume')}
                                    disabled={isLoading}
                                    title="Resume"
                                    aria-label={`Resume ${job.name}`}
                                    className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-emerald-500/20 hover:text-emerald-400 disabled:opacity-50"
                                  >
                                    {currentAction === 'resume' ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <RotateCw className="h-4 w-4" />
                                    )}
                                  </button>
                                )}

                                <button
                                  onClick={() => setEditJob(job)}
                                  disabled={isLoading}
                                  title="Edit schedule"
                                  aria-label={`Edit schedule for ${job.name}`}
                                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-500/20 hover:text-slate-200 disabled:opacity-50"
                                >
                                  <Settings2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Recent Executions */}
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/50">
              <div className="border-b border-slate-700/50 px-4 py-3">
                <h2 className="text-sm font-semibold text-white">Recent Executions</h2>
              </div>

              {runs && runs.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Recent agent executions</caption>
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Agent</th>
                        <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                        <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Duration</th>
                        <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Started</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {runs.map((run, idx) => (
                        <tr key={run.id ?? idx} className="transition-colors hover:bg-slate-700/20">
                          <td className="px-4 py-3 font-medium capitalize text-white">
                            {run.agent_name}
                          </td>
                          <td className="px-4 py-3">
                            <span className={clsx(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                              run.status === 'completed'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : run.status === 'running'
                                ? 'bg-blue-500/10 text-blue-400'
                                : 'bg-red-500/10 text-red-400'
                            )}>
                              {run.status === 'completed' ? (
                                <CheckCircle className="h-3 w-3" />
                              ) : run.status === 'running' ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <XCircle className="h-3 w-3" />
                              )}
                              {run.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-300">
                            {run.duration_ms != null ? formatDuration(run.duration_ms) : '—'}
                          </td>
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
                <div className="p-6 text-center text-sm text-slate-500">
                  No recent executions.
                </div>
              )}
            </div>
          </>
        )}

        {/* ---- Agent Schedules tab ---- */}
        {activeTab === 'agents' && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50">
            <div className="flex items-center justify-between border-b border-slate-700/50 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Agent Schedules</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Persisted schedule overrides applied to system jobs on startup.
                </p>
              </div>
              <button
                onClick={() => setScheduleModal({ open: true, schedule: null })}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                New Schedule
              </button>
            </div>

            {schedulesLoading && !agentSchedules && (
              <div className="p-6 text-center text-sm text-slate-500">Loading schedules…</div>
            )}

            {schedulesError && !agentSchedules && (
              <div className="p-6 text-center">
                <AlertTriangle className="mx-auto h-6 w-6 text-red-400" />
                <p className="mt-2 text-sm text-red-400">{schedulesError}</p>
              </div>
            )}

            {agentSchedules && agentSchedules.length === 0 && (
              <div className="p-10 text-center">
                <Clock className="mx-auto mb-3 h-8 w-8 text-slate-600" />
                <p className="text-sm font-medium text-slate-400">No agent schedules yet</p>
                <p className="mt-1 text-xs text-slate-500">
                  Create a schedule to override the default timing for any system job.
                </p>
              </div>
            )}

            {agentSchedules && agentSchedules.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Agent schedules</caption>
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Label / Job</th>
                      <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Schedule</th>
                      <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                      <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Updated</th>
                      <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {agentSchedules.map((s) => (
                      <tr key={s.id} className="transition-colors hover:bg-slate-700/20">
                        <td className="px-4 py-3">
                          <p className="font-medium text-white">{s.label}</p>
                          <p className="font-mono text-xs text-slate-500">{s.job_id}</p>
                          {s.description && (
                            <p className="mt-0.5 text-xs text-slate-500">{s.description}</p>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <span className="rounded bg-slate-700 px-2 py-0.5 font-mono text-xs text-slate-300">
                            {humanizeTrigger(s.trigger, s.trigger_args)}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span className={clsx(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                            s.enabled
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-slate-500/10 text-slate-400'
                          )}>
                            <span className={clsx(
                              'h-1.5 w-1.5 rounded-full',
                              s.enabled ? 'bg-emerald-500' : 'bg-slate-500'
                            )} />
                            {s.enabled ? 'Active' : 'Disabled'}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-xs text-slate-400">
                          {formatDate(s.updated_at)}
                        </td>

                        <td className="px-4 py-3">
                          {deleteConfirmId === s.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-slate-400">Delete?</span>
                              <button
                                onClick={() => handleDeleteSchedule(s.id)}
                                className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-red-500/10"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-700/30"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              {/* Trigger now */}
                              <button
                                onClick={() => handleTriggerAgentSchedule(s)}
                                disabled={!!agentActionLoading[s.id]}
                                title="Run now"
                                aria-label={`Run ${s.label} now`}
                                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-blue-500/20 hover:text-blue-400 disabled:opacity-50"
                              >
                                {agentActionLoading[s.id] === 'trigger' ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Play className="h-4 w-4" />
                                )}
                              </button>

                              {/* Toggle enabled */}
                              <button
                                onClick={() => handleToggleSchedule(s)}
                                title={s.enabled ? 'Disable' : 'Enable'}
                                aria-label={s.enabled ? `Disable ${s.label}` : `Enable ${s.label}`}
                                className={clsx(
                                  'rounded-md p-1.5 transition-colors',
                                  s.enabled
                                    ? 'text-emerald-400 hover:bg-emerald-500/10'
                                    : 'text-slate-400 hover:bg-slate-500/10'
                                )}
                              >
                                {s.enabled ? (
                                  <Pause className="h-4 w-4" />
                                ) : (
                                  <RotateCw className="h-4 w-4" />
                                )}
                              </button>

                              {/* Edit */}
                              <button
                                onClick={() => setScheduleModal({ open: true, schedule: s })}
                                title="Edit"
                                aria-label={`Edit ${s.label}`}
                                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-500/20 hover:text-slate-200"
                              >
                                <Settings2 className="h-4 w-4" />
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => setDeleteConfirmId(s.id)}
                                title="Delete"
                                aria-label={`Delete ${s.label}`}
                                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* System job schedule editor */}
      <ScheduleEditModal
        open={editJob !== null}
        job={editJob}
        onClose={() => setEditJob(null)}
        onSave={handleSaveSchedule}
      />

      {/* Agent schedule create / edit modal */}
      <AgentScheduleModal
        open={scheduleModal.open}
        schedule={scheduleModal.schedule}
        systemJobs={jobs ?? []}
        onClose={() => setScheduleModal({ open: false, schedule: null })}
        onSave={handleScheduleSave}
      />
    </div>
  );
}
