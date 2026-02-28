/**
 * TickerPulse AI v3.0 - Earnings API Retry Logic Tests
 *
 * Tests exponential backoff retry behavior for transient failures.
 * Covers: network errors, server errors (5xx), retry exhaustion.
 */

import { getEarnings, ApiError } from '../api';
import type { EarningsResponse } from '../types';

describe('Earnings API Retry Logic', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('retry behavior on transient failures', () => {
    it('should retry on 503 (Service Unavailable) and succeed on second attempt', async () => {
      const mockSuccess: EarningsResponse = {
        upcoming: [],
        past: [],
        stale: false,
        as_of: new Date().toISOString(),
      };

      const fetchMock = global.fetch as jest.Mock;

      // First call: 503, second call: 200 OK
      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: jest.fn().mockResolvedValue(
            JSON.stringify({ error: 'Service Unavailable' })
          ),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue(JSON.stringify(mockSuccess)),
        });

      const resultPromise = getEarnings();

      // Fast-forward through retry backoff
      jest.advanceTimersByTime(500); // First retry delay

      const result = await resultPromise;

      // Should succeed after retry
      expect(result).toEqual(mockSuccess);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 400 (client error) and throw immediately', async () => {
      const fetchMock = global.fetch as jest.Mock;

      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({ error: 'Invalid days parameter' })
        ),
      });

      await expect(getEarnings({ days: 0 })).rejects.toThrow(ApiError);

      // Should only call once (no retry for 4xx)
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should exhaust retries on persistent 500 errors and throw', async () => {
      const fetchMock = global.fetch as jest.Mock;

      // All attempts return 500
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({ error: 'Internal Server Error' })
        ),
      });

      const resultPromise = getEarnings();

      // Fast-forward through all retry delays (MAX_RETRIES = 2)
      jest.advanceTimersByTime(500 * 2); // First backoff
      jest.advanceTimersByTime(500 * 3); // Second backoff

      await expect(resultPromise).rejects.toThrow(ApiError);

      // Should attempt up to MAX_RETRIES + 1 times (3 total)
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should apply exponential backoff: 500ms, 1000ms', async () => {
      const fetchMock = global.fetch as jest.Mock;
      const mockSuccess: EarningsResponse = {
        upcoming: [],
        past: [],
        stale: false,
        as_of: new Date().toISOString(),
      };

      // First two attempts fail, third succeeds
      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'Unavailable' })),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'Unavailable' })),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue(JSON.stringify(mockSuccess)),
        });

      const resultPromise = getEarnings();

      // Advance past first backoff (500ms * 1)
      jest.advanceTimersByTime(500);

      // Advance past second backoff (500ms * 2)
      jest.advanceTimersByTime(1000);

      const result = await resultPromise;

      expect(result).toEqual(mockSuccess);
      // Total: initial + 2 retries = 3 calls
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });
});
