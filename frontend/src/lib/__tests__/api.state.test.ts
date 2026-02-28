/**
 * Tests for frontend/src/lib/api.ts — App state persistence API wrappers
 *
 * Focus: getState() and patchState() typed functions
 *
 * Design Spec Coverage:
 * - AC1: getState() fetches persisted state from GET /api/app-state
 * - AC2: patchState() persists updates via PATCH /api/app-state
 * - AC3: Error handling — invalid responses throw with clear message
 * - AC4: Type safety — responses are properly typed
 */

import { getState, patchState } from '../api';

// Mock fetch globally
global.fetch = jest.fn();

const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

beforeEach(() => {
  jest.clearAllMocks();
  delete (process.env as any).NEXT_PUBLIC_API_URL;
});

describe('getState()', () => {
  // AC1: Happy path — fetch persisted state
  it('should fetch all state from GET /api/app-state and return typed dict', async () => {
    const mockState = {
      preferences: { theme: 'dark', lang: 'en' },
      sidebar: { collapsed: false },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockState,
    } as Response);

    const result = await getState();

    expect(result).toEqual(mockState);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/app-state',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  // Edge case: Empty state (no persisted data)
  it('should return empty dict when no state has been persisted', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    const result = await getState();

    expect(result).toEqual({});
  });

  // Error case: HTTP error response
  it('should throw error with message when GET fails (non-200)', async () => {
    const errorResponse = {
      ok: false,
      status: 500,
      json: async () => ({ error: 'Database connection failed' }),
    };

    mockFetch.mockResolvedValueOnce(errorResponse as Response);

    await expect(getState()).rejects.toThrow('Database connection failed');
  });

  // Error case: Malformed response (can't parse JSON)
  it('should throw error when response is not valid JSON', async () => {
    const errorResponse = {
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    };

    mockFetch.mockResolvedValueOnce(errorResponse as Response);

    await expect(getState()).rejects.toThrow('HTTP 500');
  });

  // API_BASE: respects NEXT_PUBLIC_API_URL environment variable
  it('should use NEXT_PUBLIC_API_URL if set', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    await getState();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/api/app-state',
      expect.any(Object)
    );
  });
});

describe('patchState()', () => {
  // AC2: Happy path — persist updates
  it('should persist state updates via PATCH /api/app-state and return ok:true', async () => {
    const updates = {
      preferences: { theme: 'light', lang: 'fr' },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    const result = await patchState(updates);

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/app-state',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify(updates),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  // AC2: Partial updates — multiple keys
  it('should handle multiple key updates in single request', async () => {
    const updates = {
      preferences: { theme: 'dark' },
      sidebar: { collapsed: true },
      filters: { sector: 'tech' },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    const result = await patchState(updates);

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/app-state',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
    );
  });

  // AC2: Delete operation (null values)
  it('should support deletion via null value', async () => {
    const updates = {
      preferences: null,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    const result = await patchState(updates);

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/app-state',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
    );
  });

  // Error case: Validation error (400)
  it('should throw error with message when PATCH validation fails (400)', async () => {
    const updates = { invalid: 'should be object not string' };

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: "Value for key 'invalid' must be a JSON object or null",
      }),
    } as Response);

    await expect(patchState(updates as any)).rejects.toThrow(
      "Value for key 'invalid' must be a JSON object or null"
    );
  });

  // Error case: Persistence error (500)
  it('should throw error when persistence fails (500)', async () => {
    const updates = { preferences: { theme: 'dark' } };

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({
        error: 'Failed to save keys: preferences',
      }),
    } as Response);

    await expect(patchState(updates)).rejects.toThrow(
      'Failed to save keys: preferences'
    );
  });

  // Edge case: Empty update (should still work; server validates)
  it('should allow empty object (server will reject with 400)', async () => {
    const updates = {};

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'Request body must not be empty',
      }),
    } as Response);

    await expect(patchState(updates)).rejects.toThrow(
      'Request body must not be empty'
    );
  });

  // Edge case: Very large payload (server has 16KB limit)
  it('should send large payloads (server enforces 16KB limit)', async () => {
    const largeValue = 'x'.repeat(10_000);
    const updates = {
      large: { data: largeValue },
    };

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'Payload exceeds maximum allowed size (16 KB)',
      }),
    } as Response);

    await expect(patchState(updates)).rejects.toThrow(
      'Payload exceeds maximum allowed size (16 KB)'
    );
  });

  // Network error: request fails before response
  it('should throw error when fetch itself fails (network error)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

    await expect(patchState({ test: {} })).rejects.toThrow('Network timeout');
  });
});
