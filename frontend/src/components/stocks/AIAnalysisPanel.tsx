'use client';

import { Brain } from 'lucide-react';
import { clsx } from 'clsx';
import type { AIRatingBlock } from '@/lib/types';
import { RATING_BG_CLASSES } from '@/lib/types';

export interface AIAnalysisPanelProps {
  aiRating: AIRatingBlock | null;
  loading: boolean;
}

// ---- Helpers -----------------------------------------------------------------

function scoreBarColor(score: number): string {
  if (score >= 65) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

// ---- Sub-components ----------------------------------------------------------

interface ScoreBarProps {
  label: string;
  value: number;
  colorClass?: string;
}

function ScoreBar({ label, value, colorClass }: ScoreBarProps) {
  const pct = Math.min(100, Math.max(0, value));
  const cls = colorClass ?? scoreBarColor(pct);
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-[10px] text-slate-400">{label}</span>
      <div
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${Math.round(pct)} out of 100`}
        className="h-1.5 flex-1 rounded-full bg-slate-700"
      >
        <div
          className={clsx('h-full rounded-full transition-[width]', cls)}
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
      <span className="w-6 shrink-0 text-right font-mono text-[10px] text-slate-300">
        {Math.round(pct)}
      </span>
    </div>
  );
}

// SVG score ring — circumference ≈ 100 when r = 15.915 (2πr ≈ 100)
function ScoreRing({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const strokeColor =
    pct >= 65 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div
      className="relative h-16 w-16 shrink-0"
      aria-label={`AI Score: ${Math.round(pct)} out of 100`}
    >
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
        <circle
          className="fill-none stroke-slate-700"
          strokeWidth="3.5"
          cx="18"
          cy="18"
          r="15.915"
        />
        <circle
          fill="none"
          stroke={strokeColor}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${pct} 100`}
          cx="18"
          cy="18"
          r="15.915"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-sm font-bold text-white">
          {Math.round(pct)}
        </span>
      </div>
    </div>
  );
}

// ---- Main component ----------------------------------------------------------

export default function AIAnalysisPanel({ aiRating, loading }: AIAnalysisPanelProps) {
  const badgeClass = aiRating
    ? (RATING_BG_CLASSES[aiRating.rating.toLowerCase()] ??
       'bg-slate-500/20 text-slate-400 border-slate-500/30')
    : '';

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
        <Brain className="h-3.5 w-3.5 text-purple-400" aria-hidden="true" />
        AI Analysis
      </h2>

      {loading && (
        <div className="space-y-3" aria-busy="true">
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 animate-pulse rounded-full bg-slate-800" />
            <div className="h-7 w-28 animate-pulse rounded-full bg-slate-800" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-slate-800" />
            ))}
          </div>
        </div>
      )}

      {!loading && !aiRating && (
        <p className="text-sm text-slate-500">Analysis unavailable.</p>
      )}

      {!loading && aiRating && (
        <div className="space-y-4">
          {/* Score ring + rating badge */}
          <div className="flex items-center gap-3">
            <ScoreRing score={aiRating.score} />
            <div className="space-y-1.5">
              <span
                className={clsx(
                  'inline-block rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
                  badgeClass
                )}
              >
                {aiRating.rating.replace(/_/g, ' ')}
              </span>
              {aiRating.updated_at && (
                <p className="text-[10px] text-slate-500">
                  {timeAgo(aiRating.updated_at)}
                </p>
              )}
            </div>
          </div>

          {/* Sub-score bars */}
          <div className="space-y-2.5">
            <ScoreBar
              label="Confidence"
              value={Math.round(aiRating.confidence * 100)}
              colorClass="bg-blue-500"
            />
            {aiRating.technical_score != null && (
              <ScoreBar
                label="Technical"
                value={aiRating.technical_score}
                colorClass="bg-cyan-500"
              />
            )}
            {aiRating.fundamental_score != null && (
              <ScoreBar
                label="Fundamental"
                value={aiRating.fundamental_score}
                colorClass="bg-violet-500"
              />
            )}
          </div>

          {/* Rationale / summary */}
          {aiRating.summary && (
            <p className="text-xs leading-relaxed text-slate-400">
              {aiRating.summary}
            </p>
          )}

          {/* Metadata row */}
          {(aiRating.sentiment_label || aiRating.sector) && (
            <div className="grid grid-cols-2 gap-3 border-t border-slate-700/30 pt-3">
              {aiRating.sentiment_label && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">
                    Sentiment
                  </p>
                  <p className="mt-0.5 text-sm font-semibold capitalize text-white">
                    {aiRating.sentiment_label}
                  </p>
                </div>
              )}
              {aiRating.sector && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">
                    Sector
                  </p>
                  <p className="mt-0.5 truncate text-sm text-white">
                    {aiRating.sector}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
