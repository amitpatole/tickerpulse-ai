'use client';

import { useState, useEffect } from 'react';
import { X, Clock, Loader2, CheckCircle } from 'lucide-react';
import { clsx } from 'clsx';
import type { ScheduledJob } from '@/lib/types';
import { ApiError } from '@/lib/api';
import type { FieldError as ApiFieldError } from '@/lib/api';
import { FieldError } from '@/components/ui/FieldError';

type TriggerMode = 'interval' | 'cron';
type IntervalUnit = 'minutes' | 'hours' | 'days';

interface IntervalForm {
  value: number;
  unit: IntervalUnit;
}

interface CronForm {
  hour: string;
  minute: string;
  day_of_week: string;
}

interface Preset {
  label: string;
  mode: TriggerMode;
  interval: IntervalForm | null;
  cron: CronForm | null;
}

const PRESETS: Preset[] = [
  { label: 'Every 15 min', mode: 'interval', interval: { value: 15, unit: 'minutes' }, cron: null },
  { label: 'Every 30 min', mode: 'interval', interval: { value: 30, unit: 'minutes' }, cron: null },
  { label: 'Hourly', mode: 'interval', interval: { value: 1, unit: 'hours' }, cron: null },
  { label: 'Every 2h', mode: 'interval', interval: { value: 2, unit: 'hours' }, cron: null },
  { label: 'Every 6h', mode: 'interval', interval: { value: 6, unit: 'hours' }, cron: null },
  { label: 'Weekdays 8:30 AM', mode: 'cron', interval: null, cron: { hour: '8', minute: '30', day_of_week: 'mon-fri' } },
  { label: 'Weekdays 4:30 PM', mode: 'cron', interval: null, cron: { hour: '16', minute: '30', day_of_week: 'mon-fri' } },
  { label: 'Daily midnight', mode: 'cron', interval: null, cron: { hour: '0', minute: '0', day_of_week: '' } },
  { label: 'Sunday 8 PM', mode: 'cron', interval: null, cron: { hour: '20', minute: '0', day_of_week: 'sun' } },
];

const UNIT_MULTIPLIERS: Record<IntervalUnit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
};

function secondsToInterval(seconds: number): IntervalForm {
  if (seconds >= 86400 && seconds % 86400 === 0) {
    return { value: seconds / 86400, unit: 'days' };
  }
  if (seconds >= 3600 && seconds % 3600 === 0) {
    return { value: seconds / 3600, unit: 'hours' };
  }
  return { value: Math.max(1, Math.round(seconds / 60)), unit: 'minutes' };
}

function intervalToSeconds(form: IntervalForm): number {
  return form.value * UNIT_MULTIPLIERS[form.unit];
}

function humanizeSchedule(mode: TriggerMode, interval: IntervalForm, cron: CronForm): string {
  if (mode === 'interval') {
    const { value, unit } = interval;
    const label = value === 1 ? unit.replace(/s$/, '') : unit;
    return `Every ${value} ${label}`;
  }

  const parts: string[] = [];

  const h = parseInt(cron.hour.trim());
  const m = parseInt(cron.minute.trim());
  if (!isNaN(h) && !isNaN(m)) {
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ampm = h < 12 ? 'AM' : 'PM';
    const minStr = m.toString().padStart(2, '0');
    parts.push(`at ${hour12}:${minStr} ${ampm}`);
  } else if (cron.minute.trim() !== '') {
    parts.push(`at minute ${cron.minute.trim()}`);
  }

  const DOW_LABELS: Record<string, string> = {
    'mon-fri': 'weekdays',
    'mon,tue,wed,thu,fri': 'weekdays',
    'sat,sun': 'weekends',
    mon: 'Mondays',
    tue: 'Tuesdays',
    wed: 'Wednesdays',
    thu: 'Thursdays',
    fri: 'Fridays',
    sat: 'Saturdays',
    sun: 'Sundays',
  };

  const dow = cron.day_of_week.trim().toLowerCase();
  if (dow && dow !== '*') {
    parts.push(DOW_LABELS[dow] ?? cron.day_of_week);
  } else {
    parts.push('daily');
  }

  return parts.join(', ');
}

