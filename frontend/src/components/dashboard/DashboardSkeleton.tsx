'use client';

/**
 * Unified loading skeleton shown while the dashboard's initial data fetch
 * completes.  Mirrors the actual page grid layout so the skeleton matches
 * the fully-loaded state structurally.
 */
export default function DashboardSkeleton() {
  return (
    <div className="flex-1 animate-pulse p-4 md:p-6" aria-busy="true" aria-label="Loading dashboard">
      {/* KPI Cards row — 4 cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 rounded bg-slate-700" />
                <div className="h-8 w-20 rounded bg-slate-700" />
                <div className="h-3 w-32 rounded bg-slate-700" />
              </div>
              <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-700" />
            </div>
          </div>
        ))}
      </div>

      {/* Provider rate limit panel */}
      <div className="mt-6 h-20 rounded-xl border border-slate-700/50 bg-slate-800/50" />

      {/* Main 3-column grid */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left: stock grid + portfolio chart */}
        <div className="flex flex-col gap-6 xl:col-span-2">
          <div className="space-y-3 rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
            <div className="flex items-center justify-between">
              <div className="h-4 w-28 rounded bg-slate-700" />
              <div className="h-7 w-24 rounded bg-slate-700" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-28 rounded-lg bg-slate-700/50" />
              ))}
            </div>
          </div>
          <div className="h-48 rounded-xl border border-slate-700/50 bg-slate-800/50" />
        </div>

        {/* Right sidebar: sector breakdown + mood + news */}
        <div className="flex flex-col gap-6 xl:col-span-1">
          <div className="h-56 rounded-xl border border-slate-700/50 bg-slate-800/50" />
          <div className="h-44 rounded-xl border border-slate-700/50 bg-slate-800/50" />
          <div className="h-64 rounded-xl border border-slate-700/50 bg-slate-800/50" />
          <div className="h-40 rounded-xl border border-slate-700/50 bg-slate-800/50" />
        </div>
      </div>

      {/* Analysis row: top movers + sentiment */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-48 rounded-xl border border-slate-700/50 bg-slate-800/50" />
        <div className="h-48 rounded-xl border border-slate-700/50 bg-slate-800/50" />
      </div>

      {/* AI ratings panel */}
      <div className="mt-6 space-y-2 rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
        <div className="h-5 w-24 rounded bg-slate-700" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-slate-700/50" />
        ))}
      </div>

      {/* Alerts table */}
      <div className="mt-6 space-y-2 rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
        <div className="h-5 w-20 rounded bg-slate-700" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-slate-700/50" />
        ))}
      </div>
    </div>
  );
}
