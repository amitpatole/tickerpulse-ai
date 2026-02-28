/**
 * Type contract tests for StockDetailQuote.
 *
 * Validates that StockDetailQuote type definition includes all required and
 * optional fields, including the extended financials added for the detail page.
 */

import type { StockDetailQuote } from '@/lib/types';

describe('StockDetailQuote Type Contract', () => {
  describe('core fields: required properties exist', () => {
    it('has all required core fields for price display', () => {
      const quote: StockDetailQuote = {
        price: 150.5,
        change_pct: 2.5,
        volume: 5000000,
        name: 'Apple Inc.',
        currency: 'USD',
      };

      expect(quote.price).toBe(150.5);
      expect(quote.change_pct).toBe(2.5);
      expect(quote.volume).toBe(5000000);
      expect(quote.name).toBe('Apple Inc.');
      expect(quote.currency).toBe('USD');
    });

    it('accepts numeric types for price and change_pct', () => {
      const quote: StockDetailQuote = {
        price: 100,
        change_pct: -5.25,
        volume: 1000,
        name: 'Test',
        currency: 'USD',
      };

      expect(typeof quote.price).toBe('number');
      expect(typeof quote.change_pct).toBe('number');
      expect(typeof quote.volume).toBe('number');
    });
  });

  describe('standard optional financials: market_cap, pe_ratio, eps', () => {
    it('allows market_cap as optional number or null', () => {
      const quoteWithCap: StockDetailQuote = {
        price: 100,
        change_pct: 0,
        volume: 1000,
        name: 'Test',
        currency: 'USD',
        market_cap: 3_000_000_000_000,
      };

      const quoteWithoutCap: StockDetailQuote = {
        price: 100,
        change_pct: 0,
        volume: 1000,
        name: 'Test',
        currency: 'USD',
        market_cap: null,
      };

      expect(quoteWithCap.market_cap).toBe(3_000_000_000_000);
      expect(quoteWithoutCap.market_cap).toBeNull();
    });

    it('allows pe_ratio and eps as optional numbers', () => {
      const quote: StockDetailQuote = {
        price: 100,
        change_pct: 0,
        volume: 1000,
        name: 'Test',
        currency: 'USD',
        pe_ratio: 25.5,
        eps: 3.92,
      };

      expect(quote.pe_ratio).toBe(25.5);
      expect(quote.eps).toBe(3.92);
    });
  });

  describe('extended fields: dividend_yield, beta, avg_volume, book_value', () => {
    it('includes dividend_yield as optional number', () => {
      const quote: StockDetailQuote = {
        price: 100,
        change_pct: 0,
        volume: 1000,
        name: 'Dividend Stock',
        currency: 'USD',
        dividend_yield: 2.75,
      };

      expect(quote.dividend_yield).toBe(2.75);
    });

    it('includes beta as optional number (volatility coefficient)', () => {
      const quoteDefensive: StockDetailQuote = {
        price: 100,
        change_pct: 0,
        volume: 1000,
        name: 'Defensive',
        currency: 'USD',
        beta: 0.75,
      };

      const quoteAggressive: StockDetailQuote = {
        price: 100,
        change_pct: 0,
        volume: 1000,
        name: 'Aggressive',
        currency: 'USD',
        beta: 1.5,
      };

      expect(quoteDefensive.beta).toBe(0.75);
      expect(quoteAggressive.beta).toBe(1.5);
    });

    it('includes avg_volume as optional number', () => {
      const quote: StockDetailQuote = {
        price: 100,
        change_pct: 0,
        volume: 1000,
        name: 'Liquid',
        currency: 'USD',
        avg_volume: 50_000_000,
      };

      expect(quote.avg_volume).toBe(50_000_000);
    });

    it('includes book_value as optional number', () => {
      const quote: StockDetailQuote = {
        price: 100,
        change_pct: 0,
        volume: 1000,
        name: 'Value Stock',
        currency: 'USD',
        book_value: 150,
      };

      expect(quote.book_value).toBe(150);
    });

    it('allows all extended fields together in complete quote', () => {
      const completeQuote: StockDetailQuote = {
        price: 150.5,
        change_pct: 2.5,
        volume: 5_000_000,
        name: 'Premium Stock Inc.',
        currency: 'USD',
        market_cap: 3_000_000_000_000,
        pe_ratio: 22,
        eps: 6.82,
        week_52_high: 165,
        week_52_low: 130,
        dividend_yield: 2.5,
        beta: 1.2,
        avg_volume: 4_500_000,
        book_value: 140,
      };

      expect(completeQuote.dividend_yield).toBe(2.5);
      expect(completeQuote.beta).toBe(1.2);
      expect(completeQuote.avg_volume).toBe(4_500_000);
      expect(completeQuote.book_value).toBe(140);
    });
  });

  describe('field optionality: extended fields can be omitted', () => {
    it('allows quote with only core fields (no extended fields)', () => {
      const minimalQuote: StockDetailQuote = {
        price: 100,
        change_pct: 0,
        volume: 1000,
        name: 'Minimal Stock',
        currency: 'USD',
      };

      expect(minimalQuote.dividend_yield).toBeUndefined();
      expect(minimalQuote.beta).toBeUndefined();
      expect(minimalQuote.avg_volume).toBeUndefined();
      expect(minimalQuote.book_value).toBeUndefined();
    });

    it('allows mixed undefined and null values for optional fields', () => {
      const mixedQuote: StockDetailQuote = {
        price: 100,
        change_pct: 0,
        volume: 1000,
        name: 'Mixed Stock',
        currency: 'USD',
        dividend_yield: null,
        beta: 1.2,
        book_value: null,
      };

      expect(mixedQuote.dividend_yield).toBeNull();
      expect(mixedQuote.beta).toBe(1.2);
      expect(mixedQuote.avg_volume).toBeUndefined();
      expect(mixedQuote.book_value).toBeNull();
    });
  });

  describe('type constraints: enforces numeric values for numeric fields', () => {
    it('allows null for optional extended fields', () => {
      const quote: StockDetailQuote = {
        price: 100,
        change_pct: 0,
        volume: 1000,
        name: 'Test',
        currency: 'USD',
        beta: null,
      };

      expect(quote.beta).toBeNull();
    });
  });
});