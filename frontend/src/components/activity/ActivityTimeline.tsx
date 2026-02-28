'use client';

import React from 'react';
import { Bot, Briefcase, AlertCircle } from 'lucide-react';
import type { ActivityEvent } from '@/lib/types';

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmtCost(cost: number): string {
  if (cost === 0) return '—';
  if (cost < 0.0001) return '<$0.0001';
  return `$${cost.toFixed(4)}`;
}

function fmtDuration(ms: number | null): string | null {
  if (ms === null) return null;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function fmtRelative(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_CLASSES: Record<string, string> = {
  success:   'bg-emerald-500/15 text-emerald-400',
  completed: 'bg-emerald-500/15 text-emerald-400',
  error:     'bg-red-500/15 text-red-400',
  failed:    'bg-red-500/15 text-red-400',
  critical:  'bg-red-500/15 text-red-400',
  running:   'bg-amber-500/15 text-amber-400',
  pending:   'bg-amber-500/15 text-amber-400',
};

function statusClass(status: string): string {
  return STATUS_CLASSES[status] ?? 'bg-slate-700/50 text-slate-400';
}

// ---------------------------------------------------------------------------
// Type icon
// ---------------------------------------------------------------------------

function TypeIcon({ type }: { type: ActivityEvent['type'] }) {
  const cls = 'h-4 w-4';
  if (type === 'agent') return <Bot className={cls} />;
  if (type === 'job')   return <Briefcase className={cls} />;
  return <AlertCircle className={cls} />;
}

function iconBgClass(type: ActivityEvent['type']): string {
  if (type === 'agent') return 'bg-blue-500/15 text-blue-400';
  if (type === 'job')   return 'bg-violet-500/15 text-violet-400';
  return 'bg-red-500/15 text-red-400';
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

const SKELETONS = Array.from({ length: 5 });

function Skeleton() {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-800/60" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-40 animate-pulse rounded bg-slate-800/60" />
        <div className="h-3 w-64 animate-pulse rounded bg-slate-800/60" />
      </div>
      <div className="h-3 w-16 animate-pulse rounded bg-slate-800/60" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  events: ActivityEvent[];
  loading: boolean;
  error: string | null;
}

export default function ActivityTimeline({ events, loading, error }: Props) {
  if (loading) {
    return (
      <div className="divide-y divide-slate-700/30">
        {SKELETONS.map((_, i) => <Skeleton key={i} />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-slate-700/50 bg-slate-800/20 text-sm text-slate-500">
        No activity for the selected period
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-700/30 rounded-xl border border-slate-700/50 bg-slate-800/20">
      {events.map((event) => {
        const duration = fmtDuration(event.duration_ms);
        const cost = fmtCost(event.cost);
        const rel = fmtRelative(event.timestamp);

        return (
          <div key={event.id} className="flex items-start gap-3 px-4 py-3">
            {/* Icon */}
            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${iconBgClass(event.type)}`}>
              <TypeIcon type={event.type} />
            </div>

            {/* Main content */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-white">{event.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(event.status)}`}>
                  {event.status}
                </span>
              </div>

              {event.summary && (
                <p className="mt-0.5 truncate text-xs text-slate-500">{event.summary}</p>
              )}

              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                {/* Cost — always shown */}
                <span>{cost}</span>

                {/* Duration — only when non-null */}
                {duration !== null && <span>{duration}</span>}
              </div>
            </div>

            {/* Relative time */}
            <span className="flex-shrink-0 text-xs text-slate-500">{rel}</span>
          </div>
        );
      })}
    </div>
  );
}
