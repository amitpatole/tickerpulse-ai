```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { getRefreshInterval, setRefreshInterval } from '@/lib/api';

const LS_KEY = 'tickerpulse_refresh_interval';

const INTERVAL_OPTIONS = [
  { value: 5, label: '5s' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 0, label: 'Off' },
] as const;

type IntervalValue = (typeof INTERVAL_OPTIONS)[number]['value'];

function isKnownInterval(v: number): v is IntervalValue {
  return INTERVAL_OPTIONS.some((o) => o.value === v);
}

function readLocalInterval(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

function writeLocalInterval(v: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, String(v));
  } catch {
    // Ignore quota / private-mode errors
  }
}

interface RefreshIntervalControlProps {
  /** Called after a successful interval save so the parent can reset polling timers. */
  onIntervalChanged?: () => void;
}

export default function RefreshIntervalControl({ onIntervalChanged }: RefreshIntervalControlProps = {}) {
  // Initialise from localStorage immediately so there's no loading flash
  const [interval, setIntervalValue] = useState<number | null>(readLocalInterval);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync with server on mount — server is source of truth; localStorage is
  // only used for instant restore before this call resolves.
  useEffect(() => {
    getRefreshInterval()
      .then(({ interval: v }) => {
        setIntervalValue(v);
        writeLocalInterval(v);
      })
      .catch(() => {
        // Fall back to 30s default if we couldn't read from server
        if (interval === null) setIntervalValue(30);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback(
    async (newInterval: number) => {
      const previous = interval;
      setIntervalValue(newInterval);
      writeLocalInterval(newInterval);
      setError(null);
      setSaving(true);
      try {
        await setRefreshInterval(newInterval);
        onIntervalChanged?.();
      } catch {
        setIntervalValue(previous);
        if (previous !== null) writeLocalInterval(previous);
        setError('Save failed');
      } finally {
        setSaving(false);
      }
    },
    [interval, onIntervalChanged]
  );

  const isStreaming = interval !== null && interval > 0;

  return (
    <div className="flex items-center gap-2">
      {/* Live indicator dot */}
      <span
        aria-label={isStreaming ? 'Live price updates active' : 'Auto-refresh off'}
        title={isStreaming ? 'Live' : 'Off'}
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
```