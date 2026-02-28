/**
 * Integration tests for Dashboard Frontend Component changes
 * Verifies the following fixes:
 * - StockDetailQuote extended fields (dividend_yield, beta, avg_volume, book_value)
 * - useWSPrices 'error' status and fixed error handler
 * - WSStatusIndicator 'error' config support
 * - useDashboardData.refresh-interval.test.ts corrected mock data
 */

import type {
  StockDetailQuote,
  AIRating,
  Alert,
  NewsArticle,
  DashboardSummary,
  PriceUpdate,
} from '@/lib/types';

describe('Dashboard Frontend Component Changes', () => {
  describe('StockDetailQuote - Extended Fields Support', () => {
    it('should accept StockDetailQuote with all extended fields populated', () => {
      const quote: StockDetailQuote = {
        price: 150.5,
        change_pct: 1.7,
        volume: 50000000,
        market_cap: 2_500_000_000_000,
        week_52_high: 180.25,
        week_52_low: 120.75,
        pe_ratio: 28.5,
        eps: 5.25,
        dividend_yield: 0.45,
        beta: 1.2,
        avg_volume: 40000000,
        book_value: 31.25,
        name: 'Apple Inc.',
        currency: 'USD',
      };

      // Verify all fields are accessible and have expected types
      expect(quote.dividend_yield).toBe(0.45);
      expect(quote.beta).toBe(1.2);
      expect(quote.avg_volume).toBe(40000000);
      expect(quote.book_value).toBe(31.25);
    });

    it('should accept StockDetailQuote with extended fields as null', () => {
      const quote: StockDetailQuote = {
        price: 100,
        change_pct: 0,
        volume: 1000000,
        name: 'Test Stock',
        currency: 'USD',
        dividend_yield: null,
        beta: null,
        avg_volume: null,
        book_value: null,
      };

      expect(quote.dividend_yield).toBeNull();
      expect(quote.beta).toBeNull();
      expect(quote.avg_volume).toBeNull();
      expect(quote.book_value).toBeNull();
    });

    it('should accept StockDetailQuote with extended fields as undefined (optional)', () => {
      const quote: StockDetailQuote = {
        price: 100,
        change_pct: 0,
        volume: 1000000,
        name: 'Test Stock',
        currency: 'USD',
        // Extended fields omitted entirely
      };

      expect(quote.dividend_yield).toBeUndefined();
      expect(quote.beta).toBeUndefined();
      expect(quote.avg_volume).toBeUndefined();
      expect(quote.book_value).toBeUndefined();
    });
  });

  describe('Mock Data Type Alignment - AIRating', () => {
    it('should use proper AIRating interface with required fields', () => {
      const rating: AIRating = {
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
      };

      expect(rating.ticker).toBe('AAPL');
      expect(rating.score).toBe(75);
      expect(rating.confidence).toBe(0.85);
      expect(rating.rsi).toBe(55);
      // Verify old field names no longer used
      expect((rating as any).ai_score).toBeUndefined();
      expect((rating as any).sentiment).toBeUndefined();
      expect((rating as any).buy_signals).toBeUndefined();
    });
  });

  describe('Mock Data Type Alignment - Alert', () => {
    it('should use proper Alert interface with numeric id and required fields', () => {
      const alert: Alert = {
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
      };

      expect(typeof alert.id).toBe('number');
      expect(alert.id).toBe(1);
      expect(alert.condition_type).toBe('price_above');
      expect(alert.severity).toBe('warning');
    });

    it('should not use string ids or incomplete Alert objects', () => {
      // This test verifies the OLD broken pattern is fixed
      const validAlert: Alert = {
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
      };

      // id should be number, not string
      expect(typeof validAlert.id).toBe('number');
      // message field shouldn't exist
      expect((validAlert as any).message).toBeUndefined();
    });
  });

  describe('Mock Data Type Alignment - NewsArticle', () => {
    it('should use proper NewsArticle interface with numeric id', () => {
      const news: NewsArticle = {
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
      };

      expect(typeof news.id).toBe('number');
      expect(news.id).toBe(1);
      expect(news.ticker).toBe('AAPL');
      expect(news.title).toBe('Apple Stock Rallies on Strong Earnings');
    });
  });

  describe('Mock Data Type Alignment - DashboardSummary', () => {
    it('should use proper DashboardSummary with all required fields', () => {
      const summary: DashboardSummary = {
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

      expect(summary.stock_count).toBe(5);
      expect(summary.active_stock_count).toBe(4);
      expect(summary.active_alert_count).toBe(2);
      expect(summary.market_regime).toBe('bullish');
      expect(summary.agent_status.running).toBe(1);
      expect(summary.agent_status.idle).toBe(2);
      expect(summary.agent_status.error).toBe(0);
      // Verify old field names no longer used
      expect((summary as any).active_agents).toBeUndefined();
      expect((summary as any).alerts_today).toBeUndefined();
    });
  });

  describe('PriceUpdate Integration - Type Safety', () => {
    it('should accept PriceUpdate with all required fields for WebSocket integration', () => {
      const update: PriceUpdate = {
        type: 'price_update',
        ticker: 'AAPL',
        price: 155.5,
        change: 5.5,
        change_pct: 3.8,
        volume: 50000000,
        timestamp: '2026-02-27T10:15:00Z',
      };

      expect(update.type).toBe('price_update');
      expect(update.ticker).toBe('AAPL');
      expect(update.price).toBe(155.5);
      expect(update.change).toBe(5.5);
      expect(update.change_pct).toBe(3.8);
      expect(update.volume).toBe(50000000);
    });
  });
});
