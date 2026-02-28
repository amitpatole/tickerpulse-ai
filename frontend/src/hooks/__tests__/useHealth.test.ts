/**
 * useHealth hook tests
 *
 * Covers:
 *   - Returns loading=true initially before first fetch resolves
 *   - Returns data and loading=false after successful fetch
 *   - Returns error string and loading=false when fetch rejects
 *   - setInterval is called with 30 000 ms on first subscriber mount
 *   - Interval is cleared when last subscriber unmounts
 *   - refetch triggers another fetch
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHealth, _resetForTesting } from '../useHealth';
import * as apiModule from '@/lib/api';
import type { HealthResponse } from '@/lib/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/api');

const mockFetchHealth = apiModule.fetchHealth as ReturnType<typeof vi.fn>;

const MOCK_HEALTH: HealthResponse = {
  status: 'ok',
  version: '3.0.0',
  timestamp: '2026-02-28T00:00:00Z',
  db: 'ok',
  db_pool: 'ok',
  scheduler: 'ok',
  ai_provider: 'ok',
  error_log_count_1h: 0,
  checks: {
    db: { status: 'ok' },
    db_pool: { status: 'ok', pool_size: 5, available: 3 },
    scheduler: { status: 'ok', running: true, job_count: 2, timezone: 'UTC' },
    ai_provider: { status: 'ok', provider: 'anthropic' },
    ws_manager: { status: 'ok', client_count: 0 },
    errors: { count_1h: 0 },
  },
  services: {
    db: { status: 'ok', latency_ms: 1.0, wal_mode: 'wal', pool: null },
    scheduler: { status: 'ok', running: true, job_count: 2, timezone: 'UTC' },
    agent_registry: { status: 'ok', agent_count: 2 },
    data_providers: { status: 'ok', configured: true, providers: [] },
    data_freshness: {
      prices_updated_at: null,
      prices_age_min: null,
      earnings_updated_at: null,
      stale: false,
    },
  },
  metrics: { error_log_count_1h: 0, sse_client_count: 0 },
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  _resetForTesting();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  _resetForTesting();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useHealth - initial state', () => {
  it('starts with loading=true and data=null before fetch resolves', () => {
    vi.mocked(mockFetchHealth).mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useHealth());

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe('useHealth - successful fetch', () => {
  it('returns data and loading=false after fetch resolves', async () => {
    vi.mocked(mockFetchHealth).mockResolvedValue(MOCK_HEALTH);

    const { result } = renderHook(() => useHealth());

    await act(async () => {
      await Promise.resolve(); // flush microtasks
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(MOCK_HEALTH);
    expect(result.current.error).toBeNull();
  });
});

describe('useHealth - fetch error', () => {
  it('returns error string and loading=false when fetch rejects', async () => {
    vi.mocked(mockFetchHealth).mockRejectedValue(new Error('Network Error'));

    const { result } = renderHook(() => useHealth());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Network Error');
  });
});

describe('useHealth - polling interval', () => {
  it('registers a 30 000 ms interval on first mount', async () => {
    vi.mocked(mockFetchHealth).mockResolvedValue(MOCK_HEALTH);
    const spyInterval = vi.spyOn(global, 'setInterval');

    renderHook(() => useHealth());

    await act(async () => {
      await Promise.resolve();
    });

    expect(spyInterval).toHaveBeenCalledWith(expect.any(Function), 30_000);
  });

  it('clears the interval when the last subscriber unmounts', async () => {
    vi.mocked(mockFetchHealth).mockResolvedValue(MOCK_HEALTH);
    const spyClear = vi.spyOn(global, 'clearInterval');

    const { unmount } = renderHook(() => useHealth());

    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    expect(spyClear).toHaveBeenCalled();
  });
});

describe('useHealth - refetch', () => {
  it('refetch triggers another fetch call', async () => {
    vi.mocked(mockFetchHealth).mockResolvedValue(MOCK_HEALTH);

    const { result } = renderHook(() => useHealth());

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetchHealth).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.refetch();
      await Promise.resolve();
    });

    expect(mockFetchHealth).toHaveBeenCalledTimes(2);
  });
});
