'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  createChart,
  AreaSeries,
  ColorType,
  type IChartApi,
  type Time,
} from 'lightweight-charts';
import { clsx } from 'clsx';
import { useApi } from '@/hooks/useApi';
import { getPortfolioHistory } from '@/lib/api';
import type { PortfolioPoint } from '@/lib/types';

type DaysOption = 7 | 30 | 90;

const DAYS_OPTIONS: { label: string; value: DaysOption }[] = [
  { label: '7D', value: 7 },
  { label: '30D', value: 30 },
  { label: '90D', value: 90 },
];

interface PortfolioAreaChartProps {
  data: PortfolioPoint[];
  height?: number;
}

function PortfolioAreaChart({ data, height = 200 }: PortfolioAreaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const baseId = useId();

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      crosshair: {
        vertLine: { color: '#475569', width: 1, style: 2, labelBackgroundColor: '#334155' },
        horzLine: { color: '#475569', width: 1, style: 2, labelBackgroundColor: '#334155' },
      },
      rightPriceScale: { borderColor: '#334155' },
      timeScale: {
        borderColor: '#334155',
        timeVisible: false,
      },
    });

    chartRef.current = chart;

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#3b82f6',
      topColor: '#3b82f633',
      bottomColor: '#3b82f605',
      lineWidth: 2,
    });

    if (data.length > 0) {
      areaSeries.setData(
        data.map((p) => ({ time: p.date as Time, value: p.value }))
      );
      chart.timeScale().fitContent();
    }

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, height]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <p className="text-sm text-slate-500">No portfolio history available.</p>
      </div>
    );
  }

  const first = data[0]?.value ?? 0;
  const last = data[data.length - 1]?.value ?? 0;
  const delta = first > 0 ? ((last - first) / first) * 100 : 0;

  return (
    <figure
      role="img"
      aria-label={`Portfolio value chart. ${delta >= 0 ? 'Up' : 'Down'} ${Math.abs(delta).toFixed(2)}% over period.`}
      className="m-0"
    >
      <div ref={containerRef} className="w-full" aria-hidden="true" id={`${baseId}-chart`} />
    </figure>
  );
}

export default function PortfolioChart() {
  const [days, setDays] = useState<DaysOption>(30);

  const fetcher = () => getPortfolioHistory(days);
  const { data: points, loading, error } = useApi<PortfolioPoint[]>(
    fetcher,
    [days],
    { refreshInterval: 300_000 }
  );

  const first = points?.[0]?.value ?? 0;
  const last = points?.[points.length - 1]?.value ?? 0;
  const delta = first > 0 ? ((last - first) / first) * 100 : 0;
  const isPositive = delta >= 0;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/50 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold text-white">Portfolio Value</h2>
          {points && points.length > 0 && (
            <span
              className={clsx(
                'font-mono text-xs font-semibold',
                isPositive ? 'text-emerald-400' : 'text-red-400'
              )}
            >
              {isPositive ? '+' : ''}{delta.toFixed(2)}%
            </span>
          )}
        </div>

        <div role="group" aria-label="Select time range" className="flex gap-1">
          {DAYS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={clsx(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                days === opt.value
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
              )}
              aria-pressed={days === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="p-4" aria-live="polite" aria-busy={loading && !points}>
        {loading && !points && (
          <div className="space-y-2">
            <div className="h-[200px] animate-pulse rounded bg-slate-700" />
          </div>
        )}

        {error && !points && (
          <div className="flex items-center justify-center py-10">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {points && <PortfolioAreaChart data={points} height={200} />}
      </div>
    </div>
  );
}
