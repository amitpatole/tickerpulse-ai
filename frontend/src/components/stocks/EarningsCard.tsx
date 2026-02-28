'use client';

import { useCallback } from 'react';
import { CalendarDays, ChevronUp, ChevronDown } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { getTickerEarnings } from '@/lib/api';
import type { EarningsEvent } from '@/lib/types';

const TIME_LABELS: Record<string, string> = {
  BMO: 'Before Open',
  AMC: 'After Close',
  TNS: 'Time TBD',
};

interface EarningsCardProps {
  ticker: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysFromNow(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function formatDate(dateStr: string): string {
  const diff = daysFromNow(dateStr);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SurpriseBadge({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-slate-600 text-xs">—</span>;
  const isPos = pct > 0;
  const isNeg = pct < 0;
  const cls = isPos ? 'text-emerald-400' : isNeg ? 'text-red-400' : 'text-slate-400';
  return (
    <span className={`flex items-center justify-end gap-0.5 font-mono text-xs ${cls}`}>
      {isPos ? <ChevronUp className="h-3 w-3" /> : isNeg ? <ChevronDown className="h-3 w-3" /> : null}
      {isPos ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  );
}

function QuarterRow({ event }: { event: EarningsEvent }) {
  const beat =
    event.eps_actual != null &&
    event.eps_estimate != null &&
    event.eps_actual > event.eps_estimate;
  const miss =
    event.eps_actual != null &&
    event.eps_estimate != null &&
    event.eps_actual < event.eps_estimate;

  return (
    <div className="grid grid-cols-[60px_1fr_1fr_70px] items-center gap-2 py-1.5 text-xs">
      <span className="text-slate-400">{event.fiscal_quarter ?? '—'}</span>
      <span className="text-right font-mono text-slate-300">
        {event.eps_estimate != null ? `$${event.eps_estimate.toFixed(2)}` : '—'}
      </span>
      <div className="flex items-center justify-end gap-1">
        {event.eps_actual != null ? (
          <>
            <span
              className={`font-mono ${beat ? 'text-emerald-400' : miss ? 'text-red-400' : 'text-slate-300'}`}
            >
              ${event.eps_actual.toFixed(2)}
            </span>
            {beat && <ChevronUp className="h-3 w-3 text-emerald-400" />}
            {miss && <ChevronDown className="h-3 w-3 text-red-400" />}
          </>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </div>
      <SurpriseBadge pct={event.surprise_pct} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function EarningsCard({ ticker }: EarningsCardProps) {
  const fetcher = useCallback(() => getTickerEarnings(ticker), [ticker]);
  const { data: events, loading, error } = useApi<EarningsEvent[]>(fetcher, [ticker]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  // Next upcoming event: soonest date >= today
  const nextEarnings = events
    ? events
        .filter((e) => e.earnings_date >= todayStr)
        .sort((a, b) => a.earnings_date.localeCompare(b.earnings_date))[0] ?? null
    : null;

  // Past events, already sorted DESC by the API, limit to 4
  const pastEvents = events ? events.filter((e) => e.earnings_date < todayStr).slice(0, 4) : [];

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-700/50 px-5 py-3">
        <CalendarDays className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-white">Earnings</h2>
      </div>

      {loading && (
        <div className="space-y-3 p-5" aria-busy="true">
          <div className="h-16 animate-pulse rounded-lg bg-slate-800" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-slate-800" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-800" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-slate-800" />
        </div>
      )}

      {error && !loading && (
        <p className="px-5 py-6 text-center text-sm text-red-400">{error}</p>
      )}

      {!loading && !error && (
        <div className="space-y-4 p-5">
          {/* Next earnings banner */}
          {nextEarnings ? (
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-3">
              <p className="mb-0.5 text-xs font-medium text-blue-300">Next Earnings</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-white">
                  {formatDate(nextEarnings.earnings_date)}
                </span>
                {nextEarnings.time_of_day && (
                  <span className="text-xs text-blue-300">
                    · {TIME_LABELS[nextEarnings.time_of_day] ?? nextEarnings.time_of_day}
                  </span>
                )}
                {(() => {
                  const diff = daysFromNow(nextEarnings.earnings_date);
                  if (diff === 0) return <span className="text-xs text-amber-400">· Today</span>;
                  if (diff === 1) return <span className="text-xs text-amber-400">· Tomorrow</span>;
                  if (diff > 1)
                    return <span className="text-xs text-slate-400">· {diff} days away</span>;
                  return null;
                })()}
              </div>
            </div>
          ) : (
            <p className="py-2 text-center text-sm text-slate-500">
              No upcoming earnings scheduled
            </p>
          )}

          {/* Historical quarters table */}
          {pastEvents.length > 0 && (
            <div>
              <div className="mb-1.5 grid grid-cols-[60px_1fr_1fr_70px] gap-2 border-b border-slate-700/50 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                <span>Quarter</span>
                <span className="text-right">Est EPS</span>
                <span className="text-right">Actual</span>
                <span className="text-right">Surprise</span>
              </div>
              <div className="divide-y divide-slate-800/60">
                {pastEvents.map((event) => (
                  <QuarterRow key={`${event.ticker}-${event.earnings_date}`} event={event} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