function parseTriggerArgs(
  trigger: string,
  args: Record<string, unknown>
): { mode: TriggerMode; interval: IntervalForm; cron: CronForm } {
  const defaultInterval: IntervalForm = { value: 15, unit: 'minutes' };
  const defaultCron: CronForm = { hour: '8', minute: '30', day_of_week: 'mon-fri' };

  const isCron = trigger.startsWith('cron');
  const isInterval = trigger.startsWith('interval');

  if (isInterval || (!isCron && args.seconds != null)) {
    const seconds = Number(args.seconds ?? 0);
    return {
      mode: 'interval',
      interval: seconds > 0 ? secondsToInterval(seconds) : defaultInterval,
      cron: defaultCron,
    };
  }

  if (isCron) {
    return {
      mode: 'cron',
      interval: defaultInterval,
      cron: {
        hour: args.hour != null ? String(args.hour) : '',
        minute: args.minute != null ? String(args.minute) : '',
        day_of_week: String(args.day_of_week ?? ''),
      },
    };
  }

  return { mode: 'interval', interval: defaultInterval, cron: defaultCron };
}

export interface ScheduleEditModalProps {
  open: boolean;
  job: ScheduledJob | null;
  onClose: () => void;
  onSave: (
    jobId: string,
    trigger: 'cron' | 'interval',
    args: Record<string, number | string>
  ) => Promise<void>;
}

