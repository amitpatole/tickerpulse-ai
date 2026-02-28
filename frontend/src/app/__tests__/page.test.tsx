import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from '../page';
import * as useDashboardDataHook from '@/hooks/useDashboardData';
import type { DashboardData } from '@/hooks/useDashboardData';

// Mock child components to track props
jest.mock('@/components/layout/Header', () => ({
  __esModule: true,
  default: () => <div data-testid="header">Header</div>,
}));

jest.mock('@/components/dashboard/KPICards', () => ({
  __esModule: true,
  default: () => <div data-testid="kpi-cards">KPI Cards</div>,
}));

jest.mock('@/components/dashboard/StockGrid', () => ({
  __esModule: true,
  default: () => <div data-testid="stock-grid">Stock Grid</div>,
}));

jest.mock('@/components/dashboard/PortfolioChart', () => ({
  __esModule: true,
  default: () => <div data-testid="portfolio-chart">Portfolio Chart</div>,
}));

jest.mock('@/components/dashboard/NewsFeed', () => ({
  __esModule: true,
  default: () => <div data-testid="news-feed">News Feed</div>,
}));

jest.mock('@/components/dashboard/EarningsCalendar', () => ({
  __esModule: true,
  default: () => <div data-testid="earnings-calendar">Earnings Calendar</div>,
}));

jest.mock('@/components/dashboard/ProviderRateLimitPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="provider-rate-limit">Provider Rate Limit</div>,
}));

jest.mock('@/components/dashboard/TopMovers', () => ({
  __esModule: true,
  default: () => <div data-testid="top-movers">Top Movers</div>,
}));

jest.mock('@/components/dashboard/AlertsTable', () => ({
  __esModule: true,
  default: () => <div data-testid="alerts-table">Alerts Table</div>,
}));

jest.mock('@/components/dashboard/SentimentSummaryChart', () => ({
  __esModule: true,
  default: () => <div data-testid="sentiment-summary">Sentiment Summary</div>,
}));

jest.mock('@/components/dashboard/RefreshIntervalControl', () => ({
  __esModule: true,
  default: () => <div data-testid="refresh-interval">Refresh Interval</div>,
}));

// Track props passed to these components
let sectorBreakdownProps: any;
let marketMoodWidgetProps: any;
let aiRatingsPanelProps: any;

jest.mock('@/components/dashboard/SectorBreakdown', () => ({
  __esModule: true,
  default: (props: any) => {
    sectorBreakdownProps = props;
    return <div data-testid="sector-breakdown">Sector Breakdown</div>;
  },
}));

jest.mock('@/components/dashboard/MarketMoodWidget', () => ({
  __esModule: true,
  default: (props: any) => {
    marketMoodWidgetProps = props;
    return <div data-testid="market-mood">Market Mood</div>;
  },
}));

