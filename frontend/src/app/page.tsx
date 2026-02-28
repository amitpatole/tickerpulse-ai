'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import ErrorBoundary from '@/components/layout/ErrorBoundary';
import KPICards from '@/components/dashboard/KPICards';
import StockGrid from '@/components/dashboard/StockGrid';
import WatchlistTabs from '@/components/dashboard/WatchlistTabs';
import NewsFeed from '@/components/dashboard/NewsFeed';
import EarningsCalendar from '@/components/dashboard/EarningsCalendar';
import ProviderRateLimitPanel from '@/components/dashboard/ProviderRateLimitPanel';
import TopMovers from '@/components/dashboard/TopMovers';
import AlertsTable from '@/components/dashboard/AlertsTable';
import SentimentSummaryChart from '@/components/dashboard/SentimentSummaryChart';
import AIRatingsPanel from '@/components/dashboard/AIRatingsPanel';
import MarketMoodWidget from '@/components/dashboard/MarketMoodWidget';
import PortfolioChart from '@/components/dashboard/PortfolioChart';
import SectorBreakdown from '@/components/dashboard/SectorBreakdown';
import RefreshIntervalControl from '@/components/dashboard/RefreshIntervalControl';
import DashboardCustomizer from '@/components/dashboard/DashboardCustomizer';
import WSStatusIndicator from '@/components/ui/WSStatusIndicator';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useDashboardLayout, WIDGET_ZONES } from '@/hooks/useDashboardLayout';

