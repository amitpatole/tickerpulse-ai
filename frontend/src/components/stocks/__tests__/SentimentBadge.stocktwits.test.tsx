/**
 * Tests for SentimentBadge: StockTwits integration + 24h trend display
 *
 * Covers:
 * - Trend icon rendering (up/flat/down) with color classes
 * - Tooltip includes StockTwits count and trend direction
 * - Source line attribution for StockTwits
 * - Edge case: missing trend data defaults to 'flat'
 */

import { render, screen } from '@testing-library/react';
import type { SentimentData } from '@/lib/types';
import SentimentBadge from '../SentimentBadge';

// Mock useApi hook
jest.mock('@/hooks/useApi', () => ({
  useApi: jest.fn(),
}));

// Mock getStockSentiment API call
jest.mock('@/lib/api', () => ({
  getStockSentiment: jest.fn(),
}));

import { useApi } from '@/hooks/useApi';

const mockUseApi = useApi as jest.MockedFunction<typeof useApi>;

describe('SentimentBadge — StockTwits Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Trend icon rendering', () => {
    test('renders TrendingUp icon when trend is "up"', () => {
      const mockData: SentimentData = {
        ticker: 'AAPL',
        score: 0.75,
        label: 'bullish',
        signal_count: 10,
        sources: { news: 6, reddit: 2, stocktwits: 2 },
        trend: 'up',
        stale: false,
        updated_at: new Date().toISOString(),
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      render(<SentimentBadge ticker="AAPL" />);

      // TrendingUp icon has aria-hidden="true", check the SVG
      const badge = screen.getByLabelText(/Sentiment: Bullish, trend up/i);
      expect(badge).toBeInTheDocument();
      // Icon container should have emerald color (trend up)
      expect(badge).toHaveTextContent('Bullish');
    });

    test('renders TrendingDown icon when trend is "down"', () => {
      const mockData: SentimentData = {
        ticker: 'TSLA',
        score: 0.35,
        label: 'bearish',
        signal_count: 8,
        sources: { news: 4, reddit: 2, stocktwits: 2 },
        trend: 'down',
        stale: false,
        updated_at: new Date().toISOString(),
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      render(<SentimentBadge ticker="TSLA" />);

      const badge = screen.getByLabelText(/Sentiment: Bearish, trend down/i);
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Bearish');
    });

    test('renders Minus icon when trend is "flat"', () => {
      const mockData: SentimentData = {
        ticker: 'MSFT',
        score: 0.5,
        label: 'neutral',
        signal_count: 12,
        sources: { news: 7, reddit: 3, stocktwits: 2 },
        trend: 'flat',
        stale: false,
        updated_at: new Date().toISOString(),
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      render(<SentimentBadge ticker="MSFT" />);

      const badge = screen.getByLabelText(/Sentiment: Neutral, trend flat/i);
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Neutral');
    });

    test('defaults to flat trend icon when trend field is missing', () => {
      const mockData: SentimentData = {
        ticker: 'GOOGL',
        score: 0.68,
        label: 'bullish',
        signal_count: 9,
        sources: { news: 5, reddit: 2, stocktwits: 2 },
        // trend intentionally omitted
        stale: false,
        updated_at: new Date().toISOString(),
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      render(<SentimentBadge ticker="GOOGL" />);

      // Should default to 'flat' trend, which renders Minus icon
      const badge = screen.getByLabelText(/Sentiment: Bullish, trend flat/i);
      expect(badge).toBeInTheDocument();
    });
  });

  describe('Tooltip content', () => {
    test('tooltip includes StockTwits count and trend direction', () => {
      const mockData: SentimentData = {
        ticker: 'NVDA',
        score: 0.82,
        label: 'bullish',
        signal_count: 15,
        sources: { news: 8, reddit: 3, stocktwits: 4 },
        trend: 'up',
        stale: false,
        updated_at: '2026-02-28T14:30:00Z',
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      const { container } = render(<SentimentBadge ticker="NVDA" />);

      // Find the main badge div (has title attribute)
      const badgeContainer = container.querySelector('[title*="StockTwits"]');
      expect(badgeContainer).toBeInTheDocument();

      const tooltip = badgeContainer?.getAttribute('title') || '';
      expect(tooltip).toContain('StockTwits: 4');
      expect(tooltip).toContain('Trend (24h): up');
      expect(tooltip).toContain('15 signals');
    });

    test('tooltip shows correct trend direction in label', () => {
      const mockData: SentimentData = {
        ticker: 'AMZN',
        score: 0.45,
        label: 'neutral',
        signal_count: 11,
        sources: { news: 6, reddit: 2, stocktwits: 3 },
        trend: 'down',
        stale: false,
        updated_at: new Date().toISOString(),
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      const { container } = render(<SentimentBadge ticker="AMZN" />);

      const badgeContainer = container.querySelector('[title]');
      const tooltip = badgeContainer?.getAttribute('title') || '';
      expect(tooltip).toContain('Trend (24h): down');
    });
  });

  describe('Source attribution', () => {
    test('renders StockTwits in source line when count > 0', () => {
      const mockData: SentimentData = {
        ticker: 'META',
        score: 0.58,
        label: 'neutral',
        signal_count: 13,
        sources: { news: 7, reddit: 2, stocktwits: 4 },
        trend: 'flat',
        stale: false,
        updated_at: new Date().toISOString(),
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      render(<SentimentBadge ticker="META" />);

      // Source line should show all three sources separated by dots
      expect(screen.getByText(/7 News · 2 Reddit · 4 StockTwits/)).toBeInTheDocument();
    });

    test('source line omits StockTwits when count is 0', () => {
      const mockData: SentimentData = {
        ticker: 'INTC',
        score: 0.52,
        label: 'neutral',
        signal_count: 9,
        sources: { news: 8, reddit: 1, stocktwits: 0 },
        trend: 'flat',
        stale: false,
        updated_at: new Date().toISOString(),
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      render(<SentimentBadge ticker="INTC" />);

      // Should not include StockTwits when zero
      expect(screen.getByText(/8 News · 1 Reddit/)).toBeInTheDocument();
      expect(screen.queryByText(/StockTwits/)).not.toBeInTheDocument();
    });

    test('source line shows only News when other sources are 0', () => {
      const mockData: SentimentData = {
        ticker: 'AMD',
        score: 0.61,
        label: 'bullish',
        signal_count: 5,
        sources: { news: 5, reddit: 0, stocktwits: 0 },
        trend: 'up',
        stale: false,
        updated_at: new Date().toISOString(),
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      render(<SentimentBadge ticker="AMD" />);

      expect(screen.getByText(/5 News/)).toBeInTheDocument();
      expect(screen.queryByText(/Reddit/)).not.toBeInTheDocument();
      expect(screen.queryByText(/StockTwits/)).not.toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    test('renders loading state before data arrives', () => {
      mockUseApi.mockReturnValue({
        data: null,
        loading: true,
        error: null,
      });

      render(<SentimentBadge ticker="AAPL" />);

      expect(screen.getByLabelText(/Loading sentiment/)).toBeInTheDocument();
    });

    test('renders error message when data fetch fails', () => {
      mockUseApi.mockReturnValue({
        data: null,
        loading: false,
        error: new Error('API error'),
      });

      render(<SentimentBadge ticker="AAPL" />);

      expect(screen.getByText(/No sentiment data/)).toBeInTheDocument();
    });

    test('handles null score in display', () => {
      const mockData: SentimentData = {
        ticker: 'UNKNOWN',
        score: null,
        label: 'neutral',
        signal_count: 0,
        sources: { news: 0, reddit: 0, stocktwits: 2 },
        trend: 'flat',
        stale: false,
        updated_at: new Date().toISOString(),
      };

      mockUseApi.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
      });

      render(<SentimentBadge ticker="UNKNOWN" />);

      // Score should display as "—" when null
      expect(screen.getByText(/—/)).toBeInTheDocument();
    });
  });
});
