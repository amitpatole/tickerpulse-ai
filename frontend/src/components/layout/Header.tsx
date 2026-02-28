'use client';

import { Bell, Menu, Search, Wifi, WifiOff, X, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { useSSE } from '@/hooks/useSSE';
import { useKeyboardShortcutsContext } from '@/components/layout/KeyboardShortcutsProvider';
import { useSidebarState } from '@/components/layout/SidebarStateProvider';
import { useApiErrorContext } from '@/lib/apiErrorContext';
import { getErrorCopy } from '@/hooks/useApiError';
import HealthStatusPill from '@/components/health/HealthStatusPill';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { connected, recentAlerts } = useSSE();
  const unreadAlerts = recentAlerts.length;
  const { openMobile } = useSidebarState();
  const { persistentError, clearPersistentError } = useApiErrorContext();

  return (
    <div>
      {/* Persistent error banner — only shown when retries are exhausted */}
      {persistentError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 bg-red-900/80 px-4 py-2.5 text-sm text-red-100 border-b border-red-700/60"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
            <span className="truncate">
              {getErrorCopy(persistentError.error_code)}
            </span>
            {persistentError.request_id && (
              <span className="hidden sm:inline text-red-400 text-xs shrink-0">
                (ref: {persistentError.request_id})
              </span>
            )}
          </div>
          <button
            onClick={clearPersistentError}
            aria-label="Dismiss error"
            className="shrink-0 rounded p-0.5 text-red-300 hover:bg-red-800 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <header className="flex h-16 items-center justify-between border-b border-slate-700/50 bg-slate-900/50 px-4 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-3">
          {/* Hamburger — mobile only */}
          <button
            onClick={openMobile}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors md:hidden"
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
          {/* Search — tablet and up */}
          <div className="hidden items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 md:flex">
            <Search className="h-4 w-4 text-slate-500" />
            <span className="text-xs text-slate-500">Search...</span>
            <kbd className="ml-4 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">
              /
            </kbd>
          </div>

          {/* Alerts */}
          <button className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
            <Bell className="h-5 w-5" />
            {unreadAlerts > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadAlerts > 9 ? '9+' : unreadAlerts}
              </span>
            )}
          </button>

          {/* Health status pill */}
          <HealthStatusPill />

          {/* SSE Connection Status */}
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
            {/* Label hidden on smallest screens to save space */}
            <span className="hidden sm:inline">{connected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </header>
    </div>
  );
}