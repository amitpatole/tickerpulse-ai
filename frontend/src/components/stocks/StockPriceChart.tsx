```typescript
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useApi } from '@/hooks/useApi';
import { useChartTimeframes } from '@/hooks/useChartTimeframe';
import { getStockDetail, getCompareData } from '@/lib/api';
import type { Timeframe, StockDetail, CompareResponse } from '@/lib/types';
import PriceChart from '@/components/charts/PriceChart';
import TimeframeToggle, { STOCK_CHART_TIMEFRAMES } from './TimeframeToggle';
import MultiTimeframeGrid from './MultiTimeframeGrid';
import CompareInput from './CompareInput';

const STORAGE_KEY = 'vo_chart_timeframe';
const VIEW_MODE_KEY = 'vo_chart_view_mode';
const MULTI_TF_KEY = 'vo_chart_multi_timeframes';
const VALID_TIMEFRAMES: Timeframe[] = STOCK_CHART_TIMEFRAMES;
const DEFAULT_MULTI_TIMEFRAMES: Timeframe[] = ['1W', '1M', '3M', '1Y'];
const COMPARISON_PALETTE = ['#f59e0b', '#10b981', '#8b5cf6', '#ef4444'];

type ViewMode = 'single' | 'multi';

interface CompareOverlay {
  symbol: string;
  color: string;
  points: { time: number; value: number }[];
  current_pct: number;
}

interface StockPriceChartProps {
  ticker: string;
}

function getInitialTimeframe(): Timeframe {
  if (typeof window === 'undefined') return '1M';
  const stored = localStorage.getItem(STORAGE_KEY);
  return VALID_TIMEFRAMES.includes(stored as Timeframe) ? (stored as Timeframe) : '1M';
}

function getInitialViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'single';
  return localStorage.getItem(VIEW_MODE_KEY) === 'multi' ? 'multi' : 'single';
}

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

export default function StockPriceChart({ ticker }: StockPriceChartProps) {
  const router = useRouter();

  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);
  const [timeframe, setTimeframe] = useState<Timeframe>(getInitialTimeframe);
  const [multiTimeframes, setMultiTimeframes] = useChartTimeframes(
    MULTI_TF_KEY,
    DEFAULT_MULTI_TIMEFRAMES,
    VALID_TIMEFRAMES,
  );
  const [compareSymbols, setCompareSymbols] = useState<string[]>(parseCompareParam);
  const [compareData, setCompareData] = useState<CompareResponse | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const isFirstMount = useRef(true);

  // Single-mode data fetch
  const fetcher = useCallback(
    () => getStockDetail(ticker, timeframe),
    [ticker, timeframe]
  );
  const { data, loading, error } = useApi<StockDetail>(fetcher, [ticker, timeframe], {
    enabled: viewMode === 'single',
  });

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

  // Fetch comparison overlays (single mode only)
  useEffect(() => {
    if (viewMode !== 'single' || compareSymbols.length === 0 || timeframe === 'All') {
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
  }, [viewMode, compareSymbols, timeframe]);

  function handleViewModeChange(mode: ViewMode) {
    localStorage.setItem(VIEW_MODE_KEY, mode);
    setViewMode(mode);
  }

  function handleTimeframeChange(tf: Timeframe) {
    localStorage.setItem(STORAGE_KEY, tf);
    setTimeframe(tf);
  }

  // Clicking a mini chart promotes it: lock in the timeframe then switch to single view
  function handleMiniChartSelect(tf: Timeframe) {
    handleTimeframeChange(tf);
    handleViewModeChange('single');
  }

  function handleAddSymbol(symbol: string) {
    if (symbol === ticker || compareSymbols.includes(symbol)) return;
    if (compareSymbols.length >= 4) return;
    setCompareSymbols((prev) => [...prev, symbol]);
  }

  function handleRemoveSymbol(symbol: string) {
    setCompareSymbols((prev) => prev.filter((s) => s !== symbol));
  }

  const isComparing = viewMode === 'single' && compareSymbols.length > 0 && timeframe !== 'All';

  // Build overlays for single-mode comparison
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

  // Per-symbol compare warnings
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
      {/* Header: title + view mode toggle + timeframe selector */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white">Price History</h2>

          {/* Single / Multi view toggle */}
          <div
            role="group"
            aria-label="Chart view mode"
            className="flex rounded-lg border border-slate-700 bg-slate-800 p-0.5"
          >
            <button
              onClick={() => handleViewModeChange('single')}
              aria-pressed={viewMode === 'single'}
              className={clsx(
                'rounded px-2.5 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500/50',
                viewMode === 'single'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              Single
            </button>
            <button
              onClick={() => handleViewModeChange('multi')}
              aria-pressed={viewMode === 'multi'}
              className={clsx(
                'rounded px-2.5 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500/50',
                viewMode === 'multi'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              Multi
            </button>
          </div>
        </div>

        {/* Timeframe toggle: single-select in single mode, multi-select in multi mode */}
        {viewMode === 'single' ? (
          <TimeframeToggle selected={timeframe} onChange={handleTimeframeChange} />
        ) : (
          <TimeframeToggle
            multiSelect
            selected={multiTimeframes}
            onChange={setMultiTimeframes}
            compact
          />
        )}
      </div>

      {/* ── Single mode ── */}
      {viewMode === 'single' && (
        <>
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
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden="true" />
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

      {/* ── Multi mode: responsive grid of mini-charts for selected timeframes ── */}
      {viewMode === 'multi' && (
        <div className="mt-2">
          <MultiTimeframeGrid
            ticker={ticker}
            timeframes={multiTimeframes}
            onTimeframeSelect={handleMiniChartSelect}
          />
        </div>
      )}
    </div>
  );
}
```