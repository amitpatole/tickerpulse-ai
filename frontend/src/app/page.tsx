```typescript
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
import WSStatusIndicator from '@/components/ui/WSStatusIndicator';
import { useDashboardData } from '@/hooks/useDashboardData';

export default function DashboardPage() {
  const [activeWatchlistId, setActiveWatchlistId] = useState<number>(1);
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

  return (
    <div className="flex flex-col">
      <Header title="Dashboard" subtitle="Market overview and stock watchlist" />

      <div className="flex-1 p-4 md:p-6">
        {/* KPI Cards Row — summary prop eliminates 3 independent API calls */}
        <ErrorBoundary>
          <KPICards summary={summary} />
        </ErrorBoundary>

        {/* API Rate Limit Indicator */}
        <div className="mt-6">
          <ErrorBoundary>
            <ProviderRateLimitPanel />
          </ErrorBoundary>
        </div>

        {/* Main Content: Stock Grid + News Feed + Earnings */}
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Left: Stock Grid + Portfolio Chart (stacked) */}
          <div className="flex flex-col gap-6 xl:col-span-2">
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
            <ErrorBoundary>
              <PortfolioChart />
            </ErrorBoundary>
          </div>

          {/* Right sidebar: AI Panels + News Feed + Earnings */}
          <div className="flex flex-col gap-6 xl:col-span-1">
            <ErrorBoundary>
              <SectorBreakdown ratings={ratings} />
            </ErrorBoundary>
            <ErrorBoundary>
              <MarketMoodWidget ratings={ratings} />
            </ErrorBoundary>
            <ErrorBoundary
              fallback={
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 text-center text-sm text-slate-500">
                  News feed unavailable.
                </div>
              }
            >
              <NewsFeed articles={news} loading={loading && news === null} error={error} />
            </ErrorBoundary>
            <ErrorBoundary>
              <EarningsCalendar watchlistId={activeWatchlistId} />
            </ErrorBoundary>
          </div>
        </div>

        {/* Analysis Row: Top Movers + Sentiment Summary */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ErrorBoundary
            fallback={
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 text-center text-sm text-slate-500">
                Top movers unavailable.
              </div>
            }
          >
            <TopMovers data={topMovers} loading={loading && topMovers === null} />
          </ErrorBoundary>
          <ErrorBoundary>
            <SentimentSummaryChart ratings={ratings} />
          </ErrorBoundary>
        </div>

        {/* AI Ratings Panel */}
        <div className="mt-6">
          <ErrorBoundary>
            <AIRatingsPanel ratings={ratings} wsPrices={wsPrices} />
          </ErrorBoundary>
        </div>

        {/* Alerts Table — initialData eliminates cold-start loading flash */}
        <div className="mt-6">
          <ErrorBoundary>
            <AlertsTable initialData={alerts} />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
```