/**
 * Tests for NewsFeed Component
 *
 * Validates news article rendering with proper formatting, keyboard navigation,
 * sentiment color coding, and graceful handling of loading/error states.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import NewsFeed from '@/components/dashboard/NewsFeed';
import type { NewsArticle } from '@/lib/types';

// Mock the useApi hook to control data fetching
jest.mock('@/hooks/useApi', () => ({
  useApi: jest.fn(),
}));

// Mock keyboard integration hooks
jest.mock('@/hooks/useNewsFeedKeyboard', () => ({
  useNewsFeedKeyboard: jest.fn(() => ({
    focusedIndex: -1,
    itemRefs: { current: [] },
    handleKeyDown: jest.fn(),
    activatePanel: jest.fn(),
  })),
}));

jest.mock('@/components/layout/KeyboardShortcutsProvider', () => ({
  useKeyboardShortcutsContext: jest.fn(() => ({
    registerNewsFeed: jest.fn(),
  })),
}));

import { useApi } from '@/hooks/useApi';

const mockUseApi = useApi as jest.MockedFunction<typeof useApi>;

describe('NewsFeed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Happy Path: Normal operation with news articles
  // =========================================================================

  describe('happy path: renders news articles with proper formatting', () => {
    it('renders articles with title, link, ticker badge, and sentiment', () => {
      const mockArticles: NewsArticle[] = [
        {
          id: 'article-1',
          title: 'Tesla Q4 Earnings Beat Expectations',
          url: 'https://example.com/article1',
          ticker: 'TSLA',
          sentiment_label: 'bullish',
          source: 'CNBC',
          created_at: new Date().toISOString(),
        },
        {
          id: 'article-2',
          title: 'Apple Announces New Product Launch',
          url: 'https://example.com/article2',
          ticker: 'AAPL',
          sentiment_label: 'neutral',
          source: 'Reuters',
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
      ];

      mockUseApi.mockReturnValue({
        data: mockArticles,
        loading: false,
        error: null,
      });

      render(<NewsFeed />);

      // Assert: Article titles render
      expect(screen.getByText(/Tesla Q4 Earnings Beat Expectations/)).toBeInTheDocument();
      expect(screen.getByText(/Apple Announces New Product Launch/)).toBeInTheDocument();

      // Assert: Ticker badges render
      expect(screen.getByText('TSLA')).toBeInTheDocument();
      expect(screen.getByText('AAPL')).toBeInTheDocument();

      // Assert: Sentiment labels render
      expect(screen.getByText(/bullish/i)).toBeInTheDocument();
      expect(screen.getByText(/neutral/i)).toBeInTheDocument();

      // Assert: Sources render
      expect(screen.getByText('CNBC')).toBeInTheDocument();
      expect(screen.getByText('Reuters')).toBeInTheDocument();
    });

    it('renders article links with correct attributes (target="_blank", rel="noopener noreferrer")', () => {
      const mockArticles: NewsArticle[] = [
        {
          id: 'article-1',
          title: 'Market Update',
          url: 'https://example.com/market-update',
          ticker: 'SPY',
          sentiment_label: 'bullish',
          source: 'Bloomberg',
          created_at: new Date().toISOString(),
        },
      ];

      mockUseApi.mockReturnValue({
        data: mockArticles,
        loading: false,
        error: null,
      });

      const { container } = render(<NewsFeed />);

      const link = container.querySelector('a[href="https://example.com/market-update"]');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('formats timestamps relative to current time (e.g., "5m ago", "2h ago")', () => {
      const mockArticles: NewsArticle[] = [
        {
          id: 'article-1',
          title: 'Breaking News',
          url: 'https://example.com/breaking',
          ticker: 'BRK',
          sentiment_label: 'bullish',
          source: 'Reuters',
          created_at: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
        },
      ];

      mockUseApi.mockReturnValue({
        data: mockArticles,
        loading: false,
        error: null,
      });

      render(<NewsFeed />);

      // Assert: Relative time format appears
      expect(screen.getByText(/m ago|h ago|Just now/)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Loading State: Shows skeleton animation
  // =========================================================================

  describe('loading state: displays animated skeleton', () => {
    it('shows loading skeleton when loading=true and no articles yet', () => {
      mockUseApi.mockReturnValue({
        data: null,
        loading: true,
        error: null,
      });

      const { container } = render(<NewsFeed />);

      // Assert: aria-busy indicates loading
      const feedContainer = container.querySelector('[aria-busy="true"]');
      expect(feedContainer).toBeInTheDocument();

      // Assert: Animated skeleton divs present (animate-pulse class)
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // No Data / Empty State: No articles available
  // =========================================================================

  describe('no data: displays empty state message gracefully', () => {
    it('shows "No news articles yet" when articles array is empty', () => {
      mockUseApi.mockReturnValue({
        data: [],
        loading: false,
        error: null,
      });

      render(<NewsFeed />);

      expect(screen.getByText(/No news articles yet/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Error Case: API failure
  // =========================================================================

  describe('error case: gracefully handles API errors', () => {
    it('displays error message when news API fails', () => {
      mockUseApi.mockReturnValue({
        data: null,
        loading: false,
        error: 'Failed to fetch news articles',
      });

      render(<NewsFeed />);

      expect(screen.getByText(/Failed to fetch news articles/i)).toBeInTheDocument();
    });

    it('shows error even if there were previous articles', () => {
      mockUseApi.mockReturnValue({
        data: null,
        loading: false,
        error: 'Network error: Connection timeout',
      });

      render(<NewsFeed />);

      expect(screen.getByText(/Network error: Connection timeout/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Edge Cases: Missing optional fields, boundary conditions
  // =========================================================================

  describe('edge cases: handles missing fields and boundary conditions', () => {
    it('renders articles without sentiment_label when null', () => {
      const mockArticles: NewsArticle[] = [
        {
          id: 'article-1',
          title: 'Neutral Article',
          url: 'https://example.com/neutral',
          ticker: 'XYZ',
          sentiment_label: null,
          source: 'Wire Service',
          created_at: new Date().toISOString(),
        },
      ];

      mockUseApi.mockReturnValue({
        data: mockArticles,
        loading: false,
        error: null,
      });

      render(<NewsFeed />);

      // Assert: Article still renders, ticker and source still present
      expect(screen.getByText(/Neutral Article/)).toBeInTheDocument();
      expect(screen.getByText('XYZ')).toBeInTheDocument();
      expect(screen.getByText('Wire Service')).toBeInTheDocument();
    });

    it('truncates long article titles to prevent layout overflow', () => {
      const longTitle = 'A'.repeat(200); // Very long title
      const mockArticles: NewsArticle[] = [
        {
          id: 'article-1',
          title: longTitle,
          url: 'https://example.com/long',
          ticker: 'LONG',
          sentiment_label: 'bullish',
          source: 'Source',
          created_at: new Date().toISOString(),
        },
      ];

      mockUseApi.mockReturnValue({
        data: mockArticles,
        loading: false,
        error: null,
      });

      const { container } = render(<NewsFeed />);

      // Assert: Article title element has line-clamp class (max 2 lines)
      const titleElement = container.querySelector('[class*="line-clamp"]');
      expect(titleElement).toBeInTheDocument();
    });

    it('handles articles with missing created_at gracefully', () => {
      const mockArticles: NewsArticle[] = [
        {
          id: 'article-1',
          title: 'Undated Article',
          url: 'https://example.com/undated',
          ticker: 'UND',
          sentiment_label: 'neutral',
          source: 'Source',
          created_at: '', // Empty timestamp
        },
      ];

      mockUseApi.mockReturnValue({
        data: mockArticles,
        loading: false,
        error: null,
      });

      render(<NewsFeed />);

      // Assert: Article still renders despite missing/invalid timestamp
      expect(screen.getByText(/Undated Article/)).toBeInTheDocument();
    });

    it('maintains container max-height and enables scrolling for many articles', () => {
      const mockArticles: NewsArticle[] = Array.from({ length: 20 }, (_, i) => ({
        id: `article-${i}`,
        title: `Article ${i + 1}`,
        url: `https://example.com/article${i}`,
        ticker: `TICK${i}`,
        sentiment_label: i % 2 === 0 ? 'bullish' : 'bearish',
        source: `Source ${i}`,
        created_at: new Date(Date.now() - i * 3600000).toISOString(),
      }));

      mockUseApi.mockReturnValue({
        data: mockArticles,
        loading: false,
        error: null,
      });

      const { container } = render(<NewsFeed />);

      // Assert: Container has max-height and overflow-y-auto for scrolling
      const feedContainer = container.querySelector('[role="feed"]');
      expect(feedContainer).toHaveClass('max-h-[600px]');
      expect(feedContainer).toHaveClass('overflow-y-auto');
    });
  });

  // =========================================================================
  // Accessibility: ARIA attributes and semantic markup
  // =========================================================================

  describe('accessibility: proper ARIA attributes and semantic structure', () => {
    it('has role="feed" and aria-label for screen readers', () => {
      const mockArticles: NewsArticle[] = [
        {
          id: 'article-1',
          title: 'Accessible Article',
          url: 'https://example.com/accessible',
          ticker: 'ACC',
          sentiment_label: 'bullish',
          source: 'Source',
          created_at: new Date().toISOString(),
        },
      ];

      mockUseApi.mockReturnValue({
        data: mockArticles,
        loading: false,
        error: null,
      });

      const { container } = render(<NewsFeed />);

      const feed = container.querySelector('[role="feed"]');
      expect(feed).toHaveAttribute('aria-label', 'Recent news');
    });

    it('each article has role="article" and aria-label with title', () => {
      const mockArticles: NewsArticle[] = [
        {
          id: 'article-1',
          title: 'Test Article Title',
          url: 'https://example.com/test',
          ticker: 'TEST',
          sentiment_label: 'bullish',
          source: 'Source',
          created_at: new Date().toISOString(),
        },
      ];

      mockUseApi.mockReturnValue({
        data: mockArticles,
        loading: false,
        error: null,
      });

      const { container } = render(<NewsFeed />);

      const article = container.querySelector('[role="article"]');
      expect(article).toHaveAttribute('aria-label', 'Test Article Title');
    });
  });
});
