```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  Clock,
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { useEarnings } from '@/hooks/useEarnings';
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

type TabId = 'upcoming' | 'past';

interface EarningsCalendarProps {
  watchlistId?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  // Use browser locale (undefined) so non-US users see their locale's date format
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getDaysBadgeClass(dateStr: string, isPast: boolean): string {
  if (isPast) return 'bg-slate-700/50 text-slate-400 border border-slate-600/30';
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
  if (diff <= 7) return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
  return 'bg-slate-700/50 text-slate-400 border border-slate-600/30';
}

function formatRevenue(value: number | null | undefined): string {
  if (value == null) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

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
    <div className="flex items-center gap-1 justify-end">
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
    <div className="flex items-center gap-1 justify-end">
      <span className="text-xs text-slate-300">{formatRevenue(actual)}</span>
      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls}`}>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column header
// ---------------------------------------------------------------------------

function TableHeader({ tab }: { tab: TabId }) {
  return (
    <div
      className={`grid text-xs font-medium text-slate-500 px-3 py-1.5 border-b border-slate-700/50 ${
        tab === 'past'
          ? 'grid-cols-[72px_1fr_90px_90px_110px_110px_70px]'
          : 'grid-cols-[72px_1fr_80px_70px]'
      }`}
    >
      <span>Date</span>
      <span>Ticker / Company</span>
      <span className="text-right">EPS Est.</span>
      {tab === 'past' && <span className="text-right">EPS Actual</span>}
      {tab === 'past' && <span className="text-right">Rev Est.</span>}
      {tab === 'past' && <span className="text-right">Rev Actual</span>}
      <span className="text-right">Quarter</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single event row
// ---------------------------------------------------------------------------

function EventRow({ event, tab }: { event: EarningsEvent; tab: TabId }) {
  const isPast = tab === 'past';
  return (
    <div
      className={`grid items-center gap-1 px-3 py-2 rounded-lg ${
        tab === 'past'
          ? 'grid-cols-[72px_1fr_90px_90px_110px_110px_70px]'
          : 'grid-cols-[72px_1fr_80px_70px]'
      } ${
        event.on_watchlist
          ? 'bg-slate-800/80 border border-emerald-700/40'
          : 'bg-slate-800/40'
      }`}
    >
      {/* Date badge */}
      <span
        className={`text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap w-fit ${getDaysBadgeClass(
          event.earnings_date,
          isPast
        )}`}
      >
        {formatDate(event.earnings_date)}
      </span>

      {/* Ticker + company */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Link
            href={`/stocks/${event.ticker}`}
            className="text-sm font-semibold text-white hover:text-blue-400 transition-colors"
          >
            {event.ticker}
          </Link>
          {event.on_watchlist && (
            <TrendingUp className="h-3 w-3 text-emerald-400 flex-shrink-0" />
          )}
          {event.time_of_day && (
            <div className="flex items-center gap-0.5 text-xs text-slate-500">
              <Clock className="h-3 w-3" />
              {TIME_LABELS[event.time_of_day] ?? event.time_of_day}
            </div>
          )}
        </div>
        {event.company && (
          <p className="text-xs text-slate-500 truncate">{event.company}</p>
        )}
      </div>

      {/* EPS Estimate */}
      <div className="text-right text-xs text-slate-300">
        {event.eps_estimate != null ? `$${event.eps_estimate.toFixed(2)}` : '—'}
      </div>

      {/* EPS Actual (past tab only) */}
      {tab === 'past' && (
        <div className="text-right">
          <EpsBeatBadge actual={event.eps_actual} estimate={event.eps_estimate} />
        </div>
      )}

      {/* Revenue Estimate (past tab only) */}
      {tab === 'past' && (
        <div className="text-right text-xs text-slate-300">
          {formatRevenue(event.revenue_estimate)}
        </div>
      )}

      {/* Revenue Actual with beat/miss badge (past tab only) */}
      {tab === 'past' && (
        <div className="text-right">
          <RevenueBadge actual={event.revenue_actual} estimate={event.revenue_estimate} />
        </div>
      )}

      {/* Fiscal Quarter */}
      <div className="text-right text-xs text-slate-500">
        {event.fiscal_quarter ?? '—'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function EarningsCalendar({ watchlistId }: EarningsCalendarProps) {
  const [activeTab, setActiveTab] = useState<TabId>('upcoming');
  const [days, setDays] = useState(30);
  const [watchlistOnly, setWatchlistOnly] = useState(false);

  const { upcoming, past, stale, isLoading, error, refetch } = useEarnings(watchlistId, days);

  const sourceEvents = activeTab === 'upcoming' ? upcoming : past;
  const visibleEvents = watchlistOnly
    ? sourceEvents.filter((e) => e.on_watchlist)
    : sourceEvents;

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-700/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-semibold text-white">Earnings Calendar</span>
          {stale && (
            <span title="Data may be outdated — last fetch was over 1 hour ago">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWatchlistOnly((v) => !v)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
              watchlistOnly
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-600 hover:text-white hover:border-slate-500'
            }`}
            title={watchlistOnly ? 'Show all tickers' : 'Show watchlist only'}
          >
            <TrendingUp className="h-3 w-3" />
            Watchlist
          </button>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="text-xs bg-slate-800 text-slate-300 border border-slate-600 rounded px-2 py-1"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
          <button
            onClick={refetch}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700/50 px-4">
        {(['upcoming', 'past'] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-xs font-medium px-3 py-2 border-b-2 transition-colors capitalize ${
              activeTab === tab
                ? 'border-blue-400 text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab}
            {tab === 'upcoming' && upcoming.length > 0 && (
              <span className="ml-1.5 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-300">
                {upcoming.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="p-3">
        {isLoading && (
          <div className="space-y-2 py-2" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-10 rounded-lg bg-slate-800/60 animate-pulse"
              />
            ))}
          </div>
        )}

        {error && !isLoading && (
          <div className="flex items-center justify-center py-8 text-red-400 text-sm">
            {error}
          </div>
        )}

        {!isLoading && !error && visibleEvents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400 text-sm gap-1">
            <CalendarDays className="h-8 w-8 opacity-30 mb-1" />
            <span>
              {activeTab === 'upcoming'
                ? watchlistOnly
                  ? `No watchlist earnings in the next ${days} days`
                  : `No upcoming earnings in the next ${days} days`
                : watchlistOnly
                ? `No watchlist earnings in the past ${days} days`
                : `No past earnings in the last ${days} days`}
            </span>
          </div>
        )}

        {!isLoading && !error && visibleEvents.length > 0 && (
          <div>
            <TableHeader tab={activeTab} />
            <div className="space-y-1.5 mt-1.5 max-h-72 overflow-y-auto pr-0.5">
              {visibleEvents.map((event) => (
                <EventRow
                  key={`${event.ticker}-${event.earnings_date}`}
                  event={event}
                  tab={activeTab}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```