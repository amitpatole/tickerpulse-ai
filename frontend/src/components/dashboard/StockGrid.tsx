'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Search, Plus, Loader2, X, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { clsx } from 'clsx';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  getWatchlistOrder,
  reorderWatchlist,
  addStockToWatchlist,
  removeStockFromWatchlist,
  searchStocks,
  ApiError,
} from '@/lib/api';
import type { AIRating, StockSearchResult } from '@/lib/types';
import StockCard from './StockCard';

interface SortableStockItemProps {
  rating: AIRating;
  idx: number;
  total: number;
  flashSet: Set<string>;
  onRowClick?: (ticker: string) => void;
  onRemove: (ticker: string) => void;
  onMoveUp: (ticker: string) => void;
  onMoveDown: (ticker: string) => void;
}

function SortableStockItem({
  rating,
  idx,
  total,
  flashSet,
  onRowClick,
  onRemove,
  onMoveUp,
  onMoveDown,
}: SortableStockItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rating.ticker });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={clsx(
        'group relative',
        onRowClick && 'cursor-pointer',
        flashSet.has(rating.ticker) && 'animate-price-flash',
      )}
      onClick={(e) => {
        if (onRowClick && !(e.target as HTMLElement).closest('button')) {
          onRowClick(rating.ticker);
        }
      }}
    >
      {/* Drag handle — visible on hover */}
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="absolute right-2 top-2 z-10 cursor-grab touch-none opacity-0 transition-opacity group-hover:opacity-60 active:cursor-grabbing"
        aria-label={`Drag to reorder ${rating.ticker}`}
      >
        <GripVertical className="h-4 w-4 text-slate-400" aria-hidden="true" />
      </div>
      <StockCard rating={rating} onRemove={onRemove} />
      {/* Keyboard reorder controls — visible on focus-within */}
      <div className="absolute bottom-2 left-2 z-10 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); onMoveUp(rating.ticker); }}
          disabled={idx === 0}
          aria-label={`Move ${rating.ticker} up in watchlist`}
          className="flex h-6 w-6 items-center justify-center rounded bg-slate-700/90 text-slate-300 hover:bg-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronUp className="h-3 w-3" aria-hidden="true" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMoveDown(rating.ticker); }}
          disabled={idx === total - 1}
          aria-label={`Move ${rating.ticker} down in watchlist`}
          className="flex h-6 w-6 items-center justify-center rounded bg-slate-700/90 text-slate-300 hover:bg-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

interface StockGridProps {
  watchlistId?: number;
  /** Live ratings pre-merged with WS price updates from useDashboardData. null = loading. */
  ratings: AIRating[] | null;
  /** Called after add/remove operations so the parent can re-fetch shared data. */
  onRefetch?: () => void;
  /** Called when a stock card is clicked (excluding action buttons). Navigates to stock detail. */
  onRowClick?: (ticker: string) => void;
}

