```typescript
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LayoutGrid, LineChart } from 'lucide-react';
import { clsx } from 'clsx';
import { useApi } from '@/hooks/useApi';
import { useChartTimeframe } from '@/hooks/useChartTimeframe';
import { useChartTimeframes } from '@/hooks/useChartTimeframes';
import { getStockDetail, getCompareData } from '@/lib/api';
import type { Timeframe, StockDetail, CompareResponse } from '@/lib/types';
import PriceChart from '@/components/charts/PriceChart';
import TimeframeToggle from './TimeframeToggle';
import TimezoneToggle from './TimezoneToggle';
import CompareInput from './CompareInput';
import MultiTimeframeGrid from './MultiTimeframeGrid';
import { useTimezoneMode } from '@/hooks/useTimezoneMode';

const COMPARISON_PALETTE = ['#f59e0b', '#10b981', '#8b5cf6', '#ef4444'];
const ALL_TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', '6M', '1Y', 'All'];

function parseCompareParam(): string[] {
  if (typeof window === 'undefined') return [];
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('compare');
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 4);
}

interface CompareOverlay {
  symbol: string;
  color: string;
  points: { time: number; value: number }[];
  current_pct: number;
}

interface StockPriceChartProps {
  ticker: string;
}

export default function StockPriceChart({ ticker }: StockPriceChartProps) {
  const router = useRouter();

  const { timeframe, setTimeframe } = useChartTimeframe();
  const { mode: timezoneMode, setMode: setTimezoneMode } = useTimezoneMode();
  const { selected: selectedTimeframes, toggle, canSelect, canDeselect } = useChartTimeframes();
  const [viewMode, setViewMode] = useState<'chart' | 'multi'>('chart');

  const [compareSymbols, setCompareSymbols] = useState<string[]>(parseCompareParam);
  const [compareData, setCompareData] = useState<CompareResponse | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const isFirstMount = useRef(true);

  const fetcher = useCallback(
    () => getStockDetail(ticker, timeframe),
    [ticker, timeframe]
  );
  const { data, loading, error } = useApi<StockDetail>(fetcher, [ticker, timeframe]);

  // Sync compareSymbols → URL (skip first mount to avoid spurious navigation)
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (compareSymbols.length > 0) {
      params.set('compare', compareSymbols.join(','));
    } else {
      params.delete('compare');
    }
    const qs = params.toString();
    router.replace(`${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [compareSymbols, router]);

  // Fetch comparison data when symbols or timeframe changes
  useEffect(() => {
    if (compareSymbols.length === 0 || timeframe === 'All') {
      setCompareData(null);
      return;
    }

    let cancelled = false;
    setCompareLoading(true);

    getCompareData(compareSymbols, timeframe)
      .then((result) => {
        if (!cancelled) setCompareData(result);
      })
      .catch(() => {
        if (!cancelled) setCompareData(null);
      })
      .finally(() => {
        if (!cancelled) setCompareLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [compareSymbols, timeframe]);

  function handleAddSymbol(symbol: string) {
    if (symbol === ticker || compareSymbols.includes(symbol)) return;
    if (compareSymbols.length >= 4) return;
    setCompareSymbols((prev) => [...prev, symbol]);
  }

  function handleRemoveSymbol(symbol: string) {
    setCompareSymbols((prev) => prev.filter((s) => s !== symbol));
  }

  function handleGridTimeframeSelect(tf: Timeframe) {
    setTimeframe(tf);
    setViewMode('chart');
  }

  const isComparing = compareSymbols.length > 0 && timeframe !== 'All';

  // Build overlays for PriceChart
  const compareOverlays: CompareOverlay[] = compareSymbols
    .map((symbol, idx) => {
      if (!compareData) return null;
      const entry = compareData[symbol];
      if (!entry || 'error' in entry) return null;
      return {
        symbol,
        color: COMPARISON_PALETTE[idx % COMPARISON_PALETTE.length],
        points: entry.points,
        current_pct: entry.current_pct,
      };
    })
    .filter((o): o is CompareOverlay => o !== null);

  // Normalize primary candles to % return when comparing
  const chartData = (() => {
    if (!data?.candles?.length) return [];
    if (!isComparing) {
      return data.candles.map((c) => ({ time: c.time, value: c.close }));
    }
    const firstClose = data.candles[0].close;
    if (!firstClose) return data.candles.map((c) => ({ time: c.time, value: c.close }));
    return data.candles.map((c) => ({
      time: c.time,
      value: Math.round(((c.close / firstClose - 1) * 100 + Number.EPSILON) * 10000) / 10000,
    }));
  })();

  // Collect per-symbol error warnings
  const warnings: Record<string, string> = {};
  if (compareData) {
    for (const symbol of compareSymbols) {
      const entry = compareData[symbol];
      if (entry && 'error' in entry) {
        warnings[symbol] = entry.error;
      }
    }
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white">Price History</h2>
          <button
            onClick={() => setViewMode(viewMode === 'chart' ? 'multi' : 'chart')}
            aria-label={viewMode === 'chart' ? 'Switch to multi-timeframe view' : 'Switch to chart view'}
            aria-pressed={viewMode === 'multi'}
            title={viewMode === 'chart' ? 'Multi-timeframe view' : 'Single chart view'}
            className={clsx(
              'rounded-md p-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50',
              viewMode === 'multi'
                ? 'bg-blue-600/20 text-blue-400'
                : 'text-slate-500 hover:bg-slate-700 hover:text-slate-300',
            )}
          >
            {viewMode === 'chart' ? (
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <LineChart className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        {viewMode === 'chart' && (
          <div className="flex items-center gap-2">
            <TimeframeToggle selected={timeframe} onChange={setTimeframe} />
            <TimezoneToggle mode={timezoneMode} onModeChange={setTimezoneMode} />
          </div>
        )}

        {viewMode === 'multi' && (
          <div
            role="group"
            aria-label="Select timeframes for grid (2–4)"
            className="flex flex-wrap gap-1"
          >
            {ALL_TIMEFRAMES.map((tf) => {
              const isSelected = selectedTimeframes.includes(tf);
              const isDisabled = isSelected ? !canDeselect(tf) : !canSelect(tf);
              return (
                <button
                  key={tf}
                  onClick={() => toggle(tf)}
                  disabled={isDisabled}
                  aria-pressed={isSelected}
                  title={
                    isSelected
                      ? isDisabled ? 'Minimum 2 timeframes required' : 'Remove from grid'
                      : isDisabled ? 'Maximum 4 timeframes reached' : 'Add to grid'
                  }
                  className={clsx(
                    'min-h-[32px] min-w-[32px] rounded-md px-2 text-[11px] font-semibold transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                    isSelected
                      ? 'bg-blue-600 text-white ring-2 ring-blue-500/50'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white',
                  )}
                >
                  {tf}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Multi-timeframe grid */}
      {viewMode === 'multi' && (
        <MultiTimeframeGrid
          ticker={ticker}
          timeframes={selectedTimeframes}
          onTimeframeSelect={handleGridTimeframeSelect}
        />
      )}

      {/* Single chart view */}
      {viewMode === 'chart' && (
        <>
          {/* Comparison input — chips + text field */}
          <CompareInput
            symbols={compareSymbols}
            colors={COMPARISON_PALETTE}
            warnings={warnings}
            onAdd={handleAddSymbol}
            onRemove={handleRemoveSymbol}
            loading={compareLoading}
          />

          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2
                className="h-6 w-6 animate-spin text-slate-400"
                aria-hidden="true"
              />
              <span className="sr-only">Loading chart data…</span>
            </div>
          )}

          {!loading && error && (
            <div
              className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
              role="alert"
            >
              {error}
            </div>
          )}

          {!loading && !error && chartData.length === 0 && (
            <p className="py-12 text-center text-sm text-slate-500">
              No data available for this period
            </p>
          )}

          {!loading && !error && chartData.length > 0 && (
            <div className="mt-4">
              <PriceChart
                data={chartData}
                height={320}
                timeframe={timeframe}
                primarySymbol={isComparing ? ticker : undefined}
                compareOverlays={isComparing ? compareOverlays : undefined}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
```