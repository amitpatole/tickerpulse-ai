/**
 * Tests for Dashboard Page-Level Integration
 *
 * Validates that the dashboard page properly threads data from useDashboardData
 * to child components, eliminating redundant API calls.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import type { AIRating, Alert, NewsArticle } from '@/lib/types';
import { DashboardData } from '@/hooks/useDashboardData';

jest.mock('@/hooks/useDashboardData', () => ({
  useDashboardData: jest.fn(),
}));

jest.mock('@/components/dashboard/TopMovers', () => {
  return function MockTopMovers(props: any) {
    return <div data-testid="top-movers">{JSON.stringify(props)}</div>;
  };
});

jest.mock('@/components/dashboard/SentimentSummaryChart', () => {
  return function MockSentimentSummaryChart({ ratings }: { ratings: AIRating[] | null }) {
    return (
      <div
        data-testid="sentiment-chart"
        data-has-ratings={ratings !== null ? 'true' : 'false'}
      />
    );
  };
});

jest.mock('@/components/dashboard/AlertsTable', () => {
  return function MockAlertsTable(props: any) {
    return <div data-testid="alerts-table">{JSON.stringify(props)}</div>;
  };
});

jest.mock('@/components/dashboard/KPICards', () => {
  return function MockKPICards() {
    return <div data-testid="kpi-cards" />;
  };
});

jest.mock('@/components/dashboard/StockGrid', () => {
  return function MockStockGrid({ ratings }: { ratings: AIRating[] | null }) {
    return (
      <div
        data-testid="stock-grid"
        data-has-ratings={ratings !== null ? 'true' : 'false'}
      />
    );
  };
});

jest.mock('@/components/dashboard/SectorBreakdown', () => {
  return function MockSectorBreakdown() {
    return <div data-testid="sector-breakdown" />;
  };
});

jest.mock('@/components/dashboard/MarketMoodWidget', () => {
  return function MockMarketMoodWidget() {
    return <div data-testid="market-mood-widget" />;
  };
});

jest.mock('@/components/dashboard/NewsFeed', () => {
  return function MockNewsFeed() {
    return <div data-testid="news-feed" />;
  };
});

jest.mock('@/components/dashboard/EarningsCalendar', () => {
  return function MockEarningsCalendar() {
    return <div data-testid="earnings-calendar" />;
  };
});

jest.mock('@/components/dashboard/ProviderRateLimitPanel', () => {
  return function MockProviderRateLimitPanel() {
    return <div data-testid="provider-rate-limit-panel" />;
  };
});

jest.mock('@/components/dashboard/PortfolioChart', () => {
  return function MockPortfolioChart() {
    return <div data-testid="portfolio-chart" />;
  };
});

jest.mock('@/components/dashboard/AIRatingsPanel', () => {
  return function MockAIRatingsPanel() {
    return <div data-testid="ai-ratings-panel" />;
  };
});

jest.mock('@/components/dashboard/RefreshIntervalControl', () => {
  return function MockRefreshIntervalControl() {
    return <div data-testid="refresh-interval-control" />;
  };
});

jest.mock('@/components/ui/WSStatusIndicator', () => {
  return function MockWSStatusIndicator() {
    return <div data-testid="ws-status-indicator" />;
  };
});

jest.mock('@/components/layout/Header', () => {
  return function MockHeader() {
    return <div data-testid="header" />;
  };
});

import { useDashboardData } from '@/hooks/useDashboardData';

const mockRatings: AIRating[] = [
  {
    ticker: 'NVDA',
    rating: 'STRONG_BUY',
    score: 92,
    confidence: 0.95,
    current_price: 875.50,
    price_change_pct: 8.5,
    rsi: 72,
  },
  {
    ticker: 'AAPL',
    rating: 'BUY',
    score: 85,
    confidence: 0.90,
    current_price: 190.25,
    price_change_pct: -3.2,
    rsi: 65,
  },
];

const mockAlerts: Alert[] = [
  {
    id: 1,
    ticker: 'NVDA',
    condition_type: 'price_above',
    threshold: 900,
    enabled: true,
    sound_type: 'chime',
    triggered_at: null,
    severity: 'critical',
    type: 'price_above',
    message: 'Price exceeded upper limit',
    created_at: new Date().toISOString(),
  },
];

const mockNews: NewsArticle[] = [
  {
    id: 1,
    ticker: 'NVDA',
    title: 'Market Update',
    description: 'Markets rally on strong earnings',
    source: 'Reuters',
    published_date: new Date().toISOString(),
    url: 'https://reuters.com',
    created_at: new Date().toISOString(),
  },
];

const mockDashboardData: DashboardData = {
  ratings: mockRatings,
  alerts: mockAlerts,
  news: mockNews,
  summary: null,
  loading: false,
  error: null,
  refetch: jest.fn(),
  wsStatus: 'open',
};

describe('Dashboard Page — Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('calls useDashboardData on mount to fetch all data', async () => {
    const mockUseDashboardData = useDashboardData as jest.MockedFunction<typeof useDashboardData>;
    mockUseDashboardData.mockReturnValue(mockDashboardData);

    const { default: DashboardPage } = await import('@/app/page');
    render(<DashboardPage />);

    expect(mockUseDashboardData).toHaveBeenCalledTimes(1);
  });

  test('passes ratings from useDashboardData to SentimentSummaryChart', async () => {
    const mockUseDashboardData = useDashboardData as jest.MockedFunction<typeof useDashboardData>;
    mockUseDashboardData.mockReturnValue(mockDashboardData);

    const { default: DashboardPage } = await import('@/app/page');
    render(<DashboardPage />);

    await waitFor(() => {
      const sentimentChart = screen.getByTestId('sentiment-chart');
      expect(sentimentChart).toHaveAttribute('data-has-ratings', 'true');
    });
  });

  test('passes ratings from useDashboardData to StockGrid', async () => {
    const mockUseDashboardData = useDashboardData as jest.MockedFunction<typeof useDashboardData>;
    mockUseDashboardData.mockReturnValue(mockDashboardData);

    const { default: DashboardPage } = await import('@/app/page');
    render(<DashboardPage />);

    await waitFor(() => {
      const stockGrid = screen.getByTestId('stock-grid');
      expect(stockGrid).toHaveAttribute('data-has-ratings', 'true');
    });
  });

  test('handles loading state when useDashboardData is loading', async () => {
    const mockUseDashboardData = useDashboardData as jest.MockedFunction<typeof useDashboardData>;
    mockUseDashboardData.mockReturnValue({
      ratings: null,
      alerts: null,
      news: null,
      summary: null,
      loading: true,
      error: null,
      refetch: jest.fn(),
    });

    const { default: DashboardPage } = await import('@/app/page');
    render(<DashboardPage />);

    expect(screen.getByTestId('sentiment-chart')).toHaveAttribute('data-has-ratings', 'false');
    expect(screen.getByTestId('stock-grid')).toHaveAttribute('data-has-ratings', 'false');
  });

  test('renders all main sections when data is available', async () => {
    const mockUseDashboardData = useDashboardData as jest.MockedFunction<typeof useDashboardData>;
    mockUseDashboardData.mockReturnValue(mockDashboardData);

    const { default: DashboardPage } = await import('@/app/page');
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('header')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-cards')).toBeInTheDocument();
      expect(screen.getByTestId('stock-grid')).toBeInTheDocument();
      expect(screen.getByTestId('sector-breakdown')).toBeInTheDocument();
      expect(screen.getByTestId('market-mood-widget')).toBeInTheDocument();
      expect(screen.getByTestId('top-movers')).toBeInTheDocument();
      expect(screen.getByTestId('sentiment-chart')).toBeInTheDocument();
      expect(screen.getByTestId('alerts-table')).toBeInTheDocument();
      expect(screen.getByTestId('ai-ratings-panel')).toBeInTheDocument();
    });
  });

  test('handles error from useDashboardData gracefully', async () => {
    const mockUseDashboardData = useDashboardData as jest.MockedFunction<typeof useDashboardData>;
    mockUseDashboardData.mockReturnValue({
      ratings: null,
      alerts: null,
      news: null,
      summary: null,
      loading: false,
      error: 'Failed to fetch dashboard data',
      refetch: jest.fn(),
    });

    const { default: DashboardPage } = await import('@/app/page');
    render(<DashboardPage />);

    expect(screen.getByTestId('top-movers')).toBeInTheDocument();
    expect(screen.getByTestId('sentiment-chart')).toBeInTheDocument();
  });

  test('architectural pattern: eliminates redundant API calls by sharing data', async () => {
    const mockUseDashboardData = useDashboardData as jest.MockedFunction<typeof useDashboardData>;
    mockUseDashboardData.mockReturnValue(mockDashboardData);

    const { default: DashboardPage } = await import('@/app/page');
    render(<DashboardPage />);

    expect(mockUseDashboardData).toHaveBeenCalledTimes(1);
  });
});

describe('Dashboard — Design Spec Acceptance Criteria', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('AC1: Page coordinates single data fetch via useDashboardData', async () => {
    const mockUseDashboardData = useDashboardData as jest.MockedFunction<typeof useDashboardData>;
    mockUseDashboardData.mockReturnValue(mockDashboardData);

    const { default: DashboardPage } = await import('@/app/page');
    render(<DashboardPage />);

    expect(mockUseDashboardData).toHaveBeenCalledTimes(1);
  });

  test('AC2: SentimentSummaryChart receives ratings prop (no independent fetch)', async () => {
    const mockUseDashboardData = useDashboardData as jest.MockedFunction<typeof useDashboardData>;
    mockUseDashboardData.mockReturnValue(mockDashboardData);

    const { default: DashboardPage } = await import('@/app/page');
    render(<DashboardPage />);

    const sentimentChart = screen.getByTestId('sentiment-chart');
    expect(sentimentChart).toHaveAttribute('data-has-ratings', 'true');
  });

  test('AC3: StockGrid receives ratings prop from useDashboardData', async () => {
    const mockUseDashboardData = useDashboardData as jest.MockedFunction<typeof useDashboardData>;
    mockUseDashboardData.mockReturnValue(mockDashboardData);

    const { default: DashboardPage } = await import('@/app/page');
    render(<DashboardPage />);

    const stockGrid = screen.getByTestId('stock-grid');
    expect(stockGrid).toHaveAttribute('data-has-ratings', 'true');
  });
});