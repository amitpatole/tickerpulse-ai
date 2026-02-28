```tsx
'use client';

import { useState, useEffect } from 'react';
import { X, Clock, Loader2, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import type { AgentSchedule } from '@/lib/types';
import type { KnownAgent } from '@/lib/api';

// ---------------------------------------------------------------------------
// Schedule presets
// ---------------------------------------------------------------------------

const SCHEDULE_PRESETS = [
  { label: 'Every 15 min',     trigger: 'interval' as const, args: { seconds: 900 } },
  { label: 'Every 30 min',     trigger: 'interval' as const, args: { seconds: 1800 } },
  { label: 'Hourly',           trigger: 'interval' as const, args: { seconds: 3600 } },
  { label: 'Every 2h',         trigger: 'interval' as const, args: { seconds: 7200 } },
  { label: 'Every 6h',         trigger: 'interval' as const, args: { seconds: 21600 } },
  { label: 'Daily 6 AM',       trigger: 'cron'     as const, args: { hour: 6,  minute: 0 } },
  { label: 'Weekdays 8:30 AM', trigger: 'cron'     as const, args: { hour: 8,  minute: 30, day_of_week: 'mon-fri' } },
  { label: 'Weekdays 4:30 PM', trigger: 'cron'     as const, args: { hour: 16, minute: 30, day_of_week: 'mon-fri' } },
  { label: 'Sunday 8 PM',      trigger: 'cron'     as const, args: { hour: 20, minute: 0,  day_of_week: 'sun' } },
] as const;

export type { KnownAgent };

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

export interface AgentScheduleFormProps {
  open: boolean;
  /** null = create mode; existing schedule = edit mode */
  schedule: AgentSchedule | null;
  /** List of known agents from GET /api/scheduler/agents */
  agents: KnownAgent[];
  onClose: () => void;
  onSave: (data: {
    job_id: string;
    label: string;
    description?: string;
    trigger: 'cron' | 'interval';
    trigger_args: Record<string, number | string>;
  }) => Promise<void>;
}

// ---------------------------------------------------------------------------
// AgentScheduleForm
// ---------------------------------------------------------------------------

export default function AgentScheduleForm({
  open,
  schedule,
  agents,
  onClose,
  onSave,
}: AgentScheduleFormProps) {
  const [jobId, setJobId]      = useState('');
  const [label, setLabel]      = useState('');
  const [description, setDesc] = useState('');
  const [presetIdx, setPreset] = useState(0);
  const [saving, setSaving]    = useState(false);
  const [error, setError]      = useState<string | null>(null);

  // Populate form when modal opens
  useEffect(() => {
    if (!open) return;
    if (schedule) {
      // Edit mode: populate from existing schedule
      setJobId(schedule.job_id);
      setLabel(schedule.label);
      setDesc(schedule.description ?? '');
      // Find closest preset by trigger type
      const idx = SCHEDULE_PRESETS.findIndex((p) => p.trigger === schedule.trigger);
      setPreset(idx >= 0 ? idx : 0);
    } else {
      // Create mode: default to first agent
      const first = agents[0];
      setJobId(first?.job_id ?? '');
      setLabel(first?.name ?? '');
      setDesc('');
      setPreset(0);
    }
    setError(null);
  }, [open, schedule, agents]);

  if (!open) return null;

  const isEditing = schedule !== null;

  const handleJobSelect = (id: string) => {
    // Auto-fill label when: it's empty (user cleared it) OR it still matches
    // the previously-selected agent's name (was never manually customised).
    const prevAgent = agents.find((a) => a.job_id === jobId);
    setJobId(id);
    const agent = agents.find((a) => a.job_id === id);
    if (agent && (!label || label === prevAgent?.name)) {
      setLabel(agent.name);
    }
  };

  const handleSave = async () => {
    if (!jobId.trim()) {
      setError('Job ID is required.');
      return;
    }
    if (!label.trim()) {
      setError('Label is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const preset = SCHEDULE_PRESETS[presetIdx];
      await onSave({
        job_id: jobId.trim(),
        label: label.trim(),
        description: description.trim() || undefined,
        trigger: preset.trigger,
        trigger_args: preset.args as Record<string, number | string>,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save schedule.');
    } finally {
      setSaving(false);
    }
  };

  const preview = SCHEDULE_PRESETS[presetIdx]?.label ?? '—';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? `Edit ${schedule?.label}` : 'New agent schedule'}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-700/50 bg-slate-900 p-6 shadow-2xl">

        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <h2 className="text-base font-semibold text-white">
            {isEditing ? 'Edit Schedule' : 'New Agent Schedule'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Job ID / Agent selector */}
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-slate-300">Job ID</label>
          {isEditing ? (
            <p className="rounded-lg border border-slate-700/30 bg-slate-800/50 px-3 py-2 font-mono text-sm text-slate-400">
              {jobId}
            </p>
          ) : (
            <select
              value={jobId}
              onChange={(e) => handleJobSelect(e.target.value)}
              className="w-full rounded-lg border border-slate-700/50 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              aria-label="Select agent job"
            >
              {agents.length === 0 && (
                <option value="">No agents available</option>
              )}
              {agents.map((a) => (
                <option key={a.job_id} value={a.job_id}>
                  {a.job_id} — {a.name}
                </option>
              ))}
            </select>
          )}
          {!isEditing && agents.length === 0 && (
            <div
              data-testid="no-agents-notice"
              className="mt-1.5 flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5"
            >
              <AlertTriangle className="h-3 w-3 flex-shrink-0 text-amber-400" />
              <p className="text-[11px] text-amber-400">
                No agents found. Ensure the scheduler is running so jobs are registered.
              </p>
            </div>
          )}
          {(isEditing || agents.length > 0) && (
            <p className="mt-0.5 text-[10px] text-slate-500">
              Overrides the live schedule for this APScheduler job on next startup.
            </p>
          )}
        </div>

        {/* Label */}
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-slate-300">Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Display name"
            className="w-full rounded-lg border border-slate-700/50 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none"
            aria-label="Schedule label"
          />
        </div>

        {/* Description */}
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-slate-300">
            Description <span className="text-slate-500">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDesc(e.target.value)}
            rows={2}
            placeholder="Why this override exists"
            className="w-full resize-none rounded-lg border border-slate-700/50 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none"
            aria-label="Schedule description"
          />
        </div>

        {/* Schedule preset */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-slate-300">Schedule</label>
          <select
            value={presetIdx}
            onChange={(e) => setPreset(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-700/50 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            aria-label="Select schedule preset"
          >
            {SCHEDULE_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Preview */}
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-700/30 bg-slate-800/30 px-4 py-2.5">
          <Clock className="h-4 w-4 flex-shrink-0 text-blue-400" />
          <span className="text-xs text-slate-400">Schedule:</span>
          <span className="text-sm font-medium text-white">{preview}</span>
        </div>

        {/* Error */}
        {error && (
          <div
            data-testid="form-error"
            className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400"
          >
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
            disabled={saving || (!isEditing && agents.length === 0)}
            className={clsx(
              'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-white transition-colors disabled:opacity-60',
              'bg-blue-600 hover:bg-blue-700'
            )}
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
            ) : isEditing ? (
              'Save Changes'
            ) : (
              'Create Schedule'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
```