export default function ScheduleEditModal({
  open,
  job,
  onClose,
  onSave,
}: ScheduleEditModalProps) {
  const [mode, setMode] = useState<TriggerMode>('interval');
  const [intervalForm, setIntervalForm] = useState<IntervalForm>({ value: 15, unit: 'minutes' });
  const [cronForm, setCronForm] = useState<CronForm>({ hour: '8', minute: '30', day_of_week: 'mon-fri' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ApiFieldError[]>([]);

  useEffect(() => {
    if (open && job) {
      const parsed = parseTriggerArgs(job.trigger, job.trigger_args);
      setMode(parsed.mode);
      setIntervalForm(parsed.interval);
      setCronForm(parsed.cron);
      setError(null);
      setFieldErrors([]);
      setSaved(false);
    }
  }, [open, job]);

  if (!open || !job) return null;

  const getFieldError = (field: string): string | undefined =>
    fieldErrors.find((fe) => fe.field === field)?.message;

  const preview = humanizeSchedule(mode, intervalForm, cronForm);

  const applyPreset = (preset: Preset) => {
    setMode(preset.mode);
    if (preset.interval) setIntervalForm(preset.interval);
    if (preset.cron) setCronForm(preset.cron);
    setError(null);
    setFieldErrors([]);
  };

  const validate = (): string | null => {
    if (mode === 'interval') {
      if (!intervalForm.value || intervalForm.value < 1) return 'Interval must be at least 1';
      if (intervalToSeconds(intervalForm) < 60) return 'Minimum interval is 1 minute';
    } else {
      const hourTrimmed = cronForm.hour.trim();
      const minuteTrimmed = cronForm.minute.trim();
      if (hourTrimmed === '' && minuteTrimmed === '') {
        return 'At least one of Hour or Minute is required for a cron schedule.';
      }
      if (hourTrimmed !== '' && (isNaN(Number(hourTrimmed)) || Number(hourTrimmed) < 0 || Number(hourTrimmed) > 23)) {
        return 'Hour must be 0–23';
      }
      if (minuteTrimmed !== '' && (isNaN(Number(minuteTrimmed)) || Number(minuteTrimmed) < 0 || Number(minuteTrimmed) > 59)) {
        return 'Minute must be 0–59';
      }
    }
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setFieldErrors([]);

    try {
      let args: Record<string, number | string>;
      if (mode === 'interval') {
        args = { seconds: intervalToSeconds(intervalForm) };
      } else {
        args = {};
        const hourTrimmed = cronForm.hour.trim();
        const minuteTrimmed = cronForm.minute.trim();
        if (hourTrimmed !== '') args.hour = parseInt(hourTrimmed);
        if (minuteTrimmed !== '') args.minute = parseInt(minuteTrimmed);
        if (cronForm.day_of_week.trim()) args.day_of_week = cronForm.day_of_week.trim().toLowerCase();
      }
      await onSave(job.id, mode, args);
      setSaved(true);
      setTimeout(() => {
        onClose();
        setSaved(false);
      }, 800);
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors.length > 0) {
        setFieldErrors(e.fieldErrors);
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : 'Failed to save schedule');
      }
    } finally {
      setSaving(false);
    }
  };

  const isInvalid = validate() !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit schedule for ${job.name}`}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-700/50 bg-slate-900 p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Edit Schedule</h2>
            <p className="mt-0.5 text-xs text-slate-400">{job.name}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode selector */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-slate-300">Trigger Type</label>
          <div className="flex rounded-lg border border-slate-700/50 bg-slate-800/50 p-0.5">
            <button
              onClick={() => setMode('interval')}
              className={clsx(
                'flex-1 rounded-md py-1.5 text-xs font-medium transition-colors',
                mode === 'interval'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              Interval
            </button>
            <button
              onClick={() => setMode('cron')}
              className={clsx(
                'flex-1 rounded-md py-1.5 text-xs font-medium transition-colors',
                mode === 'cron'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              Cron
            </button>
          </div>
        </div>

        {/* Interval form */}
        {mode === 'interval' && (
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-slate-300">Repeat Every</label>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={intervalForm.value}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  // Store 0 for empty/NaN so the user can type freely without the
                  // field snapping to 1 mid-keystroke. validate() already rejects < 1.
                  setIntervalForm((prev) => ({
                    ...prev,
                    value: isNaN(parsed) ? 0 : parsed,
                  }));
                }}
                aria-label="Interval value"
                aria-describedby={getFieldError('seconds') ? 'field-error-seconds' : undefined}
                className="w-24 rounded-lg border border-slate-700/50 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
              <select
                value={intervalForm.unit}
                onChange={(e) =>
                  setIntervalForm((prev) => ({
                    ...prev,
                    unit: e.target.value as IntervalUnit,
                  }))
                }
                aria-label="Interval unit"
                className="flex-1 rounded-lg border border-slate-700/50 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
            <FieldError message={getFieldError('seconds')} id="field-error-seconds" />
          </div>
        )}

        {/* Cron form */}
        {mode === 'cron' && (
          <div className="mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Hour <span className="text-slate-500">(0–23)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={cronForm.hour}
                  onChange={(e) => setCronForm((prev) => ({ ...prev, hour: e.target.value }))}
                  aria-label="Cron hour"
                  aria-describedby={getFieldError('hour') ? 'field-error-hour' : undefined}
                  className="w-full rounded-lg border border-slate-700/50 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
                <FieldError message={getFieldError('hour')} id="field-error-hour" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Minute <span className="text-slate-500">(0–59)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={cronForm.minute}
                  onChange={(e) => setCronForm((prev) => ({ ...prev, minute: e.target.value }))}
                  aria-label="Cron minute"
                  aria-describedby={getFieldError('minute') ? 'field-error-minute' : undefined}
                  className="w-full rounded-lg border border-slate-700/50 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
                <FieldError message={getFieldError('minute')} id="field-error-minute" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Day of Week</label>
              <input
                type="text"
                placeholder="mon-fri  or  mon,wed,fri  or  * (all days)"
                value={cronForm.day_of_week}
                onChange={(e) =>
                  setCronForm((prev) => ({ ...prev, day_of_week: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-700/50 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none"
              />
              <FieldError message={getFieldError('day_of_week')} />
              <p className="mt-1 text-[10px] text-slate-500">
                Leave blank for daily. Use mon, tue, wed, thu, fri, sat, sun.
              </p>
            </div>
          </div>
        )}

        {/* Presets */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-slate-300">Quick Presets</label>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset)}
                className="rounded-md border border-slate-700/50 bg-slate-800/50 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-400"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="mb-5 rounded-lg border border-slate-700/30 bg-slate-800/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 flex-shrink-0 text-blue-400" />
            <span className="text-xs text-slate-400">Schedule:</span>
            <span className="text-sm font-medium text-white">{preview}</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-700/50 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700/30"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saved || isInvalid}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {saved ? (
              <>
                <CheckCircle className="h-4 w-4" />
                Saved!
              </>
            ) : saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save Schedule'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}