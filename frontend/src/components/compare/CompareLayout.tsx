'use client';

import { useState, useRef, useCallback } from 'react';
import { Loader2, RotateCcw, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { createComparisonRun, getComparisonRun } from '@/lib/api.comparison';
import type { ComparisonResult, ComparisonRun } from '@/lib/types';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 30;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProviderSkeleton() {
  return (
    <div
      data-testid="skeleton-card"
      className="animate-pulse rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="h-3.5 w-24 rounded bg-slate-700" />
        <div className="h-3 w-12 rounded bg-slate-700" />
      </div>
      <div className="space-y-2">
        <div className="h-2.5 w-full rounded bg-slate-700" />
        <div className="h-2.5 w-5/6 rounded bg-slate-700" />
        <div className="h-2.5 w-4/6 rounded bg-slate-700" />
        <div className="h-2.5 w-3/6 rounded bg-slate-700" />
      </div>
    </div>
  );
}

function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(3)} s`;
  return `${ms} ms`;
}

interface ProviderCardProps {
  result: ComparisonResult;
}

function ProviderCard({ result }: ProviderCardProps) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-300 capitalize">
            {result.provider_name}
          </p>
          <p className="text-[11px] text-slate-500">{result.model}</p>
        </div>
        {result.error ? (
          <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            Error
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            OK
          </span>
        )}
      </div>

      {result.error ? (
        <p className="text-xs text-red-400">{result.error}</p>
      ) : (
        <p className="text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
          {result.response}
        </p>
      )}

      {result.latency_ms > 0 && (
        <p className="flex items-center gap-1 text-[10px] text-slate-500">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {formatLatency(result.latency_ms)}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CompareLayout() {
  const [prompt, setPrompt] = useState('');
  const [runState, setRunState] = useState<
    | { phase: 'idle' }
    | { phase: 'loading'; runId: string }
    | { phase: 'complete'; run: ComparisonRun }
    | { phase: 'error'; message: string }
  >({ phase: 'idle' });

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const schedulePoll = useCallback(
    (runId: string) => {
      stopPolling();
      attemptsRef.current += 1;

      if (attemptsRef.current > MAX_POLL_ATTEMPTS) {
        setRunState({ phase: 'error', message: 'Request timed out. Please try again.' });
        return;
      }

      pollRef.current = setTimeout(async () => {
        try {
          const run = await getComparisonRun(runId);
          if (run.status === 'complete' || run.status === 'failed') {
            setRunState({ phase: 'complete', run });
          } else {
            schedulePoll(runId);
          }
        } catch (err) {
          setRunState({
            phase: 'error',
            message: err instanceof Error ? err.message : 'Something went wrong',
          });
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;

    stopPolling();
    attemptsRef.current = 0;

    try {
      const { run_id } = await createComparisonRun({ prompt: trimmed });
      setRunState({ phase: 'loading', runId: run_id });
      schedulePoll(run_id);
    } catch (err) {
      setRunState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Failed to start comparison',
      });
    }
  }

  function handleReset() {
    stopPolling();
    setPrompt('');
    setRunState({ phase: 'idle' });
    attemptsRef.current = 0;
  }

  const isLoading = runState.phase === 'loading';
  const isComplete = runState.phase === 'complete';
  const isError = runState.phase === 'error';

  return (
    <div className="space-y-4">
      {/* Prompt form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your analysis prompt…"
          rows={3}
          disabled={isLoading}
          className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30 disabled:opacity-50"
        />

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!prompt.trim() || isLoading}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Comparing…
              </>
            ) : (
              'Compare'
            )}
          </button>

          {(isComplete || isError) && (
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-400 transition-colors hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-500/50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>
      </form>

      {/* Error banner */}
      {isError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{runState.message}</span>
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div
          data-testid="results-grid"
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          {Array.from({ length: 2 }).map((_, i) => (
            <ProviderSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Results */}
      {isComplete && runState.run.results.length > 0 && (
        <div
          data-testid="results-grid"
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          {runState.run.results.map((result, i) => (
            <ProviderCard key={`${result.provider_name}-${i}`} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}

export default CompareLayout;
