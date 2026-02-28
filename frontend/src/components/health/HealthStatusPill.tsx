'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { useHealth } from '@/hooks/useHealth';

type VisualStatus = 'ok' | 'degraded' | 'unreachable';

const DOT_COLOR: Record<VisualStatus, string> = {
  ok: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  unreachable: 'bg-red-400',
};

const LABEL_COLOR: Record<VisualStatus, string> = {
  ok: 'text-emerald-400',
  degraded: 'text-amber-400',
  unreachable: 'text-red-400',
};

const BG_COLOR: Record<VisualStatus, string> = {
  ok: 'bg-emerald-500/10',
  degraded: 'bg-amber-500/10',
  unreachable: 'bg-red-500/10',
};

const LABEL_TEXT: Record<VisualStatus, string> = {
  ok: 'Healthy',
  degraded: 'Degraded',
  unreachable: 'Unreachable',
};

export default function HealthStatusPill() {
  const { data, loading, error } = useHealth();
  const [open, setOpen] = useState(false);

  const visualStatus: VisualStatus =
    error != null
      ? 'unreachable'
      : data != null
        ? (data.status as VisualStatus)
        : loading
          ? 'ok'
          : 'unreachable';

  const latency = data?.services?.db?.latency_ms;
  const schedulerRunning = data?.services?.scheduler?.running;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className={clsx(
          'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
          BG_COLOR[visualStatus],
          LABEL_COLOR[visualStatus],
        )}
        aria-label={`System health: ${LABEL_TEXT[visualStatus]}`}
      >
        <span className={clsx('h-2 w-2 rounded-full', DOT_COLOR[visualStatus])} aria-hidden="true" />
        <span className="hidden sm:inline">{LABEL_TEXT[visualStatus]}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 shadow-lg"
          role="tooltip"
        >
          <p className="mb-1 font-medium text-white">System Health</p>
          <p>
            DB latency:{' '}
            <span className="text-slate-100">
              {latency != null ? `${latency} ms` : '—'}
            </span>
          </p>
          <p>
            Scheduler:{' '}
            <span className={schedulerRunning ? 'text-emerald-400' : 'text-red-400'}>
              {schedulerRunning == null ? '—' : schedulerRunning ? 'Running' : 'Stopped'}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
