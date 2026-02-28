'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { PortfolioPosition } from '@/lib/types';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD'];

export interface PositionFormData {
  ticker: string;
  quantity: number;
  avg_cost: number;
  currency: string;
  notes: string;
}

interface AddPositionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: PositionFormData) => Promise<void>;
  /** Pre-fill for edit mode; undefined for add mode. */
  editPosition?: PortfolioPosition;
}

const EMPTY_FORM: PositionFormData = {
  ticker: '',
  quantity: 0,
  avg_cost: 0,
  currency: 'USD',
  notes: '',
};

export default function AddPositionModal({
  open,
  onClose,
  onSubmit,
  editPosition,
}: AddPositionModalProps) {
  const isEdit = editPosition != null;
  const [form, setForm] = useState<PositionFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof PositionFormData, string>>>({});

  // Populate form when opening in edit mode
  useEffect(() => {
    if (open) {
      if (editPosition) {
        setForm({
          ticker: editPosition.ticker,
          quantity: editPosition.quantity,
          avg_cost: editPosition.avg_cost,
          currency: editPosition.currency,
          notes: editPosition.notes ?? '',
        });
      } else {
        setForm(EMPTY_FORM);
      }
      setErrors({});
    }
  }, [open, editPosition]);

  const validate = useCallback((): boolean => {
    const errs: Partial<Record<keyof PositionFormData, string>> = {};
    if (!form.ticker.trim()) errs.ticker = 'Ticker is required';
    if (form.quantity <= 0) errs.quantity = 'Quantity must be greater than 0';
    if (form.avg_cost <= 0) errs.avg_cost = 'Average cost must be greater than 0';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [form]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;
      setSubmitting(true);
      try {
        await onSubmit({
          ...form,
          ticker: form.ticker.trim().toUpperCase(),
        });
        onClose();
      } finally {
        setSubmitting(false);
      }
    },
    [form, validate, onSubmit, onClose]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/50 px-5 py-4">
          <h2 id="modal-title" className="text-sm font-semibold text-white">
            {isEdit ? 'Edit Position' : 'Add Position'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {/* Ticker */}
          <div>
            <label htmlFor="ticker" className="mb-1.5 block text-xs font-medium text-slate-300">
              Ticker Symbol <span className="text-red-400">*</span>
            </label>
            <input
              id="ticker"
              type="text"
              value={form.ticker}
              onChange={(e) =>
                setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))
              }
              disabled={isEdit}
              placeholder="e.g. AAPL"
              className={clsx(
                'w-full rounded-lg border bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:ring-1',
                errors.ticker
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-slate-700 focus:border-blue-500 focus:ring-blue-500',
                isEdit && 'cursor-not-allowed opacity-60'
              )}
              autoFocus={!isEdit}
            />
            {errors.ticker && (
              <p className="mt-1 text-xs text-red-400">{errors.ticker}</p>
            )}
          </div>

          {/* Quantity + Avg Cost */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="quantity" className="mb-1.5 block text-xs font-medium text-slate-300">
                Quantity <span className="text-red-400">*</span>
              </label>
              <input
                id="quantity"
                type="number"
                min="0.000001"
                step="any"
                value={form.quantity || ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))
                }
                placeholder="0"
                className={clsx(
                  'w-full rounded-lg border bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:ring-1',
                  errors.quantity
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-700 focus:border-blue-500 focus:ring-blue-500'
                )}
              />
              {errors.quantity && (
                <p className="mt-1 text-xs text-red-400">{errors.quantity}</p>
              )}
            </div>
            <div>
              <label htmlFor="avg_cost" className="mb-1.5 block text-xs font-medium text-slate-300">
                Avg Cost <span className="text-red-400">*</span>
              </label>
              <input
                id="avg_cost"
                type="number"
                min="0.000001"
                step="any"
                value={form.avg_cost || ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, avg_cost: parseFloat(e.target.value) || 0 }))
                }
                placeholder="0.00"
                className={clsx(
                  'w-full rounded-lg border bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:ring-1',
                  errors.avg_cost
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-700 focus:border-blue-500 focus:ring-blue-500'
                )}
              />
              {errors.avg_cost && (
                <p className="mt-1 text-xs text-red-400">{errors.avg_cost}</p>
              )}
            </div>
          </div>

          {/* Currency */}
          <div>
            <label htmlFor="currency" className="mb-1.5 block text-xs font-medium text-slate-300">
              Currency
            </label>
            <select
              id="currency"
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="mb-1.5 block text-xs font-medium text-slate-300">
              Notes
            </label>
            <textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes about this position…"
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-700 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Add Position'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
