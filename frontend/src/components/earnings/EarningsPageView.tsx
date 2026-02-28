'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  Clock,
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { useEarnings } from '@/hooks/useEarnings';
import { triggerEarningsSync } from '@/lib/api';
import type { EarningsEvent } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIME_LABELS: Record<string, string> = {
  BMO: 'Before Open',
  AMC: 'After Close',
  TNS: 'Time TBD',
  // Legacy values from older data
  before_open: 'Before Open',
  after_close: 'After Close',
  during_trading: 'During Market',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  // Use browser locale (undefined) so non-US users see their locale's date format
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatRevenue(value: number | null | undefined): string {
  if (value == null) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EpsBeatBadge({
  actual,
  estimate,
}: {
  actual: number | null;
  estimate: number | null;
}) {
  if (actual == null || estimate == null) {
    return actual != null ? (
      <span className="text-xs text-slate-300">${actual.toFixed(2)}</span>
    ) : null;
  }
  const beat = actual > estimate;
  const met = actual === estimate;
  const label = beat ? 'Beat' : met ? 'Met' : 'Miss';
  const cls = beat
    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
    : met
    ? 'bg-slate-600/30 text-slate-400 border border-slate-500/30'
    : 'bg-red-500/20 text-red-400 border border-red-500/30';

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-slate-300">${actual.toFixed(2)}</span>
      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls}`}>{label}</span>
      {beat ? (
        <ChevronUp className="h-3 w-3 text-emerald-400" />
      ) : !met ? (
        <ChevronDown className="h-3 w-3 text-red-400" />
      ) : null}
    </div>
  );
}

function RevenueBadge({
  actual,
  estimate,
}: {
  actual: number | null;
  estimate: number | null;
}) {
  if (actual == null || estimate == null) {
    return actual != null ? (
      <span className="text-xs text-slate-300">{formatRevenue(actual)}</span>
    ) : null;
  }
  const beat = actual > estimate;
  const met = actual === estimate;
  const label = beat ? 'Beat' : met ? 'Met' : 'Miss';
  const cls = beat
    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
    : met
    ? 'bg-slate-600/30 text-slate-400 border border-slate-500/30'
    : 'bg-red-500/20 text-red-400 border border-red-500/30';

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-slate-300">{formatRevenue(actual)}</span>
      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls}`}>{label}</span>
    </div>
  );
}

