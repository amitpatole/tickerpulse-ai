'use client';

import { useState, useEffect } from 'react';
import { Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { updateJobSchedule } from '@/lib/api';
import type { ScheduledJob, CronTrigger, IntervalTrigger } from '@/lib/types';

interface Props {
  job: ScheduledJob;
  onSave: () => void;
}

type TriggerTab = 'interval' | 'cron';

const INTERVAL_PRESETS: { label: string; seconds: number }[] = [
  { label: '30s', seconds: 30 },
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '30m', seconds: 1800 },
  { label: '1h', seconds: 3600 },
  { label: '4h', seconds: 14400 },
  { label: '12h', seconds: 43200 },
  { label: '24h', seconds: 86400 },
];

const DAY_OF_WEEK_OPTIONS = [
  { label: 'Every day', value: '' },
  { label: 'Weekdays (Mon–Fri)', value: 'mon-fri' },
  { label: 'Weekends (Sat–Sun)', value: 'sat,sun' },
  { label: 'Custom…', value: '__custom__' },
];

function intervalLabel(secs: number): string {
  if (secs < 60) return `${secs} second${secs !== 1 ? 's' : ''}`;
  if (secs < 3600) {
    const m = Math.round(secs / 60);
    return `${m} minute${m !== 1 ? 's' : ''}`;
  }
  if (secs < 86400) {
    const h = (secs / 3600).toFixed(1).replace(/\.0$/, '');
    return `${h} hour${h !== '1' ? 's' : ''}`;
  }
  const d = (secs / 86400).toFixed(1).replace(/\.0$/, '');
  return `${d} day${d !== '1' ? 's' : ''}`;
}

function cronSummary(hour: string, minute: string, dayOfWeek: string, customDow: string): string {
  const parts: string[] = [];
  const effectiveDow = dayOfWeek === '__custom__' ? customDow : dayOfWeek;

  if (effectiveDow === 'mon-fri') parts.push('Weekdays');
  else if (effectiveDow === 'sat,sun') parts.push('Weekends');
  else if (effectiveDow) parts.push(effectiveDow.toUpperCase());
  else parts.push('Every day');

  const h = parseInt(hour, 10);
  const m = parseInt(minute, 10);
  if (!isNaN(h) && !isNaN(m)) {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    parts.push(`at ${h12}:${m.toString().padStart(2, '0')} ${ampm}`);
  }

  return parts.join(' ');
}

function detectTab(job: ScheduledJob): TriggerTab {
  return job.trigger.toLowerCase().includes('interval') ? 'interval' : 'cron';
}

function initInterval(job: ScheduledJob): number {
  const args = job.trigger_args;
  if (typeof args.seconds === 'number') return args.seconds;
  if (typeof args.minutes === 'number') return (args.minutes as number) * 60;
  if (typeof args.hours === 'number') return (args.hours as number) * 3600;
  return 900;
}

function initCron(job: ScheduledJob): { hour: string; minute: string; dayOfWeek: string; customDow: string } {
  const args = job.trigger_args;
  const rawDow = args.day_of_week ? String(args.day_of_week) : '';
  const knownDow = DAY_OF_WEEK_OPTIONS.some((o) => o.value === rawDow && o.value !== '__custom__');
  return {
    hour: args.hour != null ? String(args.hour) : '9',
    minute: args.minute != null ? String(args.minute) : '0',
    dayOfWeek: knownDow ? rawDow : rawDow ? '__custom__' : '',
    customDow: knownDow ? '' : rawDow,
  };
}

