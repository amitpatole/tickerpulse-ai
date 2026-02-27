'use client';

import { clsx } from 'clsx';
import type { WSStatus } from '@/hooks/useWSPrices';
import { formatTimestamp } from '@/lib/formatTime';
import type { TimezoneMode } from '@/lib/types';

interface WSStatusIndicatorProps {
  status: WSStatus;
  lastUpdated?: string;
  tz?: TimezoneMode;
}

const STATUS_CONFIG: Record<WSStatus, { dot: string; label: string }> = {
  open:       { dot: 'bg-emerald-400 animate-pulse', label: 'WS live' },
  connecting: { dot: 'bg-amber-400 animate-pulse',   label: 'WS connecting' },
  closed:     { dot: 'bg-slate-500',                 label: 'WS offline' },
  error:      { dot: 'bg-red-500',                   label: 'WS error' },
};

export default function WSStatusIndicator({ status, lastUpdated, tz = 'local' }: WSStatusIndicatorProps) {
  const cfg = STATUS_CONFIG[status];
  const tooltipParts = [cfg.label];
  if (lastUpdated && status === 'open') {
    tooltipParts.push(`· last update ${formatTimestamp(lastUpdated, tz)}`);
  }
  const tooltip = tooltipParts.join(' ');

  return (
    // suppressHydrationWarning: tooltip contains a local-timezone time string;
    // SSR (UTC) and browser (user TZ) may produce different values (VO-786).
    <span
      aria-label={tooltip}
      title={tooltip}
      className="inline-flex items-center gap-1.5"
      suppressHydrationWarning
    >
      <span aria-hidden="true" className={clsx('h-2 w-2 flex-shrink-0 rounded-full', cfg.dot)} />
      <span className="text-[10px] text-slate-400">{cfg.label}</span>
    </span>
  );
}