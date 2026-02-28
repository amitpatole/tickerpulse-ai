```tsx
'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { runModelComparison } from '@/lib/api';
import type { ComparisonProviderRequest, ComparisonTemplate, ModelComparisonResponse } from '@/lib/types';
import ProviderResultCard from './ProviderResultCard';
import ConsensusBar from './ConsensusBar';

const AVAILABLE_PROVIDERS: ComparisonProviderRequest[] = [
  { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  { provider: 'openai',    model: 'gpt-4o'            },
  { provider: 'google',    model: 'gemini-2.0-flash'  },
  { provider: 'grok',      model: 'grok-3'            },
];

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai:    'OpenAI',
  google:    'Google',
  grok:      'xAI Grok',
};

const TEMPLATE_OPTIONS: { value: ComparisonTemplate; label: string }[] = [
  { value: 'custom',           label: 'General Analysis' },
  { value: 'bull_bear_thesis', label: 'Bull/Bear Thesis' },
  { value: 'risk_summary',     label: 'Risk Summary'     },
  { value: 'price_target',     label: 'Price Target'     },
];

function SkeletonCard({ provider }: { provider: string }) {
  return (
    <div
      className="animate-pulse rounded-xl border border-slate-700/50 bg-slate-800/50 p-5"
      data-testid={`skeleton-${provider}`}
    >
      <div className="mb-4 h-4 w-24 rounded bg-slate-700" />
      <div className="mb-3 h-7 w-16 rounded bg-slate-700" />
      <div className="mb-2 h-1.5 w-full rounded-full bg-slate-700" />
      <div className="mb-4 h-1.5 w-3/4 rounded-full bg-slate-700" />
      <div className="h-12 rounded bg-slate-700" />
    </div>
  );
}

export default function ModelComparisonPanel() {
  const [ticker, setTicker] = useState('');
  const [selected, setSelected] = useState<string[]>(['anthropic', 'openai']);
  const [template, setTemplate] = useState<ComparisonTemplate>('custom');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ModelComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = ticker.trim().length > 0 && selected.length > 0;

  const toggleProvider = (provider: string) => {
    setSelected((prev) =>
      prev.includes(provider) ? prev.filter((p) => p !== provider) : [...prev, provider],
    );
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const providers = AVAILABLE_PROVIDERS.filter((p) => selected.includes(p.provider));
      const response = await runModelComparison({
        ticker: ticker.trim().toUpperCase(),
        providers,
        template,
      });
      setResult(response);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-6">
        <div className="flex flex-wrap items-end gap-6">
          {/* Ticker */}
          <div>
            <label className="mb-1 block text-xs text-slate-400">Ticker Symbol</label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="AAPL"
              maxLength={10}
              className="w-28 rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              data-testid="ticker-input"
            />
          </div>

          {/* Template */}
          <div>
            <label className="mb-1 block text-xs text-slate-400">Analysis Template</label>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as ComparisonTemplate)}
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              data-testid="template-select"
            >
              {TEMPLATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Provider checkboxes */}
          <div>
            <label className="mb-1 block text-xs text-slate-400">Providers</label>
            <div className="flex flex-wrap gap-3">
              {AVAILABLE_PROVIDERS.map((p) => (
                <label
                  key={p.provider}
                  className="flex cursor-pointer items-center gap-1.5"
                  data-testid={`provider-checkbox-${p.provider}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(p.provider)}
                    onChange={() => toggleProvider(p.provider)}
                    className="rounded accent-blue-500"
                  />
                  <span className="text-sm text-slate-300">
                    {PROVIDER_LABELS[p.provider]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || loading}
            className={clsx(
              'rounded-lg px-5 py-2 text-sm font-medium transition-colors',
              canSubmit && !loading
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'cursor-not-allowed bg-slate-700 text-slate-500',
            )}
            data-testid="submit-button"
          >
            {loading ? 'Running…' : 'Compare'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-700/50 bg-red-900/20 p-4">
          <p className="text-sm text-red-400" data-testid="error-banner">{error}</p>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="loading-skeletons">
          {selected.map((p) => (
            <SkeletonCard key={p} provider={p} />
          ))}
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>Run: <span className="font-mono">{result.run_id.slice(0, 8)}…</span></span>
            <span className="text-slate-600">·</span>
            <span>{result.ticker}</span>
            <span className="text-slate-600">·</span>
            <span>Price: <strong className="text-slate-400">${result.market_context.price}</strong></span>
            <span className="text-slate-600">·</span>
            <span>RSI: <strong className="text-slate-400">{result.market_context.rsi.toFixed(1)}</strong></span>
            <span className="text-slate-600">·</span>
            <span>
              Sentiment:{' '}
              <strong className="text-slate-400">{result.market_context.sentiment_score.toFixed(2)}</strong>
            </span>
          </div>

          <ConsensusBar results={result.results} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="results-grid">
            {result.results.map((r, i) => (
              <ProviderResultCard key={`${r.provider}-${i}`} result={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```