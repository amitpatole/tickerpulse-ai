'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, X, Pencil, Loader2 } from 'lucide-react';
import {
  createChart,
  AreaSeries,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { clsx } from 'clsx';
import type { AIRating, StockDetail, Timeframe } from '@/lib/types';
import { RATING_BG_CLASSES } from '@/lib/types';
import { addStock, getStockDetail } from '@/lib/api';
import { useApi } from '@/hooks/useApi';
import { useChartTimeframe } from '@/hooks/useChartTimeframe';
import TimeframeToggle from '@/components/stocks/TimeframeToggle';
import WatchlistDeleteModal from './WatchlistDeleteModal';
import WatchlistRenameModal from './WatchlistRenameModal';

const CARD_TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M'];

interface MiniChartPoint {
  time: number;
  value: number;
}

function MiniPriceChart({ data }: { data: MiniChartPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    const chart = createChart(containerRef.current, {
      height: 80,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 9,
      },
      grid: {
        vertLines: { color: 'transparent' },
        horzLines: { color: 'transparent' },
      },
      crosshair: {
        vertLine: { visible: false },
        horzLine: { visible: false },
      },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: false, borderColor: 'transparent' },
      handleScroll: false,
      handleScale: false,
    });

    chartRef.current = chart;

    const series = chart.addSeries(AreaSeries, {
      lineColor: '#3b82f6',
      topColor: '#3b82f633',
      bottomColor: '#3b82f605',
      lineWidth: 1.5,
    });

    series.setData(data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
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
  }, [data]);

  return <div ref={containerRef} className="w-full" aria-hidden="true" />;
}

interface StockCardProps {
  rating: AIRating;
  onRemove?: (ticker: string) => void;
}