export default function ScheduleEditor({ job, onSave }: Props) {
  const [tab, setTab] = useState<TriggerTab>(detectTab(job));
  const [intervalSecs, setIntervalSecs] = useState<number>(initInterval(job));
  const [intervalInput, setIntervalInput] = useState<string>(String(initInterval(job)));
  const [cronHour, setCronHour] = useState<string>('9');
  const [cronMinute, setCronMinute] = useState<string>('0');
  const [cronDow, setCronDow] = useState<string>('');
  const [customDow, setCustomDow] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  // Re-initialize when job changes
  useEffect(() => {
    const newTab = detectTab(job);
    setTab(newTab);
    const secs = initInterval(job);
    setIntervalSecs(secs);
    setIntervalInput(String(secs));
    const cron = initCron(job);
    setCronHour(cron.hour);
    setCronMinute(cron.minute);
    setCronDow(cron.dayOfWeek);
    setCustomDow(cron.customDow);
    setSaveError(null);
    setSaveOk(false);
  }, [job.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleIntervalInput(val: string) {
    setIntervalInput(val);
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0) setIntervalSecs(n);
  }

  function applyPreset(secs: number) {
    setIntervalSecs(secs);
    setIntervalInput(String(secs));
  }

  function clampCronHour(val: string) {
    const n = parseInt(val, 10);
    if (isNaN(n)) return setCronHour('');
    setCronHour(String(Math.min(23, Math.max(0, n))));
  }

  function clampCronMinute(val: string) {
    const n = parseInt(val, 10);
    if (isNaN(n)) return setCronMinute('');
    setCronMinute(String(Math.min(59, Math.max(0, n))));
  }

  async function handleSave() {
    setSaveError(null);
    setSaveOk(false);
    setSaving(true);
    try {
      if (tab === 'interval') {
        const secs = parseInt(intervalInput, 10);
        if (isNaN(secs) || secs < 1) {
          setSaveError('Interval must be a positive number of seconds.');
          return;
        }
        const payload: IntervalTrigger = { trigger: 'interval', seconds: secs };
        await updateJobSchedule(job.id, payload);
      } else {
        const h = parseInt(cronHour, 10);
        const m = parseInt(cronMinute, 10);
        if (isNaN(h) || h < 0 || h > 23) {
          setSaveError('Hour must be between 0 and 23.');
          return;
        }
        if (isNaN(m) || m < 0 || m > 59) {
          setSaveError('Minute must be between 0 and 59.');
          return;
        }
        const effectiveDow = cronDow === '__custom__' ? customDow : cronDow;
        const payload: CronTrigger = { trigger: 'cron', hour: h, minute: m };
        if (effectiveDow) payload.day_of_week = effectiveDow;
        await updateJobSchedule(job.id, payload);
      }
      setSaveOk(true);
      onSave();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save schedule.');
    } finally {
      setSaving(false);
    }
  }

  const effectiveDow = cronDow === '__custom__' ? customDow : cronDow;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
      <h3 className="mb-4 text-sm font-semibold text-white">Edit Schedule</h3>

      {/* Tabs */}
      <div className="mb-5 flex rounded-lg bg-slate-900/50 p-0.5">
        {(['interval', 'cron'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setSaveError(null); setSaveOk(false); }}
            className={clsx(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-300',
            )}
          >
            {t === 'interval' ? 'Interval' : 'Cron'}
          </button>
        ))}
      </div>

      {/* Interval tab */}
      {tab === 'interval' && (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Repeat every (seconds)
            </label>
            <input
              type="number"
              min={1}
              value={intervalInput}
              onChange={(e) => handleIntervalInput(e.target.value)}
              className="w-full rounded-lg border border-slate-600/50 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
              placeholder="e.g. 900"
            />
            <p className="mt-1 text-xs text-slate-500">
              = Every {intervalLabel(intervalSecs)}
            </p>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">Presets</p>
            <div className="flex flex-wrap gap-1.5">
              {INTERVAL_PRESETS.map(({ label, seconds }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => applyPreset(seconds)}
                  className={clsx(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    intervalSecs === seconds
                      ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
                      : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700 hover:text-white',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cron tab */}
      {tab === 'cron' && (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Day of week</label>
            <select
              value={cronDow}
              onChange={(e) => setCronDow(e.target.value)}
              className="w-full rounded-lg border border-slate-600/50 bg-slate-900/50 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
            >
              {DAY_OF_WEEK_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {cronDow === '__custom__' && (
              <input
                type="text"
                value={customDow}
                onChange={(e) => setCustomDow(e.target.value)}
                placeholder="e.g. mon,wed,fri"
                className="mt-1.5 w-full rounded-lg border border-slate-600/50 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Hour (0–23)</label>
              <input
                type="number"
                min={0}
                max={23}
                value={cronHour}
                onChange={(e) => setCronHour(e.target.value)}
                onBlur={(e) => clampCronHour(e.target.value)}
                className="w-full rounded-lg border border-slate-600/50 bg-slate-900/50 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Minute (0–59)</label>
              <input
                type="number"
                min={0}
                max={59}
                value={cronMinute}
                onChange={(e) => setCronMinute(e.target.value)}
                onBlur={(e) => clampCronMinute(e.target.value)}
                className="w-full rounded-lg border border-slate-600/50 bg-slate-900/50 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
              />
            </div>
          </div>

          <p className="rounded-lg bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
            <span className="text-slate-500">Summary: </span>
            {cronSummary(cronHour, cronMinute, cronDow, customDow)}
          </p>
        </div>
      )}

      {/* Feedback */}
      {saveError && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2.5 text-xs text-red-400">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {saveError}
        </div>
      )}
      {saveOk && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-400">
          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
          Schedule saved.
        </div>
      )}

      {/* Save button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving…
          </>
        ) : (
          <>
            <Save className="h-4 w-4" />
            Save Schedule
          </>
        )}
      </button>
    </div>
  );
}
