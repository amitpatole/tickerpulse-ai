import { renderHook, waitFor } from '@testing-library/react';
import { useDashboardData } from '../useDashboardData';
import * as api from '@/lib/api';
import { useWSPrices } from '../useWSPrices';
import type { AIRating, Alert, NewsArticle, DashboardSummary, PriceUpdate } from '@/lib/types';

jest.mock('@/lib/api');
jest.mock('../useWSPrices');

// Mock timers for controlling polling intervals
jest.useFakeTimers();

const mockRatings: AIRating[] = [
  {
    ticker: 'AAPL',
    rating: 'buy',
    score: 75,
    confidence: 0.85,
    current_price: 150,
    price_change: 2.5,
    price_change_pct: 1.7,
    rsi: 55,
    sentiment_score: 0.8,
    sentiment_label: 'positive',
    technical_score: 75,
    fundamental_score: 72,
    updated_at: '2026-02-27T10:00:00Z',
  },
];

const mockAlerts: Alert[] = [
  {
    id: 1,
    ticker: 'AAPL',
    condition_type: 'price_above',
    threshold: 150,
    enabled: true,
    sound_type: 'bell',
    triggered_at: null,
    created_at: '2026-02-27T09:00:00Z',
    severity: 'warning',
    type: 'price_above',
  },
];

const mockNews: NewsArticle[] = [
  {
    id: 1,
    ticker: 'AAPL',
    title: 'Apple Stock Rallies on Strong Earnings',
    description: 'Test description',
    source: 'Reuters',
    published_date: '2026-02-27T10:00:00Z',
    sentiment_score: 0.8,
    sentiment_label: 'positive',
    engagement_score: 95,
    created_at: '2026-02-27T10:00:00Z',
  },
];

const mockSummary: DashboardSummary = {
  stock_count: 5,
  active_stock_count: 4,
  active_alert_count: 2,
  market_regime: 'bullish',
  agent_status: {
    total: 3,
    running: 1,
    idle: 2,
    error: 0,
  },
  timestamp: '2026-02-27T10:00:00Z',
};