function SurprisePctCell({ pct }: { pct?: number | null }) {
  if (pct == null) return <span className="text-xs text-slate-500">—</span>;
  const isPositive = pct > 0;
  return (
    <span className={`text-xs font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
      {isPositive ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Upcoming row (inside a date group — no date column)
// ---------------------------------------------------------------------------

function UpcomingRow({ event }: { event: EarningsEvent }) {
  return (
    <div
      className={`grid grid-cols-[100px_1fr_90px_110px] items-center gap-2 px-4 py-2.5 rounded-lg ${
        event.on_watchlist
          ? 'bg-slate-800/80 border border-emerald-700/40'
          : 'bg-slate-800/40'
      }`}
    >
      {/* Ticker */}
      <div className="flex items-center gap-1.5">
        <Link
          href={`/stocks/${event.ticker}`}
          className="text-sm font-semibold text-white hover:text-blue-400 transition-colors"
        >
          {event.ticker}
        </Link>
        {event.on_watchlist && (
          <TrendingUp className="h-3 w-3 text-emerald-400 flex-shrink-0" />
        )}
      </div>

      {/* Company + time of day */}
      <div className="min-w-0">
        {event.company && (
          <p className="text-xs text-slate-400 truncate">{event.company}</p>
        )}
        {event.time_of_day && (
          <div className="flex items-center gap-0.5 text-xs text-slate-500">
            <Clock className="h-3 w-3" />
            {TIME_LABELS[event.time_of_day] ?? event.time_of_day}
          </div>
        )}
      </div>

      {/* EPS estimate */}
      <div className="text-right text-xs text-slate-300">
        {event.eps_estimate != null ? `$${event.eps_estimate.toFixed(2)}` : '—'}
      </div>

      {/* Revenue estimate */}
      <div className="text-right text-xs text-slate-300">
        {formatRevenue(event.revenue_estimate)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Past table header + row
// ---------------------------------------------------------------------------

const PAST_GRID = 'grid-cols-[80px_72px_1fr_80px_110px_75px_100px_110px_75px]';

function PastTableHeader() {
  return (
    <div
      className={`grid ${PAST_GRID} gap-1 px-3 py-1.5 text-xs font-medium text-slate-500 border-b border-slate-700/50`}
    >
      <span>Date</span>
      <span>Ticker</span>
      <span>Company</span>
      <span className="text-right">EPS Est.</span>
      <span className="text-right">EPS Actual</span>
      <span className="text-right">Surprise</span>
      <span className="text-right">Rev Est.</span>
      <span className="text-right">Rev Actual</span>
      <span className="text-right">Quarter</span>
    </div>
  );
}

function PastRow({ event }: { event: EarningsEvent }) {
  // Use browser locale (undefined) so non-US users see their locale's date format
  const dateLabel = new Date(event.earnings_date + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      className={`grid ${PAST_GRID} items-center gap-1 px-3 py-2.5 rounded-lg text-xs ${
        event.on_watchlist
          ? 'bg-slate-800/80 border border-emerald-700/40'
          : 'bg-slate-800/40'
      }`}
    >
      {/* Date */}
      <span className="text-slate-400">{dateLabel}</span>

      {/* Ticker */}
      <div className="flex items-center gap-1">
        <Link
          href={`/stocks/${event.ticker}`}
          className="font-semibold text-white hover:text-blue-400 transition-colors"
        >
          {event.ticker}
        </Link>
        {event.on_watchlist && (
          <TrendingUp className="h-3 w-3 text-emerald-400 flex-shrink-0" />
        )}
      </div>

      {/* Company */}
      <span className="text-slate-400 truncate">{event.company ?? '—'}</span>

      {/* EPS estimate */}
      <div className="text-right text-slate-300">
        {event.eps_estimate != null ? `$${event.eps_estimate.toFixed(2)}` : '—'}
      </div>

      {/* EPS actual with beat/miss */}
      <div className="text-right">
        <EpsBeatBadge actual={event.eps_actual} estimate={event.eps_estimate} />
      </div>

      {/* Surprise % */}
      <div className="text-right">
        <SurprisePctCell pct={event.surprise_pct} />
      </div>

      {/* Revenue estimate */}
      <div className="text-right text-slate-300">{formatRevenue(event.revenue_estimate)}</div>

      {/* Revenue actual with beat/miss */}
      <div className="text-right">
        <RevenueBadge actual={event.revenue_actual} estimate={event.revenue_estimate} />
      </div>

      {/* Fiscal quarter */}
      <div className="text-right text-slate-500">{event.fiscal_quarter ?? '—'}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface EarningsPageViewProps {
  watchlistId?: number;
}

export default function EarningsPageView({ watchlistId }: EarningsPageViewProps) {
  const [days, setDays] = useState(30);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const { upcoming, past, stale, isLoading, error, refetch } = useEarnings(watchlistId, days);

  const visibleUpcoming = watchlistOnly ? upcoming.filter((e) => e.on_watchlist) : upcoming;
  const visiblePast = watchlistOnly ? past.filter((e) => e.on_watchlist) : past;

  // Group upcoming events by earnings_date, sorted ascending
  const groupedUpcoming = useMemo(() => {
    const map = new Map<string, EarningsEvent[]>();
    for (const event of visibleUpcoming) {
      const existing = map.get(event.earnings_date) ?? [];
      existing.push(event);
      map.set(event.earnings_date, existing);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [visibleUpcoming]);

  // Sort past events newest-first
  const sortedPast = useMemo(
    () => [...visiblePast].sort((a, b) => b.earnings_date.localeCompare(a.earnings_date)),
    [visiblePast]
  );

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      await triggerEarningsSync();
      await refetch();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {stale && (
            <span title="Data may be outdated — last fetch was over 1 hour ago">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            </span>
          )}
          {syncError && <span className="text-xs text-red-400">{syncError}</span>}
        </div>

        <div className="flex items-center gap-2">
          {/* Watchlist-only toggle */}
          <button
            onClick={() => setWatchlistOnly((v) => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              watchlistOnly
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-600 hover:text-white hover:border-slate-500'
            }`}
            title={watchlistOnly ? 'Show all tickers' : 'Show watchlist only'}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Watchlist only
          </button>

          {/* Days selector */}
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Days range"
            className="text-xs bg-slate-800 text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5"
          >
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>

          {/* Manual sync button */}
          <button
            onClick={handleSync}
            disabled={syncing}
            title="Trigger manual data sync"
            aria-label={syncing ? 'Syncing data' : 'Sync earnings data'}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-800 text-slate-400 hover:text-white hover:border-slate-500 transition-colors disabled:opacity-50"
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div role="region" className="space-y-4" aria-busy="true">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-slate-800/60 animate-pulse" />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="flex items-center justify-center py-12 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Upcoming section */}
      {!isLoading && !error && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-white">Upcoming</h3>
            {visibleUpcoming.length > 0 && (
              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] text-blue-300">
                {visibleUpcoming.length}
              </span>
            )}
          </div>

          {/* Column headers (only shown when there are events) */}
          {visibleUpcoming.length > 0 && (
            <div className="grid grid-cols-[100px_1fr_90px_110px] gap-2 px-4 py-1.5 text-xs font-medium text-slate-500 border-b border-slate-700/50 mb-2">
              <span>Ticker</span>
              <span>Company / Time</span>
              <span className="text-right">EPS Est.</span>
              <span className="text-right">Rev Est.</span>
            </div>
          )}

          {groupedUpcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-sm gap-2">
              <CalendarDays className="h-8 w-8 opacity-30" />
              <span>
                {watchlistOnly
                  ? `No watchlist earnings in the next ${days} days`
                  : `No upcoming earnings in the next ${days} days`}
              </span>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedUpcoming.map(([date, events]) => (
                <div key={date}>
                  {/* Date group header */}
                  <div className="flex items-center gap-2 py-1.5 mb-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-blue-400" />
                    <span className="text-sm font-medium text-white">
                      {formatDateLabel(date)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {/* Use browser locale (undefined) so non-US users see their locale's date format */}
                      {new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>

                  {/* Events under this date */}
                  <div className="space-y-1.5 pl-5">
                    {events.map((event) => (
                      <UpcomingRow key={`${event.ticker}-${event.earnings_date}`} event={event} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Past section */}
      {!isLoading && !error && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-white">Past</h3>
            {visiblePast.length > 0 && (
              <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[11px] text-slate-400">
                {visiblePast.length}
              </span>
            )}
          </div>

          {sortedPast.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-sm gap-2">
              <CalendarDays className="h-8 w-8 opacity-30" />
              <span>
                {watchlistOnly
                  ? `No watchlist earnings in the past ${days} days`
                  : `No past earnings in the last ${days} days`}
              </span>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-900/50 border border-slate-700/50">
              <PastTableHeader />
              <div className="space-y-1 p-2">
                {sortedPast.map((event) => (
                  <PastRow key={`${event.ticker}-${event.earnings_date}`} event={event} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}