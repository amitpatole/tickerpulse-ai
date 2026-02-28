/**
 * Edge-case tests for useDashboardData hook.
 *
 * Covers critical gaps:
 * 1. Summary API failure (non-fatal error handling)
 * 2. Price merge when AIRating fields are partially null
 * 3. Concurrent state updates during rapid reconnects
 * 4. Type safety: all required StockCard fields present after merge
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useDashboardData } from '../useDashboardData';
import * as api from '@/lib/api';
import type { PriceUpdate, AIRating } from '@/lib/types';

jest.mock('@/lib/api');
jest.mock('../useWSPrices');

const mockApi = api as jest.Mocked<typeof api>;
import { useWSPrices } from '../useWSPrices';
const mockUseWSPrices = useWSPrices as jest.Mock;

let capturedOnPriceUpdate: ((update: PriceUpdate) => void) | null = null;

describe('useDashboardData — Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    capturedOnPriceUpdate = null;

    mockApi.getRefreshInterval.mockResolvedValue({ interval: 30, source: 'default' });

    mockUseWSPrices.mockImplementation(({ onPriceUpdate }: { onPriceUpdate: (u: PriceUpdate) => void }) => {
      capturedOnPriceUpdate = onPriceUpdate;
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Error case: getDashboardSummary fails, other endpoints succeed', () => {
    it('should set loading to false and error to null when summary fails but ratings succeed', async () => {
      const mockRatings: AIRating[] = [
        {
          ticker: 'AAPL',
          rating: 'BUY',
          score: 85,
          confidence: 0.9,
          current_price: 150,
          price_change: 1,
          price_change_pct: 0.67,
          rsi: 60,
          updated_at: '2026-02-27T12:00:00Z',
        },
      ];

      mockApi.getRatings.mockResolvedValue(mockRatings as any);
      mockApi.getAlerts.mockResolvedValue([]);
      mockApi.getNews.mockResolvedValue([]);
      mockApi.getDashboardSummary.mockRejectedValue(new Error('Summary service unavailable'));

      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.ratings).toEqual(mockRatings);
      expect(result.current.summary).toBe(null);
      expect(result.current.error).toBe(null);
    });
  });

  describe('Edge case: Price merge when AIRating has null price_change fields', () => {
    it('should handle price merge when initial price_change is null', async () => {
      const mockRatings: AIRating[] = [
        {
          ticker: 'GOOG',
          rating: 'HOLD',
          score: 60,
          confidence: 0.8,
          current_price: null,
          price_change: null,
          price_change_pct: null,
          rsi: 50,
        },
      ];

      mockApi.getRatings.mockResolvedValue(mockRatings as any);
      mockApi.getAlerts.mockResolvedValue([]);
      mockApi.getNews.mockResolvedValue([]);
      mockApi.getDashboardSummary.mockResolvedValue({
        stock_count: 1,
        active_stock_count: 1,
        active_alert_count: 0,
        market_regime: 'neutral',
        agent_status: { total: 0, running: 0, idle: 0, error: 0 },
        timestamp: '2026-02-27T12:00:00Z',
      });

      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(capturedOnPriceUpdate).not.toBeNull();

      const priceUpdate: PriceUpdate = {
        type: 'price_update',
        ticker: 'GOOG',
        price: 140.5,
        change: 5.5,
        change_pct: 4.07,
        volume: 1_000_000,
        timestamp: '2026-02-27T12:05:00Z',
      };

      act(() => {
        capturedOnPriceUpdate!(priceUpdate);
      });

      expect(result.current.ratings![0].current_price).toBe(140.5);
      expect(result.current.ratings![0].price_change).toBe(5.5);
      expect(result.current.ratings![0].price_change_pct).toBe(4.07);
      expect(result.current.ratings![0].updated_at).toBe('2026-02-27T12:05:00Z');
      expect(result.current.ratings![0].rsi).toBe(50);
    });
  });

  describe('Edge case: Multiple price updates arrive in quick succession', () => {
    it('should apply updates in order without losing state', async () => {
      const mockRatings: AIRating[] = [
        {
          ticker: 'MSFT',
          rating: 'BUY',
          score: 80,
          confidence: 0.85,
          current_price: 380,
          price_change: 0,
          price_change_pct: 0,
          rsi: 55,
          updated_at: '2026-02-27T12:00:00Z',
        },
      ];

      mockApi.getRatings.mockResolvedValue(mockRatings as any);
      mockApi.getAlerts.mockResolvedValue([]);
      mockApi.getNews.mockResolvedValue([]);
      mockApi.getDashboardSummary.mockResolvedValue({
        stock_count: 1,
        active_stock_count: 1,
        active_alert_count: 0,
        market_regime: 'neutral',
        agent_status: { total: 0, running: 0, idle: 0, error: 0 },
        timestamp: '2026-02-27T12:00:00Z',
      });

      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        capturedOnPriceUpdate!({
          type: 'price_update',
          ticker: 'MSFT',
          price: 385,
          change: 5,
          change_pct: 1.32,
          volume: 500_000,
          timestamp: '2026-02-27T12:01:00Z',
        });
      });

      expect(result.current.ratings![0].current_price).toBe(385);

      act(() => {
        capturedOnPriceUpdate!({
          type: 'price_update',
          ticker: 'MSFT',
          price: 388.5,
          change: 8.5,
          change_pct: 2.24,
          volume: 600_000,
          timestamp: '2026-02-27T12:02:00Z',
        });
      });

      expect(result.current.ratings![0].current_price).toBe(388.5);
      expect(result.current.ratings![0].updated_at).toBe('2026-02-27T12:02:00Z');
      expect(result.current.ratings![0].score).toBe(80);
    });
  });

  describe('Type safety: Merged rating maintains all required fields for rendering', () => {
    it('should preserve all non-price fields after WebSocket merge', async () => {
      const mockRatings: AIRating[] = [
        {
          ticker: 'TSLA',
          rating: 'SELL',
          score: 35,
          confidence: 0.75,
          current_price: 240,
          price_change: -5,
          price_change_pct: -2.04,
          rsi: 40,
          sentiment_score: -0.45,
          sentiment_label: 'bearish',
          sector: 'Automotive',
          updated_at: '2026-02-27T11:00:00Z',
        },
      ];

      mockApi.getRatings.mockResolvedValue(mockRatings as any);
      mockApi.getAlerts.mockResolvedValue([]);
      mockApi.getNews.mockResolvedValue([]);
      mockApi.getDashboardSummary.mockResolvedValue({
        stock_count: 1,
        active_stock_count: 1,
        active_alert_count: 0,
        market_regime: 'bearish',
        agent_status: { total: 1, running: 0, idle: 1, error: 0 },
        timestamp: '2026-02-27T12:00:00Z',
      });

      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        capturedOnPriceUpdate!({
          type: 'price_update',
          ticker: 'TSLA',
          price: 235,
          change: -5,
          change_pct: -2.08,
          volume: 2_000_000,
          timestamp: '2026-02-27T12:01:00Z',
        });
      });

      const merged = result.current.ratings![0];

      expect(merged.ticker).toBe('TSLA');
      expect(merged.rating).toBe('SELL');
      expect(merged.score).toBe(35);
      expect(merged.confidence).toBe(0.75);
      expect(merged.rsi).toBe(40);
      expect(merged.sentiment_score).toBe(-0.45);
      expect(merged.sentiment_label).toBe('bearish');
      expect(merged.sector).toBe('Automotive');

      expect(merged.current_price).toBe(235);
      expect(merged.price_change).toBe(-5);
      expect(merged.price_change_pct).toBe(-2.08);
      expect(merged.updated_at).toBe('2026-02-27T12:01:00Z');
    });
  });

  describe('Error recovery: Refetch when some endpoints previously failed', () => {
    it('should successfully fetch previously-failed endpoint on refetch()', async () => {
      const mockRatings: AIRating[] = [
        {
          ticker: 'AAPL',
          rating: 'BUY',
          score: 85,
          confidence: 0.9,
          current_price: 150,
          price_change: 1,
          price_change_pct: 0.67,
          rsi: 60,
        },
      ];

      mockApi.getRatings.mockResolvedValueOnce(mockRatings as any);
      mockApi.getAlerts.mockResolvedValueOnce([]);
      mockApi.getNews.mockResolvedValueOnce([]);
      mockApi.getDashboardSummary.mockRejectedValueOnce(new Error('Service down'));

      const { result } = renderHook(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.summary).toBe(null);

      const mockSummary = {
        stock_count: 50,
        active_stock_count: 45,
        active_alert_count: 3,
        market_regime: 'bullish',
        agent_status: { total: 5, running: 2, idle: 3, error: 0 },
        timestamp: '2026-02-27T12:00:00Z',
      };

      mockApi.getRatings.mockResolvedValueOnce(mockRatings as any);
      mockApi.getAlerts.mockResolvedValueOnce([]);
      mockApi.getNews.mockResolvedValueOnce([]);
      mockApi.getDashboardSummary.mockResolvedValueOnce(mockSummary);

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.summary).toEqual(mockSummary);
      });
    });
  });
});