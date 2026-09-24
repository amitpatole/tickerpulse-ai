'use client';

import type { ReactNode } from 'react';
import { Cpu, DollarSign, ExternalLink, Gauge, TimerReset } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { getAIInfraUpdate, getCostSummary } from '@/lib/api';
import type { AIInfraItem, AIInfraUpdate, CostSummary } from '@/lib/types';

function formatMoney(value?: number): string {
  return typeof value === 'number' ? `$${value.toFixed(2)}` : 'n/a';
}

function formatPct(value?: number): string {
  if (typeof value !== 'number') return 'n/a';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatNumber(value?: number): string {
  return typeof value === 'number' ? value.toLocaleString() : '0';
}

function formatTimestamp(value?: string): string {
  if (!value) return 'No timestamp';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function changeColor(value?: number): string {
  if (typeof value !== 'number') return 'text-slate-400';
  if (value > 0) return 'text-amber-300';
  if (value < 0) return 'text-emerald-300';
  return 'text-slate-300';
}

function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="min-h-20 rounded-lg bg-slate-900/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-lg font-bold text-white font-mono">{value}</p>
    </div>
  );
}

function GpuRow({ item }: { item: AIInfraItem }) {
  const metadata = item.metadata || {};
  return (
    <tr className="border-t border-slate-700/40">
      <td className="px-3 py-2 font-semibold text-white">{metadata.gpu || 'GPU'}</td>
      <td className="px-3 py-2 text-right font-mono text-slate-200">
        {formatMoney(metadata.median_usd_per_gpu_hr)}
      </td>
      <td className="px-3 py-2 text-right font-mono text-slate-300">
        {formatNumber(metadata.offers)}
      </td>
      <td className={`px-3 py-2 text-right font-mono ${changeColor(metadata.price_change_7d_pct)}`}>
        {formatPct(metadata.price_change_7d_pct)}
      </td>
      <td className={`px-3 py-2 text-right font-mono ${changeColor(metadata.price_change_30d_pct)}`}>
        {formatPct(metadata.price_change_30d_pct)}
      </td>
      <td className="px-3 py-2 text-slate-300">{metadata.price_read_7d || 'n/a'}</td>
    </tr>
  );
}

export default function AIInfraPanel() {
  const { data: costs, loading: costsLoading, error: costsError } = useApi<CostSummary>(
    () => getCostSummary(30),
    [],
    { refreshInterval: 60000 }
  );
  const { data: aiInfra, loading: aiInfraLoading, error: aiInfraError } = useApi<AIInfraUpdate>(
    getAIInfraUpdate,
    [],
    { refreshInterval: 60000 }
  );

  const items = aiInfra?.items ?? [];
  const reportUrl = items.find((item) => item.url)?.url;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/50 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-white">AI Infrastructure</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {aiInfra?.source_status ?? 'loading'} - {formatTimestamp(aiInfra?.report_timestamp_utc)}
          </p>
        </div>
        {reportUrl && (
          <a
            href={reportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:border-blue-500/60 hover:text-blue-300"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Report
          </a>
        )}
      </div>

      <div className="p-4">
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label="30D Tokens"
            value={costsLoading ? '...' : formatNumber(costs?.total_tokens)}
            icon={<Gauge className="h-3.5 w-3.5" />}
          />
          <StatTile
            label="30D Cost"
            value={costsLoading ? '...' : `$${(costs?.total_cost_usd ?? costs?.total_cost ?? 0).toFixed(4)}`}
            icon={<DollarSign className="h-3.5 w-3.5" />}
          />
          <StatTile
            label="Runs"
            value={costsLoading ? '...' : formatNumber(costs?.total_runs)}
            icon={<TimerReset className="h-3.5 w-3.5" />}
          />
        </div>

        {(costsError || aiInfraError) && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {costsError || aiInfraError}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5" />
                    GPU
                  </span>
                </th>
                <th className="px-3 py-2 text-right font-medium">Median</th>
                <th className="px-3 py-2 text-right font-medium">Offers</th>
                <th className="px-3 py-2 text-right font-medium">7D</th>
                <th className="px-3 py-2 text-right font-medium">30D</th>
                <th className="px-3 py-2 font-medium">Read</th>
              </tr>
            </thead>
            <tbody>
              {aiInfraLoading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
                    Loading AI infrastructure update...
                  </td>
                </tr>
              )}
              {!aiInfraLoading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
                    No GPU rental rows available.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <GpuRow key={`${item.metadata?.gpu}-${item.metadata?.date}`} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
