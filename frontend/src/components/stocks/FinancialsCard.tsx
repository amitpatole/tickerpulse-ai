'use client';

import { BarChart2 } from 'lucide-react';
import type { StockDetailQuote } from '@/lib/types';

interface FinancialsCardProps {
  quote: StockDetailQuote;
}

function formatLargeNumber(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

interface StatRowProps {
  label: string;
  value: React.ReactNode;
}

function StatRow({ label, value }: StatRowProps) {
  return (
    <div className="flex items-center justify-between border-b border-slate-700/30 py-2.5 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="font-mono text-xs font-semibold text-white">{value}</span>
    </div>
  );
}

export default function FinancialsCard({ quote }: FinancialsCardProps) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <BarChart2 className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
        Key Statistics
      </h2>

      <div>
        <StatRow label="Volume" value={formatVolume(quote.volume)} />

        {quote.market_cap != null && (
          <StatRow label="Market Cap" value={formatLargeNumber(quote.market_cap)} />
        )}

        {quote.pe_ratio != null && (
          <StatRow label="P/E Ratio (TTM)" value={quote.pe_ratio.toFixed(1)} />
        )}

        {quote.eps != null && (
          <StatRow label="EPS (TTM)" value={quote.eps.toFixed(2)} />
        )}

        {quote.week_52_high != null && quote.week_52_low != null && (
          <StatRow
            label="52W Range"
            value={`${quote.week_52_low.toFixed(2)} – ${quote.week_52_high.toFixed(2)}`}
          />
        )}

        {quote.week_52_high != null && (
          <StatRow label="52W High" value={`${quote.week_52_high.toFixed(2)}`} />
        )}

        {quote.week_52_low != null && (
          <StatRow label="52W Low" value={`${quote.week_52_low.toFixed(2)}`} />
        )}

        <StatRow label="Currency" value={quote.currency} />
      </div>
    </div>
  );
}
