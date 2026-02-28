'use client';

import { CalendarClock, AlertTriangle } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { getNextRuns } from '@/lib/api';
import type { NextRunsResponse } from '@/lib/types';

interface Props {
  jobId: string;
  refreshKey: number;
}

function absoluteTime(isoStr: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoStr));
}

function relativeTime(isoStr: string): string {
  const diffMs = new Date(isoStr).getTime() - Date.now();
  if (diffMs < 0) return 'Past';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

export default function NextRunsPreview({ jobId, refreshKey }: Props) {
  const { data, loading, error } = useApi<NextRunsResponse>(
    () => getNextRuns(jobId, 5),
    [jobId, refreshKey],
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
        <h3 className="mb-3 text-sm font-semibold text-white">Next Scheduled Runs</h3>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-slate-700/40" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
        <h3 className="mb-3 text-sm font-semibold text-white">Next Scheduled Runs</h3>
        <div className="flex items-center gap-2 text-xs text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Could not load next run times.
        </div>
      </div>
    );
  }

  const runs = data?.next_runs ?? [];

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-white">Next Scheduled Runs</h3>
      </div>

      {runs.length === 0 ? (
        <p className="text-xs text-slate-500">No upcoming runs. Job may be paused or misconfigured.</p>
      ) : (
        <ol className="space-y-2">
          {runs.map((iso, idx) => (
            <li
              key={iso}
              className="flex items-center justify-between rounded-lg bg-slate-900/40 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-semibold text-slate-300">
                  {idx + 1}
                </span>
                <span className="text-xs text-slate-300">{absoluteTime(iso)}</span>
              </div>
              <span className="text-[10px] text-slate-500">{relativeTime(iso)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
