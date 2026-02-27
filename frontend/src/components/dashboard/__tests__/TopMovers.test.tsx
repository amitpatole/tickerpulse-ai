/**
 * Tests for TopMovers Component
 *
 * Validates the separation of gainers and losers, proper sorting,
 * limit enforcement (max 5 movers per column), and state transitions.
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TopMovers from '@/components/dashboard/TopMovers';
import type { AIRating } from '@/lib/types';

// Mock the singleton ratings hooks so tests control data without HTTP calls
jest.mock('@/hooks/useRatings', () => ({
  useRatings: jest.fn(),
}));

jest.mock('@/hooks/useSSERatings', () => ({
  useSSERatings: jest.fn((base: AIRating[] | null) => base),
}));

import { useRatings } from '@/hooks/useRatings';

const mockUseRatings = useRatings as jest.MockedFunction<typeof useRatings>;

describe('TopMovers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Happy Path: Normal operation with mixed gainers and losers
  // =========================================================================

  describe('Happy Path: Displays gainers and losers with correct sorting', () => {
    it('separates positive and negative price changes into distinct columns', () => {
      const mockRatings: AIRating[] = [
        {
          ticker: 'NVDA',
          rating: 'strong_buy',
          score: 90,
          confidence: 0.9,
          current_price: 150.0,
          price_change: 7.5,
          price_change_pct: 5.25,
          rsi: 70,
        },
        {
          ticker: 'AMD',
          rating: 'sell',
          score: 35,
          confidence: 0.7,
          current_price: 120.5,
          price_change: -2.17,
          price_change_pct: -1.8,
          rsi: 40,
        },
        {
          ticker: 'TSM',
          rating: 'buy',
          score: 75,
          confidence: 0.8,
          current_price: 200.0,
          price_change: 6.86,
          price_change_pct: 3.5,
          rsi: 60,
        },
      ];

      mockUseRatings.mockReturnValue({ data: mockRatings, loading: false, error: null });

      render(<TopMovers />);

      // Verify gainers column shows positive changes
      expect(screen.getByText(/Gainers/i)).toBeInTheDocument();
      expect(screen.getByText('+5.25%')).toBeInTheDocument();
      expect(screen.getByText('+3.50%')).toBeInTheDocument();

      // Verify losers column shows negative changes
      expect(screen.getByText(/Losers/i)).toBeInTheDocument();
      expect(screen.getByText('-1.80%')).toBeInTheDocument();
    });

    it('sorts gainers by descending price_change_pct (highest first)', () => {
      const mockRatings: AIRating[] = [
        {
          ticker: 'STOCK1',
          rating: 'buy',
          score: 80,
          confidence: 0.8,
          current_price: 100,
          price_change: 2,
          price_change_pct: 2.0,
          rsi: 60,
        },
        {
          ticker: 'STOCK2',
          rating: 'buy',
          score: 80,
          confidence: 0.8,
          current_price: 100,
          price_change: 5,
          price_change_pct: 5.0,
          rsi: 60,
        },
        {
          ticker: 'STOCK3',
          rating: 'buy',
          score: 80,
          confidence: 0.8,
          current_price: 100,
          price_change: 3,
          price_change_pct: 3.0,
          rsi: 60,
        },
      ];

      mockUseRatings.mockReturnValue({ data: mockRatings, loading: false, error: null });

      const { container } = render(<TopMovers />);

      // Get gainers column and verify order: 5.0% > 3.0% > 2.0%
      const gainersColumn = container.querySelector('[aria-label*="Gainers"]');
      const rows = gainersColumn?.querySelectorAll('div[aria-label]') || [];

      // Verify first row is STOCK2 (5%), second is STOCK3 (3%), third is STOCK1 (2%)
      expect(rows[0]?.textContent).toContain('STOCK2');
      expect(rows[1]?.textContent).toContain('STOCK3');
      expect(rows[2]?.textContent).toContain('STOCK1');
    });

    it('sorts losers by ascending price_change_pct (most negative first)', () => {
      const mockRatings: AIRating[] = [
        {
          ticker: 'LOSE1',
          rating: 'sell',
          score: 40,
          confidence: 0.7,
          current_price: 100,
          price_change: -2,
          price_change_pct: -2.0,
          rsi: 40,
        },
        {
          ticker: 'LOSE2',
          rating: 'sell',
          score: 40,
          confidence: 0.7,
          current_price: 100,
          price_change: -5,
          price_change_pct: -5.0,
          rsi: 40,
        },
        {
          ticker: 'LOSE3',
          rating: 'sell',
          score: 40,
          confidence: 0.7,
          current_price: 100,
          price_change: -3,
          price_change_pct: -3.0,
          rsi: 40,
        },
      ];

      mockUseRatings.mockReturnValue({ data: mockRatings, loading: false, error: null });

      const { container } = render(<TopMovers />);

      // Get losers column and verify order: -5.0% < -3.0% < -2.0%
      const losersColumn = container.querySelectorAll('div')[container.querySelectorAll('div').length - 1];
      const rows = losersColumn?.querySelectorAll('div[aria-label]') || [];

      // Verify first row is LOSE2 (-5%), second is LOSE3 (-3%), third is LOSE1 (-2%)
      expect(rows[0]?.textContent).toContain('LOSE2');
      expect(rows[1]?.textContent).toContain('LOSE3');
      expect(rows[2]?.textContent).toContain('LOSE1');
    });
  });

  // =========================================================================
  // Edge Case: MAX_MOVERS limit (5 per column)
  // =========================================================================

  describe('Edge Case: Enforces MAX_MOVERS limit (5 per column)', () => {
    it('displays only top 5 gainers when more than 5 exist', () => {
      const mockRatings: AIRating[] = Array.from({ length: 10 }, (_, i) => ({
        ticker: `GAIN${i}`,
        rating: 'buy',
        score: 80,
        confidence: 0.8,
        current_price: 100,
        price_change: i,
        price_change_pct: i + 1.0,
        rsi: 60,
      }));

      mockUseRatings.mockReturnValue({ data: mockRatings, loading: false, error: null });

      render(<TopMovers />);

      // Should show only 5 gainers, not all 10
      expect(screen.getByText(/GAIN9/)).toBeInTheDocument(); // Top gainer
      expect(screen.getByText(/GAIN5/)).toBeInTheDocument(); // 5th gainer
      expect(screen.queryByText(/GAIN4/)).not.toBeInTheDocument(); // 6th gainer should not exist
    });
  });

  // =========================================================================
  // Edge Case: Empty watchlist / No data
  // =========================================================================

  describe('Edge Case: Handles empty and null data gracefully', () => {
    it('displays empty state message when no stocks in watchlist', () => {
      mockUseRatings.mockReturnValue({ data: [], loading: false, error: null });

      render(<TopMovers />);

      expect(screen.getByText(/no stocks in watchlist/i)).toBeInTheDocument();
    });

    it('shows loading skeleton when data is being fetched', () => {
      mockUseRatings.mockReturnValue({ data: null, loading: true, error: null });

      const { container } = render(<TopMovers />);

      // Should have animated pulse skeleton divs while loading
      const pulses = container.querySelectorAll('.animate-pulse');
      expect(pulses.length).toBeGreaterThan(0);
    });

    it('displays "No gainers" and "No losers" when all data is neutral (0% change)', () => {
      const mockRatings: AIRating[] = [
        {
          ticker: 'FLAT1',
          rating: 'hold',
          score: 50,
          confidence: 0.5,
          current_price: 100,
          price_change: 0,
          price_change_pct: 0,
          rsi: 50,
        },
        {
          ticker: 'FLAT2',
          rating: 'hold',
          score: 50,
          confidence: 0.5,
          current_price: 100,
          price_change: 0,
          price_change_pct: 0,
          rsi: 50,
        },
      ];

      mockUseRatings.mockReturnValue({ data: mockRatings, loading: false, error: null });

      render(<TopMovers />);

      // Both gainers and losers should show empty state
      expect(screen.getByText(/no gainers/i)).toBeInTheDocument();
      expect(screen.getByText(/no losers/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Error Case: API failure
  // =========================================================================

  describe('Error Case: Gracefully handles API errors', () => {
    it('displays error message when ratings API fails', () => {
      mockUseRatings.mockReturnValue({
        data: null,
        loading: false,
        error: 'Failed to fetch ratings data',
      });

      render(<TopMovers />);

      expect(screen.getByText(/Failed to fetch ratings data/i)).toBeInTheDocument();
    });
  });
});
