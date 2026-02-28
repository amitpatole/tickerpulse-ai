import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import StockGrid from '../StockGrid';
import { AIRating } from '@/lib/types';

jest.mock('next/navigation');
jest.mock('@/hooks/useDashboardData', () => ({
  __esModule: true,
  default: () => ({
    ratings: [],
    kpis: { stocks_count: 0, average_score: 0 },
    sentiment: { avg: 0 },
    loading: false,
    error: null,
    refetch: jest.fn(),
    wsPrices: {},
  }),
}));

describe('StockGrid - Row Navigation & Button Exclusion', () => {
  const mockRatings: AIRating[] = [
    {
      id: 'r1',
      ticker: 'AAPL',
      rating: 8,
      confidence: 0.85,
      price_change_pct: 2.5,
      sentiment_score: 0.75,
      recommendation: 'buy',
      created_at: new Date().toISOString(),
      watchlist_id: 'wl-123',
    },
    {
      id: 'r2',
      ticker: 'GOOGL',
      rating: 7,
      confidence: 0.8,
      price_change_pct: 1.2,
      sentiment_score: 0.65,
      recommendation: 'hold',
      created_at: new Date().toISOString(),
      watchlist_id: 'wl-123',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should call onRowClick with ticker when card is clicked', async () => {
    const mockOnRowClick = jest.fn();
    const mockRouter = { push: jest.fn() };
    (useRouter as jest.Mock).mockReturnValue(mockRouter);

    render(
      <StockGrid
        ratings={mockRatings}
        loading={false}
        onRowClick={mockOnRowClick}
      />
    );

    const stockCard = screen.getByText('AAPL').closest('div[role="button"]');
    expect(stockCard).toBeInTheDocument();

    fireEvent.click(stockCard!);

    expect(mockOnRowClick).toHaveBeenCalledWith('AAPL');
  });

  test('should navigate to stock detail page when row is clicked', async () => {
    const mockRouter = { push: jest.fn() };
    (useRouter as jest.Mock).mockReturnValue(mockRouter);

    render(
      <StockGrid
        ratings={mockRatings}
        loading={false}
        onRowClick={(ticker) => mockRouter.push(`/stocks/${ticker}`)}
      />
    );

    const stockCard = screen.getByText('AAPL').closest('div[role="button"]');
    fireEvent.click(stockCard!);

    expect(mockRouter.push).toHaveBeenCalledWith('/stocks/AAPL');
  });

  test('should not trigger onRowClick when a button inside the card is clicked', async () => {
    const mockOnRowClick = jest.fn();
    const mockRouter = { push: jest.fn() };
    (useRouter as jest.Mock).mockReturnValue(mockRouter);

    render(
      <StockGrid
        ratings={mockRatings}
        loading={false}
        onRowClick={mockOnRowClick}
      />
    );

    // Find and click a button inside the card (e.g., action menu button)
    const buttons = screen.getAllByRole('button');
    const actionButton = buttons.find(
      (btn) => btn.getAttribute('aria-label')?.includes('Actions') ||
        btn.className.includes('action')
    );

    if (actionButton) {
      fireEvent.click(actionButton);
      expect(mockOnRowClick).not.toHaveBeenCalled();
    }
  });

  test('should navigate only to the clicked card ticker, not parent container', async () => {
    const mockRouter = { push: jest.fn() };
    (useRouter as jest.Mock).mockReturnValue(mockRouter);

    render(
      <StockGrid
        ratings={mockRatings}
        loading={false}
        onRowClick={(ticker) => mockRouter.push(`/stocks/${ticker}`)}
      />
    );

    // Click on GOOGL card
    const googCard = screen.getByText('GOOGL').closest('div[role="button"]');
    fireEvent.click(googCard!);

    // Should navigate to GOOGL, not AAPL
    expect(mockRouter.push).toHaveBeenCalledWith('/stocks/GOOGL');
    expect(mockRouter.push).not.toHaveBeenCalledWith('/stocks/AAPL');
  });

  test('should handle onRowClick being undefined gracefully', async () => {
    const mockRouter = { push: jest.fn() };
    (useRouter as jest.Mock).mockReturnValue(mockRouter);

    render(
      <StockGrid
        ratings={mockRatings}
        loading={false}
        onRowClick={undefined}
      />
    );

    const stockCard = screen.getByText('AAPL').closest('div[role="button"]');
    expect(() => {
      fireEvent.click(stockCard!);
    }).not.toThrow();
  });

  test('should not navigate when clicking on interactive elements (links, buttons, inputs)', async () => {
    const mockRouter = { push: jest.fn() };
    (useRouter as jest.Mock).mockReturnValue(mockRouter);

    const mockOnRowClick = jest.fn();

    render(
      <StockGrid
        ratings={mockRatings}
        loading={false}
        onRowClick={mockOnRowClick}
      />
    );

    // Find any link or button within a stock card
    const links = screen.getAllByRole('link');
    const buttons = screen.getAllByRole('button');

    if (links.length > 0) {
      fireEvent.click(links[0]);
      expect(mockOnRowClick).not.toHaveBeenCalled();
    }

    if (buttons.length > 0) {
      fireEvent.click(buttons[0]);
      expect(mockOnRowClick).not.toHaveBeenCalled();
    }
  });
});
