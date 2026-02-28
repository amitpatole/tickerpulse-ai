'use client';

import { Play, Pause, RotateCw, Loader2, Clock, Settings2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { ScheduledJob } from '@/lib/types';

interface Props {
  job: ScheduledJob;
  selected: boolean;
  actionLoading: string | null;
  onClick: () => void;
  onTrigger: (e: React.MouseEvent) => void;
  onToggle: (e: React.MouseEvent) => void;
}

function relativeTime(isoStr: string | null): string {
  if (!isoStr) return '—';
  const diffMs = new Date(isoStr).getTime() - Date.now();
  if (diffMs < 0) return 'Overdue';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'in <1m';
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h ${mins % 60}m`;
  return `in ${Math.floor(hours / 24)}d`;
}

function triggerSummary(job: ScheduledJob): string {
  const args = job.trigger_args;
  const t = job.trigger.toLowerCase();

  if (t.includes('interval')) {
    const secs =
      typeof args.seconds === 'number' ? args.seconds :
      typeof args.minutes === 'number' ? (args.minutes as number) * 60 :
      typeof args.hours === 'number' ? (args.hours as number) * 3600 :
      0;
    if (!secs) return 'Interval';
    if (secs < 60) return `Every ${secs}s`;
    if (secs < 3600) return `Every ${Math.round(secs / 60)}m`;
    if (secs < 86400) return `Every ${(secs / 3600).toFixed(0)}h`;
    return `Every ${(secs / 86400).toFixed(0)}d`;
  }

  if (t.includes('cron')) {
    const parts: string[] = [];
    const dow = args.day_of_week ? String(args.day_of_week).toLowerCase() : '';
    if (dow === 'mon-fri') parts.push('Weekdays');
    else if (dow === 'sat,sun' || dow === 'sat-sun') parts.push('Weekends');
    else if (dow) parts.push(dow.toUpperCase());
    else parts.push('Daily');

    const hour = args.hour != null ? parseInt(String(args.hour), 10) : null;
    const minute = args.minute != null ? parseInt(String(args.minute), 10) : null;
    if (hour != null && minute != null) {
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const h12 = hour % 12 === 0 ? 12 : hour % 12;
      parts.push(`at ${h12}:${minute.toString().padStart(2, '0')} ${ampm}`);
    }
    return parts.join(' ');
  }

  return job.trigger;
}

export default function JobCard({ job, selected, actionLoading, onClick, onTrigger, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'w-full rounded-xl border p-4 text-left transition-all',
        selected
          ? 'border-blue-500/50 bg-blue-500/10 ring-1 ring-blue-500/30'
          : 'border-slate-700/50 bg-slate-800/50 hover:border-slate-600/60 hover:bg-slate-800/80',
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-white">{job.name}</p>
            <span
              className={clsx(
                'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                job.enabled
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-slate-500/10 text-slate-400',
              )}
            >
              <span
                className={clsx(
                  'h-1.5 w-1.5 rounded-full',
                  job.enabled ? 'bg-emerald-500' : 'bg-slate-500',
                )}
              />
              {job.enabled ? 'Active' : 'Paused'}
            </span>
          </div>
          {job.description && (
            <p className="mt-0.5 truncate text-xs text-slate-500">{job.description}</p>
          )}
        </div>

        {/* Edit indicator */}
        {selected && (
          <Settings2 className="h-4 w-4 shrink-0 text-blue-400" aria-hidden />
        )}
      </div>

      {/* Schedule info */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="rounded bg-slate-700/70 px-2 py-0.5 font-mono">
            {triggerSummary(job)}
          </span>
          {job.next_run && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-slate-500" />
              {relativeTime(job.next_run)}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onTrigger}
            disabled={!!actionLoading}
            title="Run now"
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-blue-500/20 hover:text-blue-400 disabled:opacity-40"
          >
            {actionLoading === 'trigger' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </button>

          {job.enabled ? (
            <button
              type="button"
              onClick={onToggle}
              disabled={!!actionLoading}
              title="Pause"
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-amber-500/20 hover:text-amber-400 disabled:opacity-40"
            >
              {actionLoading === 'pause' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Pause className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggle}
              disabled={!!actionLoading}
              title="Resume"
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-emerald-500/20 hover:text-emerald-400 disabled:opacity-40"
            >
              {actionLoading === 'resume' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCw className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </button>
  );
}
