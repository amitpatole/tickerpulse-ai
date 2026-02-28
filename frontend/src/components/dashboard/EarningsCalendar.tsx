'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Clock, TrendingUp, RefreshCw, AlertTriangle } from 'lucide-react';
import { getEarningsWidget } from '@/lib/api';
import type { EarningsEvent } from '@/lib/types';

const TIME_LABELS: Record<string, string> = {
  before_open: 'Before Open',
  after_close: 'After Close',
  during_trading: 'During Market',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDaysBadgeClass(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
  if (diff === 1) return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
  return 'bg-slate-700/50 text-slate-400 border border-slate-600/30';
}

export default function EarningsCalendar() {
  const [events, setEvents] = useState<EarningsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [stale, setStale] = useState(false);
  const [watchlistOnly, setWatchlistOnly] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getEarningsWidget(days);
      setEvents(data.events);
      setStale(data.stale);
    } catch (err) {
      setError('Failed to load earnings data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [days]);

  const visibleEvents = watchlistOnly ? events.filter(e => e.on_watchlist) : events;

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
            onClick={() => setWatchlistOnly(v => !v)}
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
            onChange={e => setDays(Number(e.target.value))}
            className="text-xs bg-slate-800 text-slate-300 border border-slate-600 rounded px-2 py-1"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
          <button
            onClick={load}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {loading && (
          <div className="flex items-center justify-center py-8 text-slate-400 text-sm gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading earnings...
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center justify-center py-8 text-red-400 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && visibleEvents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400 text-sm gap-1">
            <CalendarDays className="h-8 w-8 opacity-30 mb-1" />
            <span>
              {watchlistOnly
                ? 'No watchlist earnings in the next ' + days + ' days'
                : 'No earnings in the next ' + days + ' days'}
            </span>
          </div>
        )}

        {!loading && !error && visibleEvents.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {visibleEvents.map(event => (
              <div
                key={event.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                  event.on_watchlist
                    ? 'bg-slate-800/80 border border-emerald-700/40'
                    : 'bg-slate-800/40'
                }`}
              >
                {/* Date badge */}
                <span className={`text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap ${getDaysBadgeClass(event.earnings_date)}`}>
                  {formatDate(event.earnings_date)}
                </span>

                {/* Ticker + company */}
                <div className="flex-1 min-w-0">
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
                    {event.fiscal_quarter && (
                      <span className="text-xs text-slate-500">{event.fiscal_quarter}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 truncate">{event.company}</p>
                </div>

                {/* Time + EPS */}
                <div className="text-right flex-shrink-0">
                  {event.time_of_day && (
                    <div className="flex items-center gap-1 text-xs text-slate-400 justify-end">
                      <Clock className="h-3 w-3" />
                      {TIME_LABELS[event.time_of_day] ?? event.time_of_day}
                    </div>
                  )}
                  {event.eps_estimate != null && (
                    <div className="text-xs text-slate-300 mt-0.5">
                      Est. ${event.eps_estimate.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