export default function StockCard({ rating, onRemove }: StockCardProps) {
  const priceChangePct = rating.price_change_pct ?? 0;
  const isPositive = priceChangePct > 0;
  const isNegative = priceChangePct < 0;

  const ratingClass =
    RATING_BG_CLASSES[rating.rating] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  const ratingLabel = rating.rating?.replace(/_/g, ' ') ?? 'N/A';

  const sentimentScore = rating.sentiment_score ?? 0;
  const sentimentPct = Math.round(((sentimentScore + 1) / 2) * 100);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [displayName, setDisplayName] = useState(rating.ticker);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const renameButtonRef = useRef<HTMLButtonElement>(null);

  const [timeframe, setTimeframe] = useChartTimeframe(
    `vo_chart_timeframe_${rating.ticker.toLowerCase()}`,
    '1D',
    CARD_TIMEFRAMES,
  );

  const fetcher = useCallback(
    () => getStockDetail(rating.ticker, timeframe),
    [rating.ticker, timeframe],
  );
  const { data: miniData, loading: miniLoading } = useApi<StockDetail>(fetcher, [
    rating.ticker,
    timeframe,
  ]);

  const miniPoints: MiniChartPoint[] = (miniData?.candles ?? []).map((c) => ({
    time: c.time,
    value: c.close,
  }));

  const priceLabel =
    rating.current_price != null ? `$${rating.current_price.toFixed(2)}` : 'price unavailable';
  const changeLabel = `${isPositive ? '+' : ''}${priceChangePct.toFixed(2)}%`;
  const directionLabel = isPositive ? 'up' : isNegative ? 'down' : 'unchanged';

  async function handleRenameConfirm(newName: string) {
    setDisplayName(newName);
    setShowRenameModal(false);
    try {
      await addStock(rating.ticker, newName);
    } catch {
      // Name updated locally; backend persistence is best-effort
    }
  }

  return (
    <>
      <div
        tabIndex={0}
        aria-label={`${displayName}, ${priceLabel}, ${changeLabel} ${directionLabel} today, rated ${ratingLabel}`}
        aria-keyshortcuts="ArrowUp ArrowDown"
        className="group relative rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 transition-all hover:border-slate-600 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      >
        {/* Action buttons — visible on hover or focus-within */}
        {onRemove && (
          <div className="absolute right-2 top-2 flex items-center gap-1">
            <button
              ref={renameButtonRef}
              onClick={() => setShowRenameModal(true)}
              aria-label={`Rename ${rating.ticker} display name`}
              className="rounded p-1 text-slate-600 opacity-0 transition-opacity hover:bg-slate-700 hover:text-slate-300 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              ref={deleteButtonRef}
              onClick={() => setShowDeleteModal(true)}
              aria-label={`Remove ${rating.ticker} from watchlist`}
              className="rounded p-1 text-slate-600 opacity-0 transition-opacity hover:bg-slate-700 hover:text-slate-300 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Header: Ticker + Price */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-white">{displayName}</h3>
            <p className="mt-0.5 font-mono text-xl font-bold text-white">
              {rating.current_price != null ? `$${rating.current_price.toFixed(2)}` : '—'}
            </p>
          </div>
          <div
            className={clsx(
              'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
              isPositive && 'bg-emerald-500/10 text-emerald-400',
              isNegative && 'bg-red-500/10 text-red-400',
              !isPositive && !isNegative && 'bg-slate-500/10 text-slate-400',
            )}
            aria-label={`${changeLabel} ${directionLabel}`}
          >
            {isPositive ? (
              <TrendingUp className="h-3 w-3" aria-hidden="true" />
            ) : isNegative ? (
              <TrendingDown className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Minus className="h-3 w-3" aria-hidden="true" />
            )}
            <span className="font-mono" aria-hidden="true">
              {isPositive ? '+' : ''}
              {priceChangePct.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* AI Rating Badge */}
        <div className="mt-3">
          <span
            className={clsx(
              'inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold',
              ratingClass,
            )}
          >
            <span className="sr-only">Rating: </span>
            {ratingLabel}
            {rating.confidence != null && (
              <span
                className="ml-1.5 opacity-70"
                aria-label={`confidence ${Math.round(rating.confidence * 100)}%`}
              >
                {Math.round(rating.confidence * 100)}%
              </span>
            )}
          </span>
        </div>

        {/* Metrics Row */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          {/* RSI */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500" aria-hidden="true">
              RSI
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={clsx(
                  'font-mono text-sm font-bold',
                  rating.rsi > 70
                    ? 'text-red-400'
                    : rating.rsi < 30
                      ? 'text-emerald-400'
                      : 'text-slate-300',
                )}
                aria-hidden="true"
              >
                {rating.rsi?.toFixed(1) ?? '—'}
              </span>
              <div
                role="meter"
                aria-valuenow={rating.rsi ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`RSI ${rating.rsi?.toFixed(1) ?? 'unavailable'}`}
                className="h-1.5 flex-1 rounded-full bg-slate-700"
              >
                <div
                  className={clsx(
                    'h-full rounded-full',
                    rating.rsi > 70
                      ? 'bg-red-500'
                      : rating.rsi < 30
                        ? 'bg-emerald-500'
                        : 'bg-blue-500',
                  )}
                  style={{ width: `${Math.min(100, rating.rsi ?? 0)}%` }}
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>

          {/* Sentiment */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500" aria-hidden="true">
              Sentiment
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={clsx(
                  'font-mono text-sm font-bold',
                  sentimentScore > 0.2
                    ? 'text-emerald-400'
                    : sentimentScore < -0.2
                      ? 'text-red-400'
                      : 'text-slate-300',
                )}
                aria-hidden="true"
              >
                {sentimentScore > 0 ? '+' : ''}
                {sentimentScore.toFixed(2)}
              </span>
              <div
                role="meter"
                aria-valuenow={sentimentPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Sentiment score ${sentimentScore > 0 ? '+' : ''}${sentimentScore.toFixed(2)}`}
                className="h-1.5 flex-1 rounded-full bg-slate-700"
              >
                <div
                  className={clsx(
                    'h-full rounded-full',
                    sentimentScore > 0.2
                      ? 'bg-emerald-500'
                      : sentimentScore < -0.2
                        ? 'bg-red-500'
                        : 'bg-amber-500',
                  )}
                  style={{ width: `${sentimentPct}%` }}
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Mini Chart */}
        <div className="mt-3 border-t border-slate-700/50 pt-3">
          <div className="mb-1.5 flex items-center justify-end">
            <TimeframeToggle
              selected={timeframe}
              onChange={setTimeframe}
              timeframes={CARD_TIMEFRAMES}
              compact
            />
          </div>
          {miniLoading && (
            <div className="flex h-20 items-center justify-center rounded-lg bg-slate-700/20">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" aria-hidden="true" />
              <span className="sr-only">Loading chart…</span>
            </div>
          )}
          {!miniLoading && miniPoints.length > 0 && (
            <div className="rounded-lg bg-slate-700/20 px-1 pt-1">
              <MiniPriceChart data={miniPoints} />
            </div>
          )}
          {!miniLoading && miniPoints.length === 0 && (
            <div className="flex h-20 items-center justify-center rounded-lg bg-slate-700/20">
              <p className="text-xs text-slate-500">No chart data</p>
            </div>
          )}
        </div>

        {/* Score */}
        {rating.score != null && (
          <div className="mt-3 flex items-center justify-between border-t border-slate-700/50 pt-3">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">AI Score</span>
            <span className="font-mono text-sm font-bold text-white">
              {rating.score.toFixed(1)}/10
            </span>
          </div>
        )}
      </div>

      {showDeleteModal && (
        <WatchlistDeleteModal
          ticker={rating.ticker}
          onConfirm={() => {
            setShowDeleteModal(false);
            onRemove?.(rating.ticker);
          }}
          onClose={() => setShowDeleteModal(false)}
          triggerRef={deleteButtonRef}
        />
      )}

      {showRenameModal && (
        <WatchlistRenameModal
          ticker={rating.ticker}
          currentName={displayName}
          onConfirm={handleRenameConfirm}
          onClose={() => setShowRenameModal(false)}
          triggerRef={renameButtonRef}
        />
      )}
    </>
  );
}
