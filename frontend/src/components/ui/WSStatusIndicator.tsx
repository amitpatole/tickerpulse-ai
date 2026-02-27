```typescript
'use client';

import { clsx } from 'clsx';
import type { WSStatus } from '@/hooks/useWSPrices';

interface WSStatusIndicatorProps {
  status: WSStatus;
  lastUpdated?: string;
}

function formatLastUpdated(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

const STATUS_CONFIG: Record<WSStatus, { dot: string; label: string }> = {
  open: {
    dot: 'bg-emerald-400 animate-pulse',
    label: 'WS live',
  },
  connecting: {
    dot: 'bg-amber-400 animate-pulse',
    label: 'WS connecting',
  },
  closed: {
    dot: 'bg-slate-500',
    label: 'WS offline',
  },
  error: {
    dot: 'bg-red-500',
    label: 'WS error',
  },
};

export default function WSStatusIndicator({ status, lastUpdated }: WSStatusIndicatorProps) {
  const cfg = STATUS_CONFIG[status];
  const tooltipParts = [cfg.label];
  if (lastUpdated && status === 'open') {
    tooltipParts.push(`· last update ${formatLastUpdated(lastUpdated)}`);
  }
  const tooltip = tooltipParts.join(' ');

  return (
    <span
      aria-label={tooltip}
      title={tooltip}
      className="inline-flex items-center gap-1.5"
    >
      <span
        aria-hidden="true"
        className={clsx('h-2 w-2 flex-shrink-0 rounded-full', cfg.dot)}
      />
      <span className="text-[10px] text-slate-400">{cfg.label}</span>
    </span>
  );
}
```