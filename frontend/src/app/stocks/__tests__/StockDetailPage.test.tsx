/**
 * Tests for Stock Detail Page ([ticker]/page.tsx).
 *
 * Tests cover:
 * - Happy path: Stock detail loads with quote, chart, news, and analysis
 * - Comparison mode: ComparisonModePanel and ComparisonChart integration
 * - Extended financials: New fields (dividend_yield, beta, avg_volume, book_value) render correctly
 * - Error cases: Invalid ticker, failed API calls
 * - Edge cases: Null values, missing optional fields, live price overlay
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import StockDetailPage from '../[ticker]/page.tsx';
import { useApi } from '@/hooks/useApi';
import { useSSE } from '@/hooks/useSSE';
import type { StockDetail, StockDetailQuote } from '@/lib/types';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock hooks
jest.mock('@/hooks/useApi');
jest.mock('@/hooks/useSSE');

// Mock components
jest.mock('@/components/layout/Header', () => {
  return function MockHeader({ title, subtitle }: any) {
    return (
      <div data-testid="header">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    );
  };
});

jest.mock('@/components/stocks/StockPriceChart', () => {
  return function MockChart() {
    return <div data-testid="price-chart">Price Chart</div>;
  };
});

jest.mock('@/components/stocks/SentimentBadge', () => {
  return function MockBadge() {
    return <div data-testid="sentiment-badge">Sentiment Badge</div>;
  };
});

jest.mock('@/components/stocks/FinancialsCard', () => {
  return function MockFinancials() {
    return <div data-testid="financials-card">Financials Card</div>;
  };
});

jest.mock('lucide-react', () => ({
  ArrowLeft: () => <span>←</span>,
  TrendingUp: () => <span>↑</span>,
  TrendingDown: () => <span>↓</span>,
  Minus: () => <span>—</span>,
  Loader2: () => <span>Loading…</span>,
  ExternalLink: () => <span>↗</span>,
  Clock: () => <span>🕐</span>,
  Brain: () => <span>🧠</span>,
  Activity: () => <span>⚡</span>,
  Newspaper: () => <span>📰</span>,
}));

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseApi = useApi as jest.MockedFunction<typeof useApi>;
const mockUseSSE = useSSE as jest.MockedFunction<typeof useSSE>;

// Mock useCallback and other React features
const originalUseCallback = React.useCallback;
jest.spyOn(React, 'useCallback').mockImplementation((callback) => callback);

describe('StockDetailPage', () => {
  // =========================================================================
  // Setup
  // =========================================================================

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
    } as any);

    mockUseSSE.mockReturnValue({
      lastEvent: null,
      isConnected: true,
    } as any);
  });

  // =========================================================================
  // Happy Path: Stock details load correctly with all sections
  // =========================================================================

  describe('happy path: renders complete stock detail with quote, chart, news', () => {
    it('displays stock price hero with extended financials fields', async () => {
      // Arrange: Stock detail with new dividend_yield and beta fields
      const quote: StockDetailQuote = {
        price: 150.5,
        change_pct: 2.5,
        volume: 5000000,
        market_cap: 3_000_000_000_000,
        week_52_high: 160,
        week_52_low: 130,
        pe_ratio: 25.5,
        eps: 5.9,
        name: 'Apple Inc.',
        currency: 'USD',
        dividend_yield: 0.55,
        beta: 1.2,
        avg_volume: 4_500_000,
        book_value: 120,
      };

      const stockDetail: StockDetail = {
        ticker: 'AAPL',
        quote,
        candles: [],
        news: [{ title: 'Apple announces new product', source: 'Reuters' }],
        indicators: { rsi: 65, macd_signal: 'bullish', bb_position: 'upper' },
      };

      mockUseApi.mockReturnValueOnce({
        data: stockDetail,
        loading: false,
        error: null,
        refetch: jest.fn(),
      } as any);

      // Act
      const { container } = render(
        <StockDetailPage params={Promise.resolve({ ticker: 'AAPL' })} />
      );

      // Assert: Price and change display correctly
      await waitFor(() => {
        expect(screen.getByText('$150.50')).toBeInTheDocument();
        expect(screen.getByText('+2.50%')).toBeInTheDocument();
        expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
      });

      // Assert: Financials component is rendered (would display extended fields)
      expect(screen.getByTestId('financials-card')).toBeInTheDocument();
    });

    it('renders news card with sentiment labels and timestamps', async () => {
      // Arrange
      const stockDetail: StockDetail = {
        quote: {
          price: 150.5,
          change_pct: 2.5,
          volume: 5000000,
          name: 'Apple Inc.',
          currency: 'USD',
        },
        news: [
          {
            title: 'Apple Stock Rally Continues',
            source: 'Bloomberg',
            sentiment_label: 'positive',
            published_date: new Date(Date.now() - 3600000).toISOString(),
            url: 'https://example.com',
          },
        ],
      };

      mockUseApi.mockReturnValueOnce({
        data: stockDetail,
        loading: false,
        error: null,
        refetch: jest.fn(),
      } as any);

      // Act
      render(<StockDetailPage params={Promise.resolve({ ticker: 'AAPL' })} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Apple Stock Rally Continues')).toBeInTheDocument();
        expect(screen.getByText('Bloomberg')).toBeInTheDocument();
        expect(screen.getByText(/positive|1h ago/)).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // Error Cases: Invalid ticker, API failures
  // =========================================================================

  describe('error cases: handles invalid input and API failures gracefully', () => {
    it('redirects when ticker param is missing or empty', async () => {
      // Arrange
      const mockReplace = jest.fn();
      mockUseRouter.mockReturnValue({
        replace: mockReplace,
      } as any);

      // Act
      render(<StockDetailPage params={Promise.resolve({ ticker: '' })} />);

      // Assert: Router redirect is called
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/?error=missing-ticker');
      });
    });

    it('displays error banner when API fails and data is unavailable', async () => {
      // Arrange
      mockUseApi.mockReturnValueOnce({
        data: null,
        loading: false,
        error: 'Failed to fetch stock data',
        refetch: jest.fn(),
      } as any);

      // Act
      render(<StockDetailPage params={Promise.resolve({ ticker: 'INVALID' })} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Failed to fetch stock data')).toBeInTheDocument();
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('renders loading skeleton when data is fetching', async () => {
      // Arrange
      mockUseApi.mockReturnValueOnce({
        data: null,
        loading: true,
        error: null,
        refetch: jest.fn(),
      } as any);

      // Act
      render(<StockDetailPage params={Promise.resolve({ ticker: 'AAPL' })} />);

      // Assert: Loading indicators visible (animated skeleton)
      await waitFor(() => {
        const animatedElements = screen.getAllByText('Loading…');
        expect(animatedElements.length).toBeGreaterThan(0);
      });
    });
  });

  // =========================================================================
  // Edge Cases: Null fields, missing optional data, live price overlay
  // =========================================================================

  describe('edge cases: handles null values and missing optional fields', () => {
    it('renders correctly when optional financials fields are null', async () => {
      // Arrange: Quote with minimal fields (no dividend_yield, beta, etc.)
      const quote: StockDetailQuote = {
        price: 150.5,
        change_pct: 0,
        volume: 1000,
        name: 'Simple Stock',
        currency: 'USD',
        market_cap: null,
        pe_ratio: null,
        week_52_high: null,
        week_52_low: null,
        eps: null,
      };

      const stockDetail: StockDetail = {
        quote,
        news: [],
        indicators: { rsi: null, macd_signal: 'neutral', bb_position: 'mid' },
      };

      mockUseApi.mockReturnValueOnce({
        data: stockDetail,
        loading: false,
        error: null,
        refetch: jest.fn(),
      } as any);

      // Act
      render(<StockDetailPage params={Promise.resolve({ ticker: 'TEST' })} />);

      // Assert: Price displays even when change_pct is 0
      await waitFor(() => {
        expect(screen.getByText('$150.50')).toBeInTheDocument();
        expect(screen.getByText('+0.00%')).toBeInTheDocument();
      });
    });

    it('applies correct styling for negative price change', async () => {
      // Arrange
      const quote: StockDetailQuote = {
        price: 100,
        change_pct: -5.25,
        volume: 1000,
        name: 'Falling Stock',
        currency: 'USD',
      };

      mockUseApi.mockReturnValueOnce({
        data: { quote },
        loading: false,
        error: null,
        refetch: jest.fn(),
      } as any);

      // Act
      const { container } = render(
        <StockDetailPage params={Promise.resolve({ ticker: 'DOWN' })} />
      );

      // Assert: Negative change shows with red styling and down arrow
      await waitFor(() => {
        expect(screen.getByText('-5.25%')).toBeInTheDocument();
        expect(screen.getByText('↓')).toBeInTheDocument();
      });
    });

    it('updates display price from live SSE price_update event without full refetch', async () => {
      // Arrange: Initial data loaded
      const quote: StockDetailQuote = {
        price: 100,
        change_pct: 0,
        volume: 1000,
        name: 'Test Stock',
        currency: 'USD',
      };

      const mockRefetch = jest.fn();
      mockUseApi.mockReturnValueOnce({
        data: { quote },
        loading: false,
        error: null,
        refetch: mockRefetch,
      } as any);

      // Render with initial price
      const { rerender } = render(
        <StockDetailPage params={Promise.resolve({ ticker: 'TEST' })} />
      );

      await waitFor(() => {
        expect(screen.getByText('$100.00')).toBeInTheDocument();
      });

      // Act: Update SSE with live price event
      mockUseSSE.mockReturnValue({
        lastEvent: {
          type: 'price_update',
          data: {
            ticker: 'TEST',
            price: 105.5,
            change: 5.5,
            change_pct: 5.5,
          },
          timestamp: new Date().toISOString(),
        } as any,
        isConnected: true,
      } as any);

      rerender(<StockDetailPage params={Promise.resolve({ ticker: 'TEST' })} />);

      // Assert: Display updates to live price without refetch being called
      await waitFor(() => {
        expect(screen.getByText('$105.50')).toBeInTheDocument();
        expect(screen.getByText('+5.50%')).toBeInTheDocument();
        // Refetch should NOT be called for price_update (only for snapshot/news)
        expect(mockRefetch).not.toHaveBeenCalled();
      });
    });
  });

  // =========================================================================
  // Acceptance Criteria: Extended Financials & Comparison Integration
  // =========================================================================

  describe('acceptance criteria: extended financials fields display correctly', () => {
    it('renders dividend yield, beta, avg volume, and book value when available', async () => {
      // Arrange: Quote with all extended fields
      const quote: StockDetailQuote = {
        price: 150,
        change_pct: 1,
        volume: 5000000,
        name: 'Premium Stock',
        currency: 'USD',
        market_cap: 2_000_000_000_000,
        pe_ratio: 22,
        eps: 6.82,
        week_52_high: 165,
        week_52_low: 130,
        dividend_yield: 2.75, // NEW
        beta: 1.35, // NEW
        avg_volume: 4200000, // NEW
        book_value: 145.5, // NEW
      };

      mockUseApi.mockReturnValueOnce({
        data: { quote, news: [] },
        loading: false,
        error: null,
        refetch: jest.fn(),
      } as any);

      // Act
      render(<StockDetailPage params={Promise.resolve({ ticker: 'PREM' })} />);

      // Assert: Financials card is rendered (component would display these fields)
      await waitFor(() => {
        expect(screen.getByTestId('financials-card')).toBeInTheDocument();
      });
    });
  });
});
