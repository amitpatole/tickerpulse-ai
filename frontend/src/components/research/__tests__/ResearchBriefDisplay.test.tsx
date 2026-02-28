/**
 * Test suite for research brief display enhancements: summary panel, key metrics
 *
 * Tests cover:
 * 1. Rendering executive summary in callout box
 * 2. Rendering key metrics panel (price, RSI, rating, sentiment)
 * 3. Handling missing summary and metrics gracefully
 * 4. Type safety for ResearchBrief with optional fields
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ResearchBrief, KeyMetrics } from '@/lib/types';

// Mock component to test: ResearchBriefDisplay
// This is the component that would render summary + metrics + content
const ResearchBriefDisplay: React.FC<{ brief: ResearchBrief }> = ({ brief }) => {
  return (
    <div data-testid="brief-display">
      {/* Ticker badge */}
      <div className="text-2xl font-bold text-blue-500">{brief.ticker}</div>

      {/* Title */}
      <h1 className="text-xl font-bold">{brief.title}</h1>

      {/* Metadata */}
      <div className="text-sm text-gray-500" data-testid="metadata">
        Agent: {brief.agent_name} | Model: {brief.model_used} |
        Created: {brief.created_at}
      </div>

      {/* Key Metrics Panel */}
      {brief.key_metrics && (
        <div data-testid="key-metrics-panel" className="bg-blue-50 p-4 rounded mt-4">
          <h3 className="font-bold text-sm">Key Metrics</h3>
          <div className="grid grid-cols-2 gap-4 mt-2">
            {brief.key_metrics.price !== null &&
              brief.key_metrics.price !== undefined && (
                <div data-testid="metric-price">
                  <span className="text-xs font-semibold">Price</span>
                  <div className="text-lg font-bold">
                    ${brief.key_metrics.price.toFixed(2)}
                    {brief.key_metrics.change_pct !== null &&
                      brief.key_metrics.change_pct !== undefined && (
                        <span
                          className={
                            brief.key_metrics.change_pct >= 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }
                        >
                          {' '}
                          (
                          {(brief.key_metrics.change_pct >= 0
                            ? '+'
                            : '') + brief.key_metrics.change_pct.toFixed(2)}
                          %)
                        </span>
                      )}
                  </div>
                </div>
              )}

            {brief.key_metrics.rsi !== null &&
              brief.key_metrics.rsi !== undefined && (
                <div data-testid="metric-rsi">
                  <span className="text-xs font-semibold">RSI</span>
                  <div className="text-lg font-bold">{brief.key_metrics.rsi.toFixed(1)}</div>
                </div>
              )}

            {brief.key_metrics.rating && (
              <div data-testid="metric-rating">
                <span className="text-xs font-semibold">Rating</span>
                <div className="text-lg font-bold">{brief.key_metrics.rating}</div>
              </div>
            )}

            {brief.key_metrics.sentiment_label && (
              <div data-testid="metric-sentiment">
                <span className="text-xs font-semibold">Sentiment</span>
                <div className="text-lg font-bold capitalize">
                  {brief.key_metrics.sentiment_label}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Executive Summary Callout */}
      {brief.summary && (
        <div
          data-testid="executive-summary"
          className="bg-gray-100 border-l-4 border-blue-500 p-4 mt-4 italic"
        >
          <h4 className="font-bold text-sm mb-2">Executive Summary</h4>
          <p className="text-sm text-gray-700">{brief.summary}</p>
        </div>
      )}

      {/* Full Content */}
      <div
        data-testid="brief-content"
        className="prose mt-6"
        dangerouslySetInnerHTML={{ __html: brief.content }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResearchBriefDisplay', () => {
  const mockBrief: ResearchBrief = {
    id: 1,
    ticker: 'AAPL',
    title: 'Apple Inc. Deep Dive',
    content: '<h2>Technical Analysis</h2><p>Bullish setup observed.</p>',
    summary: 'Apple shows strong technical indicators with solid fundamentals.',
    agent_name: 'researcher',
    model_used: 'claude-sonnet-4-5',
    created_at: '2026-02-27T10:00:00Z',
    key_metrics: {
      price: 150.25,
      change_pct: 2.5,
      rsi: 65.0,
      sentiment_score: 0.75,
      sentiment_label: 'bullish',
      rating: 'BUY',
      score: 8.5,
    },
  };

  describe('Basic Rendering', () => {
    it('should render ticker badge', () => {
      render(<ResearchBriefDisplay brief={mockBrief} />);
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    it('should render brief title', () => {
      render(<ResearchBriefDisplay brief={mockBrief} />);
      expect(screen.getByText('Apple Inc. Deep Dive')).toBeInTheDocument();
    });

    it('should render metadata (agent, model, created_at)', () => {
      render(<ResearchBriefDisplay brief={mockBrief} />);
      const metadata = screen.getByTestId('metadata');
      expect(metadata).toHaveTextContent('researcher');
      expect(metadata).toHaveTextContent('claude-sonnet-4-5');
      expect(metadata).toHaveTextContent('2026-02-27');
    });
  });

  describe('Executive Summary Panel', () => {
    it('should render executive summary when present', () => {
      render(<ResearchBriefDisplay brief={mockBrief} />);
      const summary = screen.getByTestId('executive-summary');
      expect(summary).toBeInTheDocument();
      expect(summary).toHaveTextContent('Executive Summary');
      expect(summary).toHaveTextContent(
        'Apple shows strong technical indicators with solid fundamentals.'
      );
    });

    it('should NOT render summary panel when summary is null', () => {
      const briefWithoutSummary: ResearchBrief = {
        ...mockBrief,
        summary: null,
      };
      render(<ResearchBriefDisplay brief={briefWithoutSummary} />);
      expect(screen.queryByTestId('executive-summary')).not.toBeInTheDocument();
    });

    it('should NOT render summary panel when summary is undefined', () => {
      const briefWithoutSummary: ResearchBrief = {
        ...mockBrief,
        summary: undefined,
      };
      render(<ResearchBriefDisplay brief={briefWithoutSummary} />);
      expect(screen.queryByTestId('executive-summary')).not.toBeInTheDocument();
    });

    it('should render summary with correct styling (callout box)', () => {
      render(<ResearchBriefDisplay brief={mockBrief} />);
      const summary = screen.getByTestId('executive-summary');
      expect(summary).toHaveClass('bg-gray-100', 'border-l-4', 'border-blue-500');
    });
  });

  describe('Key Metrics Panel', () => {
    it('should render key metrics panel when present', () => {
      render(<ResearchBriefDisplay brief={mockBrief} />);
      const metricsPanel = screen.getByTestId('key-metrics-panel');
      expect(metricsPanel).toBeInTheDocument();
      expect(metricsPanel).toHaveTextContent('Key Metrics');
    });

    it('should render price metric with change percentage', () => {
      render(<ResearchBriefDisplay brief={mockBrief} />);
      const priceMetric = screen.getByTestId('metric-price');
      expect(priceMetric).toHaveTextContent('Price');
      expect(priceMetric).toHaveTextContent('150.25');
      expect(priceMetric).toHaveTextContent('+2.50%');
    });

    it('should render RSI metric when available', () => {
      render(<ResearchBriefDisplay brief={mockBrief} />);
      const rsiMetric = screen.getByTestId('metric-rsi');
      expect(rsiMetric).toHaveTextContent('RSI');
      expect(rsiMetric).toHaveTextContent('65.0');
    });

    it('should render rating metric when available', () => {
      render(<ResearchBriefDisplay brief={mockBrief} />);
      const ratingMetric = screen.getByTestId('metric-rating');
      expect(ratingMetric).toHaveTextContent('Rating');
      expect(ratingMetric).toHaveTextContent('BUY');
    });

    it('should render sentiment metric when available', () => {
      render(<ResearchBriefDisplay brief={mockBrief} />);
      const sentimentMetric = screen.getByTestId('metric-sentiment');
      expect(sentimentMetric).toHaveTextContent('Sentiment');
      expect(sentimentMetric).toHaveTextContent('bullish');
    });

    it('should NOT render key metrics panel when metrics is null', () => {
      const briefWithoutMetrics: ResearchBrief = {
        ...mockBrief,
        key_metrics: null,
      };
      render(<ResearchBriefDisplay brief={briefWithoutMetrics} />);
      expect(screen.queryByTestId('key-metrics-panel')).not.toBeInTheDocument();
    });

    it('should NOT render key metrics panel when metrics is undefined', () => {
      const briefWithoutMetrics: ResearchBrief = {
        ...mockBrief,
        key_metrics: undefined,
      };
      render(<ResearchBriefDisplay brief={briefWithoutMetrics} />);
      expect(screen.queryByTestId('key-metrics-panel')).not.toBeInTheDocument();
    });

    it('should handle missing individual metric values gracefully', () => {
      const briefPartialMetrics: ResearchBrief = {
        ...mockBrief,
        key_metrics: {
          price: 150.25,
          change_pct: null, // Missing
          rsi: undefined, // Missing
          sentiment_label: 'bullish',
          rating: 'BUY',
          score: 8.5,
        },
      };
      render(<ResearchBriefDisplay brief={briefPartialMetrics} />);
      const metricsPanel = screen.getByTestId('key-metrics-panel');
      expect(metricsPanel).toBeInTheDocument();
      // Price should still render
      expect(screen.getByTestId('metric-price')).toBeInTheDocument();
      // RSI should not render since it's undefined
      expect(screen.queryByTestId('metric-rsi')).not.toBeInTheDocument();
    });

    it('should color price change red for negative returns', () => {
      const briefDownMetrics: ResearchBrief = {
        ...mockBrief,
        key_metrics: {
          ...mockBrief.key_metrics!,
          change_pct: -3.5,
        },
      };
      render(<ResearchBriefDisplay brief={briefDownMetrics} />);
      const priceMetric = screen.getByTestId('metric-price');
      // Check for red-600 class in the percentage span
      expect(priceMetric).toHaveTextContent('-3.50%');
      const percentSpan = priceMetric.querySelector('.text-red-600');
      expect(percentSpan).toBeInTheDocument();
    });
  });

  describe('Type Safety - ResearchBrief Interface', () => {
    it('should accept ResearchBrief with all optional fields', () => {
      const completeBrief: ResearchBrief = {
        id: 1,
        ticker: 'MSFT',
        title: 'Microsoft Analysis',
        content: '<p>Content</p>',
        summary: 'Summary',
        agent_name: 'researcher',
        model_used: 'claude-sonnet',
        created_at: '2026-02-27T10:00:00Z',
        key_metrics: {
          price: 350.0,
          change_pct: 1.5,
          rsi: 55.0,
          sentiment_label: 'neutral',
          rating: 'HOLD',
          score: 7.0,
        },
      };
      render(<ResearchBriefDisplay brief={completeBrief} />);
      expect(screen.getByTestId('brief-display')).toBeInTheDocument();
    });

    it('should accept ResearchBrief with minimal fields', () => {
      const minimalBrief: ResearchBrief = {
        id: 2,
        title: 'Minimal Brief',
        content: '<p>Content</p>',
        created_at: '2026-02-27T10:00:00Z',
      };
      render(<ResearchBriefDisplay brief={minimalBrief} />);
      expect(screen.getByTestId('brief-display')).toBeInTheDocument();
    });
  });

  describe('Content Rendering', () => {
    it('should render brief content as HTML', () => {
      render(<ResearchBriefDisplay brief={mockBrief} />);
      const content = screen.getByTestId('brief-content');
      expect(content).toBeInTheDocument();
      expect(content).toHaveTextContent('Bullish setup observed.');
    });
  });
});
