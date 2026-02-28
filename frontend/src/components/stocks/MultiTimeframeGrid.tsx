'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { getStockCandles } from '@/lib/api';
import type { Timeframe, Candle } from '@/lib/types';

interface TimeframeCell {
  timeframe: Timeframe;
  candles: Candle[] | null;
  error: string | null;
  loading: boolean;
}

interface SparklineProps {
  candles: Candle[];
  height?: number;
}

function Sparkline({ candles, height = 60 }: SparklineProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || candles.length < 2) return;

    const closes = candles.map((c) => c.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;

    const w = svg.clientWidth || 200;
    const h = height;
    const pad = 4;

    const points = closes.map((v, i) => {
      const x = pad + (i / (closes.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const first = closes[0];
    const last = closes[closes.length - 1];
    const isPositive = last >= first;
    const color = isPositive ? '#10b981' : '#ef4444';

    // Clear previous content
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Fill area under line
    const fillEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const firstPt = points[0].split(',');
    const lastPt = points[points.length - 1].split(',');
    fillEl.setAttribute(
      'points',
      `${points[0]} ${points.join(' ')} ${lastPt[0]},${h} ${firstPt[0]},${h}`,
    );
    fillEl.setAttribute('fill', `${color}22`);
    svg.appendChild(fillEl);

    // Line
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', points.join(' '));
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', color);
    polyline.setAttribute('stroke-width', '1.5');
    polyline.setAttribute('stroke-linejoin', 'round');
    polyline.setAttribute('stroke-linecap', 'round');
    svg.appendChild(polyline);
  }, [candles, height]);

  return (
    <svg
      ref={svgRef}
      className="w-full"
      style={{ height }}
      aria-hidden="true"
    />
  );
}

function pctChange(candles: Candle[]): number | null {
  if (candles.length < 2) return null;
  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  if (!first) return null;
  return ((last - first) / first) * 100;
}

interface MultiTimeframeGridProps {
  ticker: string;
  timeframes: Timeframe[];
  onTimeframeSelect: (tf: Timeframe) => void;
}

export default function MultiTimeframeGrid({
  ticker,
  timeframes,
  onTimeframeSelect,
}: MultiTimeframeGridProps) {
  const [cells, setCells] = useState<TimeframeCell[]>(
    timeframes.map((tf) => ({ timeframe: tf, candles: null, error: null, loading: true })),
  );

  const isMounted = useRef(true);

  const fetchAll = useCallback(
    (tfs: Timeframe[]) => {
      setCells(tfs.map((tf) => ({ timeframe: tf, candles: null, error: null, loading: true })));

      tfs.forEach((tf) => {
        getStockCandles(ticker, tf)
          .then((candles) => {
            if (!isMounted.current) return;
            setCells((prev) =>
              prev.map((cell) =>
                cell.timeframe === tf
                  ? { ...cell, candles, error: null, loading: false }
                  : cell,
              ),
            );
          })
          .catch((err: unknown) => {
            if (!isMounted.current) return;
            const msg = err instanceof Error ? err.message : 'Failed to load';
            setCells((prev) =>
              prev.map((cell) =>
                cell.timeframe === tf
                  ? { ...cell, candles: null, error: msg, loading: false }
                  : cell,
              ),
            );
          });
      });
    },
    [ticker],
  );

  useEffect(() => {
    isMounted.current = true;
    fetchAll(timeframes);
    return () => {
      isMounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, timeframes.join(',')]);

  const allFailed = cells.every((c) => !c.loading && c.error);

  if (allFailed) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-400"
        role="alert"
      >
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Could not load chart data for {ticker}.</span>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-2 gap-3"
      role="list"
      aria-label={`Multi-timeframe price charts for ${ticker}`}
    >
      {cells.map((cell) => {
        const pct = cell.candles ? pctChange(cell.candles) : null;
        const isPositive = pct !== null && pct >= 0;

        return (
          <button
            key={cell.timeframe}
            role="listitem"
            onClick={() => onTimeframeSelect(cell.timeframe)}
            disabled={cell.loading || !!cell.error}
            aria-label={`${cell.timeframe} chart${pct !== null ? `, ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : ''}`}
            className={clsx(
              'group rounded-lg border p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50',
              cell.error
                ? 'cursor-default border-red-500/20 bg-red-500/5'
                : 'cursor-pointer border-slate-700/50 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800',
            )}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">{cell.timeframe}</span>
              {pct !== null && (
                <span
                  className={clsx(
                    'font-mono text-xs font-semibold',
                    isPositive ? 'text-emerald-400' : 'text-red-400',
                  )}
                >
                  {isPositive ? '+' : ''}
                  {pct.toFixed(2)}%
                </span>
              )}
            </div>

            {cell.loading && (
              <div className="flex h-[60px] items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-hidden="true" />
              </div>
            )}

            {!cell.loading && cell.error && (
              <div className="flex h-[60px] items-center justify-center">
                <span className="text-xs text-red-400">{cell.error}</span>
              </div>
            )}

            {!cell.loading && !cell.error && cell.candles && (
              <Sparkline candles={cell.candles} height={60} />
            )}
          </button>
        );
      })}
    </div>
  );
}
