```tsx
'use client';

import React from 'react';
import {
  Bot,
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  DollarSign,
} from 'lucide-react';
import type { ActivityEvent } from '@/lib/types';

interface Props {
  events: ActivityEvent[];
  loading: boolean;
  error: string | null;
}

function relativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function fmtDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function fmtCost(cost: number): string {
  if (cost === 0) return '—';
  if (cost < 0.0001) return '<$0.0001';
  return `$${cost.toFixed(4)}`;
}

const TYPE_ICON = {
  agent: Bot,
  job:   Briefcase,
  error: AlertTriangle,
} as const;

type StatusConfig = {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
};

const STATUS_CONFIG: Record<string, StatusConfig> = {
  success:   { icon: CheckCircle2,  color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  completed: { icon: CheckCircle2,  color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  error:     { icon: XCircle,       color: 'text-red-400',     bg: 'bg-red-500/10'     },
  failed:    { icon: XCircle,       color: 'text-red-400',     bg: 'bg-red-500/10'     },
  critical:  { icon: XCircle,       color: 'text-red-500',     bg: 'bg-red-500/10'     },
  running:   { icon: Loader2,       color: 'text-blue-400',    bg: 'bg-blue-500/10'    },
  high:      { icon: AlertTriangle, color: 'text-orange-400',  bg: 'bg-orange-500/10'  },
  medium:    { icon: AlertTriangle, color: 'text-amber-400',   bg: 'bg-amber-500/10'   },
  low:       { icon: AlertTriangle, color: 'text-slate-400',   bg: 'bg-slate-500/10'   },
};

const DEFAULT_STATUS: StatusConfig = {
  icon: AlertTriangle,
  color: 'text-slate-400',
  bg: 'bg-slate-500/10',
};

const SKELETON_ROW = (
  <div className="flex items-center gap-4 py-3">
    <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-800" />
    <div className="flex-1 space-y-1.5">
      <div className="h-3.5 w-40 animate-pulse rounded bg-slate-800" />
      <div className="h-2.5 w-24 animate-pulse rounded bg-slate-800" />
    </div>
    <div className="h-3 w-16 animate-pulse rounded bg-slate-800" />
    <div className="h-3 w-12 animate-pulse rounded bg-slate-800" />
  </div>
);

export default function ActivityTimeline({ events, loading, error }: Props) {
  if (loading) {
    return (
      <div className="divide-y divide-slate-700/40">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>{SKELETON_ROW}</div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <XCircle className="mb-3 h-10 w-10 text-red-400" />
        <p className="text-sm text-slate-400">Failed to load activity</p>
        <p className="mt-1 text-xs text-slate-500">{error}</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Clock className="mb-3 h-10 w-10 text-slate-600" />
        <p className="text-sm text-slate-400">No activity in this period</p>
        <p className="mt-1 text-xs text-slate-500">
          Try selecting a longer timeframe or a different filter
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-700/40">
      {events.map((event) => {
        const TypeIcon = TYPE_ICON[event.type as keyof typeof TYPE_ICON] ?? Briefcase;
        const statusConf = STATUS_CONFIG[event.status] ?? DEFAULT_STATUS;
        const StatusIcon = statusConf.icon;

        return (
          <div
            key={event.id}
            className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-slate-800/30"
          >
            {/* Type icon */}
            <div
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${statusConf.bg}`}
            >
              <TypeIcon className={`h-4 w-4 ${statusConf.color}`} />
            </div>

            {/* Name + summary */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{event.name}</p>
              {event.summary && (
                <p className="truncate text-xs text-slate-400">{event.summary}</p>
              )}
            </div>

            {/* Status badge */}
            <div
              className={`hidden items-center gap-1 rounded-full px-2 py-0.5 sm:flex ${statusConf.bg}`}
            >
              <StatusIcon className={`h-3 w-3 ${statusConf.color}`} />
              <span className={`text-xs font-medium ${statusConf.color}`}>
                {event.status}
              </span>
            </div>

            {/* Cost */}
            <div className="hidden min-w-[60px] items-center justify-end gap-0.5 text-xs text-slate-400 lg:flex">
              {event.cost > 0 && <DollarSign className="h-3 w-3" />}
              <span>{fmtCost(event.cost)}</span>
            </div>

            {/* Duration */}
            <div className="hidden min-w-[52px] text-right text-xs text-slate-500 md:block">
              {fmtDuration(event.duration_ms)}
            </div>

            {/* Relative time */}
            <div className="min-w-[64px] flex-shrink-0 text-right text-xs text-slate-500">
              {event.timestamp ? relativeTime(event.timestamp) : '—'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```