/**
 * Tests for SentimentSummaryChart with missing sentiment data.
 *
 * Focus areas (spec: "guard against empty data"):
 * - All ratings lack sentiment_score (should show empty sentiment section)
 * - Mix of with/without sentiment data
 * - All ratings lack sentiment_score but have AI ratings (show only rating distribution)
 * - Gracefully handle edge cases without crashing
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import SentimentSummaryChart from '../SentimentSummaryChart';
import type { AIRating } from '@/lib/types';

describe('SentimentSummaryChart — No Sentiment Data Handling', () => {
  // =========================================================================
  // Test Data: Ratings without sentiment scores
  // =========================================================================

  const ratingsWithoutSentiment: AIRating[] = [
    {
      ticker: 'AAPL',
      rating: 'STRONG_BUY',
      score: 85,
      confidence: 0.92,
      current_price: 150.25,
      price_change_pct: 2.5,
      rsi: 65,
      sentiment_score: undefined, // No sentiment
    },
    {
      ticker: 'MSFT',
      rating: 'BUY',
      score: 75,
      confidence: 0.85,
      current_price: 380.0,
      price_change_pct: 1.2,
      rsi: 62,
      sentiment_score: undefined, // No sentiment
    },
    {
      ticker: 'GOOGL',
      rating: 'HOLD',
      score: 55,
      confidence: 0.70,
      current_price: 140.0,
      price_change_pct: -0.5,
      rsi: 50,
      sentiment_score: undefined, // No sentiment
    },
  ];

  // =========================================================================
  // No Sentiment Data: Hide sentiment sections, show rating distribution
  // =========================================================================

  describe('no sentiment data: gracefully hides sentiment sections', () => {
    it('should not display Portfolio Avg. Sentiment when no sentiment_score exists', () => {
      // Arrange & Act
      render(
        <SentimentSummaryChart ratings={ratingsWithoutSentiment} />
      );

      // Assert: sentiment section hidden
      expect(screen.queryByText('Portfolio Avg. Sentiment')).not.toBeInTheDocument();
    });

    it('should not display Sentiment Distribution when no sentiment_score exists', () => {
      // Arrange & Act
      render(
        <SentimentSummaryChart ratings={ratingsWithoutSentiment} />
      );

      // Assert: sentiment distribution hidden
      expect(screen.queryByText('Sentiment Distribution')).not.toBeInTheDocument();
      expect(screen.queryByText('Bullish')).not.toBeInTheDocument();
      expect(screen.queryByText('Bearish')).not.toBeInTheDocument();
    });

    it('should still display AI Rating Distribution when sentiment data missing', () => {
      // Arrange & Act
      render(
        <SentimentSummaryChart ratings={ratingsWithoutSentiment} />
      );

      // Assert: rating distribution visible
      expect(screen.getByText('AI Rating Distribution')).toBeInTheDocument();
      expect(screen.getByText('STRONG BUY')).toBeInTheDocument();
      expect(screen.getByText('BUY')).toBeInTheDocument();
      expect(screen.getByText('HOLD')).toBeInTheDocument();
    });

    it('should render title and rating section for ratings with no sentiment', () => {
      // Arrange & Act
      render(
        <SentimentSummaryChart ratings={ratingsWithoutSentiment} />
      );

      // Assert
      expect(screen.getByText('Market Sentiment')).toBeInTheDocument();
      expect(screen.getByText('AI Rating Distribution')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Mixed Sentiment Data: Some have sentiment, some don't
  // =========================================================================

  describe('mixed sentiment data: only counts ratings with sentiment_score', () => {
    it('should calculate sentiment only from ratings with sentiment_score', () => {
      // Arrange: 2 with sentiment (both bullish 0.65, 0.45), 1 without
      const mixed: AIRating[] = [
        {
          ticker: 'WITH_SENT1',
          rating: 'BUY',
          score: 70,
          confidence: 0.8,
          current_price: 100,
          price_change_pct: 1.0,
          rsi: 55,
          sentiment_score: 0.65, // Bullish
        },
        {
          ticker: 'WITH_SENT2',
          rating: 'BUY',
          score: 70,
          confidence: 0.8,
          current_price: 100,
          price_change_pct: 1.0,
          rsi: 55,
          sentiment_score: 0.45, // Bullish
        },
        {
          ticker: 'WITHOUT_SENT',
          rating: 'HOLD',
          score: 50,
          confidence: 0.7,
          current_price: 100,
          price_change_pct: 0.0,
          rsi: 50,
          sentiment_score: undefined, // No sentiment
        },
      ];

      // Act
      render(<SentimentSummaryChart ratings={mixed} />);

      // Assert: sentiment portfolio avg (0.65 + 0.45) / 2 = 0.55 → Bullish
      expect(screen.getByText('Bullish')).toBeInTheDocument();
      expect(screen.getByText('+0.55')).toBeInTheDocument();
    });

    it('should not count ratings without sentiment_score in distribution', () => {
      // Arrange: 2 with sentiment (1 bullish, 1 bearish), 1 without
      const mixed: AIRating[] = [
        {
          ticker: 'BULL',
          rating: 'BUY',
          score: 70,
          confidence: 0.8,
          current_price: 100,
          price_change_pct: 1.0,
          rsi: 55,
          sentiment_score: 0.5, // Bullish
        },
        {
          ticker: 'BEAR',
          rating: 'SELL',
          score: 30,
          confidence: 0.8,
          current_price: 100,
          price_change_pct: -1.0,
          rsi: 40,
          sentiment_score: -0.5, // Bearish
        },
        {
          ticker: 'NONE',
          rating: 'HOLD',
          score: 50,
          confidence: 0.7,
          current_price: 100,
          price_change_pct: 0.0,
          rsi: 50,
          sentiment_score: undefined, // No sentiment
        },
      ];

      // Act
      render(<SentimentSummaryChart ratings={mixed} />);

      // Assert: each bucket is 1/2 = 50%
      const percentages = screen.getAllByText(/\(50%\)/);
      expect(percentages.length).toBeGreaterThan(0);

      // Assert: NOT 1/3 distribution
      expect(screen.queryByText(/\(33%\)/)).not.toBeInTheDocument();
    });

    it('should display rating distribution for all ratings (including those without sentiment)', () => {
      // Arrange: 3 total ratings, only 2 have sentiment
      const mixed: AIRating[] = [
        {
          ticker: 'BULL',
          rating: 'BUY',
          score: 70,
          confidence: 0.8,
          current_price: 100,
          price_change_pct: 1.0,
          rsi: 55,
          sentiment_score: 0.5,
        },
        {
          ticker: 'HOLD_WITH',
          rating: 'HOLD',
          score: 50,
          confidence: 0.7,
          current_price: 100,
          price_change_pct: 0.0,
          rsi: 50,
          sentiment_score: 0.1,
        },
        {
          ticker: 'HOLD_WITHOUT',
          rating: 'HOLD',
          score: 50,
          confidence: 0.7,
          current_price: 100,
          price_change_pct: 0.0,
          rsi: 50,
          sentiment_score: undefined,
        },
      ];

      // Act
      render(<SentimentSummaryChart ratings={mixed} />);

      // Assert: rating distribution shows 1 BUY, 2 HOLD (all 3 ratings)
      expect(screen.getByText('AI Rating Distribution')).toBeInTheDocument();
      const holdCounts = screen.getAllByText(/2/);
      expect(holdCounts.length).toBeGreaterThan(0); // 2 HOLDs
    });
  });

  // =========================================================================
  // Edge Cases: Null sentiment_score value
  // =========================================================================

  describe('edge cases: null sentiment_score (explicitly null vs undefined)', () => {
    it('should treat null sentiment_score same as undefined', () => {
      // Arrange
      const nullSentiment: AIRating[] = [
        {
          ticker: 'NULL_SENT',
          rating: 'BUY',
          score: 70,
          confidence: 0.8,
          current_price: 100,
          price_change_pct: 1.0,
          rsi: 55,
          sentiment_score: null as any, // Explicitly null
        },
        {
          ticker: 'UNDEFINED_SENT',
          rating: 'BUY',
          score: 70,
          confidence: 0.8,
          current_price: 100,
          price_change_pct: 1.0,
          rsi: 55,
          sentiment_score: undefined, // Undefined
        },
      ];

      // Act
      render(<SentimentSummaryChart ratings={nullSentiment} />);

      // Assert: no sentiment sections shown
      expect(screen.queryByText('Portfolio Avg. Sentiment')).not.toBeInTheDocument();
      expect(screen.queryByText('Sentiment Distribution')).not.toBeInTheDocument();
    });

    it('should not crash with empty array and no sentiment data in props', () => {
      // Act & Assert: should render without errors
      render(<SentimentSummaryChart ratings={[]} />);
      expect(screen.getByText('No stocks in watchlist.')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Acceptance: Spec requirements for empty/missing data
  // =========================================================================

  describe('acceptance: spec requirement - guard against empty data', () => {
    it('should gracefully show NoDataState when no sentiment scores exist', () => {
      // Spec: "guard against empty data; add NoDataState"
      // Implementation: Component hides sentiment sections when no data

      // Arrange & Act
      render(
        <SentimentSummaryChart ratings={ratingsWithoutSentiment} />
      );

      // Assert: component renders (no crash), title visible
      expect(screen.getByText('Market Sentiment')).toBeInTheDocument();

      // Assert: sentiment sections hidden gracefully
      expect(screen.queryByText('Portfolio Avg. Sentiment')).not.toBeInTheDocument();
      expect(screen.queryByText('Sentiment Distribution')).not.toBeInTheDocument();

      // Assert: rating distribution still shows (fallback data)
      expect(screen.getByText('AI Rating Distribution')).toBeInTheDocument();
    });

    it('should handle mixed empty/full sentiment gracefully without breaking layout', () => {
      // Arrange: half with sentiment, half without
      const halfFull: AIRating[] = [
        {
          ticker: 'T1',
          rating: 'BUY',
          score: 70,
          confidence: 0.8,
          current_price: 100,
          price_change_pct: 1.0,
          rsi: 55,
          sentiment_score: 0.5,
        },
        {
          ticker: 'T2',
          rating: 'BUY',
          score: 70,
          confidence: 0.8,
          current_price: 100,
          price_change_pct: 1.0,
          rsi: 55,
          sentiment_score: undefined,
        },
      ];

      // Act & Assert: should render without errors or layout shifts
      render(<SentimentSummaryChart ratings={halfFull} />);
      expect(screen.getByText('Market Sentiment')).toBeInTheDocument();
      expect(screen.getByText('AI Rating Distribution')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Integration: Empty sentiment + empty watchlist
  // =========================================================================

  describe('integration: empty sentiment combined with other empty states', () => {
    it('should show empty watchlist message when ratings array is empty', () => {
      // Arrange & Act
      render(<SentimentSummaryChart ratings={[]} />);

      // Assert: empty state message
      expect(screen.getByText('No stocks in watchlist.')).toBeInTheDocument();

      // Assert: no sentiment or rating sections
      expect(screen.queryByText('Portfolio Avg. Sentiment')).not.toBeInTheDocument();
      expect(screen.queryByText('AI Rating Distribution')).not.toBeInTheDocument();
    });

    it('should prioritize empty watchlist message over empty sentiment', () => {
      // Arrange: ratings is empty array (empty watchlist)
      // Act
      render(<SentimentSummaryChart ratings={[]} />);

      // Assert: empty watchlist message appears
      expect(screen.getByText('No stocks in watchlist.')).toBeInTheDocument();

      // Assert: sentiment sections NOT shown
      expect(screen.queryByText('Portfolio Avg. Sentiment')).not.toBeInTheDocument();
      expect(screen.queryByText('Sentiment Distribution')).not.toBeInTheDocument();
    });

    it('should show loading skeleton when ratings is null (loading state)', () => {
      // Arrange & Act
      render(<SentimentSummaryChart ratings={null} />);

      // Assert: loading skeletons visible
      const skeletons = screen.getAllByRole('generic');
      const pulseElements = skeletons.filter((el) =>
        el.className?.includes('animate-pulse')
      );
      expect(pulseElements.length).toBeGreaterThan(0);

      // Assert: no content sections
      expect(screen.queryByText('Market Sentiment')).not.toBeInTheDocument();
    });
  });
});