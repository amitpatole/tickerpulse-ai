```tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Search, GitCompare } from 'lucide-react';
import { searchStocks } from '@/lib/api';
import type { ComparisonTicker, StockSearchResult } from '@/lib/types';

const COMPARISON_PALETTE = ['#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];
const MAX_COMPARISONS = 4;

interface ComparisonModePanelProps {
  primaryTicker: string;
  comparisonTickers: ComparisonTicker[];
  onAdd: (ticker: ComparisonTicker) => void;
  onRemove: (ticker: string) => void;
  onToggle: (enabled: boolean) => void;
  enabled: boolean;
}

export default function ComparisonModePanel({
  primaryTicker,
  comparisonTickers,
  onAdd,
  onRemove,
  onToggle,
  enabled,
}: ComparisonModePanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setDropdownOpen(false);
      return;
    }
    setSearching(true);
    try {
      const res = await searchStocks(q);
      const existing = new Set([primaryTicker, ...comparisonTickers.map((c) => c.ticker)]);
      setResults(res.filter((r) => !existing.has(r.ticker.toUpperCase())).slice(0, 6));
      setDropdownOpen(true);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [primaryTicker, comparisonTickers]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function selectResult(result: StockSearchResult) {
    onAdd({ ticker: result.ticker.toUpperCase(), name: result.name, error: null });
    setQuery('');
    setResults([]);
    setDropdownOpen(false);
    inputRef.current?.focus();
  }

  const canAdd = comparisonTickers.length < MAX_COMPARISONS;

  return (
    <div className="mt-3 space-y-3">
      {/* Toggle row */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onToggle(!enabled)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
            enabled
              ? 'bg-blue-600 text-white ring-2 ring-blue-500/50'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
          }`}
          aria-pressed={enabled}
        >
          <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
          Compare
        </button>

        {enabled && (
          <p className="text-xs text-slate-500">
            Add up to {MAX_COMPARISONS} tickers to compare
          </p>
        )}
      </div>

      {/* Search + pills when enabled */}
      {enabled && (
        <div className="space-y-2">
          {comparisonTickers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {comparisonTickers.map((ct, idx) => {
                const color = COMPARISON_PALETTE[idx % COMPARISON_PALETTE.length];
                return (
                  <div key={ct.ticker} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-3 py-1">
                      <span
                        className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs font-semibold text-white">{ct.ticker}</span>
                      <button
                        onClick={() => onRemove(ct.ticker)}
                        aria-label={`Remove ${ct.ticker}`}
                        className="ml-0.5 text-slate-500 transition-colors hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    {ct.error && (
                      <p className="pl-2 text-[10px] text-red-400">{ct.error}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {canAdd && (
            <div className="relative">
              <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/30">
                <Search className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" aria-hidden="true" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => { if (results.length > 0) setDropdownOpen(true); }}
                  placeholder="Search ticker or company…"
                  className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
                  aria-label="Search comparison ticker"
                  aria-autocomplete="list"
                  aria-expanded={dropdownOpen}
                />
                {searching && (
                  <span className="text-[10px] text-slate-500">…</span>
                )}
              </div>

              {dropdownOpen && results.length > 0 && (
                <div
                  ref={dropdownRef}
                  role="listbox"
                  className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-slate-700 bg-slate-800 shadow-xl"
                >
                  {results.map((r) => (
                    <button
                      key={r.ticker}
                      role="option"
                      aria-selected={false}
                      onClick={() => selectResult(r)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-slate-700 focus:bg-slate-700 focus:outline-none"
                    >
                      <div>
                        <span className="font-semibold text-white">{r.ticker}</span>
                        <span className="ml-2 inline-block max-w-[160px] truncate align-bottom text-slate-400">
                          {r.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">{r.exchange}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```