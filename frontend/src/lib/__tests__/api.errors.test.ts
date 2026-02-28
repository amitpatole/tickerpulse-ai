```typescript
/**
 * Tests for apiFetch error handling in frontend/src/lib/api.ts
 *
 * Covers:
 *   - 400 throws ApiError immediately (no retry)
 *   - 404 throws ApiError immediately
 *   - 429 retries up to 2 times with delay, then throws ApiError
 *   - 503 retries up to 2 times, then throws ApiError
 *   - Retry respects Retry-After header
 *   - Successful response after retry resolves correctly
 *   - ApiError carries error_code, status, request_id
 */

import { getAlerts, getMetricsSummary } from '../api';
import { ApiError } from '../types';

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockClear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(
  status: number,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: {
      get: (name: string) => headers[name] ?? null,
    },
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// 400 / 404 — no retry
// ---------------------------------------------------------------------------

describe('apiFetch - 4xx immediate throw', () => {
  it('throws ApiError on 400 without retrying', async () => {
    mockFetch.mockResolvedValue(
      makeResponse(400, { error: 'Bad input', error_code: 'INVALID_INPUT' }),
    );

    await expect(getAlerts()).rejects.toThrow(ApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws ApiError on 404 without retrying', async () => {
    mockFetch.mockResolvedValue(
      makeResponse(404, { error: 'Not found', error_code: 'TICKER_NOT_FOUND' }),
    );

    await expect(getMetricsSummary()).rejects.toThrow(ApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('ApiError carries correct error_code on 400', async () => {
    mockFetch.mockResolvedValue(
      makeResponse(400, { error: 'Bad input', error_code: 'MISSING_FIELD' }),
    );

    let caught: ApiError | null = null;
    try {
      await getAlerts();
    } catch (e) {
      caught = e as ApiError;
    }

    expect(caught).not.toBeNull();
    expect(caught!.error_code).toBe('MISSING_FIELD');
    expect(caught!.status).toBe(400);
  });

  it('ApiError carries request_id when present in body', async () => {
    mockFetch.mockResolvedValue(
      makeResponse(400, {
        error: 'Bad',
        error_code: 'INVALID_INPUT',
        request_id: 'req-abc-123',
      }),
    );

    let caught: ApiError | null = null;
    try {
      await getAlerts();
    } catch (e) {
      caught = e as ApiError;
    }

    expect(caught!.request_id).toBe('req-abc-123');
  });
});

// ---------------------------------------------------------------------------
// 429 — retry with backoff
// ---------------------------------------------------------------------------

describe('apiFetch - 429 retry', () => {
  it('retries on 429 up to 2 times then throws', async () => {
    mockFetch.mockResolvedValue(
      makeResponse(429, { error: 'Rate limited', error_code: 'RATE_LIMIT_EXCEEDED' }, { 'Retry-After': '1' }),
    );

    const promise = getAlerts();

    // Advance timer for each retry delay
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow(ApiError);
    // Initial attempt + 2 retries = 3 total calls
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('resolves if 429 is followed by success', async () => {
    const alerts = [{ id: 1, ticker: 'AAPL' }];
    mockFetch
      .mockResolvedValueOnce(
        makeResponse(429, { error: 'Rate limited' }, { 'Retry-After': '1' }),
      )
      .mockResolvedValueOnce(makeResponse(200, alerts as any));

    const promise = getAlerts();
    await jest.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual(alerts);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('respects Retry-After header delay', async () => {
    mockFetch.mockResolvedValue(
      makeResponse(429, {}, { 'Retry-After': '5' }),
    );

    const promise = getAlerts();

    // Should not have resolved without advancing timer
    let settled = false;
    promise.catch(() => { settled = true; });

    await jest.advanceTimersByTimeAsync(4999);
    // Still waiting — not enough time elapsed for first retry
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(5001);
    await jest.advanceTimersByTimeAsync(5001);
    await expect(promise).rejects.toThrow(ApiError);
  });
});

// ---------------------------------------------------------------------------
// 503 — retry with backoff
// ---------------------------------------------------------------------------

describe('apiFetch - 503 retry', () => {
  it('retries on 503 up to 2 times then throws', async () => {
    mockFetch.mockResolvedValue(
      makeResponse(503, { error: 'Service unavailable', error_code: 'SERVICE_UNAVAILABLE' }),
    );

    const promise = getAlerts();
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow(ApiError);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('ApiError from 503 carries correct status', async () => {
    mockFetch.mockResolvedValue(
      makeResponse(503, { error: 'Down', error_code: 'SERVICE_UNAVAILABLE' }),
    );

    let caught: ApiError | null = null;
    const promise = getAlerts().catch((e) => { caught = e; });
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(1000);
    await promise;

    expect(caught!.status).toBe(503);
    expect(caught!.error_code).toBe('SERVICE_UNAVAILABLE');
  });
});

// ---------------------------------------------------------------------------
// Successful response
// ---------------------------------------------------------------------------

describe('apiFetch - success', () => {
  it('returns parsed JSON on 200', async () => {
    const payload = [{ id: 1, ticker: 'MSFT' }];
    mockFetch.mockResolvedValue(makeResponse(200, payload as any));

    const result = await getAlerts();
    expect(result).toEqual(payload);
  });
});
```