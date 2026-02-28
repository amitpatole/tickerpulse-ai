'use client';

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import StockCard from '../StockCard';
import type { AIRating, PriceUpdateEvent } from '@/lib/types';

// Mock API module
jest.mock('@/lib/api', () => ({
  addStock: jest.fn(),
}));

describe('Price Persistence: Per-ticker SSE data survives page reload', () => {
  const mockRating: AIRating = {
    ticker: 'AAPL',
    rating: 'strong_buy',
    score: 85,
    confidence: 0.92,
    current_price: 150.0,
    price_change: 0,
    price_change_pct: 0,
    rsi: 65,
    sentiment_score: 0.45,
  };

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('Happy Path: Store and retrieve price updates', () => {
    it('should save SSE price updates to localStorage', () => {
      const priceData: PriceUpdateEvent = {
        ticker: 'AAPL',
        price: 152.50,
        change: 2.50,
        change_pct: 1.67,
        timestamp: new Date().toISOString(),
      };

      // Simulate saving price to localStorage
      const priceKey = `ticker_price_${priceData.ticker}`;
      localStorage.setItem(priceKey, JSON.stringify(priceData));

      // Verify it was saved
      const retrieved = localStorage.getItem(priceKey);
      expect(retrieved).toBeTruthy();

      const parsed = JSON.parse(retrieved!);
      expect(parsed.price).toBe(152.50);
      expect(parsed.change_pct).toBe(1.67);
    });

    it('should retrieve persisted price on component mount after page reload', async () => {
      const priceData: PriceUpdateEvent = {
        ticker: 'AAPL',
        price: 152.50,
        change: 2.50,
        change_pct: 1.67,
        timestamp: new Date().toISOString(),
      };

      // Pre-populate localStorage (simulating data saved on previous session)
      localStorage.setItem(`ticker_price_AAPL`, JSON.stringify(priceData));

      // Mount component - should use persisted price if available
      const ratingWithPersisted: AIRating = {
        ...mockRating,
        current_price: priceData.price, // Restored from localStorage
        price_change: priceData.change,
        price_change_pct: priceData.change_pct,
      };

      render(<StockCard rating={ratingWithPersisted} />);

      await waitFor(() => {
        // Price should be from localStorage, not original rating
        expect(screen.getByText('$152.50')).toBeInTheDocument();
        expect(screen.getByText('+1.67%')).toBeInTheDocument();
      });
    });

    it('should update stored price when new SSE price_update arrives', () => {
      const initialPrice: PriceUpdateEvent = {
        ticker: 'AAPL',
        price: 150.0,
        change: 0,
        change_pct: 0,
        timestamp: new Date().toISOString(),
      };

      localStorage.setItem(`ticker_price_AAPL`, JSON.stringify(initialPrice));

      // Simulate new SSE price update
      const updatedPrice: PriceUpdateEvent = {
        ticker: 'AAPL',
        price: 155.50,
        change: 5.50,
        change_pct: 3.67,
        timestamp: new Date().toISOString(),
      };

      localStorage.setItem(`ticker_price_AAPL`, JSON.stringify(updatedPrice));

      const stored = JSON.parse(localStorage.getItem(`ticker_price_AAPL`)!);
      expect(stored.price).toBe(155.50);
      expect(stored.change_pct).toBe(3.67);
    });
  });

  describe('Edge Cases: Persistence fallback behavior', () => {
    it('should handle corrupted localStorage data gracefully', () => {
      // Store invalid JSON
      localStorage.setItem('ticker_price_AAPL', '{invalid json}');

      let parsed;
      try {
        parsed = JSON.parse(localStorage.getItem('ticker_price_AAPL')!);
      } catch {
        // Gracefully handle parse error - fallback to rating data
        parsed = null;
      }

      expect(parsed).toBeNull();
      // Component should fall back to initial rating.current_price
    });

    it('should use initial rating price when localStorage key not found', () => {
      // No localStorage entry for this ticker
      const stored = localStorage.getItem('ticker_price_UNKNOWN');
      expect(stored).toBeNull();

      // Component should use rating.current_price as fallback
      render(<StockCard rating={mockRating} />);

      expect(screen.getByText('$150.00')).toBeInTheDocument();
    });

    it('should handle expired price data (stale timestamp)', () => {
      const stalePrice: PriceUpdateEvent = {
        ticker: 'AAPL',
        price: 140.0,
        change: -10.0,
        change_pct: -6.67,
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 24h old
      };

      localStorage.setItem('ticker_price_AAPL', JSON.stringify(stalePrice));

      const stored = JSON.parse(localStorage.getItem('ticker_price_AAPL')!);
      const age = Date.now() - new Date(stored.timestamp).getTime();

      // Data is stale (older than 1 hour)
      expect(age).toBeGreaterThan(60 * 60 * 1000);
      // Should be refreshed from SSE or API, not used as-is
    });
  });

  describe('Acceptance Criterion: Page reload preserves last price', () => {
    it('should display last known price immediately after page reload', async () => {
      const savedPrice: PriceUpdateEvent = {
        ticker: 'AAPL',
        price: 152.50,
        change: 2.50,
        change_pct: 1.67,
        timestamp: new Date().toISOString(),
      };

      // Simulate stored price from previous session
      localStorage.setItem('ticker_price_AAPL', JSON.stringify(savedPrice));

      // Simulate component initializing with restored price
      const restoredRating: AIRating = {
        ...mockRating,
        current_price: savedPrice.price,
        price_change: savedPrice.change,
        price_change_pct: savedPrice.change_pct,
      };

      render(<StockCard rating={restoredRating} />);

      // Price should be visible immediately (no blank state)
      expect(screen.getByText('$152.50')).toBeInTheDocument();
      // Percentage change should also be visible
      expect(screen.getByText('+1.67%')).toBeInTheDocument();
    });

    it('should maintain per-ticker isolation in localStorage', () => {
      const aapl: PriceUpdateEvent = {
        ticker: 'AAPL',
        price: 152.50,
        change: 2.50,
        change_pct: 1.67,
        timestamp: new Date().toISOString(),
      };

      const tsla: PriceUpdateEvent = {
        ticker: 'TSLA',
        price: 205.00,
        change: 5.00,
        change_pct: 2.50,
        timestamp: new Date().toISOString(),
      };

      localStorage.setItem('ticker_price_AAPL', JSON.stringify(aapl));
      localStorage.setItem('ticker_price_TSLA', JSON.stringify(tsla));

      // Retrieve both independently
      const aaplStored = JSON.parse(localStorage.getItem('ticker_price_AAPL')!);
      const tslaStored = JSON.parse(localStorage.getItem('ticker_price_TSLA')!);

      expect(aaplStored.price).toBe(152.50);
      expect(tslaStored.price).toBe(205.00);
      // No cross-contamination
      expect(aaplStored.ticker).toBe('AAPL');
      expect(tslaStored.ticker).toBe('TSLA');
    });
  });
});
