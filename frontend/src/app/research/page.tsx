'use client';

import DOMPurify from 'dompurify';
import { useState, useMemo, useEffect, useRef } from 'react';
import {
  FileText,
  Loader2,
  Calendar,
  Bot,
  Filter,
  Play,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import Header from '@/components/layout/Header';
import { useApi } from '@/hooks/useApi';
import {
  getResearchBriefs,
  generateResearchBrief,
  getResearchBrief,
  getStocks,
  exportBriefs,
  getExportCapabilities,
  getAllBriefIds,
} from '@/lib/api';
import type {
  ResearchBrief,
  KeyMetrics,
  Stock,
  ExportFormat,
  ResearchBriefsResponse,
  ExportCapabilities,
} from '@/lib/types';
import Toast from '@/components/ui/Toast';
import { formatLocalDate } from '@/lib/formatTime';
import ExportToolbar from '@/components/research/ExportToolbar';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function MarkdownContent({ content }: { content: string }) {
  // Escape HTML special characters first so that any injected markup in the
  // AI-generated content cannot survive into the rendered output.  The markdown
  // regex transforms below only produce safe, known HTML patterns.
  const escaped = escapeHtml(content);
  const rawHtml = escaped
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-white mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-white mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-white mt-6 mb-3">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-slate-300 mb-1">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-slate-300 mb-1">$2</li>')
    .replace(/`(.+?)`/g, '<code class="rounded bg-slate-700 px-1.5 py-0.5 text-xs text-blue-400 font-mono">$1</code>')
    .replace(/\n\n/g, '</p><p class="text-sm text-slate-300 leading-relaxed mb-3">')
    .replace(/\n/g, '<br />');

  // DOMPurify requires a browser DOM — guard for the SSR pass.
  const sanitized = typeof window !== 'undefined' ? DOMPurify.sanitize(rawHtml) : rawHtml;

  return (
    <div
      className="prose prose-invert max-w-none text-sm text-slate-300 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: `<p class="text-sm text-slate-300 leading-relaxed mb-3">${sanitized}</p>` }}
    />
  );
}

const PAGE_SIZE = 25;

function KeyMetricsPanel({ metrics }: { metrics: KeyMetrics }) {
  const items: [string, string][] = [];

  if (metrics.price != null) {
    const change = metrics.change_pct;
    const sign = change != null && change >= 0 ? '+' : '';
    const changeStr = change != null ? ` (${sign}${change.toFixed(2)}%)` : '';
    items.push(['Price', `$${metrics.price.toFixed(2)}${changeStr}`]);
  }
  if (metrics.rsi != null) {
    const rsiLabel = metrics.rsi > 70 ? 'Overbought' : metrics.rsi < 30 ? 'Oversold' : 'Neutral';
    items.push(['RSI', `${metrics.rsi.toFixed(1)} · ${rsiLabel}`]);
  }
  if (metrics.rating) {
    items.push(['Rating', metrics.rating]);
  }
  if (metrics.score != null) {
    items.push(['AI Score', `${metrics.score.toFixed(1)}/10`]);
  }
  if (metrics.sentiment_label) {
    items.push(['Sentiment', metrics.sentiment_label]);
  }

  if (items.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-blue-400/70">
        Key Metrics
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={label}>
            <p className="text-[10px] font-medium text-slate-500">{label}</p>
            <p className="text-xs font-semibold text-slate-200">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCallout({ summary }: { summary: string }) {
  return (
    <div className="mb-4 rounded-lg border border-slate-600/40 bg-slate-900/60 p-3">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Executive Summary
      </p>
      <p className="text-sm italic leading-relaxed text-slate-300">{summary}</p>
    </div>
  );
}

export default function ResearchPage() {
  const [selectedBrief, setSelectedBrief] = useState<ResearchBrief | null>(null);
  const [filterTicker, setFilterTicker] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Batch-export selection state — Set<number> persists across page changes
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectingAll, setSelectingAll] = useState(false);

  // Full brief loaded on selection — includes key_metrics from ai_ratings
  const [detailBrief, setDetailBrief] = useState<ResearchBrief | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Indeterminate ref for select-all checkbox
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Export capabilities (PDF availability etc.)
  const { data: capabilities } = useApi<ExportCapabilities>(getExportCapabilities, []);

  const { data: briefsPage, loading, error, refetch } = useApi<ResearchBriefsResponse>(
    () => getResearchBriefs(filterTicker || undefined, currentPage, PAGE_SIZE),
    [filterTicker, currentPage],
    { refreshInterval: 30000 }
  );

  const briefs = briefsPage?.data ?? null;
  const totalBriefs = briefsPage?.total ?? 0;
  const hasNext = briefsPage?.has_next ?? false;
  const totalPages = totalBriefs > 0 ? Math.ceil(totalBriefs / PAGE_SIZE) : 1;

  const { data: stocks } = useApi<Stock[]>(getStocks, []);

  // Get unique tickers from current page briefs for the filter dropdown
  const tickers = useMemo(() => {
    if (!briefs) return [];
    const set = new Set(briefs.map((b) => b.ticker));
    return Array.from(set).sort();
  }, [briefs]);

  // Current-page selection state for the select-all checkbox
  const pageIds = useMemo(() => new Set((briefs ?? []).map((b) => b.id)), [briefs]);
  const pageSelectedCount = useMemo(
    () => [...pageIds].filter((id) => selectedIds.has(id)).length,
    [pageIds, selectedIds]
  );
  const allPageSelected = pageIds.size > 0 && pageSelectedCount === pageIds.size;
  const somePageSelected = pageSelectedCount > 0 && pageSelectedCount < pageIds.size;

  // Sync indeterminate property on the native checkbox element
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = somePageSelected;
    }
  }, [somePageSelected]);

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const toggleId = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = async () => {
    setSelectingAll(true);
    try {
      const { ids } = await getAllBriefIds(filterTicker || undefined);
      setSelectedIds(new Set(ids));
    } catch {
      setExportError('Failed to fetch all brief IDs');
    } finally {
      setSelectingAll(false);
    }
  };

  const loadBriefDetail = async (brief: ResearchBrief) => {
    setSelectedBrief(brief);
    setDetailBrief(null);
    setDetailLoading(true);
    try {
      const full = await getResearchBrief(brief.id);
      setDetailBrief(full);
    } catch {
      // Fall back to the list brief (no key_metrics)
      setDetailBrief(brief);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const brief = await generateResearchBrief(filterTicker || undefined);
      await refetch();
      await loadBriefDetail(brief);
      setGenerating(false);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate brief');
      setGenerating(false);
    }
  };

  const handleExport = async (format: ExportFormat) => {
    if (selectedIds.size === 0 || selectedIds.size > 100 || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const { blob, filename } = await exportBriefs([...selectedIds], format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col">
      <Header title="Research Briefs" subtitle="AI-generated research analysis" />

      {/* Toast for export errors */}
      {exportError && (
        <Toast message={exportError} variant="error" onDismiss={() => setExportError(null)} />
      )}

      <div className="flex-1 p-6">
        {/* Toolbar */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          {/* Filter by ticker */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2">
            <Filter className="h-4 w-4 text-slate-500" />
            <select
              value={filterTicker}
              onChange={(e) => {
                setFilterTicker(e.target.value);
                setSelectedBrief(null);
                setDetailBrief(null);
                setSelectedIds(new Set());
                setCurrentPage(1);
              }}
              className="bg-transparent text-sm text-slate-300 outline-none"
            >
              <option value="" className="bg-slate-800">All Tickers</option>
              {(stocks || []).map((s) => (
                <option key={s.ticker} value={s.ticker} className="bg-slate-800">
                  {s.ticker}
                </option>
              ))}
              {tickers
                .filter((t) => !(stocks || []).some((s) => s.ticker === t))
                .map((t) => (
                  <option key={t} value={t} className="bg-slate-800">
                    {t}
                  </option>
                ))}
            </select>
          </div>

          {/* Generate New */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Generate New Brief
          </button>

          {genError && (
            <span className="text-xs text-red-400">{genError}</span>
          )}
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Briefs List */}
          <div className="xl:col-span-1">
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/50">
              {/* List header with select-all */}
              <div className="border-b border-slate-700/50 px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    ref={selectAllRef}
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    title={allPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                    aria-label={allPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                    className="h-4 w-4 cursor-pointer accent-blue-500"
                  />
                  <h2 className="text-sm font-semibold text-white">
                    Briefs {totalBriefs > 0 ? `(${totalBriefs})` : briefs ? `(${briefs.length})` : ''}
                  </h2>
                </div>
                {selectedIds.size > 0 && (
                  <span className="text-xs text-blue-400">{selectedIds.size} selected</span>
                )}
              </div>

              {/* Always-rendered live region so screen readers register it before the count changes */}
              <span
                className="sr-only"
                aria-live="polite"
                aria-atomic="true"
              >
                {selectedIds.size > 0 ? `${selectedIds.size} brief${selectedIds.size === 1 ? '' : 's'} selected` : ''}
              </span>

              {/* Cross-page "select all N" affordance — shown when current page is fully selected
                  and there are more briefs on other pages not yet in the selection */}
              {allPageSelected && totalBriefs > pageIds.size && selectedIds.size < totalBriefs && (
                <div className="border-b border-slate-700/50 bg-blue-500/5 px-4 py-2 text-center text-xs text-slate-300">
                  All {pageIds.size} briefs on this page are selected.{' '}
                  <button
                    onClick={handleSelectAll}
                    disabled={selectingAll}
                    className="font-medium text-blue-400 hover:text-blue-300 underline underline-offset-2 disabled:opacity-50"
                  >
                    {selectingAll ? 'Selecting…' : `Select all ${totalBriefs} briefs`}
                  </button>
                </div>
              )}

              {/* Dismiss: when all briefs are selected show a clear option */}
              {selectedIds.size === totalBriefs && totalBriefs > pageIds.size && (
                <div className="border-b border-slate-700/50 bg-blue-500/5 px-4 py-2 text-center text-xs text-slate-300">
                  All {totalBriefs} briefs are selected.{' '}
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="font-medium text-blue-400 hover:text-blue-300 underline underline-offset-2"
                  >
                    Clear selection
                  </button>
                </div>
              )}

              {/* Batch export toolbar — visible when at least one brief is selected */}
              {selectedIds.size > 0 && (
                <ExportToolbar
                  selectedIds={selectedIds}
                  capabilities={capabilities ?? null}
                  onExport={handleExport}
                  exporting={exporting}
                />
              )}

              <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
                {loading && !briefs && (
                  <div className="space-y-3 p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-700/30" />
                    ))}
                  </div>
                )}

                {error && !briefs && (
                  <div className="p-4 text-center text-sm text-red-400">{error}</div>
                )}

                {briefs && briefs.length === 0 && (
                  <div className="p-6 text-center">
                    <FileText className="mx-auto h-8 w-8 text-slate-600" />
                    <p className="mt-2 text-sm text-slate-500">No research briefs yet.</p>
                    <p className="text-xs text-slate-600">Run the Researcher agent to generate briefs.</p>
                  </div>
                )}

                {briefs && briefs.length > 0 && (
                  <div className="divide-y divide-slate-700/30">
                    {briefs.map((brief) => (
                      <div
                        key={brief.id}
                        className={clsx(
                          'flex items-start gap-2 px-3 py-3 transition-colors',
                          selectedBrief?.id === brief.id && 'bg-blue-500/10 border-l-2 border-blue-500'
                        )}
                      >
                        {/* Checkbox — stop propagation so row click still opens detail */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleId(brief.id);
                          }}
                          className="mt-0.5 shrink-0 text-slate-400 hover:text-slate-200 transition-colors"
                          aria-label={selectedIds.has(brief.id) ? `Deselect ${brief.title}` : `Select ${brief.title}`}
                          aria-pressed={selectedIds.has(brief.id)}
                        >
                          {selectedIds.has(brief.id) ? (
                            <CheckSquare className="h-4 w-4 text-blue-400" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>

                        {/* Row content — clicking opens detail view */}
                        <button
                          onClick={() => loadBriefDetail(brief)}
                          className="flex-1 text-left hover:bg-slate-700/10 rounded transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
                              {brief.ticker}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-slate-500">
                              <Bot className="h-2.5 w-2.5" />
                              {brief.agent_name}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-300 line-clamp-2">{brief.title}</p>
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                            <Calendar className="h-2.5 w-2.5" />
                            {formatLocalDate(brief.created_at)}
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="border-t border-slate-700/50 px-4 py-2 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="rounded p-1 text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setCurrentPage((p) => p + 1)}
                      disabled={!hasNext}
                      className="rounded p-1 text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Brief Detail */}
          <div className="xl:col-span-2">
            {selectedBrief ? (
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-6">
                <div className="mb-4 border-b border-slate-700/50 pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="rounded bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-400">
                      {selectedBrief.ticker}
                    </span>
                    {selectedBrief.model_used && (
                      <span className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
                        {selectedBrief.model_used}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-white">{selectedBrief.title}</h2>
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Bot className="h-3 w-3" />
                      {selectedBrief.agent_name}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatLocalDate(selectedBrief.created_at)}
                    </span>
                  </div>
                </div>

                {/* Loading skeleton for detail fetch */}
                {detailLoading && (
                  <div className="mb-4 space-y-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-slate-700/40" />
                    <div className="h-4 w-1/2 animate-pulse rounded bg-slate-700/40" />
                  </div>
                )}

                {/* Key metrics panel — only available on full detail fetch */}
                {!detailLoading && detailBrief?.key_metrics && (
                  <KeyMetricsPanel metrics={detailBrief.key_metrics} />
                )}

                {/* Executive summary callout */}
                {!detailLoading && (detailBrief?.summary ?? selectedBrief.summary) && (
                  <SummaryCallout summary={(detailBrief?.summary ?? selectedBrief.summary)!} />
                )}

                <MarkdownContent content={selectedBrief.content} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-800/20 p-12">
                <div className="text-center">
                  <FileText className="mx-auto h-12 w-12 text-slate-700" />
                  <p className="mt-3 text-sm text-slate-500">Select a brief to view its content</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
