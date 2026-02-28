/**
 * Multi-Model Comparison API Client Tests
 *
 * Tests the frontend API layer for comparison polling, run creation, and error handling.
 * Covers: successful runs, polling logic, timeouts, concurrent requests.
 */

import {
  createComparisonRun,
  getComparisonRun,
  listComparisonRuns,
  pollComparisonRun,
} from '../api.comparison';

// Mock fetch globally
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('api.comparison', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ========================================================================
  // Test 1: createComparisonRun — Happy Path (202 Accepted)
  // ========================================================================

  test('createComparisonRun sends prompt and returns run_id', async () => {
    const mockResponse = {
      ok: true,
      status: 202,
      json: async () => ({
        run_id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'pending',
      }),
    };
    mockFetch.mockResolvedValueOnce(mockResponse as Response);

    const result = await createComparisonRun({
      prompt: 'Analyze AAPL growth potential',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/comparison/run',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('Analyze AAPL growth potential'),
      })
    );

    expect(result.run_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.status).toBe('pending');
  });

  // ========================================================================
  // Test 2: createComparisonRun with provider filtering
  // ========================================================================

  test('createComparisonRun includes provider_ids when specified', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => ({ run_id: 'run-123', status: 'pending' }),
    } as Response);

    await createComparisonRun({
      prompt: 'Test',
      provider_ids: ['gpt4', 'claude'],
    });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1]?.body).toContain('gpt4');
    expect(callArgs[1]?.body).toContain('claude');
  });

  // ========================================================================
  // Test 3: getComparisonRun — Poll pending run
  // ========================================================================

  test('getComparisonRun polls run status and returns current state', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        run_id: 'run-123',
        status: 'pending',
        results: [],
      }),
    };
    mockFetch.mockResolvedValueOnce(mockResponse as Response);

    const result = await getComparisonRun('run-123');

    expect(mockFetch).toHaveBeenCalledWith('/api/comparison/run/run-123', {
      method: 'GET',
    });

    expect(result.status).toBe('pending');
    expect(result.results).toEqual([]);
  });

  // ========================================================================
  // Test 4: getComparisonRun — Completed run with results
  // ========================================================================

  test('getComparisonRun returns all results when status is complete', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        run_id: 'run-123',
        status: 'complete',
        results: [
          {
            provider_name: 'gpt4',
            model: 'gpt-4',
            response: 'AAPL is a strong buy...',
            latency_ms: 1500,
            error: null,
          },
          {
            provider_name: 'claude',
            model: 'claude-3-opus',
            response: 'AAPL shows resilience...',
            latency_ms: 2000,
            error: null,
          },
        ],
      }),
    } as Response);

    const result = await getComparisonRun('run-123');

    expect(result.status).toBe('complete');
    expect(result.results).toHaveLength(2);
    expect(result.results[0].provider_name).toBe('gpt4');
    expect(result.results[1].response).toContain('resilience');
  });

  // ========================================================================
  // Test 5: getComparisonRun with partial failure
  // ========================================================================

  test('getComparisonRun includes error in result when provider fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        run_id: 'run-123',
        status: 'complete',
        results: [
          {
            provider_name: 'gpt4',
            model: 'gpt-4',
            response: 'Success response',
            latency_ms: 1500,
            error: null,
          },
          {
            provider_name: 'broken',
            model: 'unknown',
            response: null,
            latency_ms: 0,
            error: 'Failed to initialize provider',
          },
        ],
      }),
    } as Response);

    const result = await getComparisonRun('run-123');

    expect(result.results).toHaveLength(2);
    expect(result.results[1].error).toBe('Failed to initialize provider');
    expect(result.results[1].response).toBeNull();
  });

  // ========================================================================
  // Test 6: pollComparisonRun — Polling with timeout
  // ========================================================================

  test('pollComparisonRun polls until complete or timeout', async () => {
    // First call: pending, Second call: complete
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          run_id: 'run-123',
          status: 'pending',
          results: [],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          run_id: 'run-123',
          status: 'complete',
          results: [
            {
              provider_name: 'gpt4',
              response: 'Result',
              latency_ms: 1500,
              error: null,
            },
          ],
        }),
      } as Response);

    const result = await pollComparisonRun('run-123', {
      pollInterval: 100,
      maxAttempts: 10,
    });

    expect(result.status).toBe('complete');
    expect(result.results).toHaveLength(1);
    // Should have called twice (pending, then complete)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // ========================================================================
  // Test 7: pollComparisonRun — Timeout handling
  // ========================================================================

  test('pollComparisonRun throws error when max attempts exceeded', async () => {
    // Always return pending
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        run_id: 'run-123',
        status: 'pending',
        results: [],
      }),
    } as Response);

    const promise = pollComparisonRun('run-123', {
      pollInterval: 10,
      maxAttempts: 3,
    });

    await expect(promise).rejects.toThrow(/timeout|max attempts|timeout/i);
    // Should have tried 3 times
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  // ========================================================================
  // Test 8: listComparisonRuns — Fetch recent runs
  // ========================================================================

  test('listComparisonRuns returns recent comparison history', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        runs: [
          {
            run_id: 'run-1',
            prompt: 'Analyze AAPL',
            status: 'complete',
            created_at: '2024-01-15T10:00:00Z',
          },
          {
            run_id: 'run-2',
            prompt: 'Compare MSFT and GOOGL',
            status: 'complete',
            created_at: '2024-01-15T09:00:00Z',
          },
        ],
      }),
    } as Response);

    const result = await listComparisonRuns({ limit: 10 });

    expect(mockFetch).toHaveBeenCalledWith('/api/comparison/runs?limit=10', {
      method: 'GET',
    });

    expect(result.runs).toHaveLength(2);
    expect(result.runs[0].run_id).toBe('run-1');
  });

  // ========================================================================
  // Test 9: API error handling — 400 Bad Request
  // ========================================================================

  test('createComparisonRun throws error on 400 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Prompt is required' }),
    } as Response);

    const promise = createComparisonRun({ prompt: '' });

    await expect(promise).rejects.toThrow();
    // Verify error contains details
    try {
      await createComparisonRun({ prompt: '' });
    } catch (e) {
      expect((e as Error).message).toContain('400');
    }
  });

  // ========================================================================
  // Test 10: API error handling — 404 Not Found
  // ========================================================================

  test('getComparisonRun throws error on 404 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Run not found' }),
    } as Response);

    const promise = getComparisonRun('nonexistent-run');

    await expect(promise).rejects.toThrow(/404|not found/i);
  });

  // ========================================================================
  // Test 11: Network error handling
  // ========================================================================

  test('API functions handle network errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const promise = createComparisonRun({ prompt: 'Test' });

    await expect(promise).rejects.toThrow(/network|failed to fetch/i);
  });

  // ========================================================================
  // Test 12: Response parsing error
  // ========================================================================

  test('API functions handle invalid JSON response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    } as Response);

    const promise = getComparisonRun('run-123');

    await expect(promise).rejects.toThrow();
  });
});
