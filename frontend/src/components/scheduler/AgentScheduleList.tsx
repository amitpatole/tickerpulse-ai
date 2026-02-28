'use client';

import { Play, Pencil, Trash2, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import { clsx } from 'clsx';
import type { AgentSchedule } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function triggerSummary(trigger: string, args: Record<string, unknown>): string {
  if (trigger === 'interval') {
    const secs =
      typeof args.seconds === 'number' ? args.seconds :
      typeof args.minutes === 'number' ? (args.minutes as number) * 60 :
      typeof args.hours === 'number' ? (args.hours as number) * 3600 :
      typeof args.days === 'number' ? (args.days as number) * 86400 :
      0;
    if (!secs) return 'Interval';
    if (secs < 60) return `Every ${secs}s`;
    if (secs < 3600) return `Every ${Math.round(secs / 60)}m`;
    if (secs < 86400) return `Every ${(secs / 3600).toFixed(0)}h`;
    return `Every ${(secs / 86400).toFixed(0)}d`;
  }
  if (trigger === 'cron') {
    const parts: string[] = [];
    const dow = args.day_of_week ? String(args.day_of_week).toLowerCase() : '';
    if (dow === 'mon-fri') parts.push('Weekdays');
    else if (dow === 'sat,sun') parts.push('Weekends');
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
  return trigger;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  schedules: AgentSchedule[];
  actionLoading: Record<number, string>;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onTrigger: (id: number) => void;
  onToggle: (id: number, enabled: boolean) => void;
}

export default function AgentScheduleList({
  schedules,
  actionLoading,
  onEdit,
  onDelete,
  onTrigger,
  onToggle,
}: Props) {
  if (schedules.length === 0) return null;

  return (
    <div className="space-y-2">
      {schedules.map((schedule) => {
        const loading = actionLoading[schedule.id] ?? null;
        return (
          <div
            key={schedule.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-slate-700/50 bg-slate-800/50 px-4 py-3 transition-colors hover:bg-slate-800/80"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-white">{schedule.label}</p>
                <span
                  className={clsx(
                    'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                    schedule.enabled
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-slate-500/10 text-slate-400',
                  )}
                >
                  <span className={clsx('h-1.5 w-1.5 rounded-full', schedule.enabled ? 'bg-emerald-500' : 'bg-slate-500')} />
                  {schedule.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {schedule.job_id}
                {schedule.description && (
                  <span className="ml-2 text-slate-600">— {schedule.description}</span>
                )}
              </p>
              <div className="mt-1.5">
                <span className="rounded bg-slate-700/70 px-2 py-0.5 font-mono text-xs text-slate-300">
                  {triggerSummary(schedule.trigger, schedule.trigger_args)}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {/* Enable/Disable toggle */}
              <button
                type="button"
                onClick={() => onToggle(schedule.id, !schedule.enabled)}
                disabled={!!loading}
                title={schedule.enabled ? 'Disable' : 'Enable'}
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-40"
              >
                {loading === 'toggle' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : schedule.enabled ? (
                  <ToggleRight className="h-4 w-4 text-emerald-400" />
                ) : (
                  <ToggleLeft className="h-4 w-4" />
                )}
              </button>

              {/* Run now */}
              <button
                type="button"
                onClick={() => onTrigger(schedule.id)}
                disabled={!!loading}
                title="Run now"
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-blue-500/20 hover:text-blue-400 disabled:opacity-40"
              >
                {loading === 'trigger' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </button>

              {/* Edit */}
              <button
                type="button"
                onClick={() => onEdit(schedule.id)}
                disabled={!!loading}
                title="Edit"
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-40"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>

              {/* Delete */}
              <button
                type="button"
                onClick={() => onDelete(schedule.id)}
                disabled={!!loading}
                title="Delete"
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-500/20 hover:text-red-400 disabled:opacity-40"
              >
                {loading === 'delete' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
