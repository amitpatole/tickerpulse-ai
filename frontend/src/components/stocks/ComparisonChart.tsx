'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  AreaSeries,
  LineSeries,
  ColorType,
  TickMarkType,
  type IChartApi,
  type UTCTimestamp,
  type Time,
} from 'lightweight-charts';
import type { ComparisonSeries, Timeframe } from '@/lib/types';
import TimeframeToggle, { COMPARISON_TIMEFRAMES } from './TimeframeToggle';

const COMPARISON_PALETTE = ['#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];
const PRIMARY_COLOR = '#3b82f6';

interface ComparisonChartProps {
  series: ComparisonSeries[];
  height?: number;
  timeframe: Timeframe;
  onTimeframeChange?: (tf: Timeframe) => void;
}

export default function ComparisonChart({
  series,
  height = 320,
  timeframe,
  onTimeframeChange,
}: ComparisonChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const isIntraday = timeframe === '1D' || timeframe === '1W';

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
      rightPriceScale: {
        borderColor: '#334155',
      },
      timeScale: {
        borderColor: '#334155',
        timeVisible: true,
        tickMarkFormatter: (time: UTCTimestamp, tickMarkType: TickMarkType, locale: string) => {
          const d = new Date((time as number) * 1000);
          if (tickMarkType === TickMarkType.Time) {
            return new Intl.DateTimeFormat(locale, {
              timeZone: tz,
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }).format(d);
          }
          return new Intl.DateTimeFormat(locale, {
            timeZone: tz,
            month: 'short',
            day: 'numeric',
          }).format(d);
        },
      },
      localization: {
        timeFormatter: (time: Time) => {
          if (typeof time !== 'number') return String(time);
          return new Intl.DateTimeFormat(undefined, {
            timeZone: tz,
            month: 'short',
            day: 'numeric',
            ...(isIntraday
              ? { hour: '2-digit', minute: '2-digit', hour12: false }
              : { year: 'numeric' }),
          }).format(new Date((time as number) * 1000));
        },
      },
    });

    chartRef.current = chart;

    // Primary series (first entry) — filled AreaSeries
    const [primarySeries, ...comparisonSeries] = series;

    if (primarySeries?.candles?.length) {
      const areaSeries = chart.addSeries(AreaSeries, {
        lineColor: PRIMARY_COLOR,
        topColor: `${PRIMARY_COLOR}33`,
        bottomColor: `${PRIMARY_COLOR}05`,
        lineWidth: 2,
      });
      areaSeries.setData(
        primarySeries.candles.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.value,
        }))
      );
    }

    // Comparison series — LineSeries
    comparisonSeries.forEach((s, idx) => {
      if (!s.candles?.length) return;
      const color = COMPARISON_PALETTE[idx % COMPARISON_PALETTE.length];
      const lineSeries = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
      });
      lineSeries.setData(
        s.candles.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.value,
        }))
      );
    });

    chart.timeScale().fitContent();

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
  }, [series, height, timeframe]);

  const [primarySeries, ...comparisonSeries] = series;

  return (
    <div>
      {/* Header: legend + timeframe toggle */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {primarySeries && (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-6 rounded-full"
                style={{ backgroundColor: PRIMARY_COLOR }}
              />
              <span className="text-xs font-medium text-white">{primarySeries.ticker}</span>
              <span className="text-xs text-slate-400">(base)</span>
            </div>
          )}
          {comparisonSeries.map((s, idx) => {
            const color = COMPARISON_PALETTE[idx % COMPARISON_PALETTE.length];
            const sign = s.delta_pct >= 0 ? '+' : '';
            return (
              <div key={s.ticker} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-6 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs font-medium text-white">{s.ticker}</span>
                {s.error ? (
                  <span className="text-xs text-red-400">(error)</span>
                ) : (
                  <span
                    className={`text-xs ${s.delta_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                  >
                    {sign}{s.delta_pct.toFixed(2)}% vs {primarySeries?.ticker}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Timeframe selector */}
        {onTimeframeChange && (
          <TimeframeToggle
            selected={timeframe}
            onChange={onTimeframeChange}
            timeframes={COMPARISON_TIMEFRAMES}
            compact
          />
        )}
      </div>

      {/* Y-axis label */}
      <p className="mb-1 text-right text-[10px] text-slate-500">Performance (%)</p>

      <div ref={containerRef} className="w-full" />
    </div>
  );
}
