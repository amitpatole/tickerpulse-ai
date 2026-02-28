import { renderHook, waitFor, act } from '@testing-library/react';
import { useDashboardData } from '../useDashboardData';
import * as api from '@/lib/api';
import type { PriceUpdate } from '@/lib/types';

// Mock the API module
jest.mock('@/lib/api');

// Mock useWSPrices to prevent real WebSocket connections in tests
jest.mock('../useWSPrices');

const mockApi = api as jest.Mocked<typeof api>;

// Capture the onPriceUpdate callback passed to useWSPrices so tests can
// simulate live price events
import { useWSPrices } from '../useWSPrices';
const mockUseWSPrices = useWSPrices as jest.Mock;
let capturedOnPriceUpdate: ((update: PriceUpdate) => void) | null = null;

describe('useDashboardData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    capturedOnPriceUpdate = null;

    // Server reports 30s interval (same as the hardcoded default) so existing
    // timer tests are unaffected — no ratingsInterval state change occurs
    mockApi.getRefreshInterval.mockResolvedValue({ interval: 30, source: 'default' });

    // Capture the onPriceUpdate callback for price-merge tests.
    // Return { status: 'open' } so the hook's destructuring doesn't throw.
    mockUseWSPrices.mockImplementation(({ onPriceUpdate }: { onPriceUpdate: (u: PriceUpdate) => void }) => {
      capturedOnPriceUpdate = onPriceUpdate;
      return { status: 'open' };
    });
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

  // ---------------------------------------------------------------------------
  // Price merge: WebSocket live price updates via useWSPrices
  // ---------------------------------------------------------------------------

  describe('Price merge: WebSocket price updates', () => {
    it('should merge price_update into the matching ratings entry by ticker', async () => {
      const mockRatings = [
        {
          ticker: 'AAPL', rating: 'buy', score: 85, confidence: 0.9,
          current_price: 150.0, price_change: 0.0, price_change_pct: 0.0, rsi: 60,
          updated_at: '2026-02-27T11:00:00Z',
        },
        {
          ticker: 'MSFT', rating: 'hold', score: 70, confidence: 0.8,
          current_price: 380.0, price_change: 0.0, price_change_pct: 0.0, rsi: 55,
          updated_at: '2026-02-27T11:00:00Z',
        },
      ];

      mockApi.getRatings.mockResolvedValue(mockRatings as any);
      mockApi.getAlerts.mockResolvedValue([]);
      mockApi.getNews.mockResolvedValue([]);
      mockApi.getDashboardSummary.mockResolvedValue({
        stock_count: 2, active_stock_count: 2, active_alert_count: 0,
        market_regime: 'neutral',
        agent_status: { total: 0, running: 0, idle: 0, error: 0 },
        timestamp: '2026-02-27T12:00:00Z',
      });

      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Verify useWSPrices received the callback
      expect(capturedOnPriceUpdate).not.toBeNull();

      // Simulate a live price update for AAPL
      const priceUpdate: PriceUpdate = {
        type: 'price_update',
        ticker: 'AAPL',
        price: 175.5,
        change: 2.5,
        change_pct: 1.45,
        volume: 1_000_000,
        timestamp: '2026-02-27T12:01:00Z',
      };

      act(() => { capturedOnPriceUpdate!(priceUpdate); });

      // AAPL should be updated with live price data
      expect(result.current.ratings![0].ticker).toBe('AAPL');
      expect(result.current.ratings![0].current_price).toBe(175.5);
      expect(result.current.ratings![0].price_change).toBe(2.5);
      expect(result.current.ratings![0].price_change_pct).toBe(1.45);
      expect(result.current.ratings![0].updated_at).toBe('2026-02-27T12:01:00Z');

      // MSFT should remain completely unchanged
      expect(result.current.ratings![1].ticker).toBe('MSFT');
      expect(result.current.ratings![1].current_price).toBe(380.0);
      expect(result.current.ratings![1].updated_at).toBe('2026-02-27T11:00:00Z');

      // Non-price fields (AI score, sentiment) should be preserved on AAPL
      expect(result.current.ratings![0].score).toBe(85);
      expect(result.current.ratings![0].confidence).toBe(0.9);
    });

    it('should populate wsPrices map keyed by ticker on each price_update', async () => {
      const mockRatings = [
        {
          ticker: 'AAPL', rating: 'buy', score: 85, confidence: 0.9,
          current_price: 150.0, rsi: 60,
        },
        {
          ticker: 'MSFT', rating: 'hold', score: 70, confidence: 0.8,
          current_price: 380.0, rsi: 55,
        },
      ];

      mockApi.getRatings.mockResolvedValue(mockRatings as any);
      mockApi.getAlerts.mockResolvedValue([]);
      mockApi.getNews.mockResolvedValue([]);
      mockApi.getDashboardSummary.mockResolvedValue({
        stock_count: 2, active_stock_count: 2, active_alert_count: 0,
        market_regime: 'neutral',
        agent_status: { total: 0, running: 0, idle: 0, error: 0 },
        timestamp: '2026-02-27T12:00:00Z',
      });

      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => expect(result.current.loading).toBe(false));

      // wsPrices starts empty
      expect(result.current.wsPrices).toEqual({});

      const aaplUpdate: PriceUpdate = {
        type: 'price_update',
        ticker: 'AAPL',
        price: 160.0,
        change: 10.0,
        change_pct: 6.67,
        volume: 3_000_000,
        timestamp: '2026-02-27T13:00:00Z',
      };

      act(() => { capturedOnPriceUpdate!(aaplUpdate); });

      expect(result.current.wsPrices['AAPL']).toEqual(aaplUpdate);
      // MSFT not yet updated
      expect(result.current.wsPrices['MSFT']).toBeUndefined();

      const msftUpdate: PriceUpdate = {
        type: 'price_update',
        ticker: 'MSFT',
        price: 390.0,
        change: 10.0,
        change_pct: 2.63,
        volume: 1_500_000,
        timestamp: '2026-02-27T13:01:00Z',
      };

      act(() => { capturedOnPriceUpdate!(msftUpdate); });

      // Both entries present; each holds the latest update
      expect(result.current.wsPrices['AAPL']).toEqual(aaplUpdate);
      expect(result.current.wsPrices['MSFT']).toEqual(msftUpdate);
    });

    it('should update wsPrices without disturbing ratings sort order', async () => {
      const mockRatings = [
        {
          ticker: 'AAPL', rating: 'buy', score: 85, confidence: 0.9,
          current_price: 150.0, price_change_pct: 0.0, rsi: 60,
        },
        {
          ticker: 'MSFT', rating: 'strong_buy', score: 95, confidence: 0.95,
          current_price: 380.0, price_change_pct: 0.0, rsi: 65,
        },
      ];

      mockApi.getRatings.mockResolvedValue(mockRatings as any);
      mockApi.getAlerts.mockResolvedValue([]);
      mockApi.getNews.mockResolvedValue([]);
      mockApi.getDashboardSummary.mockResolvedValue({
        stock_count: 2, active_stock_count: 2, active_alert_count: 0,
        market_regime: 'neutral',
        agent_status: { total: 0, running: 0, idle: 0, error: 0 },
        timestamp: '2026-02-27T12:00:00Z',
      });

      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Capture array reference before update
      const ratingsBeforeUpdate = result.current.ratings;

      act(() => {
        capturedOnPriceUpdate!({
          type: 'price_update',
          ticker: 'AAPL',
          price: 999.0,
          change: 849.0,
          change_pct: 566.0,
          volume: 10_000_000,
          timestamp: '2026-02-27T13:00:00Z',
        });
      });

      // ratings array reference changes (new array with updated AAPL entry)
      // but sort fields (score) are untouched — order is preserved by the component
      const ratingsAfterUpdate = result.current.ratings;
      expect(ratingsAfterUpdate![0].ticker).toBe('AAPL');
      expect(ratingsAfterUpdate![0].score).toBe(85); // score unchanged
      expect(ratingsAfterUpdate![1].ticker).toBe('MSFT');

      // wsPrices captures the raw update
      expect(result.current.wsPrices['AAPL'].price).toBe(999.0);
      expect(result.current.wsPrices['AAPL'].change_pct).toBe(566.0);
    });

    it('should not mutate state when PriceUpdate ticker is not in ratings', async () => {
      const mockRatings = [
        {
          ticker: 'AAPL', rating: 'buy', score: 85, confidence: 0.9,
          current_price: 150.0, rsi: 60,
        },
      ];

      mockApi.getRatings.mockResolvedValue(mockRatings as any);
      mockApi.getAlerts.mockResolvedValue([]);
      mockApi.getNews.mockResolvedValue([]);
      mockApi.getDashboardSummary.mockResolvedValue({
        stock_count: 1, active_stock_count: 1, active_alert_count: 0,
        market_regime: 'neutral',
        agent_status: { total: 0, running: 0, idle: 0, error: 0 },
        timestamp: '2026-02-27T12:00:00Z',
      });

      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const prevRatings = result.current.ratings;

      // Simulate price update for a ticker NOT in the ratings list
      act(() => {
        capturedOnPriceUpdate!({
          type: 'price_update',
          ticker: 'UNKNOWN_XYZ',
          price: 99.9,
          change: 0.1,
          change_pct: 0.1,
          volume: 0,
          timestamp: '2026-02-27T12:01:00Z',
        });
      });

      // State reference should be identical — no copy was made
      expect(result.current.ratings).toBe(prevRatings);
    });
  });
});
