'use client';

import { useEffect, useState } from 'react';
import { Bot, AlertTriangle, CheckCircle, Clock, Radio } from 'lucide-react';
import { clsx } from 'clsx';
import { useSSE } from '@/hooks/useSSE';
import { formatLocalTime } from '@/lib/formatTime';
import type { SSEEvent } from '@/lib/types';

function EventIcon({ type }: { type: string }) {
  switch (type) {
    case 'agent_status':
      return <Bot className="h-4 w-4 text-blue-400" aria-hidden="true" />;
    case 'alert':
      return <AlertTriangle className="h-4 w-4 text-amber-400" aria-hidden="true" />;
    case 'job_complete':
      return <CheckCircle className="h-4 w-4 text-emerald-400" aria-hidden="true" />;
    case 'heartbeat':
      return <Radio className="h-4 w-4 text-slate-500" aria-hidden="true" />;
    default:
      return <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />;
  }
}

function formatEventMessage(event: SSEEvent): string {
  const data = event.data;
  switch (event.type) {
    case 'agent_status':
      return `Agent "${data.agent_name}" is now ${data.status}${data.message ? `: ${data.message}` : ''}`;
    case 'alert':
      return `[${data.ticker}] ${data.message}`;
    case 'job_complete':
      return `Job "${data.job_name}" completed (${data.status})`;
    case 'heartbeat':
      return 'System heartbeat';
    default:
      return JSON.stringify(data);
  }
}

export default function ActivityFeed() {
  const { connected, eventLog } = useSSE();
  const [assertiveMessage, setAssertiveMessage] = useState('');

  // Announce failed/error agent_status events via assertive live region
  useEffect(() => {
    if (!eventLog.length) return;
    const latest = eventLog[0];
    if (latest.type !== 'agent_status') return;
    const data = latest.data as { agent_name?: string; status?: string; message?: string };
    if (data.status === 'failed' || data.status === 'error') {
      setAssertiveMessage(
        `Alert: Agent "${data.agent_name}" ${data.status}${data.message ? `: ${data.message}` : ''}`
      );
    }
  }, [eventLog]);

  // Filter out heartbeat events for display
  const visibleEvents = eventLog.filter((e) => e.type !== 'heartbeat');

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50">
      {/* Assertive live region for critical failures — visually hidden */}
      <div
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertiveMessage}
      </div>

      <div className="flex items-center justify-between border-b border-slate-700/50 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Activity Feed</h2>
        <div
          className="flex items-center gap-1.5"
          aria-label={connected ? 'Activity feed connected' : 'Activity feed disconnected'}
        >
          <span
            aria-hidden="true"
            className={clsx(
              'h-2 w-2 rounded-full',
              connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
            )}
          />
          <span className="text-xs text-slate-400">{connected ? 'Live' : 'Disconnected'}</span>
        </div>
      </div>

      <div
        aria-live="polite"
        aria-label="Agent activity feed"
        aria-atomic="false"
        className="max-h-96 overflow-y-auto"
      >
        {visibleEvents.length === 0 ? (
          <div className="p-6 text-center">
            <Radio className="mx-auto h-8 w-8 text-slate-600" aria-hidden="true" />
            <p className="mt-2 text-sm text-slate-500">Waiting for events...</p>
            <p className="text-xs text-slate-600">
              {connected ? 'Connected to event stream' : 'Connecting to event stream...'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/30">
            {visibleEvents.map((event, idx) => (
              <div key={idx} className="flex items-start gap-3 px-4 py-3">
                <div className="mt-0.5">
                  <EventIcon type={event.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300">{formatEventMessage(event)}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 capitalize">{event.type.replace('_', ' ')}</span>
                    {event.timestamp && (
                      <span className="text-[10px] text-slate-600" suppressHydrationWarning>{formatLocalTime(event.timestamp)}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
