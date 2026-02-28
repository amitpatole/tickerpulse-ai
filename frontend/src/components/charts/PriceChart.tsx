```tsx
'use client';

import { useEffect, useId, useRef } from 'react';
import { createChart, AreaSeries, ColorType, TickMarkType, type IChartApi, type Time, type UTCTimestamp } from 'lightweight-charts';
import { ChartDataSummary } from './ChartDataSummary';
import type { Timeframe } from '@/lib/types';

interface PriceDataPoint {
  time: string | number;
  value: number;
}

interface PriceChartProps {
  data: PriceDataPoint[];
  title?: string;
  height?: number;
  color?: string;
  timeframe?: Timeframe;
  /** Accepted but not rendered — reserved for future comparison overlay support. */
  primarySymbol?: string;
  /** Accepted but not rendered — reserved for future comparison overlay support. */
  compareOverlays?: unknown[];
}

export default function PriceChart({
  data,
  title,
  height = 300,
  color = '#3b82f6',
  timeframe,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const summaryId = `${baseId}-summary`;

  const usesTimestamps = data.length > 0 && typeof data[0].time === 'number';
  const browserTimezone = usesTimestamps
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : null;

  useEffect(() => {
    if (!containerRef.current) return;

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hasTimestamps = data.length > 0 && typeof data[0].time === 'number';
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

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: color,
      topColor: `${color}33`,
      bottomColor: `${color}05`,
      lineWidth: 2,
    });

    if (data.length > 0) {
      const chartData = data.map((d) => ({
        time: (hasTimestamps ? d.time as UTCTimestamp : d.time as Time),
        value: d.value,
      }));
      areaSeries.setData(chartData);
    }

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
  }, [data, height, color, timeframe]);

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
      <figure
        role="img"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={data.length > 0 ? summaryId : undefined}
        className="m-0"
      >
        {title && (
          <h3 id={titleId} className="mb-3 text-sm font-semibold text-white">{title}</h3>
        )}
        <div ref={containerRef} className="w-full" aria-hidden="true" />
        <ChartDataSummary id={summaryId} data={data} />
      </figure>
      {usesTimestamps && browserTimezone && (
        <p className="mt-2 text-right text-[10px] text-slate-500">
          All times in {browserTimezone}
        </p>
      )}
      {data.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-slate-500">No chart data available</p>
        </div>
      )}
    </div>
  );
}
```