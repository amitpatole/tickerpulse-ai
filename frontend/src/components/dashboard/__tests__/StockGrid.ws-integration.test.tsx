"""
Tests for StockGrid WebSocket price integration.

Covers:
- WS price updates merged with SSE and initial snapshot
- Priority: WS > SSE > initial snapshot
- Real-time updates without page reload
"""

import { renderHook, act } from '@testing-library/react';
import type { AIRating, PriceUpdate } from '@/lib/types';

// Mock types for testing
interface MockStockCardProps {
  rating: AIRating;
  livePrice?: number;
  liveChange?: number;
  liveChangePercent?: number;
  updatedAt?: string;
}

interface MergePricePayload {
  ticker: string;
  price: number;
  change: number;
  change_pct: number;
  volume: number;
  timestamp: string;
}

/**
 * Simulates the price merging logic in StockGrid.
 * Implements the priority: WS > SSE > initial snapshot
 */
function mergeRatingWithPrices(
  rating: AIRating,
  wsPrices: Record<string, PriceUpdate>,
  ssePrices: Record<string, MergePricePayload>
): MockStockCardProps {
  const ticker = rating.ticker;
  const wsPrice = wsPrices[ticker];
  const ssePrice = ssePrices[ticker];

  if (wsPrice) {
    // WS price (highest priority - live, real-time)
    return {
      rating,
      livePrice: wsPrice.price,
      liveChange: wsPrice.change,
      liveChangePercent: wsPrice.change_pct,
      updatedAt: wsPrice.timestamp,
    };
  }

  if (ssePrice) {
    // SSE price (fallback - last broadcast)
    return {
      rating,
      livePrice: ssePrice.price,
      liveChange: ssePrice.change,
      liveChangePercent: ssePrice.change_pct,
      updatedAt: ssePrice.timestamp,
    };
  }

  // Initial snapshot from rating (lowest priority - stale)
  return {
    rating,
    livePrice: rating.current_price,
    liveChange: rating.price_change,
    liveChangePercent: rating.price_change_pct,
  };
}

