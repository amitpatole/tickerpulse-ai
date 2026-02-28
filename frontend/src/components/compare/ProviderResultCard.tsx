'use client';

import { clsx } from 'clsx';
import type { ComparisonResult } from '@/lib/types';

const RATING_STYLES: Record<string, string> = {
  BUY:  'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  HOLD: 'text-amber-400  bg-amber-400/10  border-amber-400/30',
  SELL: 'text-red-400    bg-red-400/10    border-red-400/30',
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai:    'OpenAI',
  google:    'Google',
  grok:      'xAI Grok',
};

interface Props {
  result: ComparisonResult;
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span>{Math.round(pct)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-700">
        <div
          className={clsx('h-1.5 rounded-full transition-all', color)}
          style={{ width: `${pct}%` }}
          data-testid={`score-bar-${label.toLowerCase()}`}
        />
      </div>
    </div>
  );
}

export default function ProviderResultCard({ result }: Props) {
  const displayName = PROVIDER_LABELS[result.provider] ?? result.provider;

  const header = (
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-slate-200">{displayName}</h3>
      <div className="flex items-center gap-2">
        {result.duration_ms !== undefined && (
          <span className="rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] text-slate-500">
            {result.duration_ms}ms
          </span>
        )}
        <span className="text-xs text-slate-500">{result.model}</span>
      </div>
    </div>
  );

  if (result.error) {
    return (
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
        {header}
        <div className="rounded-lg border border-red-700/30 bg-red-900/20 px-3 py-2">
          <p className="text-xs text-red-400" data-testid="error-message">{result.error}</p>
        </div>
      </div>
    );
  }

  const ratingStyle = result.rating
    ? RATING_STYLES[result.rating] ?? 'text-slate-400 bg-slate-700/50 border-slate-600/50'
    : null;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
      {header}

      {ratingStyle && (
        <div
          className={clsx(
            'mb-4 inline-flex items-center rounded-lg border px-3 py-1 text-sm font-bold',
            ratingStyle,
          )}
          data-testid="rating-badge"
        >
          {result.rating}
        </div>
      )}

      {result.score !== undefined && (
        <ScoreBar label="Score" value={result.score} color="bg-blue-500" />
      )}
      {result.confidence !== undefined && (
        <ScoreBar label="Confidence" value={result.confidence} color="bg-emerald-500" />
      )}

      {result.summary && (
        <p className="text-xs leading-relaxed text-slate-400">{result.summary}</p>
      )}
    </div>
  );
}
