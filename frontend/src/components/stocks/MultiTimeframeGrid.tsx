'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { getStockCandles } from '@/lib/api';
import type { StockCandle } from '@/lib/api';
import type { Timeframe } from '@/lib/types';

const GRID_TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '1Y'];

type ChartEntry = {
  candles: StockCandle[];
  loading: boolean;
  error: string | null;
};

interface MultiTimeframeGridProps {
  ticker: string;
  onTimeframeSelect: (tf: Timeframe) => void;
  timeframes?: Timeframe[];
}

interface SparkLineProps {
  candles: StockCandle[];
  isUp: boolean;
}

function SparkLine({ candles, isUp }: SparkLineProps) {
  if (candles.length < 2) return null;

  const closes = candles.map((c) => c.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const W = 200;
  const H = 60;
  const step = W / (closes.length - 1);

  const points = closes
    .map((v, i) => `${i * step},${H - ((v - min) / range) * H}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-14 w-full"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={isUp ? '#10b981' : '#ef4444'}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MultiTimeframeGrid({
  ticker,
  onTimeframeSelect,
  timeframes = GRID_TIMEFRAMES,
}: MultiTimeframeGridProps) {
  const storageKey = `stock-chart-view-${ticker}`;
  const [chartData, setChartData] = useState<Partial<Record<Timeframe, ChartEntry>>>({});

  useEffect(() => {
    localStorage.setItem(storageKey, 'multi');
  }, [storageKey]);

  useEffect(() => {
    let cancelled = false;

    setChartData(
      Object.fromEntries(
        timeframes.map((tf) => [tf, { candles: [], loading: true, error: null }])
      ) as Partial<Record<Timeframe, ChartEntry>>
    );

    Promise.all(
      timeframes.map((tf) =>
        getStockCandles(ticker, tf)
          .then((candles) => ({ tf, candles, error: null as string | null }))
          .catch((err) => ({
            tf,
            candles: [] as StockCandle[],
            error: err instanceof Error ? err.message : 'Failed to load',
          }))
      )
    ).then((results) => {
      if (cancelled) return;
      const next: Partial<Record<Timeframe, ChartEntry>> = {};
      for (const r of results) {
        next[r.tf] = { candles: r.candles, loading: false, error: r.error };
      }
      setChartData(next);
    });

    return () => {
      cancelled = true;
    };
  }, [ticker, timeframes]);

  const entries = Object.values(chartData);
  const allSettled =
    entries.length === timeframes.length && entries.every((e) => e && !e.loading);
  const allFailed = allSettled && entries.every((e) => e && e.error !== null);

  if (allFailed) {
    return (
      <div
        data-testid="grid-error-message"
        className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-400"
        role="alert"
      >
        Failed to load chart data. Please try again.
      </div>
    );
  }

  return (
    <div
      data-testid="multi-grid-container"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      {timeframes.map((tf) => {
        const entry = chartData[tf];
        const isLoading = !entry || entry.loading;

        if (isLoading) {
          return (
            <div
              key={tf}
              data-testid={`grid-timeframe-${tf}`}
              className="flex min-h-[140px] items-center justify-center rounded-xl border border-slate-700/50 bg-slate-800/50"
            >
              <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-hidden="true" />
              <span className="sr-only">Loading {tf}…</span>
            </div>
          );
        }

        if (entry.error) {
          return (
            <div
              key={tf}
              data-testid={`grid-timeframe-${tf}`}
              className="flex min-h-[140px] flex-col items-center justify-center gap-1 rounded-xl border border-slate-700/50 bg-slate-800/50 p-3"
            >
              <p className="text-xs font-semibold text-slate-400">{tf}</p>
              <p className="text-xs text-red-400">{entry.error}</p>
            </div>
          );
        }

        if (entry.candles.length === 0) {
          return (
            <div
              key={tf}
              data-testid={`grid-timeframe-${tf}-empty`}
              className="flex min-h-[140px] flex-col items-center justify-center gap-1 rounded-xl border border-slate-700/50 bg-slate-800/50 p-3"
            >
              <p className="text-xs font-semibold text-slate-400">{tf}</p>
              <p className="text-xs text-slate-500">No data available</p>
            </div>
          );
        }

        const firstClose = entry.candles[0].close;
        const lastClose = entry.candles[entry.candles.length - 1].close;
        const isUp = lastClose >= firstClose;
        const changePct = (((lastClose - firstClose) / firstClose) * 100).toFixed(2);

        return (
          <button
            key={tf}
            data-testid={`grid-timeframe-${tf}`}
            onClick={() => onTimeframeSelect(tf)}
            className={clsx(
              'group flex min-h-[140px] flex-col gap-2 rounded-xl border border-slate-700/50 bg-slate-800/50 p-3 text-left transition-colors',
              'hover:border-blue-500/50 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50'
            )}
            aria-label={`View ${tf} chart`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-white">{tf}</p>
              <p
                className={clsx(
                  'text-xs font-semibold',
                  isUp ? 'text-emerald-400' : 'text-red-400'
                )}
              >
                {isUp ? '+' : ''}
                {changePct}%
              </p>
            </div>
            <div className="flex-1">
              <SparkLine candles={entry.candles} isUp={isUp} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
