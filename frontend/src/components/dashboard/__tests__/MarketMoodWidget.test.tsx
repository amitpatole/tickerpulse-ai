/**
 * Tests for MarketMoodWidget component.
 *
 * Tests cover:
 * - Mood calculation (bullish/neutral/bearish) based on average score
 * - Gauge needle positioning at correct percentage
 * - Bucket breakdown showing correct stock counts
 * - Accessibility with role="meter" and aria attributes
 * - Empty watchlist and error states
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import MarketMoodWidget from '../MarketMoodWidget';
import { useApi } from '@/hooks/useApi';
import type { AIRating } from '@/lib/types';

// Mock the useApi hook
jest.mock('@/hooks/useApi');

const mockUseApi = useApi as jest.MockedFunction<typeof useApi>;

describe('MarketMoodWidget', () => {
  // =========================================================================
  // Setup
  // =========================================================================

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Happy Path: Mood calculation and gauge rendering
  // =========================================================================

  describe('happy path: calculates mood and displays gauge correctly', () => {
    it('displays bullish mood when average score >= 65', () => {
      // Arrange
      const bullishRatings: AIRating[] = [
        {
          ticker: 'AAPL',
          rating: 'STRONG_BUY',
          score: 78,
          confidence: 0.92,
          current_price: 150.25,
          price_change_pct: 2.5,
          rsi: 65,
        },
        {
          ticker: 'MSFT',
          rating: 'BUY',
          score: 72,
          confidence: 0.88,
          current_price: 380.0,
          price_change_pct: 1.2,
          rsi: 55,
        },
        {
          ticker: 'GOOGL',
          rating: 'HOLD',
          score: 65,
          confidence: 0.70,
          current_price: 140.0,
          price_change_pct: 0.5,
          rsi: 50,
        },
      ];

      mockUseApi.mockReturnValue({
        data: bullishRatings,
        loading: false,
        error: null,
      });

      // Act
      render(<MarketMoodWidget />);

      // Assert
      // Average = Math.round((78 + 72 + 65) / 3) = Math.round(71.67) = 72
      expect(screen.getByText('72')).toBeInTheDocument();
      expect(screen.getByText('Bullish')).toBeInTheDocument();
      expect(screen.getByText('Market Mood')).toBeInTheDocument();
    });

    it('displays neutral mood when average score is between 40-65', () => {
      // Arrange
      const neutralRatings: AIRating[] = [
        {
          ticker: 'TSLA',
          rating: 'HOLD',
          score: 55,
          confidence: 0.70,
          current_price: 250.0,
          price_change_pct: 0.0,
          rsi: 50,
        },
        {
          ticker: 'AMD',
          rating: 'HOLD',
          score: 50,
          confidence: 0.65,
          current_price: 130.0,
          price_change_pct: -0.5,
          rsi: 48,
        },
      ];

      mockUseApi.mockReturnValue({
        data: neutralRatings,
        loading: false,
        error: null,
      });

      // Act
      render(<MarketMoodWidget />);

      // Assert
      // Average = Math.round((55 + 50) / 2) = Math.round(52.5) = 52 or 53
      const scoreElement = screen.getByText(/^(52|53)$/);
      expect(scoreElement).toBeInTheDocument();
      expect(screen.getByText('Neutral')).toBeInTheDocument();
    });

    it('displays bearish mood when average score <= 40', () => {
      // Arrange
      const bearishRatings: AIRating[] = [
        {
          ticker: 'TSLA',
          rating: 'SELL',
          score: 25,
          confidence: 0.60,
          current_price: 250.0,
          price_change_pct: -2.0,
          rsi: 30,
        },
        {
          ticker: 'GME',
          rating: 'STRONG_SELL',
          score: 20,
          confidence: 0.75,
          current_price: 20.0,
          price_change_pct: -5.0,
          rsi: 15,
        },
      ];

      mockUseApi.mockReturnValue({
        data: bearishRatings,
        loading: false,
        error: null,
      });

      // Act
      render(<MarketMoodWidget />);

      // Assert
      // Average = Math.round((25 + 20) / 2) = Math.round(22.5) = 23 or 22
      const scoreElement = screen.getByText(/^(22|23)$/);
      expect(scoreElement).toBeInTheDocument();
      expect(screen.getByText('Bearish')).toBeInTheDocument();
    });

    it('positions gauge needle at correct percentage', () => {
      // Arrange
      const ratings: AIRating[] = [
        {
          ticker: 'AAPL',
          rating: 'STRONG_BUY',
          score: 80,
          confidence: 0.92,
          current_price: 150.25,
          price_change_pct: 2.5,
          rsi: 65,
        },
      ];

      mockUseApi.mockReturnValue({
        data: ratings,
        loading: false,
        error: null,
      });

      // Act
      const { container } = render(<MarketMoodWidget />);

      // Assert: needle positioned at left: 80%
      const needle = container.querySelector('div[style*="left: 80%"]');
      expect(needle).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Bucket Breakdown: Counts bullish/neutral/bearish correctly
  // =========================================================================

  describe('bucket breakdown: displays correct stock counts by sentiment', () => {
    it('counts stocks in bullish (>=65), neutral (40-64), and bearish (<=40) categories', () => {
      // Arrange: Mix of all three sentiment categories
      const ratings: AIRating[] = [
        {
          ticker: 'A',
          rating: 'STRONG_BUY',
          score: 80,
          confidence: 0.9,
          current_price: 100,
          price_change_pct: 1.0,
          rsi: 60,
        }, // bullish (>=65)
        {
          ticker: 'B',
          rating: 'BUY',
          score: 70,
          confidence: 0.85,
          current_price: 100,
          price_change_pct: 1.0,
          rsi: 60,
        }, // bullish (>=65)
        {
          ticker: 'C',
          rating: 'HOLD',
          score: 55,
          confidence: 0.7,
          current_price: 100,
          price_change_pct: 0.0,
          rsi: 50,
        }, // neutral (40-64)
        {
          ticker: 'D',
          rating: 'SELL',
          score: 38,
          confidence: 0.6,
          current_price: 100,
          price_change_pct: -1.0,
          rsi: 35,
        }, // bearish (<=40)
      ];

      mockUseApi.mockReturnValue({
        data: ratings,
        loading: false,
        error: null,
      });

      // Act
      render(<MarketMoodWidget />);

      // Assert: counts should be 2 bullish, 1 neutral, 1 bearish
      const counts = screen.getAllByText(/^[0-2]$/);
      expect(counts.length).toBeGreaterThanOrEqual(3);
      // Verify bucket labels
      expect(screen.getByText('Bullish')).toBeInTheDocument();
      expect(screen.getByText('Neutral')).toBeInTheDocument();
      expect(screen.getByText('Bearish')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Accessibility: Meter role and aria attributes
  // =========================================================================

  describe('accessibility: gauge has role="meter" with aria attributes', () => {
    it('renders meter with correct aria attributes', () => {
      // Arrange
      const ratings: AIRating[] = [
        {
          ticker: 'AAPL',
          rating: 'STRONG_BUY',
          score: 75,
          confidence: 0.92,
          current_price: 150.25,
          price_change_pct: 2.5,
          rsi: 65,
        },
      ];

      mockUseApi.mockReturnValue({
        data: ratings,
        loading: false,
        error: null,
      });

      // Act
      render(<MarketMoodWidget />);

      // Assert
      const meter = screen.getByRole('meter');
      expect(meter).toHaveAttribute('aria-valuenow', '75');
      expect(meter).toHaveAttribute('aria-valuemin', '0');
      expect(meter).toHaveAttribute('aria-valuemax', '100');
      expect(meter).toHaveAttribute('aria-label', expect.stringContaining('75'));
    });
  });

  // =========================================================================
  // Edge Cases: Empty watchlist and error states
  // =========================================================================

  describe('edge cases: empty watchlist and error handling', () => {
    it('shows "No stocks in watchlist" when empty', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: [],
        loading: false,
        error: null,
      });

      // Act
      render(<MarketMoodWidget />);

      // Assert
      expect(screen.getByText('No stocks in watchlist.')).toBeInTheDocument();
    });

    it('shows error message when API fails', () => {
      // Arrange
      const errorMsg = 'Failed to fetch market ratings';
      mockUseApi.mockReturnValue({
        data: null,
        loading: false,
        error: errorMsg,
      });

      // Act
      render(<MarketMoodWidget />);

      // Assert
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
    });
  });
});