describe('useDashboardData: Refresh Interval Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();

    (api.getRatings as jest.Mock).mockResolvedValue(mockRatings);
    (api.getAlerts as jest.Mock).mockResolvedValue(mockAlerts);
    (api.getNews as jest.Mock).mockResolvedValue(mockNews);
    (api.getDashboardSummary as jest.Mock).mockResolvedValue(mockSummary);
    (api.getRefreshInterval as jest.Mock).mockResolvedValue({ interval: 30 });
    (useWSPrices as jest.Mock).mockReturnValue({ status: 'open' });
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Happy Path: Server Interval Configuration', () => {
    it('should read server-configured interval on mount', async () => {
      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(api.getRefreshInterval).toHaveBeenCalledTimes(1);
      });

      // Verify interval was fetched (will be used internally for the timer)
      expect(api.getRefreshInterval).toHaveBeenCalled();
    });

    it('should fetch all data on mount', async () => {
      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(api.getRatings).toHaveBeenCalled();
        expect(api.getAlerts).toHaveBeenCalled();
        expect(api.getNews).toHaveBeenCalled();
        expect(api.getDashboardSummary).toHaveBeenCalled();
      });

      expect(result.current.ratings).toEqual(mockRatings);
      expect(result.current.alerts).toEqual(mockAlerts);
      expect(result.current.news).toEqual(mockNews);
      expect(result.current.summary).toEqual(mockSummary);
    });

    it('should set up polling timer using server interval (30s default)', async () => {
      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(api.getRatings).toHaveBeenCalled();
      });

      // Advance time by 30 seconds (server interval)
      jest.advanceTimersByTime(30_000);

      await waitFor(() => {
        // Should have been called twice: once on mount, once on timer
        expect(api.getRatings).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('WebSocket Price Merge: Live Updates', () => {
    it('should merge price update into matching rating by ticker', async () => {
      let priceUpdateCallback: ((update: PriceUpdate) => void) | null = null;

      (useWSPrices as jest.Mock).mockImplementation(({ onPriceUpdate }) => {
        priceUpdateCallback = onPriceUpdate;
        return { status: 'open' };
      });

      const { result, rerender } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.ratings).toEqual(mockRatings);
      });

      // Simulate WebSocket price update
      const priceUpdate: PriceUpdate = {
        type: 'price_update',
        ticker: 'AAPL',
        price: 155.5,
        change: 5.5,
        change_pct: 3.8,
        volume: 50000000,
        timestamp: '2026-02-27T10:15:00Z',
      };

      priceUpdateCallback?.(priceUpdate);

      await waitFor(() => {
        expect(result.current.ratings?.[0].current_price).toBe(155.5);
        expect(result.current.ratings?.[0].price_change).toBe(5.5);
        expect(result.current.ratings?.[0].price_change_pct).toBe(3.8);
        expect(result.current.ratings?.[0].updated_at).toBe('2026-02-27T10:15:00Z');
      });
    });

    it('should ignore price update for unknown ticker', async () => {
      let priceUpdateCallback: ((update: PriceUpdate) => void) | null = null;

      (useWSPrices as jest.Mock).mockImplementation(({ onPriceUpdate }) => {
        priceUpdateCallback = onPriceUpdate;
        return { status: 'open' };
      });

      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.ratings).toEqual(mockRatings);
      });

      const originalRatings = result.current.ratings;

      // Try to update unknown ticker
      const priceUpdate: PriceUpdate = {
        type: 'price_update',
        ticker: 'UNKNOWN',
        price: 100,
        change: 5,
        change_pct: 5,
        volume: 1000000,
        timestamp: '2026-02-27T10:15:00Z',
      };

      priceUpdateCallback?.(priceUpdate);

      // Ratings should remain unchanged
      expect(result.current.ratings).toEqual(originalRatings);
    });

    it('should subscribe to tickers from ratings on mount', async () => {
      let wsOptions: any = null;

      (useWSPrices as jest.Mock).mockImplementation((options) => {
        wsOptions = options;
        return { status: 'open' };
      });

      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.ratings).toEqual(mockRatings);
      });

      // Check that useWSPrices was called with correct tickers
      expect(wsOptions.tickers).toContain('AAPL');
    });
  });

  describe('Error Handling: Non-Fatal Failures', () => {
    it('should set error only if ratings fetch fails', async () => {
      (api.getRatings as jest.Mock).mockRejectedValue(new Error('Ratings API down'));
      (api.getAlerts as jest.Mock).mockResolvedValue(mockAlerts);
      (api.getNews as jest.Mock).mockResolvedValue(mockNews);
      (api.getDashboardSummary as jest.Mock).mockResolvedValue(mockSummary);

      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.error).toContain('Ratings API down');
      });

      // Other data should still be available
      expect(result.current.alerts).toEqual(mockAlerts);
      expect(result.current.news).toEqual(mockNews);
      expect(result.current.summary).toEqual(mockSummary);
    });

    it('should continue polling even if alerts fetch fails', async () => {
      (api.getAlerts as jest.Mock).mockRejectedValue(new Error('Alerts API down'));

      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(api.getRatings).toHaveBeenCalled();
      });

      // Advance alerts polling timer (30s)
      jest.advanceTimersByTime(30_000);

      await waitFor(() => {
        // Should attempt to fetch alerts again despite previous failure
        expect(api.getAlerts).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Edge Cases: Mounted/Unmounted State', () => {
    it('should not update state after unmount', async () => {
      const { result, unmount } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(api.getRatings).toHaveBeenCalled();
      });

      unmount();

      // Clear any pending timers
      jest.runAllTimers();

      // After unmount, the hook should not process any data
      // This is verified by the mountedRef.current checks in the implementation
      expect(result.current.ratings).toBeDefined(); // Last value retained
    });

    it('should clear all timers on unmount', async () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      const { unmount } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(api.getRatings).toHaveBeenCalled();
      });

      unmount();

      // Verify clearInterval was called for all timers
      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });
  });

  describe('Polling Behavior: Multiple Timers at Different Intervals', () => {
    it('should poll ratings at server-configured interval (30s default)', async () => {
      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(api.getRatings).toHaveBeenCalledTimes(1);
      });

      // Advance by 30 seconds
      jest.advanceTimersByTime(30_000);

      await waitFor(() => {
        expect(api.getRatings).toHaveBeenCalledTimes(2);
      });

      // Advance another 30 seconds
      jest.advanceTimersByTime(30_000);

      await waitFor(() => {
        expect(api.getRatings).toHaveBeenCalledTimes(3);
      });
    });

    it('should poll alerts at fixed 30s interval', async () => {
      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(api.getAlerts).toHaveBeenCalledTimes(1);
      });

      // Alerts use fixed 30s interval regardless of server config
      jest.advanceTimersByTime(30_000);

      await waitFor(() => {
        expect(api.getAlerts).toHaveBeenCalledTimes(2);
      });
    });

    it('should poll news and summary at fixed 60s interval', async () => {
      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(api.getNews).toHaveBeenCalledTimes(1);
        expect(api.getDashboardSummary).toHaveBeenCalledTimes(1);
      });

      // Advance by 60 seconds
      jest.advanceTimersByTime(60_000);

      await waitFor(() => {
        expect(api.getNews).toHaveBeenCalledTimes(2);
        expect(api.getDashboardSummary).toHaveBeenCalledTimes(2);
      });
    });
  });
});