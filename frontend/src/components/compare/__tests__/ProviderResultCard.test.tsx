/**
 * Focused tests for ProviderResultCard component.
 *
 * Coverage:
 * - AC1: Display provider name and model
 * - AC2: Display structured result fields (rating, score, confidence, summary)
 * - AC3: Display latency and error states
 * - AC4: Proper styling for different ratings
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProviderResultCard from '../ProviderResultCard';
import type { ComparisonResult } from '@/lib/types';

describe('ProviderResultCard', () => {
  // =========================================================================
  // AC1: Provider Name and Model Display
  // =========================================================================

  test('should display provider name and model', () => {
    const result: ComparisonResult = {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      rating: 'BUY',
      score: 75,
      confidence: 0.85,
      summary: 'Strong bullish signals',
      duration_ms: 420,
    };

    render(<ProviderResultCard result={result} />);

    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument();
  });

  test('should display model name for unknown providers', () => {
    const result: ComparisonResult = {
      provider: 'custom_provider',
      model: 'custom-model-v1',
      rating: 'SELL',
      summary: 'Bearish outlook',
    };

    render(<ProviderResultCard result={result} />);

    expect(screen.getByText('custom_provider')).toBeInTheDocument();
    expect(screen.getByText('custom-model-v1')).toBeInTheDocument();
  });

  // =========================================================================
  // AC2: Structured Result Fields
  // =========================================================================

  test('should display rating badge when present', () => {
    const result: ComparisonResult = {
      provider: 'openai',
      model: 'gpt-4o',
      rating: 'BUY',
      score: 85,
      confidence: 0.92,
      summary: 'Excellent fundamentals',
      duration_ms: 380,
    };

    render(<ProviderResultCard result={result} />);

    const ratingBadge = screen.getByTestId('rating-badge');
    expect(ratingBadge).toBeInTheDocument();
    expect(ratingBadge).toHaveTextContent('BUY');
  });

  test('should display score and confidence bars', () => {
    const result: ComparisonResult = {
      provider: 'google',
      model: 'gemini-2.0-flash',
      rating: 'HOLD',
      score: 65,
      confidence: 0.78,
      summary: 'Mixed signals',
      duration_ms: 290,
    };

    render(<ProviderResultCard result={result} />);

    // Score bar
    const scoreBar = screen.getByTestId('score-bar-score');
    expect(scoreBar).toBeInTheDocument();

    // Confidence bar
    const confidenceBar = screen.getByTestId('score-bar-confidence');
    expect(confidenceBar).toBeInTheDocument();
  });

  test('should display summary text when present', () => {
    const summaryText = 'Strong uptrend with positive momentum';
    const result: ComparisonResult = {
      provider: 'openai',
      model: 'gpt-4o',
      rating: 'BUY',
      score: 78,
      confidence: 0.88,
      summary: summaryText,
      duration_ms: 450,
    };

    render(<ProviderResultCard result={result} />);

    expect(screen.getByText(summaryText)).toBeInTheDocument();
  });

  test('should skip rating badge if not present', () => {
    const result: ComparisonResult = {
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      summary: 'Analysis complete',
      duration_ms: 510,
    };

    render(<ProviderResultCard result={result} />);

    // Should not have rating badge
    expect(screen.queryByTestId('rating-badge')).not.toBeInTheDocument();
    // But should still have summary
    expect(screen.getByText('Analysis complete')).toBeInTheDocument();
  });

  // =========================================================================
  // AC3: Latency and Error States
  // =========================================================================

  test('should display latency in milliseconds', () => {
    const result: ComparisonResult = {
      provider: 'openai',
      model: 'gpt-4o',
      rating: 'BUY',
      score: 82,
      confidence: 0.90,
      summary: 'Test',
      duration_ms: 1250,
    };

    render(<ProviderResultCard result={result} />);

    expect(screen.getByText('1250ms')).toBeInTheDocument();
  });

  test('should display error message when error is present', () => {
    const errorMsg = 'API rate limit exceeded';
    const result: ComparisonResult = {
      provider: 'google',
      model: 'gemini-2.0-flash',
      error: errorMsg,
    };

    render(<ProviderResultCard result={result} />);

    const errorMessage = screen.getByTestId('error-message');
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage).toHaveTextContent(errorMsg);
  });

  test('should not display score/confidence when error is present', () => {
    const result: ComparisonResult = {
      provider: 'openai',
      model: 'gpt-4o',
      error: 'Timeout',
      duration_ms: 5000,
    };

    render(<ProviderResultCard result={result} />);

    expect(screen.queryByTestId('score-bar-score')).not.toBeInTheDocument();
    expect(screen.queryByTestId('score-bar-confidence')).not.toBeInTheDocument();
  });

  // =========================================================================
  // AC4: Rating-Based Styling
  // =========================================================================

  test('should apply correct styling for BUY rating', () => {
    const result: ComparisonResult = {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      rating: 'BUY',
      score: 80,
      confidence: 0.88,
      summary: 'Bullish outlook',
      duration_ms: 400,
    };

    render(<ProviderResultCard result={result} />);

    const ratingBadge = screen.getByTestId('rating-badge');
    // Should have emerald styling for BUY
    expect(ratingBadge).toHaveClass('text-emerald-400');
  });

  test('should apply correct styling for HOLD rating', () => {
    const result: ComparisonResult = {
      provider: 'openai',
      model: 'gpt-4o',
      rating: 'HOLD',
      score: 60,
      confidence: 0.72,
      summary: 'Wait for clarity',
      duration_ms: 350,
    };

    render(<ProviderResultCard result={result} />);

    const ratingBadge = screen.getByTestId('rating-badge');
    // Should have amber styling for HOLD
    expect(ratingBadge).toHaveClass('text-amber-400');
  });

  test('should apply correct styling for SELL rating', () => {
    const result: ComparisonResult = {
      provider: 'google',
      model: 'gemini-2.0-flash',
      rating: 'SELL',
      score: 25,
      confidence: 0.81,
      summary: 'Downside risks',
      duration_ms: 320,
    };

    render(<ProviderResultCard result={result} />);

    const ratingBadge = screen.getByTestId('rating-badge');
    // Should have red styling for SELL
    expect(ratingBadge).toHaveClass('text-red-400');
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  test('should handle missing optional fields gracefully', () => {
    const result: ComparisonResult = {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    };

    render(<ProviderResultCard result={result} />);

    // Should render without crashing
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument();
  });

  test('should handle score value of 0', () => {
    const result: ComparisonResult = {
      provider: 'openai',
      model: 'gpt-4o',
      score: 0,
      confidence: 0.5,
      summary: 'No confidence',
      duration_ms: 200,
    };

    render(<ProviderResultCard result={result} />);

    const scoreBar = screen.getByTestId('score-bar-score');
    expect(scoreBar).toBeInTheDocument();
  });

  test('should handle score value exceeding 100', () => {
    const result: ComparisonResult = {
      provider: 'openai',
      model: 'gpt-4o',
      score: 150, // Should be clamped to 100%
      confidence: 0.99,
      summary: 'Strong signal',
      duration_ms: 300,
    };

    render(<ProviderResultCard result={result} />);

    const scoreBar = screen.getByTestId('score-bar-score');
    expect(scoreBar).toBeInTheDocument();
  });
});
