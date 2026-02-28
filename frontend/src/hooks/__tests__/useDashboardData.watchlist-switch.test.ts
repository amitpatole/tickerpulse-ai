import { renderHook, waitFor, act } from '@testing-library/react';
import { useDashboardData } from '../useDashboardData';
import * as api from '@/lib/api';
import type { PriceUpdate } from '@/lib/types';

jest.mock('@/lib/api');
jest.mock('../useWSPrices');

const mockApi = api as jest.Mocked<typeof api>;

import { useWSPrices } from '../useWSPrices';
const mockUseWSPrices = useWSPrices as jest.Mock;
let capturedOnPriceUpdate: ((update: PriceUpdate) => void) | null = null;

const baseRatings = [
  { ticker: 'AAPL', rating: 'buy', score: 85, confidence: 0.9, rsi: 60 },
  { ticker: 'GOOGL', rating: 'hold', score: 65, confidence: 0.75, rsi: 52 },
];

const watchlist2Ratings = [
  { ticker: 'TSLA', rating: 'strong_buy', score: 92, confidence: 0.95, rsi: 71 },
];

const mockSummary = {
  stock_count: 5,
  active_stock_count: 5,
  active_alert_count: 0,
  market_regime: 'neutral',
  agent_status: { total: 0, running: 0, idle: 0, error: 0 },
  timestamp: '2026-02-27T12:00:00Z',
};

function setupMocks() {
  mockApi.getRatings.mockResolvedValue(baseRatings as any);
  mockApi.getAlerts.mockResolvedValue([]);
  mockApi.getNews.mockResolvedValue([]);
  mockApi.getDashboardSummary.mockResolvedValue(mockSummary);
  mockApi.getRefreshInterval.mockResolvedValue({ interval: 30, source: 'default' });

  capturedOnPriceUpdate = null;
  mockUseWSPrices.mockImplementation(({ onPriceUpdate }: { onPriceUpdate: (u: PriceUpdate) => void }) => {
    capturedOnPriceUpdate = onPriceUpdate;
    return { status: 'open' };
  });
}

describe('useDashboardData — watchlist switching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    setupMocks();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('watchlistId scoping', () => {
    it('passes watchlistId to getRatings on initial fetch', async () => {
      renderHook(() => useDashboardData(2));

      await waitFor(() => {
        expect(mockApi.getRatings).toHaveBeenCalledWith(2);
      });
    });

    it('passes undefined to getRatings when no watchlistId is provided', async () => {
      renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(mockApi.getRatings).toHaveBeenCalledWith(undefined);
      });
    });

    it('re-fetches ratings only when activeWatchlistId changes', async () => {
      mockApi.getRatings
        .mockResolvedValueOnce(baseRatings as any)
        .mockResolvedValueOnce(watchlist2Ratings as any);

      const { result, rerender } = renderHook(
        ({ id }: { id: number }) => useDashboardData(id),
        { initialProps: { id: 1 } },
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(mockApi.getRatings).toHaveBeenCalledTimes(1);
      expect(mockApi.getRatings).toHaveBeenLastCalledWith(1);
      expect(result.current.ratings).toEqual(baseRatings);

      // Initial full-fetch called getAlerts/getNews/getDashboardSummary once
      const alertCallsBefore = mockApi.getAlerts.mock.calls.length;

      rerender({ id: 2 });

      await waitFor(() => {
        expect(result.current.ratings).toEqual(watchlist2Ratings);
      });

      // getRatings called again with new id
      expect(mockApi.getRatings).toHaveBeenCalledTimes(2);
      expect(mockApi.getRatings).toHaveBeenLastCalledWith(2);

      // Secondary endpoints NOT re-fetched on watchlist switch
      expect(mockApi.getAlerts.mock.calls.length).toBe(alertCallsBefore);
    });

    it('updates wsTickers subscription after watchlist switch', async () => {
      mockApi.getRatings
        .mockResolvedValueOnce(baseRatings as any)
        .mockResolvedValueOnce(watchlist2Ratings as any);

      const { result, rerender } = renderHook(
        ({ id }: { id: number }) => useDashboardData(id),
        { initialProps: { id: 1 } },
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      rerender({ id: 2 });

      await waitFor(() => {
        expect(result.current.ratings).toEqual(watchlist2Ratings);
      });

      // After switch, only watchlist-2 tickers should be in the subscription.
      // useWSPrices is called with the new tickers list — verify via the mock.
      const lastCallArgs = mockUseWSPrices.mock.calls[mockUseWSPrices.mock.calls.length - 1][0];
      expect(lastCallArgs.tickers).toEqual(['TSLA']);
    });
  });

  describe('wsPrices exposure', () => {
    it('exposes wsPrices as an empty object before any WS tick', async () => {
      const { result } = renderHook(() => useDashboardData(1));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.wsPrices).toBeDefined();
      expect(typeof result.current.wsPrices).toBe('object');
      expect(Array.isArray(result.current.wsPrices)).toBe(false);
      expect(Object.keys(result.current.wsPrices)).toHaveLength(0);
    });

    it('populates wsPrices keyed by ticker when a price_update arrives', async () => {
      const { result } = renderHook(() => useDashboardData(1));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(capturedOnPriceUpdate).not.toBeNull();

      const update: PriceUpdate = {
        type: 'price_update',
        ticker: 'AAPL',
        price: 175.5,
        change: 2.5,
        change_pct: 1.45,
        volume: 1_000_000,
        timestamp: '2026-02-27T12:01:00Z',
      };

      act(() => { capturedOnPriceUpdate!(update); });

      expect(result.current.wsPrices['AAPL']).toEqual(update);
    });

    it('wsPrices update does not change ratings sort order', async () => {
      const { result } = renderHook(() => useDashboardData(1));

      await waitFor(() => expect(result.current.loading).toBe(false));

      const originalOrder = result.current.ratings!.map((r) => r.ticker);

      act(() => {
        capturedOnPriceUpdate!({
          type: 'price_update',
          ticker: 'AAPL',
          price: 999.0,
          change: 849.0,
          change_pct: 566.0,
          volume: 5_000_000,
          timestamp: '2026-02-27T12:02:00Z',
        });
      });

      const newOrder = result.current.ratings!.map((r) => r.ticker);
      expect(newOrder).toEqual(originalOrder);

      // AI score untouched — only price fields are overwritten in ratings
      const aapl = result.current.ratings!.find((r) => r.ticker === 'AAPL')!;
      expect(aapl.score).toBe(85);
    });
  });

  describe('error resilience', () => {
    it('sets error state if getRatings fails; other data still loads', async () => {
      mockApi.getRatings.mockRejectedValue(new Error('Ratings unavailable'));
      mockApi.getAlerts.mockResolvedValue([]);
      mockApi.getNews.mockResolvedValue([]);

      const { result } = renderHook(() => useDashboardData(1));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.ratings).toBeNull();
      expect(result.current.error).toBe('Ratings unavailable');
      expect(result.current.alerts).toEqual([]);
    });

    it('re-fetches on watchlist switch even if previous fetch failed', async () => {
      mockApi.getRatings
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce(watchlist2Ratings as any);

      const { result, rerender } = renderHook(
        ({ id }: { id: number }) => useDashboardData(id),
        { initialProps: { id: 1 } },
      );

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBe('Timeout');

      rerender({ id: 2 });

      await waitFor(() => {
        expect(result.current.ratings).toEqual(watchlist2Ratings);
      });
    });
  });
});
