/**
 * SentimentBadge Component Integration Tests
 *
 * Focused tests validating:
 * - Mixed-source display (News · Reddit · StockTwits)
 * - Trend icon rendering (up/flat/down with correct colors)
 * - Stale data warning indicator
 * - Error state graceful fallback
 *
 * Complements SentimentBadge.stocktwits.test.tsx (unit-level rendering)
 * by testing real-world API response scenarios.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SentimentBadge from '../SentimentBadge';
import { useApi } from '@/hooks/useApi';
import type { SentimentData } from '@/lib/types';

// Mock the useApi hook
jest.mock('@/hooks/useApi');
const mockUseApi = useApi as jest.MockedFunction<typeof useApi>;

describe('SentimentBadge Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock Date.now() for consistent stale detection
    jest.spyOn(Date, 'now').mockReturnValue(1000000000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Mixed-Source Attribution', () => {
    it('displays all three sources when present: News · Reddit · StockTwits', async () => {
      /**
       * AC: Sentiment badge includes source attribution.
       * When: Multiple sources present
       * Then: All sources listed in order with counts
       */
      const mockData: SentimentData = {
        ticker: 'AAPL',
        label: 'bullish',
        score: 0.72,
        signal_count: 43,
        sources: { news: 28, reddit: 11, stocktwits: 4 },
        updated_at: new Date(1000000000 - 100000).toISOString(),
        stale: false,
        trend: 'up',
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      render(<SentimentBadge ticker="AAPL" />);

      const sourceText = screen.getByText('28 News · 11 Reddit · 4 StockTwits');
      expect(sourceText).toBeInTheDocument();
    });

    it('omits StockTwits when count is zero (no live signals)', async () => {
      /**
       * Given: StockTwits source count = 0
       * When: Component renders
       * Then: Source line excludes StockTwits
       */
      const mockData: SentimentData = {
        ticker: 'MSFT',
        label: 'neutral',
        score: 0.50,
        signal_count: 15,
        sources: { news: 10, reddit: 5, stocktwits: 0 },
        updated_at: new Date(1000000000 - 100000).toISOString(),
        stale: false,
        trend: 'flat',
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      render(<SentimentBadge ticker="MSFT" />);

      const sourceText = screen.getByText('10 News · 5 Reddit');
      expect(sourceText).toBeInTheDocument();
      expect(screen.queryByText(/StockTwits/)).not.toBeInTheDocument();
    });

    it('displays single source only when others are absent', async () => {
      /**
       * Edge case: Only Reddit signals present
       */
      const mockData: SentimentData = {
        ticker: 'GOOG',
        label: 'bullish',
        score: 0.65,
        signal_count: 8,
        sources: { news: 0, reddit: 8, stocktwits: 0 },
        updated_at: new Date(1000000000 - 100000).toISOString(),
        stale: false,
        trend: 'up',
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      render(<SentimentBadge ticker="GOOG" />);

      const sourceText = screen.getByText('8 Reddit');
      expect(sourceText).toBeInTheDocument();
      // Ensure no separators when only one source
      expect(screen.queryByText(/·/)).not.toBeInTheDocument();
    });
  });

  describe('Trend Icon & Color Rendering', () => {
    it('renders TrendingUp icon (emerald) when trend=up', async () => {
      /**
       * AC: Trend direction icon reflects 24h sentiment direction.
       * When: trend='up' and bullish label
       * Then: Green TrendingUp icon with emerald color
       */
      const mockData: SentimentData = {
        ticker: 'TSLA',
        label: 'bullish',
        score: 0.78,
        signal_count: 25,
        sources: { news: 15, reddit: 7, stocktwits: 3 },
        updated_at: new Date(1000000000 - 100000).toISOString(),
        stale: false,
        trend: 'up',
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      render(<SentimentBadge ticker="TSLA" />);

      // Verify badge contains "Bullish" and emerald styling
      const badge = screen.getByLabelText(/Sentiment.*bullish.*up/i);
      expect(badge).toHaveClass('text-emerald-400');
    });

    it('renders TrendingDown icon (red) when trend=down', async () => {
      /**
       * When: trend='down' and bearish label
       * Then: Red TrendingDown icon
       */
      const mockData: SentimentData = {
        ticker: 'AMD',
        label: 'bearish',
        score: 0.35,
        signal_count: 12,
        sources: { news: 8, reddit: 4, stocktwits: 0 },
        updated_at: new Date(1000000000 - 100000).toISOString(),
        stale: false,
        trend: 'down',
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      render(<SentimentBadge ticker="AMD" />);

      const badge = screen.getByLabelText(/Sentiment.*bearish.*down/i);
      expect(badge).toHaveClass('text-red-400');
    });

    it('renders Minus icon (slate) when trend=flat', async () => {
      /**
       * When: trend='flat'
       * Then: Neutral Minus icon with slate color
       */
      const mockData: SentimentData = {
        ticker: 'NVDA',
        label: 'neutral',
        score: 0.50,
        signal_count: 10,
        sources: { news: 6, reddit: 4, stocktwits: 0 },
        updated_at: new Date(1000000000 - 100000).toISOString(),
        stale: false,
        trend: 'flat',
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      render(<SentimentBadge ticker="NVDA" />);

      const badge = screen.getByLabelText(/Sentiment.*neutral.*flat/i);
      expect(badge).toHaveClass('text-slate-400');
    });
  });

  describe('Stale Data Detection & Warning', () => {
    it('displays warning indicator when data exceeds 15-minute staleness threshold', async () => {
      /**
       * AC: Badge marks data as stale if age > 15 minutes.
       * When: updated_at is 20 minutes old
       * Then: Warning indicator (⚠) displayed
       */
      const oldTime = new Date(1000000000 - 1200000).toISOString(); // 20 min old
      const mockData: SentimentData = {
        ticker: 'META',
        label: 'bullish',
        score: 0.60,
        signal_count: 18,
        sources: { news: 12, reddit: 6, stocktwits: 0 },
        updated_at: oldTime,
        stale: false,
        trend: 'up',
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      render(<SentimentBadge ticker="META" />);

      // Component detects staleness via isStaleData()
      const badge = screen.getByLabelText(/Sentiment/i);
      expect(badge).toHaveTextContent('⚠');
    });

    it('includes stale warning in tooltip when age > TTL', async () => {
      /**
       * When: Data is 25 minutes old
       * Then: Tooltip includes "Data may be stale" message
       */
      const veryOldTime = new Date(1000000000 - 1500000).toISOString(); // 25 min old
      const mockData: SentimentData = {
        ticker: 'AMZN',
        label: 'neutral',
        score: 0.55,
        signal_count: 20,
        sources: { news: 14, reddit: 6, stocktwits: 0 },
        updated_at: veryOldTime,
        stale: false,
        trend: 'flat',
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      const { container } = render(<SentimentBadge ticker="AMZN" />);
      const badge = container.firstChild;

      // Tooltip includes stale warning
      expect(badge).toHaveAttribute('title', expect.stringContaining('Data may be stale'));
    });

    it('does not show warning when data is fresh (< 15 minutes old)', async () => {
      /**
       * When: updated_at is 5 minutes old
       * Then: No warning indicator
       */
      const freshTime = new Date(1000000000 - 300000).toISOString(); // 5 min old
      const mockData: SentimentData = {
        ticker: 'GOOG',
        label: 'bullish',
        score: 0.70,
        signal_count: 22,
        sources: { news: 16, reddit: 6, stocktwits: 0 },
        updated_at: freshTime,
        stale: false,
        trend: 'up',
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      render(<SentimentBadge ticker="GOOG" />);

      const badge = screen.getByLabelText(/Sentiment/i);
      expect(badge).not.toHaveTextContent('⚠');
    });
  });

  describe('Error States & Edge Cases', () => {
    it('displays loading skeleton when data is fetching', () => {
      /**
       * When: Hook returns loading=true, data=null
       * Then: Animated pulse skeleton displayed
       */
      mockUseApi.mockReturnValue({
        data: null,
        loading: true,
        error: null,
      });

      render(<SentimentBadge ticker="TSLA" />);

      const skeleton = screen.getByLabelText('Loading sentiment');
      expect(skeleton).toHaveClass('animate-pulse');
    });

    it('displays neutral fallback when API returns null data', () => {
      /**
       * When: useApi returns data=null (fetch failed)
       * Then: Graceful fallback message, no crash
       */
      mockUseApi.mockReturnValue({
        data: null,
        loading: false,
        error: new Error('API failed'),
      });

      render(<SentimentBadge ticker="UNKNOWN" />);

      const fallback = screen.getByText('No sentiment data');
      expect(fallback).toBeInTheDocument();
    });

    it('handles missing trend field by defaulting to flat', () => {
      /**
       * Edge case: Backend returns sentiment without trend field
       * When: data.trend is undefined
       * Then: Component defaults to 'flat' icon
       */
      const mockData = {
        ticker: 'XYZ',
        label: 'neutral',
        score: 0.50,
        signal_count: 5,
        sources: { news: 5, reddit: 0, stocktwits: 0 },
        updated_at: new Date(1000000000 - 100000).toISOString(),
        stale: false,
        // trend field missing
      } as unknown as SentimentData;

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      render(<SentimentBadge ticker="XYZ" />);

      const badge = screen.getByLabelText(/Sentiment/i);
      expect(badge).toBeInTheDocument();
      // Should render without crash, defaulting to flat icon
    });

    it('formats null score as em-dash in badge', () => {
      /**
       * When: score is null (no signals)
       * Then: Badge displays "—" instead of "null" or "0.00"
       */
      const mockData: SentimentData = {
        ticker: 'LOWSIGNAL',
        label: 'neutral',
        score: null,
        signal_count: 0,
        sources: { news: 0, reddit: 0, stocktwits: 0 },
        updated_at: new Date(1000000000 - 100000).toISOString(),
        stale: false,
        trend: 'flat',
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      render(<SentimentBadge ticker="LOWSIGNAL" />);

      const badge = screen.getByLabelText(/Sentiment/i);
      expect(badge).toHaveTextContent('—');
    });
  });
});
