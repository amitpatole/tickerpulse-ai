'use client';

import { Wifi, WifiOff, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { useSSE } from '@/hooks/useSSE';
import { useKeyboardShortcutsContext } from '@/components/layout/KeyboardShortcutsProvider';
import AlertBell from '@/components/alerts/AlertBell';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { connected } = useSSE();

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-700/50 bg-slate-900/50 px-6 backdrop-blur-sm">
      <div>
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        {/* Search placeholder */}
        <div className="hidden items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 md:flex">
          <Search className="h-4 w-4 text-slate-500" />
          <span className="text-xs text-slate-500">Search...</span>
          <kbd className="ml-4 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">
            /
          </kbd>
        </div>

        {/* Alerts bell with unread badge */}
        <AlertBell />

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
          <span>{connected ? 'Live' : 'Offline'}</span>
        </div>
      </div>
    </header>
  );
}
