'use client';

import { useEffect, useState } from 'react';
import { Menu, Wifi, WifiOff, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { useSSE } from '@/hooks/useSSE';
import { useSidebarState } from '@/components/layout/SidebarStateProvider';
import AlertBell from '@/components/alerts/AlertBell';
import { getHealth } from '@/lib/api';

function HealthDot() {
  const [status, setStatus] = useState<'ok' | 'degraded' | null>(null);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const data = await getHealth();
        if (isMounted) setStatus(data.status);
      } catch {
        if (isMounted) setStatus('degraded');
      }
      if (isMounted) {
        timeoutId = setTimeout(poll, 60_000);
      }
    };

    poll();
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []);

  if (status === null) return null;

  return (
    <div
      className={clsx(
        'h-2.5 w-2.5 rounded-full',
        status === 'ok' ? 'bg-emerald-400' : 'bg-amber-400',
      )}
      aria-label={`Service health: ${status}`}
      title={`Service health: ${status}`}
    />
  );
}

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { connected } = useSSE();
  const { toggle } = useSidebarState();

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-700/50 bg-slate-900/50 px-4 backdrop-blur-sm md:px-6">
      <div className="flex items-center gap-3">
        {/* Hamburger — visible on mobile only, opens the sidebar drawer */}
        <button
          className="flex items-center justify-center rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white md:hidden"
          onClick={toggle}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div>
          <h1 className="text-lg font-semibold text-white">{title}</h1>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3 md:gap-4">
        {/* Search placeholder — hidden on mobile to save space */}
        <div className="hidden items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 md:flex">
          <Search className="h-4 w-4 text-slate-500" />
          <span className="text-xs text-slate-500">Search...</span>
          <kbd className="ml-4 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">
            /
          </kbd>
        </div>

        {/* Alerts bell with unread badge */}
        <AlertBell />

        {/* Service health indicator */}
        <HealthDot />

        {/* Connection Status */}
        <div
          className={clsx(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            connected
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-red-500/10 text-red-400'
          )}
        >
          {connected ? (
            <Wifi className="h-3 w-3" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          <span className="hidden sm:inline">{connected ? 'Live' : 'Offline'}</span>
        </div>
      </div>
    </header>
  );
}