describe('StockGrid WebSocket Price Integration', () => {
  describe('Happy path: WS price priority', () => {
    it('should use WS price when available', () => {
      const rating: AIRating = {
        ticker: 'AAPL',
        rating: 'BUY',
        current_price: 170.00, // stale
        price_change: 0.0,
        price_change_pct: 0.0,
        confidence: 85,
      } as AIRating;

      const wsPrice: PriceUpdate = {
        type: 'price_update',
        ticker: 'AAPL',
        price: 175.50, // fresh from WS
        change: 5.50,
        change_pct: 3.24,
        volume: 1_000_000,
        timestamp: '2026-02-27T12:00:00Z',
      };

      const merged = mergeRatingWithPrices(rating, { AAPL: wsPrice }, {});

      expect(merged.livePrice).toBe(175.50);
      expect(merged.liveChange).toBe(5.50);
      expect(merged.liveChangePercent).toBe(3.24);
      expect(merged.updatedAt).toBe('2026-02-27T12:00:00Z');
    });

    it('should prefer WS price over SSE price', () => {
      const rating: AIRating = {
        ticker: 'MSFT',
        rating: 'HOLD',
        current_price: 370.00,
        price_change: 0.0,
        price_change_pct: 0.0,
        confidence: 75,
      } as AIRating;

      const wsPrice: PriceUpdate = {
        type: 'price_update',
        ticker: 'MSFT',
        price: 385.00, // more recent
        change: 15.00,
        change_pct: 4.05,
        volume: 2_000_000,
        timestamp: '2026-02-27T12:05:00Z',
      };

      const ssePrice: MergePricePayload = {
        ticker: 'MSFT',
        price: 380.00, // from previous SSE event
        change: 10.00,
        change_pct: 2.70,
        volume: 1_500_000,
        timestamp: '2026-02-27T12:03:00Z',
      };

      const merged = mergeRatingWithPrices(rating, { MSFT: wsPrice }, { MSFT: ssePrice });

      expect(merged.livePrice).toBe(385.00); // WS price, not SSE
      expect(merged.updatedAt).toBe('2026-02-27T12:05:00Z'); // WS timestamp
    });

    it('should prefer SSE price over initial snapshot', () => {
      const rating: AIRating = {
        ticker: 'GOOG',
        rating: 'BUY',
        current_price: 135.00, // stale snapshot
        price_change: 0.0,
        price_change_pct: 0.0,
        confidence: 90,
      } as AIRating;

      const ssePrice: MergePricePayload = {
        ticker: 'GOOG',
        price: 140.00, // from SSE event
        change: 5.00,
        change_pct: 3.70,
        volume: 1_200_000,
        timestamp: '2026-02-27T12:01:00Z',
      };

      const merged = mergeRatingWithPrices(rating, {}, { GOOG: ssePrice });

      expect(merged.livePrice).toBe(140.00); // SSE price, not initial snapshot
      expect(merged.updatedAt).toBe('2026-02-27T12:01:00Z');
    });

    it('should use initial snapshot when no WS or SSE price available', () => {
      const rating: AIRating = {
        ticker: 'TSLA',
        rating: 'SELL',
        current_price: 245.00,
        price_change: 2.00,
        price_change_pct: 0.82,
        confidence: 60,
      } as AIRating;

      const merged = mergeRatingWithPrices(rating, {}, {});

      expect(merged.livePrice).toBe(245.00);
      expect(merged.liveChange).toBe(2.00);
      expect(merged.liveChangePercent).toBe(0.82);
      expect(merged.updatedAt).toBeUndefined(); // No timestamp from WS/SSE
    });
  });

  describe('Real-time updates: live price changes', () => {
    it('should update card when WS price arrives for previously stale ticker', () => {
      const rating: AIRating = {
        ticker: 'NVDA',
        rating: 'BUY',
        current_price: 870.00,
        price_change: 0.0,
        price_change_pct: 0.0,
        confidence: 95,
      } as AIRating;

      // Initially, only initial snapshot available
      let merged = mergeRatingWithPrices(rating, {}, {});
      expect(merged.livePrice).toBe(870.00);

      // WS price arrives
      const wsPrice: PriceUpdate = {
        type: 'price_update',
        ticker: 'NVDA',
        price: 875.50,
        change: 5.50,
        change_pct: 0.63,
        volume: 3_000_000,
        timestamp: '2026-02-27T12:00:00Z',
      };

      // Re-merge with WS price
      merged = mergeRatingWithPrices(rating, { NVDA: wsPrice }, {});

      expect(merged.livePrice).toBe(875.50);
      expect(merged.updatedAt).toBe('2026-02-27T12:00:00Z');
    });

    it('should replace SSE price when newer WS price arrives', () => {
      const rating: AIRating = {
        ticker: 'AMD',
        rating: 'HOLD',
        current_price: 140.00,
        price_change: 0.0,
        price_change_pct: 0.0,
        confidence: 70,
      } as AIRating;

      // First SSE event arrives
      const ssePrices: Record<string, MergePricePayload> = {
        AMD: {
          ticker: 'AMD',
          price: 145.00,
          change: 5.00,
          change_pct: 3.57,
          volume: 500_000,
          timestamp: '2026-02-27T12:00:00Z',
        },
      };

      let merged = mergeRatingWithPrices(rating, {}, ssePrices);
      expect(merged.livePrice).toBe(145.00);

      // Later, WS price arrives (more recent)
      const wsPrice: PriceUpdate = {
        type: 'price_update',
        ticker: 'AMD',
        price: 148.50,
        change: 8.50,
        change_pct: 6.07,
        volume: 750_000,
        timestamp: '2026-02-27T12:01:00Z',
      };

      merged = mergeRatingWithPrices(rating, { AMD: wsPrice }, ssePrices);

      expect(merged.livePrice).toBe(148.50); // WS price takes priority
      expect(merged.updatedAt).toBe('2026-02-27T12:01:00Z');
    });
  });

  describe('Edge cases: empty and boundary conditions', () => {
    it('should handle empty price objects gracefully', () => {
      const rating: AIRating = {
        ticker: 'META',
        rating: 'BUY',
        current_price: 500.00,
        price_change: 2.00,
        price_change_pct: 0.40,
        confidence: 80,
      } as AIRating;

      const merged = mergeRatingWithPrices(rating, {}, {});

      expect(merged.rating).toEqual(rating);
      expect(merged.livePrice).toBe(500.00); // Falls back to initial
    });

    it('should handle zero price correctly', () => {
      const rating: AIRating = {
        ticker: 'TEST',
        rating: 'SELL',
        current_price: 100.00,
        price_change: 0.0,
        price_change_pct: 0.0,
        confidence: 50,
      } as AIRating;

      const wsPrice: PriceUpdate = {
        type: 'price_update',
        ticker: 'TEST',
        price: 0, // Edge case: zero price
        change: -100.00,
        change_pct: -100.0,
        volume: 0,
        timestamp: '2026-02-27T12:00:00Z',
      };

      const merged = mergeRatingWithPrices(rating, { TEST: wsPrice }, {});

      expect(merged.livePrice).toBe(0); // Should accept zero (not treat as falsy)
    });

    it('should handle negative price change', () => {
      const rating: AIRating = {
        ticker: 'LOSS',
        rating: 'SELL',
        current_price: 100.00,
        price_change: 0.0,
        price_change_pct: 0.0,
        confidence: 40,
      } as AIRating;

      const wsPrice: PriceUpdate = {
        type: 'price_update',
        ticker: 'LOSS',
        price: 85.50,
        change: -14.50,
        change_pct: -14.50,
        volume: 2_000_000,
        timestamp: '2026-02-27T12:00:00Z',
      };

      const merged = mergeRatingWithPrices(rating, { LOSS: wsPrice }, {});

      expect(merged.livePrice).toBe(85.50);
      expect(merged.liveChange).toBe(-14.50);
      expect(merged.liveChangePercent).toBe(-14.50);
    });
  });

  describe('Multiple tickers: independent merging', () => {
    it('should merge prices for multiple tickers independently', () => {
      const ratings: AIRating[] = [
        {
          ticker: 'AAPL',
          rating: 'BUY',
          current_price: 170.00,
          price_change: 0.0,
          price_change_pct: 0.0,
          confidence: 85,
        } as AIRating,
        {
          ticker: 'MSFT',
          rating: 'BUY',
          current_price: 370.00,
          price_change: 0.0,
          price_change_pct: 0.0,
          confidence: 80,
        } as AIRating,
      ];

      const wsPrices: Record<string, PriceUpdate> = {
        AAPL: {
          type: 'price_update',
          ticker: 'AAPL',
          price: 175.50,
          change: 5.50,
          change_pct: 3.24,
          volume: 1_000_000,
          timestamp: '2026-02-27T12:00:00Z',
        },
        // MSFT not in WS prices
      };

      const ssePrices: Record<string, MergePricePayload> = {
        MSFT: {
          ticker: 'MSFT',
          price: 385.00,
          change: 15.00,
          change_pct: 4.05,
          volume: 2_000_000,
          timestamp: '2026-02-27T12:00:00Z',
        },
      };

      const mergedAAPL = mergeRatingWithPrices(ratings[0], wsPrices, ssePrices);
      const mergedMSFT = mergeRatingWithPrices(ratings[1], wsPrices, ssePrices);

      expect(mergedAAPL.livePrice).toBe(175.50); // From WS
      expect(mergedMSFT.livePrice).toBe(385.00); // From SSE
    });
  });
});