export default function DashboardPage() {
  const [activeWatchlistId, setActiveWatchlistId] = useState<number>(1);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const router = useRouter();

  const {
    ratings,
    topMovers,
    alerts,
    news,
    summary,
    loading,
    error,
    wsStatus,
    refetch,
    lastPriceAt,
    wsPrices,
  } = useDashboardData(activeWatchlistId);

  const {
    isEnabled,
    isZoneVisible,
    toggleWidget,
    moveWidget,
    getSortedZone,
    resetLayout,
    syncing,
  } = useDashboardLayout();

  // Derived visibility flags used for responsive grid decisions
  const hasLeftWidgets  = isZoneVisible('left');
  const hasRightWidgets = isZoneVisible('right');

  // Sorted widget IDs within each zone (user-controlled order)
  const sortedRight    = getSortedZone(WIDGET_ZONES.right.ids);
  const sortedAnalysis = getSortedZone(WIDGET_ZONES.analysis.ids);
  const sortedTables   = getSortedZone(WIDGET_ZONES.tables.ids);

  return (
    <div className="flex flex-col">
      <Header title="Dashboard" subtitle="Market overview and stock watchlist" />

      <div className="flex-1 p-4 md:p-6">
        {/* Customize button */}
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => setCustomizerOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-700/60 hover:text-white"
            aria-label="Customize dashboard layout"
          >
            <SlidersIcon />
            Customize
          </button>
        </div>

        {/* KPI Cards Row */}
        {isEnabled('kpi-cards') && (
          <ErrorBoundary>
            <KPICards summary={summary} />
          </ErrorBoundary>
        )}

        {/* Rate Limit Indicator */}
        {isEnabled('rate-limit') && (
          <div className="mt-6">
            <ErrorBoundary>
              <ProviderRateLimitPanel />
            </ErrorBoundary>
          </div>
        )}

        {/* Main Content: Stock Grid + Sidebar */}
        {(hasLeftWidgets || hasRightWidgets) && (
          <div
            className={`mt-6 grid grid-cols-1 gap-6 ${
              hasLeftWidgets && hasRightWidgets
                ? 'xl:grid-cols-3'
                : 'xl:grid-cols-1'
            }`}
          >
            {/* Left column */}
            {hasLeftWidgets && (
              <div
                className={`flex flex-col gap-6 ${
                  hasRightWidgets ? 'xl:col-span-2' : 'xl:col-span-1'
                }`}
              >
                {isEnabled('stock-watchlist') && (
                  <div>
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-white">Stock Watchlist</h2>
                      <div className="flex items-center gap-3">
                        <WSStatusIndicator
                          status={wsStatus ?? 'connecting'}
                          lastUpdated={lastPriceAt ?? undefined}
                        />
                        <RefreshIntervalControl />
                      </div>
                    </div>
                    <WatchlistTabs
                      activeId={activeWatchlistId}
                      onSelect={setActiveWatchlistId}
                      onGroupsChanged={() => refetch()}
                    />
                    <ErrorBoundary>
                      <StockGrid
                        watchlistId={activeWatchlistId}
                        ratings={ratings}
                        onRefetch={refetch}
                        onRowClick={(ticker) => router.push(`/stocks/${ticker}`)}
                      />
                    </ErrorBoundary>
                  </div>
                )}

                {isEnabled('portfolio-chart') && (
                  <ErrorBoundary>
                    <PortfolioChart />
                  </ErrorBoundary>
                )}
              </div>
            )}

            {/* Right sidebar — rendered in user-defined order */}
            {hasRightWidgets && (
              <div className="flex flex-col gap-6 xl:col-span-1">
                {sortedRight.map((id) => {
                  if (!isEnabled(id)) return null;

                  if (id === 'sector-breakdown') {
                    return (
                      <ErrorBoundary key={id}>
                        <SectorBreakdown ratings={ratings} />
                      </ErrorBoundary>
                    );
                  }
                  if (id === 'market-mood') {
                    return (
                      <ErrorBoundary key={id}>
                        <MarketMoodWidget ratings={ratings} />
                      </ErrorBoundary>
                    );
                  }
                  if (id === 'news-feed') {
                    return (
                      <ErrorBoundary
                        key={id}
                        fallback={
                          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 text-center text-sm text-slate-500">
                            News feed unavailable.
                          </div>
                        }
                      >
                        <NewsFeed
                          articles={news}
                          loading={loading && news === null}
                          error={error}
                        />
                      </ErrorBoundary>
                    );
                  }
                  if (id === 'earnings-calendar') {
                    return (
                      <ErrorBoundary key={id}>
                        <EarningsCalendar watchlistId={activeWatchlistId} />
                      </ErrorBoundary>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </div>
        )}

        {/* Analysis Row */}
        {isZoneVisible('analysis') && (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {sortedAnalysis.map((id) => {
              if (!isEnabled(id)) return null;

              if (id === 'top-movers') {
                return (
                  <ErrorBoundary
                    key={id}
                    fallback={
                      <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 text-center text-sm text-slate-500">
                        Top movers unavailable.
                      </div>
                    }
                  >
                    <TopMovers data={topMovers} loading={loading && topMovers === null} />
                  </ErrorBoundary>
                );
              }
              if (id === 'sentiment-chart') {
                return (
                  <ErrorBoundary key={id}>
                    <SentimentSummaryChart ratings={ratings} />
                  </ErrorBoundary>
                );
              }
              return null;
            })}
          </div>
        )}

        {/* Data Tables */}
        {sortedTables.map((id) => {
          if (!isEnabled(id)) return null;

          if (id === 'ai-ratings') {
            return (
              <div key={id} className="mt-6">
                <ErrorBoundary>
                  <AIRatingsPanel ratings={ratings} wsPrices={wsPrices} />
                </ErrorBoundary>
              </div>
            );
          }
          if (id === 'alerts-table') {
            return (
              <div key={id} className="mt-6">
                <ErrorBoundary>
                  <AlertsTable initialData={alerts} />
                </ErrorBoundary>
              </div>
            );
          }
          return null;
        })}
      </div>

      {/* Dashboard customizer slide-over */}
      <DashboardCustomizer
        open={customizerOpen}
        onClose={() => setCustomizerOpen(false)}
        isEnabled={isEnabled}
        toggleWidget={toggleWidget}
        moveWidget={moveWidget}
        getSortedZone={getSortedZone}
        resetLayout={resetLayout}
        syncing={syncing}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline sliders icon
// ---------------------------------------------------------------------------

function SlidersIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3.5 w-3.5"
    >
      <path d="M14 2.75a.75.75 0 0 0-.75-.75H2.75a.75.75 0 0 0 0 1.5h10.5A.75.75 0 0 0 14 2.75ZM2 5.75a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 2 5.75ZM14 9.25a.75.75 0 0 0-.75-.75h-10.5a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 .75-.75ZM2 12.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z" />
    </svg>
  );
}
