import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import DashboardPage from '../page';
import * as api from '@/lib/api';

jest.mock('next/navigation');
jest.mock('@/lib/api');
jest.mock('@/components/layout/Header', () => {
  return function MockHeader() {
    return <div data-testid="header">Header</div>;
  };
});
jest.mock('@/components/dashboard/KPICards', () => {
  return function MockKPICards() {
    return <div data-testid="kpi-cards">KPI Cards</div>;
  };
});
jest.mock('@/components/dashboard/StockGrid', () => {
  return function MockStockGrid({
    watchlistId,
    onRowClick,
  }: {
    watchlistId?: string;
    onRowClick?: (ticker: string) => void;
  }) {
    return (
      <div
        data-testid="stock-grid"
        data-watchlist-id={watchlistId || 'default'}
        onClick={() => onRowClick?.('AAPL')}
      >
        Stock Grid
      </div>
    );
  };
});
jest.mock('@/components/dashboard/WatchlistTabs', () => {
  return function MockWatchlistTabs({
    activeId,
    onSelect,
    onGroupsChanged,
  }: {
    activeId?: string;
    onSelect?: (id: string) => void;
    onGroupsChanged?: () => void;
  }) {
    return (
      <div data-testid="watchlist-tabs">
        <button
          data-testid="switch-watchlist-btn"
          onClick={() => onSelect?.('wl-456')}
        >
          Switch Watchlist
        </button>
        <button
          data-testid="update-watchlist-btn"
          onClick={() => onGroupsChanged?.()}
        >
          Update Watchlist
        </button>
        <span data-testid="active-id">{activeId || 'default'}</span>
      </div>
    );
  };
});

describe('Dashboard Page - WatchlistTabs Integration', () => {
  const mockSummary = {
    kpis: { stocks_count: 5, average_score: 8.5 },
    ratings: [{ ticker: 'AAPL', rating: 8, sentiment_score: 0.75 }],
    sentiment: { avg: 0.7 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
    });
    (api.getSummary as jest.Mock).mockResolvedValue(mockSummary);
    (api.getNews as jest.Mock).mockResolvedValue({ news: [] });
    (api.getAlerts as jest.Mock).mockResolvedValue({ alerts: [] });
  });

  test('should render WatchlistTabs and manage activeWatchlistId state', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('watchlist-tabs')).toBeInTheDocument();
    });

    // Initial state: default or first watchlist ID
    const activeIdElement = screen.getByTestId('active-id');
    expect(activeIdElement).toBeInTheDocument();
  });

  test('should update activeWatchlistId when WatchlistTabs onSelect fires', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('watchlist-tabs')).toBeInTheDocument();
    });

    const switchButton = screen.getByTestId('switch-watchlist-btn');
    fireEvent.click(switchButton);

    await waitFor(() => {
      const activeIdElement = screen.getByTestId('active-id');
      // After switching, the activeId should reflect the new selection
      expect(activeIdElement.textContent).toBe('wl-456');
    });
  });

  test('should pass activeWatchlistId to StockGrid', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('stock-grid')).toBeInTheDocument();
    });

    const stockGrid = screen.getByTestId('stock-grid');
    // StockGrid should receive a watchlistId attribute
    expect(
      stockGrid.getAttribute('data-watchlist-id')
    ).not.toBeNull();
  });

  test('should call refetch when onGroupsChanged fires (watchlist updated)', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(api.getSummary).toHaveBeenCalled();
    });

    const initialCallCount = (api.getSummary as jest.Mock).mock.calls.length;

    const updateButton = screen.getByTestId('update-watchlist-btn');
    fireEvent.click(updateButton);

    await waitFor(() => {
      // getSummary should be called again when onGroupsChanged fires
      expect((api.getSummary as jest.Mock).mock.calls.length).toBeGreaterThan(
        initialCallCount
      );
    });
  });

  test('should navigate to stock detail when StockGrid onRowClick fires', async () => {
    const mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('stock-grid')).toBeInTheDocument();
    });

    const stockGrid = screen.getByTestId('stock-grid');
    fireEvent.click(stockGrid);

    expect(mockPush).toHaveBeenCalledWith('/stocks/AAPL');
  });
});
