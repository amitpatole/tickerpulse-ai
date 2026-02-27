import { renderHook, waitFor } from '@testing-library/react';
import { useDashboardData } from '../useDashboardData';
import * as api from '@/lib/api';

// Mock the API module
jest.mock('@/lib/api');

const mockApi = api as jest.Mocked<typeof api>;

describe('useDashboardData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Happy path: all endpoints succeed', () => {
    it('should fetch all four datasets in parallel on mount and return them', async () => {
      const mockRatings = [
        { ticker: 'AAPL', rating: 'BUY', score: 85, confidence: 0.9 },
      ];
      const mockAlerts = [
        { id: 1, alert_type: 'price_change', condition_type: 'above_threshold' },
      ];
      const mockNews = [
        { id: 1, ticker: 'AAPL', title: 'Apple gains market share' },
      ];
      const mockSummary = {
        stock_count: 50,
        active_stock_count: 45,
        active_alert_count: 3,
        market_regime: 'bullish',
        agent_status: { total: 5, running: 2, idle: 3, error: 0 },
        timestamp: '2026-02-27T12:00:00Z',
      };

      mockApi.getRatings.mockResolvedValue(mockRatings as any);
      mockApi.getAlerts.mockResolvedValue(mockAlerts as any);
      mockApi.getNews.mockResolvedValue(mockNews as any);
      mockApi.getDashboardSummary.mockResolvedValue(mockSummary);

      const { result } = renderHook(() => useDashboardData());

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.ratings).toEqual(mockRatings);
      expect(result.current.alerts).toEqual(mockAlerts);
      expect(result.current.news).toEqual(mockNews);
      expect(result.current.summary).toEqual(mockSummary);
      expect(result.current.error).toBe(null);

      // All four were called once during mount
      expect(mockApi.getRatings).toHaveBeenCalledTimes(1);
      expect(mockApi.getAlerts).toHaveBeenCalledTimes(1);
      expect(mockApi.getNews).toHaveBeenCalledTimes(1);
      expect(mockApi.getDashboardSummary).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling: ratings fails, others succeed', () => {
    it('should set error state only if ratings fails; other failures are silent', async () => {
      const ratingsError = new Error('Ratings API unreachable');

      mockApi.getRatings.mockRejectedValue(ratingsError);
      mockApi.getAlerts.mockResolvedValue([]);
      mockApi.getNews.mockResolvedValue([]);
      mockApi.getDashboardSummary.mockResolvedValue({
        stock_count: 10,
        active_stock_count: 8,
        active_alert_count: 0,
        market_regime: 'neutral',
        agent_status: { total: 0, running: 0, idle: 0, error: 0 },
        timestamp: '2026-02-27T12:00:00Z',
      });

      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.ratings).toBe(null);
      expect(result.current.alerts).toEqual([]);
      expect(result.current.news).toEqual([]);
      expect(result.current.error).toBe('Ratings API unreachable');
    });

    it('should silently handle alerts and news failures', async () => {
      const mockRatings = [
        { ticker: 'GOOG', rating: 'HOLD', score: 60, confidence: 0.7 },
      ];

      mockApi.getRatings.mockResolvedValue(mockRatings as any);
      mockApi.getAlerts.mockRejectedValue(new Error('Alerts failed'));
      mockApi.getNews.mockRejectedValue(new Error('News failed'));
      mockApi.getDashboardSummary.mockResolvedValue({
        stock_count: 25,
        active_stock_count: 20,
        active_alert_count: 2,
        market_regime: 'bearish',
        agent_status: { total: 3, running: 1, idle: 2, error: 0 },
        timestamp: '2026-02-27T12:00:00Z',
      });

      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.ratings).toEqual(mockRatings);
      expect(result.current.alerts).toBe(null);
      expect(result.current.news).toBe(null);
      expect(result.current.error).toBe(null); // No error because only secondary endpoints failed
    });
  });

  describe('Edge case: empty data arrays', () => {
    it('should handle all endpoints returning empty arrays gracefully', async () => {
      mockApi.getRatings.mockResolvedValue([]);
      mockApi.getAlerts.mockResolvedValue([]);
      mockApi.getNews.mockResolvedValue([]);
      mockApi.getDashboardSummary.mockResolvedValue({
        stock_count: 0,
        active_stock_count: 0,
        active_alert_count: 0,
        market_regime: 'undefined',
        agent_status: { total: 0, running: 0, idle: 0, error: 0 },
        timestamp: '2026-02-27T12:00:00Z',
      });

      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.ratings).toEqual([]);
      expect(result.current.alerts).toEqual([]);
      expect(result.current.news).toEqual([]);
      expect(result.current.summary).toBeDefined();
      expect(result.current.summary?.stock_count).toBe(0);
      expect(result.current.error).toBe(null);
    });
  });

  describe('Refresh intervals: verify cadences are set correctly', () => {
    it('should refresh summary at 60s cadence', async () => {
      mockApi.getRatings.mockResolvedValue([]);
      mockApi.getAlerts.mockResolvedValue([]);
      mockApi.getNews.mockResolvedValue([]);
      mockApi.getDashboardSummary.mockResolvedValue({
        stock_count: 10,
        active_stock_count: 8,
        active_alert_count: 0,
        market_regime: 'neutral',
        agent_status: { total: 1, running: 0, idle: 1, error: 0 },
        timestamp: '2026-02-27T12:00:00Z',
      });

      renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(mockApi.getDashboardSummary).toHaveBeenCalledTimes(1);
      });

      // Advance 60 seconds
      jest.advanceTimersByTime(60_000);

      await waitFor(() => {
        expect(mockApi.getDashboardSummary).toHaveBeenCalledTimes(2);
      });
    });

    it('should refresh ratings at 30s cadence', async () => {
      mockApi.getRatings.mockResolvedValue([]);
      mockApi.getAlerts.mockResolvedValue([]);
      mockApi.getNews.mockResolvedValue([]);
      mockApi.getDashboardSummary.mockResolvedValue({
        stock_count: 10,
        active_stock_count: 8,
        active_alert_count: 0,
        market_regime: 'neutral',
        agent_status: { total: 1, running: 0, idle: 1, error: 0 },
        timestamp: '2026-02-27T12:00:00Z',
      });

      renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(mockApi.getRatings).toHaveBeenCalledTimes(1);
      });

      // Advance 30 seconds
      jest.advanceTimersByTime(30_000);

      await waitFor(() => {
        expect(mockApi.getRatings).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Component cleanup: unmount handling', () => {
    it('should not set state after component unmounts', async () => {
      mockApi.getRatings.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 100))
      );
      mockApi.getAlerts.mockResolvedValue([]);
      mockApi.getNews.mockResolvedValue([]);
      mockApi.getDashboardSummary.mockResolvedValue({
        stock_count: 5,
        active_stock_count: 5,
        active_alert_count: 1,
        market_regime: 'neutral',
        agent_status: { total: 2, running: 1, idle: 1, error: 0 },
        timestamp: '2026-02-27T12:00:00Z',
      });

      const { unmount } = renderHook(() => useDashboardData());

      // Unmount before the slow getRatings call completes
      jest.advanceTimersByTime(50);
      unmount();

      // Advance past the slow call
      jest.advanceTimersByTime(100);

      // No errors should occur (no console warnings about setting state on unmounted component)
    });
  });

  describe('refetch manual trigger', () => {
    it('should re-fetch all four datasets when refetch() is called', async () => {
      mockApi.getRatings.mockResolvedValue([]);
      mockApi.getAlerts.mockResolvedValue([]);
      mockApi.getNews.mockResolvedValue([]);
      mockApi.getDashboardSummary.mockResolvedValue({
        stock_count: 10,
        active_stock_count: 8,
        active_alert_count: 0,
        market_regime: 'neutral',
        agent_status: { total: 1, running: 0, idle: 1, error: 0 },
        timestamp: '2026-02-27T12:00:00Z',
      });

      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockApi.getRatings).toHaveBeenCalledTimes(1);

      // Call refetch
      result.current.refetch();

      await waitFor(() => {
        expect(mockApi.getRatings).toHaveBeenCalledTimes(2);
      });

      expect(mockApi.getAlerts).toHaveBeenCalledTimes(2);
      expect(mockApi.getNews).toHaveBeenCalledTimes(2);
      expect(mockApi.getDashboardSummary).toHaveBeenCalledTimes(2);
    });
  });
});
