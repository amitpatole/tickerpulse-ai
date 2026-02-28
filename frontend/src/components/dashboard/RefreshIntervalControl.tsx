'use client';

import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { getRefreshInterval, setRefreshInterval } from '@/lib/api';

const INTERVAL_OPTIONS = [
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 300, label: '5m' },
  { value: 600, label: '10m' },
  { value: 0, label: 'Manual' },
] as const;

type IntervalValue = (typeof INTERVAL_OPTIONS)[number]['value'];

function isKnownInterval(v: number): v is IntervalValue {
  return INTERVAL_OPTIONS.some((o) => o.value === v);
}

export default function RefreshIntervalControl() {
  const [interval, setIntervalValue] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRefreshInterval()
      .then(({ interval: v }) => setIntervalValue(v))
      .catch(() => setIntervalValue(60));
  }, []);

  const handleChange = useCallback(
    async (newInterval: number) => {
      const previous = interval;
      setIntervalValue(newInterval);
      setError(null);
      setSaving(true);
      try {
        await setRefreshInterval(newInterval);
      } catch {
        setIntervalValue(previous);
        setError('Save failed');
      } finally {
        setSaving(false);
      }
    },
    [interval]
  );

  const isStreaming = interval !== null && interval > 0;

  return (
    <div className="flex items-center gap-2">
      {/* Live indicator dot */}
      <span
        aria-label={isStreaming ? 'Live price updates active' : 'Manual mode — auto-refresh off'}
        title={isStreaming ? 'Live' : 'Manual'}
        className={clsx(
          'h-2 w-2 flex-shrink-0 rounded-full',
          interval === null
            ? 'bg-slate-600'
            : isStreaming
              ? 'animate-pulse bg-emerald-400'
              : 'bg-slate-500'
        )}
      />

      {/* Interval selector */}
      <select
        aria-label="Price refresh interval"
        disabled={interval === null || saving}
        value={interval ?? ''}
        onChange={(e) => handleChange(Number(e.target.value))}
        className={clsx(
          'rounded border bg-slate-800 px-2 py-1 text-xs text-slate-300',
          'border-slate-600 hover:border-slate-500',
          'focus:border-blue-500 focus:outline-none focus:ring-0',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-colors'
        )}
      >
        {/* Preserve an unsaved custom value if it doesn't match any preset */}
        {interval !== null && !isKnownInterval(interval) && (
          <option value={interval}>{interval}s</option>
        )}
        {INTERVAL_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {error && (
        <span className="text-xs text-red-400" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}