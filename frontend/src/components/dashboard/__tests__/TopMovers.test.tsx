```tsx
/**
 * Tests for TopMovers component.
 *
 * Tests cover:
 * - Deriving gainers and losers from ratings (sorted by price change %)
 * - Limiting to MAX_MOVERS (5) per category
 * - Empty watchlist handling
 * - Loading and error states
 * - MoverRow rendering with price and change percentage
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import TopMovers from '../TopMovers';
import { useRatings } from '@/hooks/useRatings';
import type { AIRating } from '@/lib/types';

// Mock the shared ratings hook
jest.mock('@/hooks/useRatings');

// Mock useSSERatings to pass through data unchanged
jest.mock('@/hooks/useSSERatings', () => ({
  useSSERatings: (ratings: AIRating[] | null) => ratings,
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  TrendingUp: () => <div data-testid="trending-up-icon" />,
  TrendingDown: () => <div data-testid="trending-down-icon" />,
}));

const mockUseRatings = useRatings as jest.MockedFunction<typeof useRatings>;

describe('TopMovers', () => {
  // =========================================================================
  // Test Data: Mock Ratings with various price changes
  // =========================================================================

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
      price_change_pct: 3.2,
      rsi: 65,
    },
    {
      ticker: 'MSFT',
      rating: 'HOLD',
      score: 60,
      confidence: 0.70,
      current_price: 420.00,
      price_change_pct: 1.1,
      rsi: 55,
    },
    {
      ticker: 'TSLA',
      rating: 'SELL',
      score: 40,
      confidence: 0.65,
      current_price: 242.30,
      price_change_pct: -2.8,
      rsi: 35,
    },
    {
      ticker: 'META',
      rating: 'STRONG_SELL',
      score: 25,
      confidence: 0.80,
      current_price: 485.10,
      price_change_pct: -5.6,
      rsi: 28,
    },
    {
      ticker: 'AMZN',
      rating: 'BUY',
      score: 78,
      confidence: 0.85,
      current_price: 193.45,
      price_change_pct: 6.2,
      rsi: 62,
    },
    {
      ticker: 'GOOGL',
      rating: 'HOLD',
      score: 55,
      confidence: 0.68,
      current_price: 165.80,
      price_change_pct: -1.3,
      rsi: 48,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Happy Path: Fetches and displays top gainers/losers correctly
  // =========================================================================

  describe('happy path: derives gainers and losers from ratings', () => {
    it('should display header and both gainers/losers columns', () => {
      // Arrange
      mockUseRatings.mockReturnValue({
        data: mockRatings,
        loading: false,
        error: null,
      });

      // Act
      render(<TopMovers />);

      // Assert: header
      expect(screen.getByText('Top Movers')).toBeInTheDocument();
      expect(screen.getByText('Gainers')).toBeInTheDocument();
      expect(screen.getByText('Losers')).toBeInTheDocument();
    });

    it('should sort gainers by price_change_pct descending (highest first)', () => {
      // Arrange
      mockUseRatings.mockReturnValue({
        data: mockRatings,
        loading: false,
        error: null,
      });

      // Act
      render(<TopMovers />);

      // Assert: top gainer (NVDA at 8.5%) has aria-label containing NVDA
      const gainersSection = screen.getByText('Gainers').closest('div');
      const firstGainerRow = gainersSection?.querySelector('[aria-label]');
      expect(firstGainerRow).toHaveAttribute('aria-label', expect.stringContaining('NVDA'));
    });

    it('should sort losers by price_change_pct ascending (lowest first)', () => {
      // Arrange
      mockUseRatings.mockReturnValue({
        data: mockRatings,
        loading: false,
        error: null,
      });

      // Act
      render(<TopMovers />);

      // Assert: top loser (META at -5.6%) appears first in losers column
      const losersSection = screen.getByText('Losers').closest('div');
      const loserTickers = losersSection?.querySelectorAll('p.text-sm');
      expect(loserTickers?.[0]).toHaveTextContent('META');
    });

    it('should limit gainers to MAX_MOVERS (5) per category', () => {
      // Arrange: 10 gainers but should show max 5
      const manyGainers: AIRating[] = Array.from({ length: 10 }, (_, i) => ({
        ticker: `GAIN${i}`,
        rating: 'BUY',
        score: 75,
        confidence: 0.8,
        current_price: 100 + i,
        price_change_pct: 10 - i * 0.5, // 10%, 9.5%, 9%, ...
        rsi: 60,
      }));

      mockUseRatings.mockReturnValue({
        data: manyGainers,
        loading: false,
        error: null,
      });

      // Act
      render(<TopMovers />);

      // Assert: only 5 gainers displayed (ranks 1-5 only)
      const gainersSection = screen.getByText('Gainers').closest('div');
      const ranks = gainersSection?.querySelectorAll(
        'span.text-slate-600'
      ) as NodeListOf<HTMLElement>;
      expect(ranks.length).toBeLessThanOrEqual(5);
    });

    it('should display price and change percentage correctly formatted', () => {
      // Arrange
      const singleRating: AIRating[] = [mockRatings[0]]; // NVDA: 875.50 price, 8.5% change

      mockUseRatings.mockReturnValue({
        data: singleRating,
        loading: false,
        error: null,
      });

      // Act
      render(<TopMovers />);

      // Assert: price displays with 2 decimals
      expect(screen.getByText('$875.50')).toBeInTheDocument();
      // Assert: percentage shows sign and 2 decimals
      expect(screen.getByText('+8.50%')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Edge Cases: Empty watchlist, missing data fields
  // =========================================================================

  describe('edge cases', () => {
    it('should handle empty ratings list (no stocks in watchlist)', () => {
      // Arrange
      mockUseRatings.mockReturnValue({
        data: [],
        loading: false,
        error: null,
      });

      // Act
      render(<TopMovers />);

      // Assert
      expect(screen.getByText('No stocks in watchlist.')).toBeInTheDocument();
    });

    it('should handle missing price_change_pct as 0 (not a gainer or loser)', () => {
      // Arrange
      const ratingNoPriceChange: AIRating[] = [
        {
          ticker: 'TEST',
          rating: 'BUY',
          score: 70,
          confidence: 0.8,
          current_price: 100,
          price_change_pct: undefined,
          rsi: 50,
        },
      ];

      mockUseRatings.mockReturnValue({
        data: ratingNoPriceChange,
        loading: false,
        error: null,
      });

      // Act
      render(<TopMovers />);

      // Assert: stock with undefined change is treated as 0 — not in gainers or losers
      // "No gainers" / "No losers" messages should appear
      expect(screen.getByText('No gainers')).toBeInTheDocument();
      expect(screen.getByText('No losers')).toBeInTheDocument();
    });

    it('should handle missing current_price gracefully', () => {
      // Arrange
      const ratingNoPrice: AIRating[] = [
        {
          ticker: 'NOPRICE',
          rating: 'BUY',
          score: 70,
          confidence: 0.8,
          current_price: null,
          price_change_pct: 2.5,
          rsi: 50,
        },
      ];

      mockUseRatings.mockReturnValue({
        data: ratingNoPrice,
        loading: false,
        error: null,
      });

      // Act
      render(<TopMovers />);

      // Assert: ticker should render without price
      expect(screen.getByText('NOPRICE')).toBeInTheDocument();
      expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // Loading & Error States
  // =========================================================================

  describe('loading and error states', () => {
    it('should display loading skeleton while fetching', () => {
      // Arrange
      mockUseRatings.mockReturnValue({
        data: null,
        loading: true,
        error: null,
      });

      // Act
      render(<TopMovers />);

      // Assert: loading state shows skeleton pulse elements
      const skeletons = screen.getAllByRole('generic');
      const pulseElements = skeletons.filter((el) =>
        el.className?.includes('animate-pulse')
      );
      expect(pulseElements.length).toBeGreaterThan(0);
    });

    it('should display error message when fetch fails', () => {
      // Arrange
      const errorMsg = 'Failed to fetch ratings. Please try again.';
      mockUseRatings.mockReturnValue({
        data: null,
        loading: false,
        error: errorMsg,
      });

      // Act
      render(<TopMovers />);

      // Assert
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
    });
  });
});
```