/**
 * Tests for SentimentSummaryChart component.
 *
 * All data flows in via the `ratings` prop from useDashboardData — no hook
 * self-fetch.  Tests cover:
 * - Sentiment bucket classification (bullish > 0.2, bearish < -0.2, neutral between)
 * - Sentiment distribution percentages calculated correctly
 * - AI rating distribution with counts and percentages
 * - Portfolio average sentiment score and label
 * - SentimentBar and RatingDistribution subcomponent rendering
 * - Edge cases: no sentiment data, all neutral, boundary conditions
 * - Loading state (null prop) and empty watchlist
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import SentimentSummaryChart from '../SentimentSummaryChart';
import type { AIRating } from '@/lib/types';

describe('SentimentSummaryChart', () => {
  // =========================================================================
  // Test Data: Mock Ratings with various sentiment scores
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
      sentiment_score: 0.65, // Bullish
    },
    {
      ticker: 'MSFT',
      rating: 'BUY',
      score: 75,
      confidence: 0.85,
      current_price: 380.0,
      price_change_pct: 1.2,
      rsi: 62,
      sentiment_score: 0.45, // Bullish
    },
    {
      ticker: 'GOOGL',
      rating: 'HOLD',
      score: 55,
      confidence: 0.70,
      current_price: 140.0,
      price_change_pct: -0.5,
      rsi: 50,
      sentiment_score: 0.10, // Neutral (between -0.2 and 0.2)
    },
    {
      ticker: 'AMZN',
      rating: 'HOLD',
      score: 50,
      confidence: 0.65,
      current_price: 180.45,
      price_change_pct: 0.3,
      rsi: 48,
      sentiment_score: -0.15, // Neutral (between -0.2 and 0.2)
    },
    {
      ticker: 'TSLA',
      rating: 'SELL',
      score: 35,
      confidence: 0.75,
      current_price: 242.30,
      price_change_pct: -2.8,
      rsi: 35,
      sentiment_score: -0.50, // Bearish
    },
    {
      ticker: 'META',
      rating: 'STRONG_SELL',
      score: 20,
      confidence: 0.80,
      current_price: 485.10,
      price_change_pct: -5.6,
      rsi: 28,
      sentiment_score: -0.75, // Bearish
    },
  ];

  // =========================================================================
  // Happy Path: Renders sentiment distribution and portfolio average
  // =========================================================================

  describe('happy path: calculates and displays sentiment distribution', () => {
    it('should render title and all sentiment sections', () => {
      // Arrange
      render(<SentimentSummaryChart ratings={mockRatings} />);

      // Assert: header
      expect(screen.getByText('Market Sentiment')).toBeInTheDocument();

      // Assert: sections
      expect(screen.getByText('Portfolio Avg. Sentiment')).toBeInTheDocument();
      expect(screen.getByText('Sentiment Distribution')).toBeInTheDocument();
      expect(screen.getByText('AI Rating Distribution')).toBeInTheDocument();
    });

    it('should calculate portfolio average sentiment correctly (avg of 6 scores)', () => {
      // Arrange
      // Scores: 0.65, 0.45, 0.10, -0.15, -0.50, -0.75
      // Avg = (0.65 + 0.45 + 0.10 - 0.15 - 0.50 - 0.75) / 6 = -0.20/6 ≈ -0.033
      render(<SentimentSummaryChart ratings={mockRatings} />);

      // Assert: portfolio average displayed with 2 decimals
      expect(screen.getByText('-0.03')).toBeInTheDocument();
    });

    it('should classify portfolio sentiment as Neutral when avg is between -0.2 and 0.2', () => {
      // Arrange
      render(<SentimentSummaryChart ratings={mockRatings} />);

      // Assert: avg score -0.033 is neutral
      const sentimentLabels = screen.getAllByText('Neutral');
      expect(sentimentLabels.length).toBeGreaterThan(0);
    });

    it('should display sentiment distribution counts and percentages', () => {
      // Arrange
      // Bullish: 2 (AAPL, MSFT), Neutral: 2 (GOOGL, AMZN), Bearish: 2 (TSLA, META)
      render(<SentimentSummaryChart ratings={mockRatings} />);

      // Assert: all three labels present
      expect(screen.getByText('Bullish')).toBeInTheDocument();
      expect(screen.getByText('Neutral')).toBeInTheDocument();
      expect(screen.getByText('Bearish')).toBeInTheDocument();

      // Assert: each bucket is 2/6 = 33%
      const percentages = screen.getAllByText(/\(33%\)/);
      expect(percentages.length).toBeGreaterThan(0);
    });

    it('should display AI rating distribution with counts', () => {
      // Arrange
      // Ratings: STRONG_BUY(1), BUY(1), HOLD(2), SELL(1), STRONG_SELL(1)
      render(<SentimentSummaryChart ratings={mockRatings} />);

      // Assert: rating labels shown (RATING_ORDER uses underscores replaced with spaces)
      expect(screen.getByText('STRONG BUY')).toBeInTheDocument();
      expect(screen.getByText('BUY')).toBeInTheDocument();
      expect(screen.getByText('HOLD')).toBeInTheDocument();
      expect(screen.getByText('SELL')).toBeInTheDocument();
      expect(screen.getByText('STRONG SELL')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Sentiment Classification: Boundary conditions for classifyScore
  // =========================================================================

  describe('sentiment classification: bullish (>0.2), neutral (-0.2 to 0.2), bearish (<-0.2)', () => {
    it('should classify score > 0.2 as bullish', () => {
      // Arrange
      const bullishRatings: AIRating[] = [
        {
          ticker: 'BULL1',
          rating: 'BUY',
          score: 70,
          confidence: 0.8,
          current_price: 100,
          price_change_pct: 1.0,
          rsi: 55,
          sentiment_score: 0.21, // Just above threshold
        },
        {
          ticker: 'BULL2',
          rating: 'BUY',
          score: 70,
          confidence: 0.8,
          current_price: 100,
          price_change_pct: 1.0,
          rsi: 55,
          sentiment_score: 0.9, // Very bullish
        },
      ];

      // Act
      render(<SentimentSummaryChart ratings={bullishRatings} />);

      // Assert: avg (0.21 + 0.9) / 2 = 0.555 → Bullish label shown
      expect(screen.getByText('Bullish')).toBeInTheDocument();
    });

    it('should classify score < -0.2 as bearish', () => {
      // Arrange
      const bearishRatings: AIRating[] = [
        {
          ticker: 'BEAR1',
          rating: 'SELL',
          score: 30,
          confidence: 0.8,
          current_price: 100,
          price_change_pct: -1.0,
          rsi: 40,
          sentiment_score: -0.21, // Just below threshold
        },
        {
          ticker: 'BEAR2',
          rating: 'SELL',
          score: 30,
          confidence: 0.8,
          current_price: 100,
          price_change_pct: -1.0,
          rsi: 40,
          sentiment_score: -0.9, // Very bearish
        },
      ];

      // Act
      render(<SentimentSummaryChart ratings={bearishRatings} />);

      // Assert: avg (-0.21 - 0.9) / 2 = -0.555 → Bearish label shown
      expect(screen.getByText('Bearish')).toBeInTheDocument();
    });

    it('should classify score between -0.2 and 0.2 as neutral', () => {
      // Arrange
      const neutralRatings: AIRating[] = [
        {
          ticker: 'NEUT1',
          rating: 'HOLD',
          score: 50,
          confidence: 0.7,
          current_price: 100,
          price_change_pct: 0.0,
          rsi: 50,
          sentiment_score: 0.0, // Exactly neutral
        },
        {
          ticker: 'NEUT2',
          rating: 'HOLD',
          score: 50,
          confidence: 0.7,
          current_price: 100,
          price_change_pct: 0.0,
          rsi: 50,
          sentiment_score: 0.15, // Within neutral range
        },
      ];

      // Act
      render(<SentimentSummaryChart ratings={neutralRatings} />);

      // Assert: avg (0.0 + 0.15) / 2 = 0.075 → Neutral
      expect(screen.getByText('Neutral')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Edge Cases: No sentiment data, rating distribution edge cases
  // =========================================================================

  describe('edge cases: no sentiment scores, missing ratings', () => {
    it('should show only ratings that have sentiment_score values', () => {
      // Arrange
      const mixedRatings: AIRating[] = [
        {
          ticker: 'WITH_SENT',
          rating: 'BUY',
          score: 70,
          confidence: 0.8,
          current_price: 100,
          price_change_pct: 1.0,
          rsi: 55,
          sentiment_score: 0.5, // Bullish
        },
        {
          ticker: 'WITHOUT_SENT',
          rating: 'HOLD',
          score: 50,
          confidence: 0.7,
          current_price: 100,
          price_change_pct: 0.0,
          rsi: 50,
          sentiment_score: undefined, // No sentiment data
        },
      ];

      // Act
      render(<SentimentSummaryChart ratings={mixedRatings} />);

      // Assert: only 1 stock counted → avg 0.5 → Bullish
      expect(screen.getByText('Bullish')).toBeInTheDocument();
    });

    it('should handle empty watchlist gracefully', () => {
      // Arrange
      render(<SentimentSummaryChart ratings={[]} />);

      // Assert
      expect(screen.getByText('No stocks in watchlist.')).toBeInTheDocument();
    });

    it('should not display rating distribution section for empty watchlist', () => {
      // Arrange
      render(<SentimentSummaryChart ratings={[]} />);

      // Assert: distribution section not rendered
      expect(screen.queryByText('AI Rating Distribution')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // SentimentBar Accessibility & Rendering
  // =========================================================================

  describe('SentimentBar accessibility and rendering', () => {
    it('should render sentiment bars with role="meter" for accessibility', () => {
      // Arrange
      render(<SentimentSummaryChart ratings={mockRatings} />);

      // Assert: meter elements for sentiment bars
      const meterElements = screen.getAllByRole('meter');
      expect(meterElements.length).toBeGreaterThan(0);
    });

    it('should set aria-valuenow to a valid percentage for all meters', () => {
      // Arrange
      render(<SentimentSummaryChart ratings={mockRatings} />);

      // Assert: all meters have valid 0-100 percentages
      const meterElements = screen.getAllByRole('meter');
      meterElements.forEach((meter) => {
        const valueNow = meter.getAttribute('aria-valuenow');
        expect(valueNow).toBeTruthy();
        expect(parseInt(valueNow!)).toBeGreaterThanOrEqual(0);
        expect(parseInt(valueNow!)).toBeLessThanOrEqual(100);
      });
    });

    it('should display percentage text for each sentiment bucket', () => {
      // Arrange
      render(<SentimentSummaryChart ratings={mockRatings} />);

      // Assert: percentages in parentheses are visible
      const percentages = screen.getAllByText(/\(\d+%\)/);
      expect(percentages.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Loading State: null ratings prop
  // =========================================================================

  describe('loading state: null ratings prop', () => {
    it('should display loading skeleton while ratings is null', () => {
      // Arrange & Act
      render(<SentimentSummaryChart ratings={null} />);

      // Assert: skeleton pulse elements visible
      const skeletons = screen.getAllByRole('generic');
      const pulseElements = skeletons.filter((el) =>
        el.className?.includes('animate-pulse')
      );
      expect(pulseElements.length).toBeGreaterThan(0);
    });

    it('should not display content sections while loading', () => {
      // Arrange & Act
      render(<SentimentSummaryChart ratings={null} />);

      // Assert: no content rendered while loading
      expect(screen.queryByText('Portfolio Avg. Sentiment')).not.toBeInTheDocument();
      expect(screen.queryByText('No stocks in watchlist.')).not.toBeInTheDocument();
    });
  });
});
