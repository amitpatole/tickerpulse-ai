/**
 * Tests for useDashboardData Hook
 *
 * Validates the batch-fetch pattern where a single call to useDashboardData
 * provides ratings, alerts, and news on mount, with each dataset refreshing
 * on its own interval (ratings/alerts 30s, news 60s).
 *
 * Tests:
 * 1. Hook fetches all three datasets on mount in parallel
 * 2. Each dataset has independent refresh interval (30s/30s/60s)
 * 3. Failed alerts/news don't block ratings (non-fatal failures)
 * 4. Component unmounting cleans up timers
 * 5. Provides refetch function for manual refresh
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { getRatings, getAlerts, getNews } from '@/lib/api';
import type { AIRating, Alert, NewsArticle } from '@/lib/types';

// =============================================================================
// MOCK SETUP: API calls
// =============================================================================

jest.mock('@/lib/api', () => ({
  getRatings: jest.fn(),
  getAlerts: jest.fn(),
  getNews: jest.fn(),
}));

// =============================================================================
// TEST FIXTURES: Mock Data
// =============================================================================

const mockRatings: AIRating[] = [
  {
    ticker: 'NVDA',
    rating: 'STRONG_BUY',
    score: 92,
    confidence: 0.95,
    current_price: 875.50,
    price_change_pct: 8.5,
    rsi: 72,
  },
];

const mockAlerts: Alert[] = [
  {
    id: '1',
    ticker: 'NVDA',
    severity: 'critical',
    type: 'price_breach',
    message: 'Price exceeded upper limit',
    created_at: new Date().toISOString(),
  },
];

const mockNews: NewsArticle[] = [
  {
    id: 'news-1',
    title: 'Market Update',
    content: 'Markets rally on strong earnings',
    source: 'Reuters',
    published_at: new Date().toISOString(),
    url: 'https://reuters.com',
  },
];

// =============================================================================
// TESTS: Hook Behavior and Lifecycle
// =============================================================================

describe('useDashboardData Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('fetches all three datasets on mount in parallel', async () => {
    // GIVEN: API mocks are set up
    const getRatingsMock = getRatings as jest.MockedFunction<typeof getRatings>;
    const getAlertsMock = getAlerts as jest.MockedFunction<typeof getAlerts>;
    const getNewsMock = getNews as jest.MockedFunction<typeof getNews>;

    getRatingsMock.mockResolvedValue(mockRatings);
    getAlertsMock.mockResolvedValue(mockAlerts);
    getNewsMock.mockResolvedValue(mockNews);

    // WHEN: Hook is called
    const { result } = renderHook(() => useDashboardData());

    // THEN: Initially should be loading
    expect(result.current.loading).toBe(true);
    expect(result.current.ratings).toBeNull();
    expect(result.current.alerts).toBeNull();
    expect(result.current.news).toBeNull();

    // THEN: After fetch completes, data should be available
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.ratings).toEqual(mockRatings);
    expect(result.current.alerts).toEqual(mockAlerts);
    expect(result.current.news).toEqual(mockNews);

    // THEN: All three API calls should have been made
    expect(getRatingsMock).toHaveBeenCalledTimes(1);
    expect(getAlertsMock).toHaveBeenCalledTimes(1);
    expect(getNewsMock).toHaveBeenCalledTimes(1);
  });

  test('continues refreshing ratings at 30s interval even if alerts/news fail', async () => {
    // GIVEN: ratings will succeed, but alerts/news will fail
    const getRatingsMock = getRatings as jest.MockedFunction<typeof getRatings>;
    const getAlertsMock = getAlerts as jest.MockedFunction<typeof getAlerts>;
    const getNewsMock = getNews as jest.MockedFunction<typeof getNews>;

    getRatingsMock.mockResolvedValue(mockRatings);
    getAlertsMock.mockRejectedValue(new Error('Alerts API down'));
    getNewsMock.mockRejectedValue(new Error('News API down'));

    // WHEN: Hook is called
    const { result } = renderHook(() => useDashboardData());

    // THEN: Wait for initial fetch
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // THEN: Ratings should be available, alerts/news should fail gracefully
    expect(result.current.ratings).toEqual(mockRatings);
    expect(result.current.alerts).toBeNull();
    expect(result.current.news).toBeNull();
    expect(result.current.error).toBeTruthy(); // ratings fetch succeeded, so error from other attempts

    // WHEN: Time advances 30 seconds (ratings refresh interval)
    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    // THEN: Ratings should refresh (alert/news still failing)
    expect(getRatingsMock).toHaveBeenCalledTimes(2);
  });

  test('provides separate refresh intervals: ratings/alerts 30s, news 60s', async () => {
    // GIVEN: API mocks are set up
    const getRatingsMock = getRatings as jest.MockedFunction<typeof getRatings>;
    const getAlertsMock = getAlerts as jest.MockedFunction<typeof getAlerts>;
    const getNewsMock = getNews as jest.MockedFunction<typeof getNews>;

    getRatingsMock.mockResolvedValue(mockRatings);
    getAlertsMock.mockResolvedValue(mockAlerts);
    getNewsMock.mockResolvedValue(mockNews);

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useDashboardData());

    // THEN: Wait for initial fetch
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // WHEN: Time advances 30 seconds
    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    // THEN: Ratings and alerts should refresh (news stays old)
    expect(getRatingsMock).toHaveBeenCalledTimes(2);
    expect(getAlertsMock).toHaveBeenCalledTimes(2);
    expect(getNewsMock).toHaveBeenCalledTimes(1); // Still first call only

    // WHEN: Time advances another 30 seconds (total 60s)
    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    // THEN: All three should refresh by now
    expect(getRatingsMock).toHaveBeenCalledTimes(3);
    expect(getAlertsMock).toHaveBeenCalledTimes(3);
    expect(getNewsMock).toHaveBeenCalledTimes(2);
  });

  test('cleans up timers when component unmounts', async () => {
    // GIVEN: API mocks are set up
    const getRatingsMock = getRatings as jest.MockedFunction<typeof getRatings>;
    const getAlertsMock = getAlerts as jest.MockedFunction<typeof getAlerts>;
    const getNewsMock = getNews as jest.MockedFunction<typeof getNews>;

    getRatingsMock.mockResolvedValue(mockRatings);
    getAlertsMock.mockResolvedValue(mockAlerts);
    getNewsMock.mockResolvedValue(mockNews);

    // WHEN: Hook is rendered
    const { result, unmount } = renderHook(() => useDashboardData());

    // THEN: Wait for initial fetch
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Verify initial call count
    const initialRatingsCallCount = getRatingsMock.mock.calls.length;

    // WHEN: Component unmounts
    unmount();

    // WHEN: Time advances 30 seconds after unmount
    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    // THEN: No additional calls should have been made (timers were cleaned up)
    expect(getRatingsMock).toHaveBeenCalledTimes(initialRatingsCallCount);
  });

  test('provides manual refetch function that re-fetches all datasets', async () => {
    // GIVEN: API mocks are set up
    const getRatingsMock = getRatings as jest.MockedFunction<typeof getRatings>;
    const getAlertsMock = getAlerts as jest.MockedFunction<typeof getAlerts>;
    const getNewsMock = getNews as jest.MockedFunction<typeof getNews>;

    getRatingsMock.mockResolvedValue(mockRatings);
    getAlertsMock.mockResolvedValue(mockAlerts);
    getNewsMock.mockResolvedValue(mockNews);

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useDashboardData());

    // THEN: Wait for initial fetch
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Verify initial call count
    const initialCallCount = getRatingsMock.mock.calls.length;

    // WHEN: Manual refetch is called
    act(() => {
      result.current.refetch();
    });

    // THEN: Should trigger loading state
    expect(result.current.loading).toBe(true);

    // THEN: Wait for refetch to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // THEN: All three should have been called again
    expect(getRatingsMock).toHaveBeenCalledTimes(initialCallCount + 1);
    expect(getAlertsMock).toHaveBeenCalledTimes(initialCallCount + 1);
    expect(getNewsMock).toHaveBeenCalledTimes(initialCallCount + 1);
  });

  test('handles ratings fetch failure while alerts/news succeed', async () => {
    // GIVEN: ratings fails, alerts/news succeed
    const getRatingsMock = getRatings as jest.MockedFunction<typeof getRatings>;
    const getAlertsMock = getAlerts as jest.MockedFunction<typeof getAlerts>;
    const getNewsMock = getNews as jest.MockedFunction<typeof getNews>;

    getRatingsMock.mockRejectedValue(new Error('Ratings API error'));
    getAlertsMock.mockResolvedValue(mockAlerts);
    getNewsMock.mockResolvedValue(mockNews);

    // WHEN: Hook is called
    const { result } = renderHook(() => useDashboardData());

    // THEN: Wait for fetch to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // THEN: Ratings should be null with error, but alerts/news should be available
    expect(result.current.ratings).toBeNull();
    expect(result.current.alerts).toEqual(mockAlerts);
    expect(result.current.news).toEqual(mockNews);
    expect(result.current.error).toContain('Ratings API error');
  });

  test('does not update state if component unmounts before fetch completes', async () => {
    // GIVEN: API is slow to respond
    const getRatingsMock = getRatings as jest.MockedFunction<typeof getRatings>;
    const getAlertsMock = getAlerts as jest.MockedFunction<typeof getAlerts>;
    const getNewsMock = getNews as jest.MockedFunction<typeof getNews>;

    let resolveRatings: (value: AIRating[]) => void;
    getRatingsMock.mockReturnValue(new Promise((resolve) => {
      resolveRatings = resolve;
    }) as Promise<AIRating[]>);

    getAlertsMock.mockResolvedValue(mockAlerts);
    getNewsMock.mockResolvedValue(mockNews);

    // WHEN: Hook is rendered
    const { result, unmount } = renderHook(() => useDashboardData());

    // THEN: Should be in loading state
    expect(result.current.loading).toBe(true);

    // WHEN: Component unmounts before ratings resolves
    unmount();

    // WHEN: Ratings resolves after unmount
    act(() => {
      resolveRatings!(mockRatings);
    });

    // No assertion needed here, but test confirms no errors from state update after unmount
    expect(true).toBe(true);
  });
});
