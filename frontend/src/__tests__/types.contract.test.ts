/**
 * Type contract tests for dashboard components.
 *
 * Validates that:
 * 1. AIRating interface matches API response structure
 * 2. Required fields for StockCard rendering are present
 * 3. Optional fields are safely nullable
 * 4. Price update fields align with AIRating fields
 *
 * This test suite catches type mismatches that would otherwise
 * cause runtime errors in production.
 */

import type {
  AIRating,
  PriceUpdate,
  DashboardSummary,
  Alert,
  NewsArticle,
} from '@/lib/types';

describe('Types Contract — Dashboard Components', () => {
  // =========================================================================
  // AIRating Type Validation
  // =========================================================================

  describe('AIRating interface contracts', () => {
    it('should have all required fields for StockCard rendering', () => {
      const rating: AIRating = {
        ticker: 'AAPL',
        rating: 'STRONG_BUY',
        score: 85,
        confidence: 0.92,
        rsi: 65,
      };

      // Type-safe assertions: these must not cause TypeScript errors
      expect(rating.ticker).toBeDefined();
      expect(rating.rating).toBeDefined();
      expect(rating.score).toBeDefined();
      expect(rating.confidence).toBeDefined();
      expect(rating.rsi).toBeDefined();
    });

    it('should allow null price fields (stale data)', () => {
      const stalRating: AIRating = {
        ticker: 'MSFT',
        rating: 'BUY',
        score: 75,
        confidence: 0.85,
        current_price: null, // OK to be null
        price_change: null, // OK to be null
        price_change_pct: null, // OK to be null
        rsi: 60,
      };

      // These checks ensure null is acceptable
      expect(stalRating.current_price).toBeNull();
      expect(stalRating.price_change).toBeNull();
      expect(stalRating.price_change_pct).toBeNull();
    });

    it('should allow numeric price fields (fresh data)', () => {
      const freshRating: AIRating = {
        ticker: 'GOOG',
        rating: 'HOLD',
        score: 60,
        confidence: 0.75,
        current_price: 140.25,
        price_change: 2.5,
        price_change_pct: 1.82,
        rsi: 55,
      };

      expect(typeof freshRating.current_price).toBe('number');
      expect(typeof freshRating.price_change).toBe('number');
      expect(typeof freshRating.price_change_pct).toBe('number');
    });

    it('should support optional sentiment/technical fields', () => {
      const fullRating: AIRating = {
        ticker: 'NVDA',
        rating: 'STRONG_BUY',
        score: 90,
        confidence: 0.95,
        rsi: 72,
        sentiment_score: 0.65,
        sentiment_label: 'bullish',
        technical_score: 85,
        fundamental_score: 88,
        sector: 'Technology',
        updated_at: '2026-02-27T12:00:00Z',
      };

      expect(fullRating.sentiment_score).toBe(0.65);
      expect(fullRating.sentiment_label).toBe('bullish');
      expect(fullRating.technical_score).toBe(85);
      expect(fullRating.fundamental_score).toBe(88);
      expect(fullRating.sector).toBe('Technology');
      expect(fullRating.updated_at).toBeDefined();
    });

    it('should handle empty/sparse AIRating objects', () => {
      // Minimal required fields only
      const minimal: AIRating = {
        ticker: 'TEST',
        rating: 'HOLD',
        score: 50,
        confidence: 0.5,
      };

      // All required fields should be present
      expect(minimal.ticker).toBeTruthy();
      expect(minimal.rating).toBeTruthy();
      expect(minimal.score).toBeDefined();
      expect(minimal.confidence).toBeDefined();
    });
  });

  // =========================================================================
  // PriceUpdate Type Validation
  // =========================================================================

  describe('PriceUpdate interface contracts', () => {
    it('should have all fields required for price merge', () => {
      const update: PriceUpdate = {
        type: 'price_update',
        ticker: 'AAPL',
        price: 175.5,
        change: 2.5,
        change_pct: 1.45,
        volume: 1_000_000,
        timestamp: '2026-02-27T12:00:00Z',
      };

      // Verify field structure matches useDashboardData merge logic
      expect(update.type).toBe('price_update');
      expect(update.ticker).toBeTruthy();
      expect(typeof update.price).toBe('number');
      expect(typeof update.change).toBe('number');
      expect(typeof update.change_pct).toBe('number');
      expect(typeof update.volume).toBe('number');
      expect(typeof update.timestamp).toBe('string');
    });

    it('should allow zero and negative values in price updates', () => {
      const downUpdate: PriceUpdate = {
        type: 'price_update',
        ticker: 'LOSS',
        price: 50.0,
        change: -25.0, // Stock down 50%
        change_pct: -50.0,
        volume: 2_000_000,
        timestamp: '2026-02-27T12:00:00Z',
      };

      // Should accept negative change and percentage
      expect(downUpdate.change).toBeLessThan(0);
      expect(downUpdate.change_pct).toBeLessThan(0);
      expect(downUpdate.price).toBeGreaterThan(0);
    });

    it('should support edge case: zero price', () => {
      const zeroPrice: PriceUpdate = {
        type: 'price_update',
        ticker: 'ZERO',
        price: 0,
        change: -100,
        change_pct: -100,
        volume: 0,
        timestamp: '2026-02-27T12:00:00Z',
      };

      // Zero should be treated as a valid (albeit unusual) price
      expect(zeroPrice.price).toBe(0);
      expect(zeroPrice.volume).toBe(0);
    });

    it('should align with AIRating price merge fields', () => {
      // PriceUpdate fields should map to AIRating fields:
      // price → current_price
      // change → price_change
      // change_pct → price_change_pct
      // timestamp → updated_at

      const update: PriceUpdate = {
        type: 'price_update',
        ticker: 'MSFT',
        price: 385.0,
        change: 15.0,
        change_pct: 4.05,
        volume: 2_000_000,
        timestamp: '2026-02-27T12:05:00Z',
      };

      const merged: Partial<AIRating> = {
        current_price: update.price,
        price_change: update.change,
        price_change_pct: update.change_pct,
        updated_at: update.timestamp,
      };

      expect(merged.current_price).toBe(update.price);
      expect(merged.price_change).toBe(update.change);
      expect(merged.price_change_pct).toBe(update.change_pct);
      expect(merged.updated_at).toBe(update.timestamp);
    });
  });

  // =========================================================================
  // DashboardSummary Type Validation
  // =========================================================================

  describe('DashboardSummary interface contracts', () => {
    it('should have all fields for KPI cards rendering', () => {
      const summary: DashboardSummary = {
        stock_count: 50,
        active_stock_count: 45,
        active_alert_count: 3,
        market_regime: 'bullish',
        agent_status: {
          total: 5,
          running: 2,
          idle: 3,
          error: 0,
        },
        timestamp: '2026-02-27T12:00:00Z',
      };

      // All required fields present
      expect(summary.stock_count).toBeGreaterThan(0);
      expect(summary.active_stock_count).toBeGreaterThanOrEqual(0);
      expect(summary.active_alert_count).toBeGreaterThanOrEqual(0);
      expect(summary.market_regime).toBeTruthy();
      expect(summary.agent_status.total).toBeGreaterThanOrEqual(0);
      expect(summary.agent_status.running).toBeGreaterThanOrEqual(0);
      expect(summary.agent_status.idle).toBeGreaterThanOrEqual(0);
      expect(summary.agent_status.error).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero counts', () => {
      const empty: DashboardSummary = {
        stock_count: 0,
        active_stock_count: 0,
        active_alert_count: 0,
        market_regime: 'undefined',
        agent_status: {
          total: 0,
          running: 0,
          idle: 0,
          error: 0,
        },
        timestamp: '2026-02-27T12:00:00Z',
      };

      expect(empty.stock_count).toBe(0);
      expect(empty.active_alert_count).toBe(0);
    });
  });

  // =========================================================================
  // Cross-Type Field Alignment
  // =========================================================================

  describe('Cross-type field alignment', () => {
    it('should maintain ticker consistency across types', () => {
      const rating: AIRating = { ticker: 'AAPL', rating: 'BUY', score: 85, confidence: 0.9 };
      const update: PriceUpdate = {
        type: 'price_update',
        ticker: 'AAPL',
        price: 175,
        change: 5,
        change_pct: 2.94,
        volume: 1_000_000,
        timestamp: '2026-02-27T12:00:00Z',
      };

      // Tickers should match for merge to work
      expect(rating.ticker).toBe(update.ticker);
    });

    it('should support timestamp fields in ISO-8601 format', () => {
      const timestamp = '2026-02-27T12:00:00Z';

      const rating: AIRating = {
        ticker: 'TEST',
        rating: 'HOLD',
        score: 50,
        confidence: 0.5,
        updated_at: timestamp,
      };

      const update: PriceUpdate = {
        type: 'price_update',
        ticker: 'TEST',
        price: 100,
        change: 0,
        change_pct: 0,
        volume: 0,
        timestamp,
      };

      // Both should use same timestamp format
      expect(rating.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(update.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });
  });
});
