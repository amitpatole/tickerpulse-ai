'use client';

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import StockGrid from '../StockGrid';
import * as apiModule from '@/lib/api';
import { useSSE } from '@/hooks/useSSE';
import type { AIRating, PriceUpdateEvent } from '@/lib/types';

// Mock the API module
jest.mock('@/lib/api', () => ({
  getRatings: jest.fn(),
  getWatchlistOrder: jest.fn(),
  reorderWatchlist: jest.fn(),
  addStockToWatchlist: jest.fn(),
  removeStockFromWatchlist: jest.fn(),
  searchStocks: jest.fn(),
  getBulkPrices: jest.fn(),
  ApiError: Error,
}));

// Mock useSSE hook
jest.mock('@/hooks/useSSE');

// Mock useApi hook to provide control over state updates
jest.mock('@/hooks/useApi', () => ({
  useApi: jest.fn((fn, initialData, options) => ({
    data: null,
    loading: true,
    error: null,
    refetch: jest.fn(),
  })),
}));

const mockUseSSE = useSSE as jest.MockedFunction<typeof useSSE>;

describe('StockGrid SSE Price Updates Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Happy Path: SSE price updates merge into ratings', () => {
    it('should merge live SSE priceUpdates into StockCard props', async () => {
      const mockRatings: AIRating[] = [
        {
          ticker: 'AAPL',
          rating: 'strong_buy',
          score: 85,
          confidence: 0.92,
          current_price: 150.0,
          price_change: 2.5,
          price_change_pct: 1.69,
          rsi: 65,
          sentiment_score: 0.45,
        },
      ];

      const mockPriceUpdate: PriceUpdateEvent = {
        ticker: 'AAPL',
        price: 152.50,
        change: 4.50,
        change_pct: 3.08,
        timestamp: new Date().toISOString(),
      };

      // Mock useSSE to return price update
      mockUseSSE.mockReturnValue({
        connected: true,
        lastEvent: null,
        agentStatus: {},
        recentAlerts: [],
        recentJobCompletes: [],
        priceUpdates: { AAPL: mockPriceUpdate },
        eventLog: [],
        announcement: { assertive: '', polite: '' },
      });

      // Mock useApi to return ratings
      const useApiMock = require('@/hooks/useApi').useApi as jest.Mock;
      useApiMock.mockReturnValue({
        data: mockRatings,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      // Mock API calls
      (apiModule.getWatchlistOrder as jest.Mock).mockResolvedValue(['AAPL']);
      (apiModule.getBulkPrices as jest.Mock).mockResolvedValue({});

      render(<StockGrid watchlistId={1} />);

      await waitFor(() => {
        const cardElement = screen.getByRole('listbox');
        expect(cardElement).toBeInTheDocument();
      });

      // Verify merged price is displayed (SSE price overrides initial rating price)
      // StockCard displays $152.50 from SSE priceUpdate, not $150.00 from initial rating
      expect(screen.getByText('$152.50')).toBeInTheDocument();
      expect(screen.getByText('+3.08%')).toBeInTheDocument();
    });

    it('should handle multiple ticker price updates simultaneously', async () => {
      const mockRatings: AIRating[] = [
        {
          ticker: 'AAPL',
          rating: 'strong_buy',
          score: 85,
          confidence: 0.92,
          current_price: 150.0,
          price_change: 0,
          price_change_pct: 0,
          rsi: 65,
          sentiment_score: 0.45,
        },
        {
          ticker: 'TSLA',
          rating: 'buy',
          score: 72,
          confidence: 0.85,
          current_price: 200.0,
          price_change: 0,
          price_change_pct: 0,
          rsi: 55,
          sentiment_score: 0.30,
        },
      ];

      const priceUpdates = {
        AAPL: {
          ticker: 'AAPL',
          price: 152.50,
          change: 2.50,
          change_pct: 1.67,
          timestamp: new Date().toISOString(),
        },
        TSLA: {
          ticker: 'TSLA',
          price: 205.00,
          change: 5.00,
          change_pct: 2.50,
          timestamp: new Date().toISOString(),
        },
      };

      mockUseSSE.mockReturnValue({
        connected: true,
        lastEvent: null,
        agentStatus: {},
        recentAlerts: [],
        recentJobCompletes: [],
        priceUpdates,
        eventLog: [],
        announcement: { assertive: '', polite: '' },
      });

      const useApiMock = require('@/hooks/useApi').useApi as jest.Mock;
      useApiMock.mockReturnValue({
        data: mockRatings,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      (apiModule.getWatchlistOrder as jest.Mock).mockResolvedValue(['AAPL', 'TSLA']);
      (apiModule.getBulkPrices as jest.Mock).mockResolvedValue({});

      render(<StockGrid watchlistId={1} />);

      await waitFor(() => {
        expect(screen.getByText('$152.50')).toBeInTheDocument();
        expect(screen.getByText('$205.00')).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases: Missing data and fallbacks', () => {
    it('should use initPrices fallback when SSE priceUpdates not yet received', async () => {
      const mockRatings: AIRating[] = [
        {
          ticker: 'AAPL',
          rating: 'strong_buy',
          score: 85,
          confidence: 0.92,
          current_price: 150.0,
          price_change: 0,
          price_change_pct: 0,
          rsi: 65,
          sentiment_score: 0.45,
        },
      ];

      // No SSE price updates yet
      mockUseSSE.mockReturnValue({
        connected: true,
        lastEvent: null,
        agentStatus: {},
        recentAlerts: [],
        recentJobCompletes: [],
        priceUpdates: {},
        eventLog: [],
        announcement: { assertive: '', polite: '' },
      });

      const useApiMock = require('@/hooks/useApi').useApi as jest.Mock;
      useApiMock.mockReturnValue({
        data: mockRatings,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      // Mock getBulkPrices to return initial price
      const initPrice: PriceUpdateEvent = {
        ticker: 'AAPL',
        price: 151.00,
        change: 1.00,
        change_pct: 0.67,
        timestamp: new Date().toISOString(),
      };
      (apiModule.getBulkPrices as jest.Mock).mockResolvedValue({ AAPL: initPrice });
      (apiModule.getWatchlistOrder as jest.Mock).mockResolvedValue(['AAPL']);

      render(<StockGrid watchlistId={1} />);

      await waitFor(() => {
        // Should display initial price from getBulkPrices
        expect(screen.getByText('$151.00')).toBeInTheDocument();
      });
    });

    it('should handle ticker with no price data gracefully', async () => {
      const mockRatings: AIRating[] = [
        {
          ticker: 'UNKNOWN',
          rating: 'hold',
          score: 50,
          confidence: 0.50,
          current_price: null, // No price
          price_change: null,
          price_change_pct: null,
          rsi: 50,
          sentiment_score: 0,
        },
      ];

      mockUseSSE.mockReturnValue({
        connected: true,
        lastEvent: null,
        agentStatus: {},
        recentAlerts: [],
        recentJobCompletes: [],
        priceUpdates: {}, // No SSE update for this ticker
        eventLog: [],
        announcement: { assertive: '', polite: '' },
      });

      const useApiMock = require('@/hooks/useApi').useApi as jest.Mock;
      useApiMock.mockReturnValue({
        data: mockRatings,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      (apiModule.getBulkPrices as jest.Mock).mockResolvedValue({});
      (apiModule.getWatchlistOrder as jest.Mock).mockResolvedValue(['UNKNOWN']);

      render(<StockGrid watchlistId={1} />);

      await waitFor(() => {
        const listbox = screen.getByRole('listbox');
        expect(listbox).toBeInTheDocument();
      });

      // StockCard should render with "—" for missing price
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  describe('Acceptance Criterion: SSE priceUpdates state wires to StockCard', () => {
    it('should update StockCard price when SSE priceUpdates state changes', async () => {
      const mockRatings: AIRating[] = [
        {
          ticker: 'AAPL',
          rating: 'strong_buy',
          score: 85,
          confidence: 0.92,
          current_price: 150.0,
          price_change: 0,
          price_change_pct: 0,
          rsi: 65,
          sentiment_score: 0.45,
        },
      ];

      // Initial state: no price update
      mockUseSSE.mockReturnValue({
        connected: true,
        lastEvent: null,
        agentStatus: {},
        recentAlerts: [],
        recentJobCompletes: [],
        priceUpdates: {},
        eventLog: [],
        announcement: { assertive: '', polite: '' },
      });

      const useApiMock = require('@/hooks/useApi').useApi as jest.Mock;
      useApiMock.mockReturnValue({
        data: mockRatings,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      (apiModule.getBulkPrices as jest.Mock).mockResolvedValue({});
      (apiModule.getWatchlistOrder as jest.Mock).mockResolvedValue(['AAPL']);

      const { rerender } = render(<StockGrid watchlistId={1} />);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // Re-render with SSE price update
      mockUseSSE.mockReturnValue({
        connected: true,
        lastEvent: null,
        agentStatus: {},
        recentAlerts: [],
        recentJobCompletes: [],
        priceUpdates: {
          AAPL: {
            ticker: 'AAPL',
            price: 155.50,
            change: 5.50,
            change_pct: 3.67,
            timestamp: new Date().toISOString(),
          },
        },
        eventLog: [],
        announcement: { assertive: '', polite: '' },
      });

      rerender(<StockGrid watchlistId={1} />);

      await waitFor(() => {
        // Updated price should be displayed
        expect(screen.getByText('$155.50')).toBeInTheDocument();
      });
    });
  });
});