export default function StockGrid({ watchlistId = 1, ratings, onRefetch, onRowClick }: StockGridProps) {
  const loading = ratings === null;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [announceMsg, setAnnounceMsg] = useState('');
  const [order, setOrder] = useState<string[]>([]);

  // Price flash: track which tickers had a recent price change
  const [flashSet, setFlashSet] = useState<Set<string>>(new Set());
  const prevPricesRef = useRef<Record<string, number | null | undefined>>({});
  const flashTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load ordered ticker list for the active watchlist
  useEffect(() => {
    let cancelled = false;
    getWatchlistOrder(watchlistId)
      .then((tickers) => {
        if (!cancelled) setOrder(tickers);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [watchlistId]);

  // Prune order to only tickers that have ratings (rating job may not have run yet)
  useEffect(() => {
    if (!ratings) return;
    const ratingTickers = new Set(ratings.map((r) => r.ticker));
    setOrder((prev) => prev.filter((t) => ratingTickers.has(t)));
  }, [ratings]);

  // Detect price changes and apply flash animation for 800ms
  useEffect(() => {
    if (!ratings) return;
    const updated = new Set<string>();
    for (const rating of ratings) {
      const prev = prevPricesRef.current[rating.ticker];
      if (prev !== undefined && prev !== rating.current_price) {
        updated.add(rating.ticker);
      }
      prevPricesRef.current[rating.ticker] = rating.current_price;
    }
    if (updated.size === 0) return;

    setFlashSet((prev) => new Set([...prev, ...updated]));
    for (const ticker of updated) {
      if (flashTimersRef.current[ticker]) {
        clearTimeout(flashTimersRef.current[ticker]);
      }
      flashTimersRef.current[ticker] = setTimeout(() => {
        setFlashSet((prev) => {
          const next = new Set(prev);
          next.delete(ticker);
          return next;
        });
        delete flashTimersRef.current[ticker];
      }, 800);
    }
  }, [ratings]);

  // Cleanup flash timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of Object.values(flashTimersRef.current)) {
        clearTimeout(timer);
      }
    };
  }, []);

  // Build sorted list: apply watchlist order to ratings (already live-price-merged)
  const sortedRatings = useMemo(() => {
    if (!ratings) return [];
    return order
      .map((ticker) => ratings.find((r) => r.ticker === ticker))
      .filter((r): r is AIRating => r != null);
  }, [ratings, order]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const data = await searchStocks(q);
      setResults(data);
      setShowDropdown(data.length > 0);
      setHighlightIdx(-1);
    } catch (err) {
      setResults([]);
      if (err instanceof ApiError && err.status === 400) {
        setSearchError('Invalid search query');
      } else {
        setSearchError('Search unavailable, try again');
      }
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    setAddError(null);
    setSearchError(null);
    if (value.trim()) setValidationError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleSelect = async (result: StockSearchResult) => {
    setShowDropdown(false);
    setQuery('');
    setResults([]);
    setAdding(true);
    setAddError(null);
    try {
      await addStockToWatchlist(watchlistId, result.ticker, result.name);
      setOrder((prev) =>
        prev.includes(result.ticker) ? prev : [...prev, result.ticker]
      );
      onRefetch?.();
      setAnnounceMsg(`${result.ticker} added to watchlist`);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add stock');
    } finally {
      setAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !query.trim()) {
      e.preventDefault();
      setValidationError('Please enter a ticker symbol');
      inputRef.current?.focus();
      return;
    }

    if (!showDropdown || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault();
      handleSelect(results[highlightIdx]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = order.indexOf(active.id as string);
    const newIdx = order.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(order, oldIdx, newIdx);
    setOrder(next);
    reorderWatchlist(watchlistId, next).catch(() => {});
    setAnnounceMsg(`${active.id as string} moved to position ${newIdx + 1}`);
  }

  function moveUp(ticker: string) {
    const idx = order.indexOf(ticker);
    if (idx <= 0) return;
    const next = [...order];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setOrder(next);
    reorderWatchlist(watchlistId, next).catch(() => {});
  }

  function moveDown(ticker: string) {
    const idx = order.indexOf(ticker);
    if (idx >= order.length - 1) return;
    const next = [...order];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setOrder(next);
    reorderWatchlist(watchlistId, next).catch(() => {});
  }

  async function handleRemoveStock(tickerToRemove: string) {
    try {
      await removeStockFromWatchlist(watchlistId, tickerToRemove);
      setOrder((prev) => prev.filter((t) => t !== tickerToRemove));
      onRefetch?.();
      setAnnounceMsg(`${tickerToRemove} removed from watchlist`);
    } catch {
      // Silently handle for now
    }
  }

  return (
    <div>
      {/* Screen reader live announcement region */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announceMsg}
      </div>

      {/* Search & Add Stock Bar */}
      <div ref={wrapperRef} className="relative mb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <label htmlFor="stock-search-input" className="sr-only">
              Search stocks to add to watchlist
            </label>
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <input
              id="stock-search-input"
              ref={inputRef}
              type="text"
              role="combobox"
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
              onKeyDown={handleKeyDown}
              placeholder="Search stocks (e.g., AAPL, Tesla, Reliance)..."
              aria-controls="stock-search-listbox"
              aria-expanded={showDropdown}
              aria-haspopup="listbox"
              aria-autocomplete="list"
              aria-activedescendant={
                highlightIdx >= 0 ? `stock-option-${results[highlightIdx]?.ticker}` : undefined
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-800/50 py-2.5 pl-10 pr-10 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
              maxLength={40}
            />
            {(searching || adding) && (
              <Loader2
                className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400"
                aria-hidden="true"
              />
            )}
            {!searching && !adding && query && (
              <button
                onClick={() => {
                  setQuery('');
                  setResults([]);
                  setShowDropdown(false);
                  setAddError(null);
                }}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {searchError && (
          <div className="mt-1 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {searchError}
          </div>
        )}

        {/* Search Results Dropdown */}
        {showDropdown && (
          <div
            id="stock-search-listbox"
            role="listbox"
            aria-label="Stock search results"
            className="absolute z-50 mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 shadow-xl"
          >
            {results.map((result, idx) => (
              <button
                key={result.ticker}
                id={`stock-option-${result.ticker}`}
                role="option"
                aria-selected={idx === highlightIdx}
                onClick={() => handleSelect(result)}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors first:rounded-t-lg last:rounded-b-lg ${
                  idx === highlightIdx
                    ? 'bg-blue-600/20 text-white'
                    : 'text-slate-300 hover:bg-slate-700/50'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{result.ticker}</span>
                    <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-xs text-slate-400">
                      {result.exchange}
                    </span>
                    {result.type === 'ETF' && (
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-400">
                        ETF
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-400">{result.name}</p>
                </div>
                <Plus className="ml-3 h-4 w-4 flex-shrink-0 text-slate-500" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </div>

      {addError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {addError}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
          aria-busy="true"
          aria-label="Loading watchlist"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-xl border border-slate-700/50 bg-slate-800/30"
            />
          ))}
        </div>
      )}

      {/* Stock Cards Grid */}
      {ratings && (
        <>
          {sortedRatings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800/20 p-12 text-center">
              <p className="text-sm text-slate-400">No stocks in this group yet.</p>
              <p className="mt-1 text-xs text-slate-500">
                Search for a stock above to add it.
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={order} strategy={rectSortingStrategy}>
                <ul
                  role="list"
                  aria-label="Watchlist stocks"
                  className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
                >
                  {sortedRatings.map((rating, idx) => (
                    <SortableStockItem
                      key={rating.ticker}
                      rating={rating}
                      idx={idx}
                      total={sortedRatings.length}
                      flashSet={flashSet}
                      onRowClick={onRowClick}
                      onRemove={handleRemoveStock}
                      onMoveUp={moveUp}
                      onMoveDown={moveDown}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </>
      )}
    </div>
  );
}
