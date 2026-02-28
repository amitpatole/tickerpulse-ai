'use client';

import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CronBuilderValue {
  trigger: 'cron' | 'interval';
  trigger_args: Record<string, unknown>;
}

interface Props {
  value: CronBuilderValue;
  onChange: (value: CronBuilderValue) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INTERVAL_PRESETS: { label: string; seconds: number }[] = [
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '30m', seconds: 1800 },
  { label: '1h', seconds: 3600 },
  { label: '4h', seconds: 14400 },
  { label: '12h', seconds: 43200 },
  { label: '24h', seconds: 86400 },
];

const DAY_OPTIONS = [
  { label: 'Every day', value: '' },
  { label: 'Weekdays (Mon–Fri)', value: 'mon-fri' },
  { label: 'Weekends (Sat–Sun)', value: 'sat,sun' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSecs(args: Record<string, unknown>): number {
  if (typeof args.seconds === 'number') return args.seconds;
  if (typeof args.minutes === 'number') return (args.minutes as number) * 60;
  if (typeof args.hours === 'number') return (args.hours as number) * 3600;
  return 3600;
}

function intervalLabel(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  if (secs < 86400) return `${(secs / 3600).toFixed(1).replace(/\.0$/, '')}h`;
  return `${(secs / 86400).toFixed(1).replace(/\.0$/, '')}d`;
}

function cronSummary(args: Record<string, unknown>): string {
  const parts: string[] = [];
  const dow = args.day_of_week ? String(args.day_of_week).toLowerCase() : '';
  if (dow === 'mon-fri') parts.push('Weekdays');
  else if (dow === 'sat,sun') parts.push('Weekends');
  else if (dow) parts.push(dow.toUpperCase());
  else parts.push('Every day');

  const hour = args.hour != null ? parseInt(String(args.hour), 10) : null;
  const minute = args.minute != null ? parseInt(String(args.minute), 10) : null;
  if (hour != null && minute != null && !isNaN(hour) && !isNaN(minute)) {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    parts.push(`at ${h12}:${minute.toString().padStart(2, '0')} ${ampm}`);
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CronBuilder({ value, onChange }: Props) {
  const { trigger, trigger_args } = value;
  const currentSecs = trigger === 'interval' ? toSecs(trigger_args) : 3600;
  const cronHour = trigger === 'cron' && trigger_args.hour != null ? Number(trigger_args.hour) : 9;
  const cronMinute = trigger === 'cron' && trigger_args.minute != null ? Number(trigger_args.minute) : 0;
  const cronDow = trigger === 'cron' && trigger_args.day_of_week ? String(trigger_args.day_of_week) : '';

  function switchTrigger(t: 'cron' | 'interval') {
    if (t === 'interval') {
      onChange({ trigger: 'interval', trigger_args: { seconds: currentSecs } });
    } else {
      onChange({ trigger: 'cron', trigger_args: { hour: cronHour, minute: cronMinute } });
    }
  }

  function setIntervalSecs(secs: number) {
    onChange({ trigger: 'interval', trigger_args: { seconds: secs } });
  }

  function setCronArgs(patch: Record<string, unknown>) {
    const merged = { ...trigger_args, ...patch };
    if ('day_of_week' in patch && !patch.day_of_week) {
      const { day_of_week: _dow, ...rest } = merged;
      onChange({ trigger: 'cron', trigger_args: rest });
    } else {
      onChange({ trigger: 'cron', trigger_args: merged });
    }
  }

  return (
    <div className="space-y-3">
      {/* Trigger type tabs */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-400">Schedule type</label>
        <div className="flex rounded-lg bg-slate-900/50 p-0.5">
          {(['interval', 'cron'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchTrigger(t)}
              className={clsx(
                'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                trigger === t
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-300',
              )}
            >
              {t === 'interval' ? 'Interval (recurring)' : 'Cron (time-based)'}
            </button>
          ))}
        </div>
      </div>

      {/* Interval fields */}
      {trigger === 'interval' && (
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Repeat every (seconds)</label>
            <input
              type="number"
              min={1}
              value={currentSecs}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!isNaN(n) && n > 0) setIntervalSecs(n);
              }}
              className="w-full rounded-lg border border-slate-600/50 bg-slate-900/50 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
            />
            <p className="mt-0.5 text-xs text-slate-500">= Every {intervalLabel(currentSecs)}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {INTERVAL_PRESETS.map(({ label: pl, seconds }) => (
              <button
                key={pl}
                type="button"
                onClick={() => setIntervalSecs(seconds)}
                className={clsx(
                  'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                  currentSecs === seconds
                    ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
                    : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700',
                )}
              >
                {pl}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cron fields */}
      {trigger === 'cron' && (
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Day of week</label>
            <select
              value={cronDow}
              onChange={(e) => setCronArgs({ day_of_week: e.target.value })}
              className="w-full rounded-lg border border-slate-600/50 bg-slate-900/50 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
            >
              {DAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Hour (0–23)</label>
              <input
                type="number"
                min={0}
                max={23}
                value={cronHour}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!isNaN(n)) setCronArgs({ hour: Math.min(23, Math.max(0, n)) });
                }}
                className="w-full rounded-lg border border-slate-600/50 bg-slate-900/50 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Minute (0–59)</label>
              <input
                type="number"
                min={0}
                max={59}
                value={cronMinute}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!isNaN(n)) setCronArgs({ minute: Math.min(59, Math.max(0, n)) });
                }}
                className="w-full rounded-lg border border-slate-600/50 bg-slate-900/50 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
              />
            </div>
          </div>
          <p className="rounded-lg bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
            <span className="text-slate-500">Summary: </span>
            {cronSummary(trigger_args)}
          </p>
        </div>
      )}
    </div>
  );
}
