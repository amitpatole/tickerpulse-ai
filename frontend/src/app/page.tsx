```tsx
'use client';

import Header from '@/components/layout/Header';
import KPICards from '@/components/dashboard/KPICards';
import StockGrid from '@/components/dashboard/StockGrid';
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
import { useDashboardData } from '@/hooks/useDashboardData';

export default function DashboardPage() {
  const { ratings, alerts, summary } = useDashboardData();

  return (
    <div className="flex flex-col">
      <Header title="Dashboard" subtitle="Market overview and stock watchlist" />

      <div className="flex-1 p-4 md:p-6">
        {/* KPI Cards Row — summary prop eliminates 3 independent API calls */}
        <KPICards summary={summary} />

        {/* API Rate Limit Indicator */}
        <div className="mt-6">
          <ProviderRateLimitPanel />
        </div>

        {/* Main Content: Stock Grid + News Feed + Earnings */}
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Left: Stock Grid + Portfolio Chart (stacked) */}
          <div className="flex flex-col gap-6 xl:col-span-2">
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Stock Watchlist</h2>
                <RefreshIntervalControl />
              </div>
              <StockGrid />
            </div>
            <PortfolioChart />
          </div>

          {/* Right sidebar: AI Panels + News Feed + Earnings */}
          <div className="flex flex-col gap-6 xl:col-span-1">
            <SectorBreakdown ratings={ratings} />
            <MarketMoodWidget ratings={ratings} />
            <NewsFeed />
            <EarningsCalendar />
          </div>
        </div>

        {/* Analysis Row: Top Movers + Sentiment Summary */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <TopMovers />
          <SentimentSummaryChart />
        </div>

        {/* AI Ratings Panel */}
        <div className="mt-6">
          <AIRatingsPanel ratings={ratings} />
        </div>

        {/* Alerts Table — initialData eliminates cold-start loading flash */}
        <div className="mt-6">
          <AlertsTable initialData={alerts} />
        </div>
      </div>
    </div>
  );
}
```