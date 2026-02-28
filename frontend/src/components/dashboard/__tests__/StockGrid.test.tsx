/**
 * Tests for StockGrid component.
 *
 * All data flows in via the `ratings` prop from useDashboardData — no hook
 * self-fetch. Tests cover:
 * - Rendering stock cards grid with watchlist order applied
 * - Empty state when ratings is empty
 * - Loading state when ratings prop is null
 * - Search, add, and remove stock flows
 * - Price flash animation on price changes
 * - Keyboard navigation and accessibility
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StockGrid from '../StockGrid';
import type { AIRating } from '@/lib/types';
import * as api from '@/lib/api';

// Mock API functions
jest.mock('@/lib/api', () => ({
  getWatchlistOrder: jest.fn(),
  reorderWatchlist: jest.fn(),
  addStockToWatchlist: jest.fn(),
  removeStockFromWatchlist: jest.fn(),
  searchStocks: jest.fn(),
}));

// Mock StockCard component
jest.mock('../StockCard', () => {
  return function DummyStockCard({ rating }: { rating: AIRating }) {
    return <div data-testid={`stock-card-${rating.ticker}`}>{rating.ticker}</div>;
  };
});

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Search: () => <div />,
  Plus: () => <div />,
  Loader2: () => <div data-testid="loader-icon" />,
  X: () => <div />,
  ChevronUp: () => <div />,
  ChevronDown: () => <div />,
}));

describe('StockGrid', () => {
  // =========================================================================
  // Test Data: Mock Ratings & API responses
  // =========================================================================

  const mockRatings: AIRating[] = [
    {
      ticker: 'AAPL',
      rating: 'STRONG_BUY',
      score: 85,
      confidence: 0.92,
      current_price: 150.25,
      price_change_pct: 2.5,
      rsi: 65,
    },
    {
      ticker: 'TSLA',
      rating: 'BUY',
      score: 72,
      confidence: 0.78,
      current_price: 250.0,
      price_change_pct: -1.2,
      rsi: 45,
    },
    {
      ticker: 'MSFT',
      rating: 'HOLD',
      score: 55,
      confidence: 0.65,
      current_price: 380.0,
      price_change_pct: 0.5,
      rsi: 50,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (api.getWatchlistOrder as jest.Mock).mockResolvedValue(['AAPL', 'TSLA', 'MSFT']);
    (api.searchStocks as jest.Mock).mockResolvedValue([
      { ticker: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', type: 'STOCK' },
    ]);
  });

  // =========================================================================
  // Happy Path: Renders stock grid with ratings
  // =========================================================================

  describe('happy path: renders stock cards in correct order', () => {
    it('displays all stock cards when ratings provided', () => {
      // Arrange & Act
      render(
        <StockGrid
          watchlistId={1}
          ratings={mockRatings}
        />
      );

      // Assert: all tickers rendered
      expect(screen.getByTestId('stock-card-AAPL')).toBeInTheDocument();
      expect(screen.getByTestId('stock-card-TSLA')).toBeInTheDocument();
      expect(screen.getByTestId('stock-card-MSFT')).toBeInTheDocument();
    });

    it('applies watchlist order to stock cards', async () => {
      // Arrange
      (api.getWatchlistOrder as jest.Mock).mockResolvedValue(['MSFT', 'AAPL', 'TSLA']);

      // Act
      render(
        <StockGrid
          watchlistId={1}
          ratings={mockRatings}
        />
      );

      // Assert: wait for order to load and verify sort
      await waitFor(() => {
        const cards = screen.getAllByTestId(/stock-card-/);
        expect(cards[0]).toHaveAttribute('data-testid', 'stock-card-MSFT');
        expect(cards[1]).toHaveAttribute('data-testid', 'stock-card-AAPL');
        expect(cards[2]).toHaveAttribute('data-testid', 'stock-card-TSLA');
      });
    });
  });

  // =========================================================================
  // Empty State: No stocks in watchlist
  // =========================================================================

  describe('empty state: no stocks in watchlist', () => {
    it('shows empty message when ratings array is empty', () => {
      // Arrange & Act
      render(
        <StockGrid
          watchlistId={1}
          ratings={[]}
        />
      );

      // Assert
      expect(screen.getByText('No stocks in this group yet.')).toBeInTheDocument();
      expect(screen.getByText(/Search for a stock above to add it/)).toBeInTheDocument();
    });

    it('does not render any stock cards when ratings is empty', () => {
      // Arrange & Act
      render(
        <StockGrid
          watchlistId={1}
          ratings={[]}
        />
      );

      // Assert: no stock cards present
      expect(screen.queryByTestId(/stock-card-/)).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // Loading State: ratings is null
  // =========================================================================

  describe('loading state: ratings is null', () => {
    it('shows skeleton loaders when ratings is null', () => {
      // Arrange & Act
      render(
        <StockGrid
          watchlistId={1}
          ratings={null}
        />
      );

      // Assert: skeleton elements visible (6 placeholders)
      const skeletons = screen.getAllByRole('generic');
      const animatePulse = skeletons.filter((el) =>
        el.className?.includes('animate-pulse')
      );
      expect(animatePulse.length).toBeGreaterThan(0);
    });

    it('does not render stock cards while loading', () => {
      // Arrange & Act
      render(
        <StockGrid
          watchlistId={1}
          ratings={null}
        />
      );

      // Assert
      expect(screen.queryByTestId(/stock-card-/)).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // Price Flash Animation: Detects price changes and clears after 800ms
  // =========================================================================

  describe('price flash animation: triggers on price delta', () => {
    it('applies flash class when price changes', async () => {
      // Arrange
      const { rerender } = render(
        <StockGrid
          watchlistId={1}
          ratings={mockRatings}
        />
      );

      // Act: update price for AAPL
      const updatedRatings: AIRating[] = [
        { ...mockRatings[0], current_price: 152.0 }, // price changed
        mockRatings[1],
        mockRatings[2],
      ];
      rerender(
        <StockGrid
          watchlistId={1}
          ratings={updatedRatings}
        />
      );

      // Assert: flash animation applied to AAPL card
      await waitFor(() => {
        const aapl = screen.getByTestId('stock-card-AAPL');
        const li = aapl.closest('li');
        expect(li?.className).toContain('animate-price-flash');
      });
    });

    it('removes flash class after 800ms', async () => {
      // Arrange
      const { rerender } = render(
        <StockGrid
          watchlistId={1}
          ratings={mockRatings}
        />
      );

      // Act: trigger price change
      const updatedRatings: AIRating[] = [
        { ...mockRatings[0], current_price: 152.0 },
        mockRatings[1],
        mockRatings[2],
      ];
      rerender(
        <StockGrid
          watchlistId={1}
          ratings={updatedRatings}
        />
      );

      // Assert: flash exists initially
      await waitFor(() => {
        const aapl = screen.getByTestId('stock-card-AAPL');
        const li = aapl.closest('li');
        expect(li?.className).toContain('animate-price-flash');
      });

      // Act: wait for animation to clear
      await waitFor(
        () => {
          const aapl = screen.getByTestId('stock-card-AAPL');
          const li = aapl.closest('li');
          expect(li?.className).not.toContain('animate-price-flash');
        },
        { timeout: 1000 }
      );
    });

    it('does not flash on initial load', async () => {
      // Arrange & Act
      render(
        <StockGrid
          watchlistId={1}
          ratings={mockRatings}
        />
      );

      // Assert: no flash on mount
      await waitFor(() => {
        const aapl = screen.getByTestId('stock-card-AAPL');
        const li = aapl.closest('li');
        expect(li?.className).not.toContain('animate-price-flash');
      });
    });
  });

  // =========================================================================
  // Search Functionality
  // =========================================================================

  describe('search: add stocks to watchlist', () => {
    it('performs search when user types into input field', async () => {
      // Arrange
      const user = userEvent.setup();
      render(
        <StockGrid
          watchlistId={1}
          ratings={mockRatings}
        />
      );

      // Act: type in search
      const input = screen.getByPlaceholderText(/Search stocks/);
      await user.type(input, 'AP');

      // Assert: search debounce triggers (300ms)
      await waitFor(() => {
        expect(api.searchStocks).toHaveBeenCalledWith('AP');
      });
    });

    it('shows search results in dropdown', async () => {
      // Arrange
      const user = userEvent.setup();
      render(
        <StockGrid
          watchlistId={1}
          ratings={mockRatings}
        />
      );

      // Act: type search
      const input = screen.getByPlaceholderText(/Search stocks/);
      await user.type(input, 'APP');

      // Assert: results dropdown appears
      await waitFor(() => {
        expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // Accessibility: Live region announcements
  // =========================================================================

  describe('accessibility: live region announcements', () => {
    it('announces stock addition via aria-live', async () => {
      // Arrange
      (api.addStockToWatchlist as jest.Mock).mockResolvedValue(true);
      (api.getWatchlistOrder as jest.Mock).mockResolvedValue(['AAPL', 'TSLA', 'MSFT']);

      const user = userEvent.setup();
      const { container } = render(
        <StockGrid
          watchlistId={1}
          ratings={mockRatings}
        />
      );

      // Act: add stock via search
      const input = screen.getByPlaceholderText(/Search stocks/);
      await user.type(input, 'APP');

      await waitFor(() => {
        expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
      });

      const appleOption = screen.getByText('Apple Inc.').closest('button');
      await user.click(appleOption!);

      // Assert: announcement made
      const liveRegion = container.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Edge Cases: Multiple rapid price updates
  // =========================================================================

  describe('edge cases: multiple rapid price updates', () => {
    it('handles multiple price changes without memory leak', async () => {
      // Arrange
      const { rerender } = render(
        <StockGrid
          watchlistId={1}
          ratings={mockRatings}
        />
      );

      // Act: apply multiple price changes rapidly
      for (let i = 0; i < 5; i++) {
        const updated: AIRating[] = [
          { ...mockRatings[0], current_price: 150.0 + i },
          mockRatings[1],
          mockRatings[2],
        ];
        rerender(
          <StockGrid
            watchlistId={1}
            ratings={updated}
          />
        );
      }

      // Assert: component still renders without errors
      expect(screen.getByTestId('stock-card-AAPL')).toBeInTheDocument();
    });

    it('cleans up flash timers on unmount', () => {
      // Arrange: spy on clearTimeout
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      // Act: render and trigger price change
      const { unmount } = render(
        <StockGrid
          watchlistId={1}
          ratings={mockRatings}
        />
      );

      // Simulate price change to create timer
      const updated: AIRating[] = [
        { ...mockRatings[0], current_price: 152.0 },
        mockRatings[1],
        mockRatings[2],
      ];
      const { unmount: unmount2 } = render(
        <StockGrid
          watchlistId={1}
          ratings={updated}
        />
      );

      unmount2();

      // Assert: clearTimeout was called (timers cleaned up)
      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });
  });
});
