/**
 * Integration Tests for NewsFeed Keyboard Navigation
 *
 * Tests the real keyboard interaction flow: roving focus pattern, ARIA state
 * updates, keyboard shortcut activation, and focus management in the context
 * of the rendered component and hook.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import NewsFeed from '@/components/dashboard/NewsFeed';
import type { NewsArticle } from '@/lib/types';

// Mock keyboard shortcuts provider to track activation
jest.mock('@/components/layout/KeyboardShortcutsProvider', () => ({
  useKeyboardShortcutsContext: jest.fn(() => ({
    registerNewsFeed: jest.fn((callback) => {
      // Store the callback globally for test access
      (window as any)._newsFeedActivateCallback = callback;
    }),
  })),
}));

// Don't mock the hook - we want to test the real keyboard integration
jest.unmock('@/hooks/useNewsFeedKeyboard');

describe('NewsFeed Keyboard Navigation Integration', () => {
  const mockArticles: NewsArticle[] = [
    {
      id: 1,
      title: 'Article One',
      url: 'https://example.com/1',
      ticker: 'AAPL',
      sentiment_label: 'bullish',
      source: 'Bloomberg',
      created_at: new Date().toISOString(),
    },
    {
      id: 2,
      title: 'Article Two',
      url: 'https://example.com/2',
      ticker: 'MSFT',
      sentiment_label: 'neutral',
      source: 'Reuters',
      created_at: new Date().toISOString(),
    },
    {
      id: 3,
      title: 'Article Three',
      url: 'https://example.com/3',
      ticker: 'GOOGL',
      sentiment_label: 'bearish',
      source: 'CNBC',
      created_at: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    delete (window as any)._newsFeedActivateCallback;
  });

  // =========================================================================
  // Happy Path: Keyboard navigation with focus ring and aria-selected updates
  // =========================================================================

  it('navigates articles with arrow keys and updates focus ring + aria-selected', async () => {
    const { container } = render(
      <NewsFeed articles={mockArticles} loading={false} error={null} />
    );

    const feedContainer = container.querySelector('[role="feed"]') as HTMLDivElement;
    expect(feedContainer).toBeInTheDocument();

    // Activate panel by focusing the container (triggers onFocus -> activatePanel)
    act(() => {
      feedContainer.focus();
    });

    // First article should be focused with ring-2 ring-blue-500 styling and aria-selected=true
    let articles = container.querySelectorAll('[role="article"]');
    await waitFor(() => {
      articles = container.querySelectorAll('[role="article"]');
      expect(articles[0]).toHaveAttribute('aria-selected', 'true');
      expect(articles[0]).toHaveClass('ring-2', 'ring-blue-500');
    });

    // ArrowDown → focus second article
    act(() => {
      fireEvent.keyDown(feedContainer, { key: 'ArrowDown' });
    });
    await waitFor(() => {
      articles = container.querySelectorAll('[role="article"]');
      expect(articles[0]).toHaveAttribute('aria-selected', 'false');
      expect(articles[1]).toHaveAttribute('aria-selected', 'true');
      expect(articles[1]).toHaveClass('ring-2', 'ring-blue-500');
    });

    // ArrowDown → focus third article
    act(() => {
      fireEvent.keyDown(feedContainer, { key: 'ArrowDown' });
    });
    await waitFor(() => {
      articles = container.querySelectorAll('[role="article"]');
      expect(articles[1]).toHaveAttribute('aria-selected', 'false');
      expect(articles[2]).toHaveAttribute('aria-selected', 'true');
    });

    // ArrowUp → back to second article
    act(() => {
      fireEvent.keyDown(feedContainer, { key: 'ArrowUp' });
    });
    await waitFor(() => {
      articles = container.querySelectorAll('[role="article"]');
      expect(articles[2]).toHaveAttribute('aria-selected', 'false');
      expect(articles[1]).toHaveAttribute('aria-selected', 'true');
    });
  });

  // =========================================================================
  // Acceptance Criteria: Enter key opens article link
  // =========================================================================

  it('opens article link when Enter key pressed on focused item', async () => {
    const { container } = render(
      <NewsFeed articles={mockArticles} loading={false} error={null} />
    );

    const feedContainer = container.querySelector('[role="feed"]') as HTMLDivElement;

    // Focus and activate
    act(() => {
      feedContainer.focus();
    });

    // ArrowDown once to focus second article
    act(() => {
      fireEvent.keyDown(feedContainer, { key: 'ArrowDown' });
    });

    await waitFor(() => {
      const articles = container.querySelectorAll('[role="article"]');
      expect(articles[1]).toHaveAttribute('aria-selected', 'true');
    });

    // Get the link within the focused article
    const articles = container.querySelectorAll('[role="article"]');
    const focusedLink = articles[1]?.querySelector('a') as HTMLAnchorElement;
    expect(focusedLink).toHaveAttribute('href', 'https://example.com/2');

    // Spy on click
    const clickSpy = jest.spyOn(focusedLink, 'click');

    // Simulate Enter key on focused article (hook will call anchor.click())
    act(() => {
      fireEvent.keyDown(feedContainer, { key: 'Enter' });
    });

    // Verify click was called on the link
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  // =========================================================================
  // Acceptance Criteria: Escape key releases focus
  // =========================================================================

  it('releases focus and blurs container when Escape pressed', async () => {
    const { container } = render(
      <NewsFeed articles={mockArticles} loading={false} error={null} />
    );

    const feedContainer = container.querySelector('[role="feed"]') as HTMLDivElement;

    act(() => {
      feedContainer.focus();
    });

    // Verify first article is focused
    let articles = container.querySelectorAll('[role="article"]');
    await waitFor(() => {
      articles = container.querySelectorAll('[role="article"]');
      expect(articles[0]).toHaveAttribute('aria-selected', 'true');
    });

    // Press Escape
    const blurSpy = jest.spyOn(feedContainer, 'blur');
    act(() => {
      fireEvent.keyDown(feedContainer, { key: 'Escape' });
    });

    await waitFor(() => {
      // All articles should lose focus (aria-selected = false)
      articles = container.querySelectorAll('[role="article"]');
      articles.forEach((article) => {
        expect(article).toHaveAttribute('aria-selected', 'false');
      });
    });

    expect(blurSpy).toHaveBeenCalled();
    blurSpy.mockRestore();
  });

  // =========================================================================
  // Edge Case: Focus clamping when article list shrinks
  // =========================================================================

  it('clamps focus when articles are removed and focused item is beyond new list length', async () => {
    const { rerender, container } = render(
      <NewsFeed articles={mockArticles} loading={false} error={null} />
    );

    const feedContainer = container.querySelector('[role="feed"]') as HTMLDivElement;

    act(() => {
      feedContainer.focus();
    });

    // Navigate to third article (index 2)
    act(() => {
      fireEvent.keyDown(feedContainer, { key: 'ArrowDown' });
    });
    act(() => {
      fireEvent.keyDown(feedContainer, { key: 'ArrowDown' });
    });

    let articles = container.querySelectorAll('[role="article"]');
    await waitFor(() => {
      articles = container.querySelectorAll('[role="article"]');
      expect(articles[2]).toHaveAttribute('aria-selected', 'true');
    });

    // Rerender with only 2 articles (third article removed)
    const reducedArticles = mockArticles.slice(0, 2);
    act(() => {
      rerender(<NewsFeed articles={reducedArticles} loading={false} error={null} />);
    });

    // Focus should clamp to last available article (index 1)
    articles = container.querySelectorAll('[role="article"]');
    await waitFor(() => {
      articles = container.querySelectorAll('[role="article"]');
      expect(articles).toHaveLength(2);
      expect(articles[1]).toHaveAttribute('aria-selected', 'true');
    });
  });

  // =========================================================================
  // Edge Case: PageDown/PageUp navigation with PAGE_SIZE=5
  // =========================================================================

  it('navigates by PAGE_SIZE (5) items with PageDown/PageUp keys', async () => {
    // Create a longer list (10 items) to test pagination
    const longArticles = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      title: `Article ${i + 1}`,
      url: `https://example.com/${i}`,
      ticker: `TICK${i}`,
      sentiment_label: 'neutral' as const,
      source: 'Source',
      created_at: new Date().toISOString(),
    }));

    const { container } = render(
      <NewsFeed articles={longArticles} loading={false} error={null} />
    );

    const feedContainer = container.querySelector('[role="feed"]') as HTMLDivElement;

    act(() => {
      feedContainer.focus();
    });

    let articles = container.querySelectorAll('[role="article"]');

    // Initially at first article
    await waitFor(() => {
      articles = container.querySelectorAll('[role="article"]');
      expect(articles[0]).toHaveAttribute('aria-selected', 'true');
    });

    // PageDown → jump 5 items forward (to index 5)
    act(() => {
      fireEvent.keyDown(feedContainer, { key: 'PageDown' });
    });
    await waitFor(() => {
      articles = container.querySelectorAll('[role="article"]');
      expect(articles[5]).toHaveAttribute('aria-selected', 'true');
    });

    // PageUp → jump 5 items back (to index 0)
    act(() => {
      fireEvent.keyDown(feedContainer, { key: 'PageUp' });
    });
    await waitFor(() => {
      articles = container.querySelectorAll('[role="article"]');
      expect(articles[0]).toHaveAttribute('aria-selected', 'true');
    });
  });

  // =========================================================================
  // Integration: Home/End keys for boundary navigation
  // =========================================================================

  it('jumps to first item with Home key and last item with End key', async () => {
    const { container } = render(
      <NewsFeed articles={mockArticles} loading={false} error={null} />
    );

    const feedContainer = container.querySelector('[role="feed"]') as HTMLDivElement;

    act(() => {
      feedContainer.focus();
    });

    let articles = container.querySelectorAll('[role="article"]');

    // Navigate to middle (second article)
    act(() => {
      fireEvent.keyDown(feedContainer, { key: 'ArrowDown' });
    });
    await waitFor(() => {
      articles = container.querySelectorAll('[role="article"]');
      expect(articles[1]).toHaveAttribute('aria-selected', 'true');
    });

    // Home key → jump to first
    act(() => {
      fireEvent.keyDown(feedContainer, { key: 'Home' });
    });
    await waitFor(() => {
      articles = container.querySelectorAll('[role="article"]');
      expect(articles[0]).toHaveAttribute('aria-selected', 'true');
    });

    // End key → jump to last
    act(() => {
      fireEvent.keyDown(feedContainer, { key: 'End' });
    });
    await waitFor(() => {
      articles = container.querySelectorAll('[role="article"]');
      expect(articles[2]).toHaveAttribute('aria-selected', 'true');
    });
  });
});
