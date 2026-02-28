'use client';

import { useState } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import CronBuilder, { type CronBuilderValue } from './CronBuilder';
import type { AgentSchedule, KnownAgent, ScheduleFormValues } from '@/lib/types';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  agents: KnownAgent[];
  initial?: AgentSchedule;
  onSave: (data: ScheduleFormValues) => Promise<void>;
  onClose: () => void;
}

export default function AgentScheduleModal({ agents, initial, onSave, onClose }: Props) {
  const isEdit = !!initial;

  const [jobId, setJobId] = useState(initial?.job_id ?? (agents[0]?.job_id ?? ''));
  const [label, setLabel] = useState(initial?.label ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [cronValue, setCronValue] = useState<CronBuilderValue>({
    trigger: initial?.trigger ?? 'cron',
    trigger_args: initial?.trigger_args ?? { hour: 9, minute: 0 },
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!jobId) { setError('Please select an agent.'); return; }
    if (!label.trim()) { setError('Label is required.'); return; }

    if (cronValue.trigger === 'interval') {
      const secs = typeof cronValue.trigger_args.seconds === 'number' ? cronValue.trigger_args.seconds : 0;
      if (secs < 1) { setError('Interval must be at least 1 second.'); return; }
    } else {
      const h = typeof cronValue.trigger_args.hour === 'number' ? cronValue.trigger_args.hour : -1;
      const m = typeof cronValue.trigger_args.minute === 'number' ? cronValue.trigger_args.minute : -1;
      if (h < 0 || h > 23) { setError('Hour must be between 0 and 23.'); return; }
      if (m < 0 || m > 59) { setError('Minute must be between 0 and 59.'); return; }
    }

    setSaving(true);
    try {
      await onSave({
        job_id: jobId,
        label: label.trim(),
        description: description.trim(),
        trigger: cronValue.trigger,
        trigger_args: cronValue.trigger_args,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-modal-title"
        className="relative w-full max-w-md rounded-2xl border border-slate-700/50 bg-slate-800 p-6 shadow-2xl"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h3 id="schedule-modal-title" className="text-base font-semibold text-white">
            {isEdit ? 'Edit Schedule' : 'New Schedule'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Agent selector */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Agent</label>
            <select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              disabled={isEdit}
              className="w-full rounded-lg border border-slate-600/50 bg-slate-900/50 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30 disabled:opacity-60"
            >
              {agents.map((a) => (
                <option key={a.job_id} value={a.job_id}>{a.name || a.job_id}</option>
              ))}
              {agents.length === 0 && <option value="">No agents available</option>}
            </select>
          </div>

          {/* Label */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Morning Briefing at 8:30 AM"
              className="w-full rounded-lg border border-slate-600/50 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Description <span className="text-slate-600">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this schedule"
              className="w-full rounded-lg border border-slate-600/50 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
            />
          </div>

          {/* CronBuilder */}
          <CronBuilder value={cronValue} onChange={setCronValue} />

          {/* Inline error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {saving
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
                : (isEdit ? 'Update Schedule' : 'Create Schedule')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-600/50 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
