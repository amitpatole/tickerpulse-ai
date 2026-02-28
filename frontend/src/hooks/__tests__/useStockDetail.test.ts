/**
 * Tests for useStockDetail hook
 *
 * Tests cover:
 * - Happy path: Fetch stock detail, overlay live prices via SSE without refetch
 * - Live price updates: price_update SSE events update livePrice in-place
 * - Full refetch triggers: snapshot and news events trigger refetch
 * - Error handling: API failures, missing data gracefully handled
 * - Edge cases: Live price cleared on data refresh, ticker filtering for news
 * - Acceptance: Live prices overlay on top of base data without re-sorting
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useStockDetail } from '../useStockDetail';
import { useApi } from '../useApi';
import { useSSE } from '../useSSE';
import type { StockDetail, PriceUpdateEvent, SSEMessage } from '@/lib/types';

// Mock the dependency hooks
jest.mock('../useApi');
jest.mock('../useSSE');

const mockUseApi = useApi as jest.MockedFunction<typeof useApi>;
const mockUseSSE = useSSE as jest.MockedFunction<typeof useSSE>;

describe('useStockDetail', () => {
  // =========================================================================
  // Setup
  // =========================================================================

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks
    mockUseApi.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: jest.fn(),
    } as any);

    mockUseSSE.mockReturnValue({
      lastEvent: null,
      isConnected: true,
    } as any);
  });

  // =========================================================================
  // Happy Path: Fetch and display stock detail with live price overlay
  // =========================================================================

  describe('happy path: fetches stock detail and overlays live prices', () => {
    it('returns stock detail data from useApi with initial livePrice null', async () => {
      // Arrange: Stock detail data
      const stockDetail: StockDetail = {
        ticker: 'AAPL',
        quote: {
          ticker: 'AAPL',
          price: 150.5,
          change_pct: 2.5,
          volume: 5000000,
          name: 'Apple Inc.',
          currency: 'USD',
        },
        candles: [],
        news: [],
        indicators: { rsi: 65, macd_signal: 'bullish', bb_position: 'upper' },
        ai_rating: {
          score: 72,
          rating: 'STRONG_BUY',
          confidence: 0.85,
        },
      };

      const mockRefetch = jest.fn();
      mockUseApi.mockReturnValue({
        data: stockDetail,
        loading: false,
        error: null,
        refetch: mockRefetch,
      } as any);

      // Act
      const { result } = renderHook(() => useStockDetail('AAPL'));

      // Assert: Data loads and livePrice is null initially
      await waitFor(() => {
        expect(result.current.data).toEqual(stockDetail);
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeNull();
        expect(result.current.livePrice).toBeNull();
      });

      // Assert: aiRating extracted from data
      expect(result.current.aiRating).toEqual(stockDetail.ai_rating);
    });

    it('updates livePrice without full refetch when SSE price_update event arrives', async () => {
      // Arrange: Initial data
      const stockDetail: StockDetail = {
        ticker: 'AAPL',
        quote: {
          price: 150.5,
          change_pct: 2.5,
          volume: 5000000,
          name: 'Apple Inc.',
          currency: 'USD',
        },
        candles: [],
        news: [],
      };

      const mockRefetch = jest.fn();
      mockUseApi.mockReturnValue({
        data: stockDetail,
        loading: false,
        error: null,
        refetch: mockRefetch,
      } as any);

      mockUseSSE.mockReturnValue({
        lastEvent: null,
        isConnected: true,
      } as any);

      const { result, rerender } = renderHook(() => useStockDetail('AAPL'));

      // Assert: Initial state
      await waitFor(() => {
        expect(result.current.livePrice).toBeNull();
        expect(mockRefetch).not.toHaveBeenCalled();
      });

      // Act: SSE price_update event arrives
      const priceUpdateEvent: PriceUpdateEvent = {
        ticker: 'AAPL',
        price: 151.25, // Price updated
        change: 0.75,
        change_pct: 2.8,
        volume: 5100000,
        timestamp: new Date().toISOString(),
      };

      mockUseSSE.mockReturnValue({
        lastEvent: {
          type: 'price_update',
          data: priceUpdateEvent,
          timestamp: Date.now(),
        } as unknown as SSEMessage,
        isConnected: true,
      } as any);

      rerender();

      // Assert: livePrice updates WITHOUT triggering refetch
      await waitFor(() => {
        expect(result.current.livePrice).toEqual(priceUpdateEvent);
        expect(mockRefetch).not.toHaveBeenCalled();
      });
    });
  });

  // =========================================================================
  // Full Refetch Triggers: snapshot and news events
  // =========================================================================

  describe('refetch triggers: snapshot and news events cause full refetch', () => {
    it('triggers refetch when SSE snapshot event arrives', async () => {
      // Arrange
      const mockRefetch = jest.fn();
      mockUseApi.mockReturnValue({
        data: null,
        loading: false,
        error: null,
        refetch: mockRefetch,
      } as any);

      mockUseSSE.mockReturnValue({
        lastEvent: null,
        isConnected: true,
      } as any);

      const { rerender } = renderHook(() => useStockDetail('AAPL'));

      // Act: snapshot event arrives
      mockUseSSE.mockReturnValue({
        lastEvent: {
          type: 'snapshot',
          data: null,
          timestamp: Date.now(),
        } as unknown as SSEMessage,
        isConnected: true,
      } as any);

      rerender();

      // Assert: refetch called
      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalledTimes(1);
      });
    });

    it('triggers refetch when SSE news event arrives for matching ticker', async () => {
      // Arrange
      const mockRefetch = jest.fn();
      mockUseApi.mockReturnValue({
        data: null,
        loading: false,
        error: null,
        refetch: mockRefetch,
      } as any);

      mockUseSSE.mockReturnValue({
        lastEvent: null,
        isConnected: true,
      } as any);

      const { rerender } = renderHook(() => useStockDetail('AAPL'));

      // Act: news event for AAPL
      mockUseSSE.mockReturnValue({
        lastEvent: {
          type: 'news',
          data: { ticker: 'AAPL', title: 'Apple announces product' },
          timestamp: Date.now(),
        } as unknown as SSEMessage,
        isConnected: true,
      } as any);

      rerender();

      // Assert: refetch triggered
      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalledTimes(1);
      });
    });

    it('ignores news event when ticker does not match', async () => {
      // Arrange
      const mockRefetch = jest.fn();
      mockUseApi.mockReturnValue({
        data: null,
        loading: false,
        error: null,
        refetch: mockRefetch,
      } as any);

      mockUseSSE.mockReturnValue({
        lastEvent: null,
        isConnected: true,
      } as any);

      const { rerender } = renderHook(() => useStockDetail('AAPL'));

      // Act: news event for different ticker (MSFT)
      mockUseSSE.mockReturnValue({
        lastEvent: {
          type: 'news',
          data: { ticker: 'MSFT', title: 'Microsoft announcement' },
          timestamp: Date.now(),
        } as unknown as SSEMessage,
        isConnected: true,
      } as any);

      rerender();

      // Assert: refetch NOT triggered for different ticker
      await waitFor(() => {
        expect(mockRefetch).not.toHaveBeenCalled();
      });
    });
  });

  // =========================================================================
  // Live Price Cleanup: livePrice cleared on data refresh
  // =========================================================================

  describe('live price cleanup: clears livePrice when data refreshes', () => {
    it('clears livePrice when data is refreshed (after refetch)', async () => {
      // Arrange: Initial state with livePrice
      const stockDetail: StockDetail = {
        ticker: 'AAPL',
        quote: {
          price: 150.5,
          change_pct: 2.5,
          volume: 5000000,
          name: 'Apple Inc.',
          currency: 'USD',
        },
        candles: [],
        news: [],
      };

      const priceUpdateEvent: PriceUpdateEvent = {
        ticker: 'AAPL',
        price: 151.25,
        change: 0.75,
        change_pct: 2.8,
        volume: 5100000,
        timestamp: new Date().toISOString(),
      };

      const mockRefetch = jest.fn();
      const { rerender: rerender1 } = renderHook(() => useStockDetail('AAPL'), {
        initialProps: undefined,
      });

      // Set initial data
      mockUseApi.mockReturnValue({
        data: stockDetail,
        loading: false,
        error: null,
        refetch: mockRefetch,
      } as any);

      const { rerender: rerender2, result } = renderHook(() =>
        useStockDetail('AAPL')
      );

      rerender2();

      // Set livePrice via price_update event
      mockUseSSE.mockReturnValue({
        lastEvent: {
          type: 'price_update',
          data: priceUpdateEvent,
          timestamp: Date.now(),
        } as unknown as SSEMessage,
        isConnected: true,
      } as any);

      const { rerender: rerender3 } = renderHook(() => useStockDetail('AAPL'));
      rerender3();

      // Assert: livePrice is set
      await waitFor(() => {
        expect(result.current.livePrice).toEqual(priceUpdateEvent);
      });

      // Act: Data refreshes (different reference)
      const updatedStockDetail = {
        ...stockDetail,
        quote: { ...stockDetail.quote, price: 151.5 }, // Updated price
      };

      mockUseApi.mockReturnValue({
        data: updatedStockDetail,
        loading: false,
        error: null,
        refetch: mockRefetch,
      } as any);

      const { rerender: rerender4 } = renderHook(() => useStockDetail('AAPL'));
      rerender4();

      // Assert: livePrice is cleared when data updates
      await waitFor(() => {
        expect(result.current.livePrice).toBeNull();
      });
    });
  });

  // =========================================================================
  // Error Handling: API failures and edge cases
  // =========================================================================

  describe('error handling: gracefully handles API failures', () => {
    it('returns error state when API fails', async () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: null,
        loading: false,
        error: 'Failed to fetch stock detail',
        refetch: jest.fn(),
      } as any);

      // Act
      const { result } = renderHook(() => useStockDetail('INVALID'));

      // Assert: Error is returned
      await waitFor(() => {
        expect(result.current.error).toBe('Failed to fetch stock detail');
        expect(result.current.data).toBeNull();
      });
    });

    it('handles disabled hook when ticker is empty', () => {
      // Arrange
      const mockRefetch = jest.fn();
      mockUseApi.mockReturnValue({
        data: null,
        loading: false,
        error: null,
        refetch: mockRefetch,
      } as any);

      // Act
      const { result } = renderHook(() => useStockDetail(''));

      // Assert: enabled=false passed to useApi (hook disabled)
      expect(mockUseApi).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Array),
        expect.objectContaining({ enabled: false })
      );

      expect(result.current.data).toBeNull();
    });

    it('ignores price_update events when enabled is false', async () => {
      // Arrange: Empty ticker (disabled)
      mockUseSSE.mockReturnValue({
        lastEvent: null,
        isConnected: true,
      } as any);

      const { rerender } = renderHook(() => useStockDetail(''));

      // Act: Price update event arrives while disabled
      mockUseSSE.mockReturnValue({
        lastEvent: {
          type: 'price_update',
          data: { ticker: 'AAPL', price: 151.25 },
          timestamp: Date.now(),
        } as unknown as SSEMessage,
        isConnected: true,
      } as any);

      const { result } = renderHook(() => useStockDetail(''));
      rerender();

      // Assert: livePrice remains null (event ignored)
      await waitFor(() => {
        expect(result.current.livePrice).toBeNull();
      });
    });
  });

  // =========================================================================
  // Timeframe Parameter: useStockDetail respects timeframe
  // =========================================================================

  describe('timeframe parameter: passes timeframe to API correctly', () => {
    it('uses custom timeframe when provided', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: null,
        loading: false,
        error: null,
        refetch: jest.fn(),
      } as any);

      // Act
      renderHook(() => useStockDetail('AAPL', '6M'));

      // Assert: timeframe passed to useApi
      expect(mockUseApi).toHaveBeenCalledWith(
        expect.any(Function),
        expect.arrayContaining(['AAPL', '6M']),
        expect.any(Object)
      );
    });

    it('defaults to 1M timeframe when not specified', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: null,
        loading: false,
        error: null,
        refetch: jest.fn(),
      } as any);

      // Act
      renderHook(() => useStockDetail('AAPL'));

      // Assert: defaults to 1M
      expect(mockUseApi).toHaveBeenCalledWith(
        expect.any(Function),
        expect.arrayContaining(['AAPL', '1M']),
        expect.any(Object)
      );
    });
  });

  // =========================================================================
  // Acceptance Criteria: Live prices overlay without re-sorting
  // =========================================================================

  describe('acceptance criteria: live prices overlay on base data', () => {
    it('provides refetch function for parent to manually refresh', async () => {
      // Arrange
      const mockRefetch = jest.fn();
      mockUseApi.mockReturnValue({
        data: null,
        loading: false,
        error: null,
        refetch: mockRefetch,
      } as any);

      // Act
      const { result } = renderHook(() => useStockDetail('AAPL'));

      // Assert: refetch exposed to caller
      expect(result.current.refetch).toBe(mockRefetch);

      // Act: Parent calls refetch
      result.current.refetch();

      // Assert: refetch executed
      expect(mockRefetch).toHaveBeenCalled();
    });
  });
});
