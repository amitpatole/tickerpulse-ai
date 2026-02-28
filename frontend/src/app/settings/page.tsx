'use client';

import { Palette, Timer, Wifi } from 'lucide-react';
import Header from '@/components/layout/Header';
import RefreshIntervalControl from '@/components/dashboard/RefreshIntervalControl';
import PriceAlertsPanel from '@/components/alerts/PriceAlertsPanel';
import ThemeToggle from '@/components/settings/ThemeToggle';

export default function SettingsPage() {
  return (
    <div className="flex flex-col">
      <Header title="Settings" subtitle="Configure TickerPulse AI behavior" />

      <div className="flex-1 p-6">
        {/* Appearance */}
        <section aria-labelledby="appearance-heading" className="mb-6">
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Palette className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <h2 id="appearance-heading" className="text-sm font-semibold text-white">
                Appearance
              </h2>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-slate-400">
              Choose between dark, light, or system-matched colour scheme.{' '}
              <strong className="text-slate-300">System</strong> follows your OS preference
              and updates automatically when it changes.
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Colour scheme</span>
              <ThemeToggle />
            </div>
          </div>
        </section>

        {/* Price Refresh */}
        <section aria-labelledby="price-refresh-heading" className="mb-6">
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Timer className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <h2 id="price-refresh-heading" className="text-sm font-semibold text-white">
                Price Refresh
              </h2>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-slate-400">
              Controls how often live prices are fetched from market data providers
              and broadcast to connected clients via WebSocket. Set to{' '}
              <strong className="text-slate-300">Manual</strong> to disable automatic
              refresh.
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Refresh interval</span>
              <RefreshIntervalControl />
            </div>
          </div>
        </section>

        {/* WebSocket */}
        <section aria-labelledby="websocket-heading" className="mb-6">
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Wifi className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <h2 id="websocket-heading" className="text-sm font-semibold text-white">
                Real-Time Updates
              </h2>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              Live price updates are streamed to the dashboard over WebSocket at{' '}
              <code className="rounded bg-slate-700 px-1 py-0.5 font-mono text-slate-300">
                /api/ws/prices
              </code>
              . The connection automatically reconnects with exponential backoff
              (1s → 30s) if the server becomes unavailable. The colored dot next to
              the Stock Watchlist heading reflects the current connection state.
            </p>
          </div>
        </section>

        {/* Price Alerts & Sound Settings */}
        <PriceAlertsPanel />
      </div>
    </div>
  );
}