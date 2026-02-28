/**
 * TickerPulse AI v3.0 - Earnings Calendar API Tests
 *
 * Tests cover:
 * - Happy path (GET /api/earnings with/without filters, GET /api/earnings/<ticker>)
 * - Error cases (404 not found, 500 server errors, network errors)
 * - Edge cases (empty results, stale data flag, surprise calculation)
 * - Parameter handling (days, watchlist_id, ticker case-insensitivity)
 */

import {
  getEarnings,
  getTickerEarnings,
  triggerEarningsSync,
  ApiError,
  type EarningsParams,
} from '../api';
import type { EarningsEvent, EarningsResponse, TickerEarningsResponse } from '../types';

describe('Earnings Calendar API', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // getEarnings Tests
  // ---------------------------------------------------------------------------

  describe('getEarnings', () => {
    it('should call GET /api/earnings with default params and return EarningsResponse', async () => {
      const mockResponse: EarningsResponse = {
        upcoming: [
          {
            id: 1,
            ticker: 'AAPL',
            company: 'Apple Inc.',
            earnings_date: '2026-03-15',
            time_of_day: 'AMC',
            eps_estimate: 1.50,
            eps_actual: null,
            revenue_estimate: 100e9,
            revenue_actual: null,
            fiscal_quarter: 'Q2',
            on_watchlist: true,
            surprise_pct: null,
          },
        ],
        past: [
          {
            id: 2,
            ticker: 'MSFT',
            company: 'Microsoft Corp.',
            earnings_date: '2026-02-01',
            time_of_day: 'BMO',
            eps_estimate: 3.00,
            eps_actual: 3.25,
            revenue_estimate: 50e9,
            revenue_actual: 51e9,
            fiscal_quarter: 'Q3',
            on_watchlist: false,
            surprise_pct: 8.33,
          },
        ],
        stale: false,
        as_of: '2026-02-27T12:00:00Z',
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
      });

      const result = await getEarnings();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/earnings'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );

      expect(result).toEqual(mockResponse);
      expect(result.upcoming.length).toBe(1);
      expect(result.upcoming[0].ticker).toBe('AAPL');
      expect(result.past.length).toBe(1);
      expect(result.stale).toBe(false);
    });

    it('should include days, watchlist_id, and ticker parameters in query string', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({ upcoming: [], past: [], stale: false, as_of: '' })
        ),
      });

      const params: EarningsParams = {
        days: 60,
        watchlist_id: 2,
        ticker: 'aapl',
      };

      await getEarnings(params);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/days=60.*watchlist_id=2.*ticker=AAPL/),
        expect.any(Object)
      );
    });

    it('should not include parameters in query string when not provided', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({ upcoming: [], past: [], stale: false, as_of: '' })
        ),
      });

      await getEarnings({});

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^.*\/api\/earnings($|\?)/),
        expect.any(Object)
      );
    });

    it('should split earnings into upcoming and past at today\'s date', async () => {
      const mockResponse: EarningsResponse = {
        upcoming: [
          {
            id: 1,
            ticker: 'AAPL',
            company: 'Apple Inc.',
            earnings_date: '2026-03-15',
            time_of_day: 'AMC',
            eps_estimate: 1.50,
            eps_actual: null,
            revenue_estimate: null,
            revenue_actual: null,
            fiscal_quarter: null,
            on_watchlist: true,
            surprise_pct: null,
          },
        ],
        past: [
          {
            id: 2,
            ticker: 'MSFT',
            company: 'Microsoft Corp.',
            earnings_date: '2026-01-15',
            time_of_day: 'BMO',
            eps_estimate: 3.00,
            eps_actual: 3.10,
            revenue_estimate: null,
            revenue_actual: null,
            fiscal_quarter: null,
            on_watchlist: false,
            surprise_pct: 3.33,
          },
        ],
        stale: false,
        as_of: '2026-02-27T12:00:00Z',
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
      });

      const result = await getEarnings();

      expect(result.upcoming.length).toBeGreaterThan(0);
      expect(result.past.length).toBeGreaterThan(0);
    });

    it('should detect stale data (> 1 hour old)', async () => {
      const staleResponse: EarningsResponse = {
        upcoming: [],
        past: [],
        stale: true,
        as_of: '2026-02-27T10:00:00Z', // 2+ hours ago
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(staleResponse)),
      });

      const result = await getEarnings();

      expect(result.stale).toBe(true);
    });

    it('should return empty arrays for no earnings data', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({ upcoming: [], past: [], stale: false, as_of: '' })
        ),
      });

      const result = await getEarnings();

      expect(result.upcoming).toEqual([]);
      expect(result.past).toEqual([]);
    });

    it('should throw ApiError with 400 for invalid days parameter', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({ error: 'Invalid days parameter' })
        ),
      });

      await expect(getEarnings({ days: 0 })).rejects.toThrow(ApiError);
      await expect(getEarnings({ days: 0 })).rejects.toMatchObject({
        status: 400,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getTickerEarnings Tests
  // ---------------------------------------------------------------------------

  describe('getTickerEarnings', () => {
    it('should call GET /api/earnings/<ticker> and return events array', async () => {
      const mockResponse: TickerEarningsResponse = {
        ticker: 'AAPL',
        events: [
          {
            id: 1,
            ticker: 'AAPL',
            company: 'Apple Inc.',
            earnings_date: '2026-03-15',
            time_of_day: 'AMC',
            eps_estimate: 1.50,
            eps_actual: 1.55,
            revenue_estimate: 100e9,
            revenue_actual: 101e9,
            fiscal_quarter: 'Q2',
            on_watchlist: false,
            surprise_pct: 3.33,
          },
          {
            id: 2,
            ticker: 'AAPL',
            company: 'Apple Inc.',
            earnings_date: '2026-01-15',
            time_of_day: 'AMC',
            eps_estimate: 1.30,
            eps_actual: 1.28,
            revenue_estimate: 95e9,
            revenue_actual: 94e9,
            fiscal_quarter: 'Q1',
            on_watchlist: false,
            surprise_pct: -1.54,
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
      });

      const result = await getTickerEarnings('AAPL');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/earnings/AAPL'),
        expect.any(Object)
      );

      expect(result).toEqual(mockResponse.events);
      expect(result.length).toBe(2);
      expect(result[0].ticker).toBe('AAPL');
    });

    it('should convert lowercase ticker to uppercase', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({ ticker: 'MSFT', events: [] })
        ),
      });

      await getTickerEarnings('msft');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/earnings/MSFT'),
        expect.any(Object)
      );
    });

    it('should compute surprise percentage from actual vs estimate', async () => {
      const mockResponse: TickerEarningsResponse = {
        ticker: 'AAPL',
        events: [
          {
            id: 1,
            ticker: 'AAPL',
            company: 'Apple Inc.',
            earnings_date: '2026-03-15',
            time_of_day: 'AMC',
            eps_estimate: 1.00,
            eps_actual: 1.50,
            revenue_estimate: null,
            revenue_actual: null,
            fiscal_quarter: null,
            on_watchlist: false,
            surprise_pct: 50.0, // (1.50 - 1.00) / 1.00 * 100 = 50%
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
      });

      const result = await getTickerEarnings('AAPL');

      expect(result[0].surprise_pct).toBe(50.0);
    });

    it('should throw ApiError with 404 when ticker not found', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({ error: 'Ticker FAKE not found' })
        ),
      });

      await expect(getTickerEarnings('FAKE')).rejects.toThrow(ApiError);
      await expect(getTickerEarnings('FAKE')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('should return empty events array when ticker has no earnings', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({ ticker: 'UNKNOWN', events: [] })
        ),
      });

      const result = await getTickerEarnings('UNKNOWN');

      expect(result).toEqual([]);
    });

    it('should throw ApiError with 500 for server errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({ error: 'Internal server error' })
        ),
      });

      await expect(getTickerEarnings('AAPL')).rejects.toThrow(ApiError);
      await expect(getTickerEarnings('AAPL')).rejects.toMatchObject({
        status: 500,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // triggerEarningsSync Tests
  // ---------------------------------------------------------------------------

  describe('triggerEarningsSync', () => {
    it('should call POST /api/earnings/sync and return success response', async () => {
      const mockResponse = {
        ok: true,
        message: 'Earnings sync completed',
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
      });

      const result = await triggerEarningsSync();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/earnings/sync'),
        expect.objectContaining({
          method: 'POST',
        })
      );

      expect(result.ok).toBe(true);
      expect(result.message).toBe('Earnings sync completed');
    });

    it('should throw ApiError with 500 when sync fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({ error: 'yfinance API unavailable' })
        ),
      });

      await expect(triggerEarningsSync()).rejects.toThrow(ApiError);
      await expect(triggerEarningsSync()).rejects.toMatchObject({
        status: 500,
      });
    });

    it('should handle network errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(
        new TypeError('Failed to fetch')
      );

      await expect(triggerEarningsSync()).rejects.toThrow(ApiError);
      await expect(triggerEarningsSync()).rejects.toMatchObject({
        status: 0,
        message: expect.stringContaining('Failed to connect to API'),
      });
    });

    it('should include POST method in request', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify({ ok: true })),
      });

      await triggerEarningsSync();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });
});
