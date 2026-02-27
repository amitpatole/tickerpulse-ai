'use client';

import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import type { Alert, AlertCondition } from '@/lib/types';

const CONDITION_OPTIONS: { value: AlertCondition; label: string; hint: string }[] = [
  { value: 'price_above', label: 'Price above', hint: 'Fires when price rises above the threshold' },
  { value: 'price_below', label: 'Price below', hint: 'Fires when price falls below the threshold' },
  { value: 'pct_change', label: '% Change ±', hint: 'Fires when |price change| reaches threshold %' },
];

const SOUND_OPTIONS: { value: string; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'chime', label: 'Chime' },
  { value: 'alarm', label: 'Alarm' },
  { value: 'silent', label: 'Silent' },
];

interface AlertFormModalProps {
  /** Existing alert to edit. If undefined, the modal is in create mode. */
  alert?: Alert;
  /** Called after a successful create or edit with the resulting alert. */
  onSuccess: (alert: Alert) => void;
  /** Called when the user dismisses the modal without saving. */
  onClose: () => void;
  /** Callback for creating a new alert. */
  onCreate: (data: {
    ticker: string;
    condition_type: string;
    threshold: number;
    sound_type: string;
  }) => Promise<Alert>;
  /** Callback for updating an existing alert. */
  onUpdate: (
    id: number,
    data: { condition_type?: string; threshold?: number; sound_type?: string }
  ) => Promise<Alert>;
}

interface FormState {
  ticker: string;
  condition_type: AlertCondition;
  threshold: string;
  sound_type: string;
}

interface FormErrors {
  ticker?: string;
  threshold?: string;
  general?: string;
}

export default function AlertFormModal({
  alert,
  onSuccess,
  onClose,
  onCreate,
  onUpdate,
}: AlertFormModalProps) {
  const isEdit = alert !== undefined;
  const firstFocusRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  const [form, setForm] = useState<FormState>({
    ticker: alert?.ticker ?? '',
    condition_type: alert?.condition_type ?? 'price_above',
    threshold: alert ? String(alert.threshold) : '',
    sound_type: alert?.sound_type ?? 'default',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Trap focus inside modal and auto-focus first input.
  useEffect(() => {
    firstFocusRef.current?.focus();
  }, []);

  // Close on Escape key.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  function validate(): FormErrors {
    const errs: FormErrors = {};

    if (!isEdit) {
      const t = form.ticker.trim().toUpperCase();
      if (!t) {
        errs.ticker = 'Ticker is required';
      } else if (!/^[A-Z]{1,5}$/.test(t)) {
        errs.ticker = 'Ticker must be 1–5 uppercase letters';
      }
    }

    const raw = form.threshold.trim();
    if (!raw) {
      errs.threshold = 'Threshold is required';
    } else {
      const num = parseFloat(raw);
      if (isNaN(num) || num <= 0) {
        errs.threshold = 'Threshold must be a number greater than 0';
      } else if (num > 1_000_000) {
        errs.threshold = 'Threshold must be ≤ 1,000,000';
      } else if (form.condition_type === 'pct_change' && num > 100) {
        errs.threshold = '% Change threshold must be ≤ 100';
      }
    }

    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      const threshold = parseFloat(form.threshold.trim());
      let result: Alert;

      if (isEdit && alert) {
        result = await onUpdate(alert.id, {
          condition_type: form.condition_type,
          threshold,
          sound_type: form.sound_type,
        });
      } else {
        result = await onCreate({
          ticker: form.ticker.trim().toUpperCase(),
          condition_type: form.condition_type,
          threshold,
          sound_type: form.sound_type,
        });
      }

      onSuccess(result);
    } catch (err) {
      setErrors({
        general: err instanceof Error ? err.message : 'Failed to save alert',
      });
    } finally {
      setSubmitting(false);
    }
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear the specific field error on change.
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  const thresholdLabel =
    form.condition_type === 'pct_change' ? 'Threshold (%)' : 'Threshold ($)';
  const thresholdPlaceholder =
    form.condition_type === 'pct_change' ? 'e.g. 5' : 'e.g. 150.00';

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-slate-700/50 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/50 px-5 py-4">
          <h2 id="alert-modal-title" className="text-sm font-semibold text-white">
            {isEdit ? 'Edit Alert' : 'New Price Alert'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded p-1 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4 px-5 py-4">
          {errors.general && (
            <p role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {errors.general}
            </p>
          )}

          {/* Ticker (create mode only) */}
          {!isEdit && (
            <div>
              <label htmlFor="alert-ticker" className="mb-1 block text-xs font-medium text-slate-300">
                Ticker
              </label>
              <input
                id="alert-ticker"
                ref={firstFocusRef as React.RefObject<HTMLInputElement>}
                type="text"
                value={form.ticker}
                onChange={(e) => setField('ticker', e.target.value.toUpperCase())}
                placeholder="e.g. AAPL"
                maxLength={5}
                autoComplete="off"
                aria-describedby={errors.ticker ? 'ticker-error' : undefined}
                aria-invalid={errors.ticker ? 'true' : undefined}
                className={clsx(
                  'w-full rounded border bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500',
                  'focus:outline-none focus:ring-2',
                  errors.ticker
                    ? 'border-red-500/60 focus:ring-red-500/30'
                    : 'border-slate-600 focus:ring-blue-500/30'
                )}
              />
              {errors.ticker && (
                <p id="ticker-error" role="alert" className="mt-1 text-xs text-red-400">
                  {errors.ticker}
                </p>
              )}
            </div>
          )}

          {/* Condition type */}
          <div>
            <label htmlFor="alert-condition" className="mb-1 block text-xs font-medium text-slate-300">
              Condition
            </label>
            <select
              id="alert-condition"
              ref={isEdit ? (firstFocusRef as React.RefObject<HTMLSelectElement>) : undefined}
              value={form.condition_type}
              onChange={(e) => setField('condition_type', e.target.value as AlertCondition)}
              className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              {CONDITION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              {CONDITION_OPTIONS.find((o) => o.value === form.condition_type)?.hint}
            </p>
          </div>

          {/* Threshold */}
          <div>
            <label htmlFor="alert-threshold" className="mb-1 block text-xs font-medium text-slate-300">
              {thresholdLabel}
            </label>
            <input
              id="alert-threshold"
              type="number"
              min="0.0001"
              step="any"
              value={form.threshold}
              onChange={(e) => setField('threshold', e.target.value)}
              placeholder={thresholdPlaceholder}
              aria-describedby={errors.threshold ? 'threshold-error' : undefined}
              aria-invalid={errors.threshold ? 'true' : undefined}
              className={clsx(
                'w-full rounded border bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500',
                'focus:outline-none focus:ring-2',
                errors.threshold
                  ? 'border-red-500/60 focus:ring-red-500/30'
                  : 'border-slate-600 focus:ring-blue-500/30'
              )}
            />
            {errors.threshold && (
              <p id="threshold-error" role="alert" className="mt-1 text-xs text-red-400">
                {errors.threshold}
              </p>
            )}
          </div>

          {/* Sound type */}
          <div>
            <label htmlFor="alert-sound" className="mb-1 block text-xs font-medium text-slate-300">
              Alert Sound
            </label>
            <select
              id="alert-sound"
              value={form.sound_type}
              onChange={(e) => setField('sound_type', e.target.value)}
              className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              {SOUND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={clsx(
                'rounded px-4 py-2 text-sm font-medium text-white transition-colors',
                submitting
                  ? 'cursor-not-allowed bg-blue-500/50'
                  : 'bg-blue-600 hover:bg-blue-500'
              )}
            >
              {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Alert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
