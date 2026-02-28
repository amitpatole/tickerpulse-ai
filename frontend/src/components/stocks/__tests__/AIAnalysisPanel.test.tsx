/**
 * Tests for AIAnalysisPanel component
 *
 * Tests cover:
 * - Happy path: Display AI score ring, rating badge, sub-scores
 * - Loading state: Skeleton animation
 * - No data: Graceful fallback when aiRating is null
 * - Edge cases: Missing optional fields (technical_score, fundamental_score, summary)
 * - Acceptance: Score bar rendering with color transitions (65+ green, 40-64 amber, <40 red)
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import AIAnalysisPanel from '../AIAnalysisPanel';
import type { AIRatingBlock } from '@/lib/types';

describe('AIAnalysisPanel', () => {
  // =========================================================================
  // Happy Path: Renders AI analysis with score, rating, and sub-scores
  // =========================================================================

  describe('happy path: displays AI rating with score ring and sub-scores', () => {
    it('renders score ring, rating badge, and sub-score bars with full data', () => {
      // Arrange: Complete AI rating with all fields
      const aiRating: AIRatingBlock = {
        score: 72,
        rating: 'STRONG_BUY',
        confidence: 0.85,
        technical_score: 78,
        fundamental_score: 65,
        summary: 'Technical setup looks bullish with momentum building.',
        sentiment_label: 'bullish',
        sector: 'Technology',
        updated_at: new Date().toISOString(),
      };

      // Act
      render(<AIAnalysisPanel aiRating={aiRating} loading={false} />);

      // Assert: Score ring displays numeric value
      expect(screen.getByText('72')).toBeInTheDocument();

      // Assert: Rating badge displays correctly
      expect(screen.getByText(/strong buy/i)).toBeInTheDocument();

      // Assert: Sub-score bars display with correct values
      expect(screen.getByText(/Confidence/)).toBeInTheDocument();
      expect(screen.getByText('85')).toBeInTheDocument(); // Confidence: 85%

      expect(screen.getByText(/Technical/)).toBeInTheDocument();
      expect(screen.getByText('78')).toBeInTheDocument(); // Technical: 78

      expect(screen.getByText(/Fundamental/)).toBeInTheDocument();
      expect(screen.getByText('65')).toBeInTheDocument(); // Fundamental: 65

      // Assert: Summary and metadata display
      expect(screen.getByText(/Technical setup looks bullish/)).toBeInTheDocument();
      expect(screen.getByText(/bullish/i)).toBeInTheDocument();
      expect(screen.getByText(/Technology/)).toBeInTheDocument();
    });

    it('renders updated_at timestamp in relative format (e.g., "Just now", "5m ago")', () => {
      // Arrange: Recent update
      const aiRating: AIRatingBlock = {
        score: 50,
        rating: 'HOLD',
        confidence: 0.7,
        updated_at: new Date(Date.now() - 180000).toISOString(), // 3 minutes ago
      };

      // Act
      render(<AIAnalysisPanel aiRating={aiRating} loading={false} />);

      // Assert: Relative time displays (format: "3m ago")
      const timeElements = screen.getAllByText(/m ago/);
      expect(timeElements.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Loading State: Shows skeleton animation
  // =========================================================================

  describe('loading state: displays animated skeleton', () => {
    it('shows loading skeleton when loading=true', () => {
      // Act
      const { container } = render(
        <AIAnalysisPanel aiRating={null} loading={true} />
      );

      // Assert: aria-busy attribute indicates loading
      const loadingContainer = container.querySelector('[aria-busy="true"]');
      expect(loadingContainer).toBeInTheDocument();

      // Assert: Animated skeletons present (animate-pulse class)
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // No Data: Graceful fallback when aiRating is null
  // =========================================================================

  describe('no data state: displays fallback message', () => {
    it('shows fallback message when aiRating is null and not loading', () => {
      // Act
      render(<AIAnalysisPanel aiRating={null} loading={false} />);

      // Assert: Fallback text displays
      expect(screen.getByText(/Analysis unavailable/)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Edge Cases: Missing optional fields, boundary scores
  // =========================================================================

  describe('edge cases: handles missing optional fields and boundary scores', () => {
    it('renders correctly when technical_score and fundamental_score are null', () => {
      // Arrange: Minimal rating without technical/fundamental scores
      const aiRating: AIRatingBlock = {
        score: 45,
        rating: 'SELL',
        confidence: 0.6,
        technical_score: null,
        fundamental_score: null,
        summary: null,
      };

      // Act
      render(<AIAnalysisPanel aiRating={aiRating} loading={false} />);

      // Assert: Main score and confidence display
      expect(screen.getByText('45')).toBeInTheDocument();
      expect(screen.getByText('60')).toBeInTheDocument(); // Confidence: 60%

      // Assert: Technical and Fundamental bars NOT rendered (null fields)
      expect(screen.queryByText(/Fundamental/)).not.toBeInTheDocument();
    });

    it('applies correct color coding based on score thresholds', () => {
      // Arrange: Test high score (should be green)
      const { rerender, container: container1 } = render(
        <AIAnalysisPanel
          aiRating={{
            score: 75,
            rating: 'STRONG_BUY',
            confidence: 0.9,
            technical_score: 80,
          }}
          loading={false}
        />
      );

      // Assert: High score uses emerald/green color
      const scoreRing1 = container1.querySelector('circle[stroke="#10b981"]');
      expect(scoreRing1).toBeInTheDocument();

      // Re-render with medium score (should be amber)
      const { container: container2 } = rerender(
        <AIAnalysisPanel
          aiRating={{
            score: 55,
            rating: 'HOLD',
            confidence: 0.7,
            technical_score: 50,
          }}
          loading={false}
        />
      );

      // Assert: Medium score uses amber color
      const scoreRing2 = container2.querySelector('circle[stroke="#f59e0b"]');
      expect(scoreRing2).toBeInTheDocument();

      // Re-render with low score (should be red)
      const { container: container3 } = rerender(
        <AIAnalysisPanel
          aiRating={{
            score: 25,
            rating: 'SELL',
            confidence: 0.5,
            technical_score: 20,
          }}
          loading={false}
        />
      );

      // Assert: Low score uses red color
      const scoreRing3 = container3.querySelector('circle[stroke="#ef4444"]');
      expect(scoreRing3).toBeInTheDocument();
    });

    it('displays sector and sentiment when provided, omits when null', () => {
      // Arrange: Rating without sentiment/sector
      const aiRating: AIRatingBlock = {
        score: 60,
        rating: 'BUY',
        confidence: 0.75,
        sentiment_label: null,
        sector: null,
      };

      // Act
      render(<AIAnalysisPanel aiRating={aiRating} loading={false} />);

      // Assert: Metadata section hidden when both are null
      const metadataSection = screen.queryByText(/Sentiment|Sector/);
      expect(metadataSection).not.toBeInTheDocument();
    });

    it('clamps score values between 0 and 100 for display', () => {
      // Arrange: Score above 100 (should display as 100)
      const aiRating: AIRatingBlock = {
        score: 150, // Out of range
        rating: 'STRONG_BUY',
        confidence: 1.5, // Also out of range
        technical_score: -10, // Negative score
      };

      // Act
      render(<AIAnalysisPanel aiRating={aiRating} loading={false} />);

      // Assert: Display values are clamped (score clamped to 100, confidence to 100)
      const scoreElements = screen.getAllByText(/100/);
      expect(scoreElements.length).toBeGreaterThan(0);

      // Technical score should clamp negative to 0
      const technicalBar = screen.queryByText(/0/);
      expect(technicalBar).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Accessibility: ARIA attributes and semantic markup
  // =========================================================================

  describe('accessibility: proper ARIA attributes and semantic structure', () => {
    it('has proper ARIA labels for score meter and rating badge', () => {
      // Arrange
      const aiRating: AIRatingBlock = {
        score: 72,
        rating: 'STRONG_BUY',
        confidence: 0.85,
      };

      // Act
      const { container } = render(
        <AIAnalysisPanel aiRating={aiRating} loading={false} />
      );

      // Assert: Score ring has aria-label
      const scoreRing = container.querySelector('[aria-label*="AI Score"]');
      expect(scoreRing).toBeInTheDocument();

      // Assert: Confidence meter has proper aria attributes
      const confidenceMeter = container.querySelector('[role="meter"]');
      expect(confidenceMeter).toHaveAttribute('aria-valuenow');
      expect(confidenceMeter).toHaveAttribute('aria-valuemin', '0');
      expect(confidenceMeter).toHaveAttribute('aria-valuemax', '100');
    });
  });
});
