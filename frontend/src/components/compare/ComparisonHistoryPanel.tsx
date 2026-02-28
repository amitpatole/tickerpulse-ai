```tsx
'use client';

import { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { fetchComparisonHistory, getModelComparisonHistory } from '@/lib/api';
import type { ModelComparisonRun } from '@/lib/types';

const RATING_BADGE: Record<string, string> = {
  BUY:  'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  HOLD: 'text-amber-400  bg-amber-400/10  border-amber-400/30',
  SELL: 'text-red-400    bg-red-400/10    border-red-400/30',
};

function RatingPip({ rating }: { rating: string }) {
  const style = RATING_BADGE[rating] ?? 'text-slate-400 bg-slate-700/50 border-slate-600/50';
  return (
    <span className={clsx('rounded border px-1.5 py-0.5 text-[10px] font-bold', style)}>
      {rating}
    </span>
  );
}

function RunRow({ run }: { run: ModelComparisonRun }) {
  const [expanded, setExpanded] = useState(false);

  const rated  = run.results.filter((r) => !r.error && r.rating);
  const errors = run.results.filter((r) => Boolean(r.error));

  const date = new Date(run.created_at).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-4 px-4 py-3 text-left"
        data-testid={`run-row-${run.run_id}`}
      >
        <span className="w-24 font-mono text-xs text-slate-500">{run.run_id.slice(0, 8)}…</span>
        <span className="w-16 text-sm font-semibold text-white">{run.ticker}</span>
        <div className="flex flex-wrap gap-1.5">
          {rated.map((r, i) => r.rating && <RatingPip key={i} rating={r.rating} />)}
          {errors.length > 0 && (
            <span className="rounded border border-red-700/30 bg-red-900/10 px-1.5 py-0.5 text-[10px] text-red-400">
              {errors.length} error{errors.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span className="ml-auto text-xs text-slate-500">{date}</span>
        <svg
          className={clsx('h-4 w-4 flex-shrink-0 text-slate-500 transition-transform', expanded && 'rotate-180')}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div
          className="border-t border-slate-700/30 px-4 pb-4 pt-3"
          data-testid={`run-details-${run.run_id}`}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {run.results.map((r, i) => (
              <div key={i} className="rounded-lg border border-slate-700/30 bg-slate-900/50 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">{r.provider}</span>
                  {r.rating && <RatingPip rating={r.rating} />}
                  {r.error && <span className="text-[10px] text-red-400">error</span>}
                </div>
                <p className="line-clamp-2 text-xs text-slate-500">{r.error ?? r.summary ?? '—'}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ComparisonHistoryPanel() {
  const [tickerFilter, setTickerFilter] = useState('');
  const [runs, setRuns] = useState<ModelComparisonRun[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ticker = tickerFilter.trim().toUpperCase();
      let result: { runs: ModelComparisonRun[] };
      if (ticker) {
        result = await getModelComparisonHistory(ticker, 20);
      } else {
        result = await fetchComparisonHistory(20);
      }
      setRuns(result.runs);
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tickerFilter]);

  return (
    <div className="space-y-4">
      {/* Filter controls */}
      <div className="flex items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate-400">Filter by Ticker (optional)</label>
          <input
            type="text"
            value={tickerFilter}
            onChange={(e) => setTickerFilter(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && loadHistory()}
            placeholder="AAPL"
            maxLength={10}
            className="w-28 rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            data-testid="history-ticker-input"
          />
        </div>
        <button
          onClick={loadHistory}
          disabled={loading}
          className={clsx(
            'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            loading
              ? 'cursor-not-allowed bg-slate-700 text-slate-500'
              : 'bg-blue-600 text-white hover:bg-blue-700',
          )}
          data-testid="load-history-button"
        >
          {loading ? 'Loading…' : loaded ? 'Refresh' : 'Load History'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-700/50 bg-red-900/20 p-4">
          <p className="text-sm text-red-400" data-testid="history-error">{error}</p>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-2" data-testid="history-loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl border border-slate-700/50 bg-slate-800/50" />
          ))}
        </div>
      )}

      {/* Runs list */}
      {!loading && runs !== null && (
        <div data-testid="history-list">
          {runs.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500" data-testid="history-empty">
              No comparison runs found.
            </p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => <RunRow key={run.run_id} run={run} />)}
            </div>
          )}
        </div>
      )}

      {/* Initial prompt */}
      {!loading && runs === null && !error && (
        <p className="py-8 text-center text-sm text-slate-500" data-testid="history-prompt">
          Click "Load History" to see past comparison runs.
        </p>
      )}
    </div>
  );
}
```