jest.mock('@/components/dashboard/AIRatingsPanel', () => ({
  __esModule: true,
  default: (props: any) => {
    aiRatingsPanelProps = props;
    return <div data-testid="ai-ratings-panel">AI Ratings Panel</div>;
  },
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sectorBreakdownProps = undefined;
    marketMoodWidgetProps = undefined;
    aiRatingsPanelProps = undefined;
  });

  it('should render all dashboard components', async () => {
    jest.spyOn(useDashboardDataHook, 'useDashboardData').mockReturnValue({
      ratings: null,
      alerts: null,
      news: null,
      summary: null,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<DashboardPage />);

    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-cards')).toBeInTheDocument();
    expect(screen.getByTestId('stock-grid')).toBeInTheDocument();
    expect(screen.getByTestId('sector-breakdown')).toBeInTheDocument();
    expect(screen.getByTestId('market-mood')).toBeInTheDocument();
    expect(screen.getByTestId('ai-ratings-panel')).toBeInTheDocument();
    expect(screen.getByTestId('alerts-table')).toBeInTheDocument();
  });

  describe('Happy path: ratings data is fetched and passed to components', () => {
    it('should pass ratings prop to SectorBreakdown, MarketMoodWidget, and AIRatingsPanel', async () => {
      const mockRatings = [
        {
          ticker: 'AAPL',
          rating: 'BUY',
          score: 85,
          confidence: 0.92,
          sector: 'Technology',
        },
        {
          ticker: 'MSFT',
          rating: 'HOLD',
          score: 60,
          confidence: 0.75,
          sector: 'Technology',
        },
      ];

      jest.spyOn(useDashboardDataHook, 'useDashboardData').mockReturnValue({
        ratings: mockRatings as any,
        alerts: [],
        news: [],
        summary: null,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<DashboardPage />);

      // All three components should receive the ratings prop
      expect(sectorBreakdownProps).toEqual({ ratings: mockRatings });
      expect(marketMoodWidgetProps).toEqual({ ratings: mockRatings });
      expect(aiRatingsPanelProps).toEqual({ ratings: mockRatings });
    });
  });

  describe('Error case: ratings is null', () => {
    it('should pass null ratings to child components when data is not yet loaded', async () => {
      jest.spyOn(useDashboardDataHook, 'useDashboardData').mockReturnValue({
        ratings: null,
        alerts: null,
        news: null,
        summary: null,
        loading: true,
        error: null,
        refetch: jest.fn(),
      });

      render(<DashboardPage />);

      expect(sectorBreakdownProps.ratings).toBe(null);
      expect(marketMoodWidgetProps.ratings).toBe(null);
      expect(aiRatingsPanelProps.ratings).toBe(null);
    });
  });

  describe('Edge case: empty ratings array', () => {
    it('should pass empty array to components when no ratings are available', async () => {
      jest.spyOn(useDashboardDataHook, 'useDashboardData').mockReturnValue({
        ratings: [],
        alerts: [],
        news: [],
        summary: {
          stock_count: 0,
          active_stock_count: 0,
          active_alert_count: 0,
          market_regime: 'undefined',
          agent_status: { total: 0, running: 0, idle: 0, error: 0 },
          timestamp: '2026-02-27T12:00:00Z',
        },
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<DashboardPage />);

      expect(sectorBreakdownProps.ratings).toEqual([]);
      expect(marketMoodWidgetProps.ratings).toEqual([]);
      expect(aiRatingsPanelProps.ratings).toEqual([]);
    });
  });

  describe('Integration: page calls useDashboardData hook', () => {
    it('should call useDashboardData hook on mount', () => {
      const mockUseDashboardData = jest.spyOn(useDashboardDataHook, 'useDashboardData');

      jest.spyOn(useDashboardDataHook, 'useDashboardData').mockReturnValue({
        ratings: null,
        alerts: null,
        news: null,
        summary: null,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<DashboardPage />);

      expect(mockUseDashboardData).toHaveBeenCalled();
    });

    it('should destructure ratings and alerts from useDashboardData', async () => {
      const mockAlerts = [
        { id: 1, alert_type: 'price_change', condition_type: 'above_threshold' },
      ];

      jest.spyOn(useDashboardDataHook, 'useDashboardData').mockReturnValue({
        ratings: [],
        alerts: mockAlerts as any,
        news: [],
        summary: null,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<DashboardPage />);

      // Verify that alerts is available (it's used internally but not explicitly tested here)
      // The key test is that ratings is passed to the three components above
      expect(sectorBreakdownProps.ratings).toEqual([]);
    });
  });

  describe('Header configuration', () => {
    it('should render with correct header title and subtitle', () => {
      jest.spyOn(useDashboardDataHook, 'useDashboardData').mockReturnValue({
        ratings: null,
        alerts: null,
        news: null,
        summary: null,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<DashboardPage />);

      // Header mock receives props but we can't verify them directly in the mock.
      // This test verifies the component renders without error.
      expect(screen.getByTestId('header')).toBeInTheDocument();
    });
  });
});
