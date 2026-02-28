/**
 * Tests for useMetrics hook.
 *
 * Coverage:
 * - AC1: Hook fetches metrics summary on mount
 * - AC2: Singleton pattern ensures single fetch regardless of component count
 * - AC3: Auto-refresh every 60 seconds while mounted
 * - AC4: Cleanup releases resources when all consumers unmount
 * - Error cases: API errors captured and reported
 * - Disabled state: Optional enabled flag disables fetching
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useMetrics, _resetForTesting } from '../useMetrics';
import * as api from '@/lib/api';

jest.mock('@/lib/api');

describe('useMetrics hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
    _resetForTesting();
  });

  afterEach(() => {
    jest.useRealTimers();
    _resetForTesting();
  });

  describe('Happy path', () => {
    test('AC1: fetches metrics summary on mount', async () => {
      const mockMetrics = {
        total_jobs: 100,
        successful_jobs: 95,
        failed_jobs: 5,
        avg_duration_ms: 2500,
        total_cost_usd: 50.00,
        cost_today: 3.25,
        agents_active: 5,
        last_24h_duration: 356000,
      };

      (api.getMetricsSummary as jest.Mock).mockResolvedValue(mockMetrics);

      const { result } = renderHook(() => useMetrics());

      // Initially loading
      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();

      // Wait for fetch to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockMetrics);
      expect(api.getMetricsSummary).toHaveBeenCalledTimes(1);
    });

    test('returns correct data structure', async () => {
      const mockMetrics = {
        total_jobs: 150,
        successful_jobs: 145,
        failed_jobs: 5,
        avg_duration_ms: 2000,
        total_cost_usd: 75.50,
        cost_today: 5.10,
        agents_active: 6,
        last_24h_duration: 450000,
      };

      (api.getMetricsSummary as jest.Mock).mockResolvedValue(mockMetrics);

      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const metrics = result.current.data;
      expect(metrics?.total_jobs).toBe(150);
      expect(metrics?.successful_jobs).toBe(145);
      expect(metrics?.avg_duration_ms).toBe(2000);
      expect(metrics?.total_cost_usd).toBe(75.50);
    });

    test('sets loading to false when fetch completes', async () => {
      (api.getMetricsSummary as jest.Mock).mockResolvedValue({
        total_jobs: 100,
        successful_jobs: 100,
        failed_jobs: 0,
        avg_duration_ms: 1000,
        total_cost_usd: 25.00,
        cost_today: 1.00,
        agents_active: 3,
        last_24h_duration: 200000,
      });

      const { result } = renderHook(() => useMetrics());

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('Singleton pattern', () => {
    test('AC2: only one fetch when multiple hooks mounted', async () => {
      const mockMetrics = {
        total_jobs: 50,
        successful_jobs: 50,
        failed_jobs: 0,
        avg_duration_ms: 1500,
        total_cost_usd: 30.00,
        cost_today: 2.00,
        agents_active: 4,
        last_24h_duration: 300000,
      };

      (api.getMetricsSummary as jest.Mock).mockResolvedValue(mockMetrics);

      const { result: result1 } = renderHook(() => useMetrics());
      const { result: result2 } = renderHook(() => useMetrics());
      const { result: result3 } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result1.current.loading).toBe(false);
      });

      // All hooks share the same data
      expect(result1.current.data).toBe(result2.current.data);
      expect(result2.current.data).toBe(result3.current.data);

      // API called only once despite three hooks
      expect(api.getMetricsSummary).toHaveBeenCalledTimes(1);
    });

    test('maintains shared state across hook instances', async () => {
      const mockMetrics = {
        total_jobs: 75,
        successful_jobs: 72,
        failed_jobs: 3,
        avg_duration_ms: 2200,
        total_cost_usd: 40.00,
        cost_today: 2.50,
        agents_active: 4,
        last_24h_duration: 280000,
      };

      (api.getMetricsSummary as jest.Mock).mockResolvedValue(mockMetrics);

      const { result: result1 } = renderHook(() => useMetrics());
      const { result: result2 } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result1.current.loading).toBe(false);
      });

      expect(result1.current.data).toEqual(mockMetrics);
      expect(result2.current.data).toEqual(mockMetrics);
    });
  });

  describe('Auto-refresh', () => {
    test('AC3: refetches metrics every 60 seconds', async () => {
      (api.getMetricsSummary as jest.Mock).mockResolvedValue({
        total_jobs: 100,
        successful_jobs: 100,
        failed_jobs: 0,
        avg_duration_ms: 1000,
        total_cost_usd: 25.00,
        cost_today: 1.00,
        agents_active: 3,
        last_24h_duration: 200000,
      });

      const { result } = renderHook(() => useMetrics());

      // Wait for initial fetch
      await waitFor(() => {
        expect(api.getMetricsSummary).toHaveBeenCalledTimes(1);
      });

      // Advance time 60 seconds
      jest.advanceTimersByTime(60_000);

      await waitFor(() => {
        expect(api.getMetricsSummary).toHaveBeenCalledTimes(2);
      });

      // Advance another 60 seconds
      jest.advanceTimersByTime(60_000);

      await waitFor(() => {
        expect(api.getMetricsSummary).toHaveBeenCalledTimes(3);
      });
    });

    test('updates data when refetch completes', async () => {
      const initialMetrics = {
        total_jobs: 100,
        successful_jobs: 100,
        failed_jobs: 0,
        avg_duration_ms: 1000,
        total_cost_usd: 25.00,
        cost_today: 1.00,
        agents_active: 3,
        last_24h_duration: 200000,
      };

      const updatedMetrics = {
        total_jobs: 110,
        successful_jobs: 109,
        failed_jobs: 1,
        avg_duration_ms: 1050,
        total_cost_usd: 27.50,
        cost_today: 2.50,
        agents_active: 3,
        last_24h_duration: 210000,
      };

      (api.getMetricsSummary as jest.Mock)
        .mockResolvedValueOnce(initialMetrics)
        .mockResolvedValueOnce(updatedMetrics);

      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.data?.total_jobs).toBe(100);
      });

      // Advance time and trigger refetch
      jest.advanceTimersByTime(60_000);

      await waitFor(() => {
        expect(result.current.data?.total_jobs).toBe(110);
      });
    });
  });

  describe('Cleanup and lifecycle', () => {
    test('AC4: clears timer when last consumer unmounts', async () => {
      (api.getMetricsSummary as jest.Mock).mockResolvedValue({
        total_jobs: 100,
        successful_jobs: 100,
        failed_jobs: 0,
        avg_duration_ms: 1000,
        total_cost_usd: 25.00,
        cost_today: 1.00,
        agents_active: 3,
        last_24h_duration: 200000,
      });

      const { unmount: unmount1 } = renderHook(() => useMetrics());
      const { unmount: unmount2 } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(api.getMetricsSummary).toHaveBeenCalledTimes(1);
      });

      // Unmount first hook — timer should stay
      unmount1();
      const initialCallCount = (api.getMetricsSummary as jest.Mock).mock.calls.length;

      jest.advanceTimersByTime(60_000);
      await waitFor(() => {
        expect(api.getMetricsSummary).toHaveBeenCalledTimes(2);
      });

      // Unmount second hook — timer should clear
      unmount2();

      jest.advanceTimersByTime(60_000);
      // No additional call should occur
      expect(api.getMetricsSummary).toHaveBeenCalledTimes(2);
    });

    test('resets state when last consumer unmounts', async () => {
      const mockMetrics = {
        total_jobs: 100,
        successful_jobs: 100,
        failed_jobs: 0,
        avg_duration_ms: 1000,
        total_cost_usd: 25.00,
        cost_today: 1.00,
        agents_active: 3,
        last_24h_duration: 200000,
      };

      (api.getMetricsSummary as jest.Mock).mockResolvedValue(mockMetrics);

      const { unmount } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(api.getMetricsSummary).toHaveBeenCalledTimes(1);
      });

      unmount();

      // Render again — should fetch again since state was reset
      (api.getMetricsSummary as jest.Mock).mockResolvedValue(mockMetrics);
      const { result } = renderHook(() => useMetrics());

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(api.getMetricsSummary).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Error handling', () => {
    test('captures API errors and exposes error message', async () => {
      const error = new Error('Failed to load metrics');
      (api.getMetricsSummary as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to load metrics');
      expect(result.current.data).toBeNull();
    });

    test('handles non-Error exceptions', async () => {
      (api.getMetricsSummary as jest.Mock).mockRejectedValue('Unknown error');

      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to load metrics');
    });

    test('clears error on successful refetch', async () => {
      (api.getMetricsSummary as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
      });

      // Mock success for next fetch
      const mockMetrics = {
        total_jobs: 100,
        successful_jobs: 100,
        failed_jobs: 0,
        avg_duration_ms: 1000,
        total_cost_usd: 25.00,
        cost_today: 1.00,
        agents_active: 3,
        last_24h_duration: 200000,
      };

      (api.getMetricsSummary as jest.Mock).mockResolvedValue(mockMetrics);

      // Trigger refetch
      jest.advanceTimersByTime(60_000);

      await waitFor(() => {
        expect(result.current.error).toBeNull();
        expect(result.current.data).toEqual(mockMetrics);
      });
    });
  });

  describe('Disabled state', () => {
    test('skips fetching when enabled is false', async () => {
      (api.getMetricsSummary as jest.Mock).mockResolvedValue({
        total_jobs: 100,
        successful_jobs: 100,
        failed_jobs: 0,
        avg_duration_ms: 1000,
        total_cost_usd: 25.00,
        cost_today: 1.00,
        agents_active: 3,
        last_24h_duration: 200000,
      });

      const { result } = renderHook(() => useMetrics({ enabled: false }));

      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
      expect(api.getMetricsSummary).not.toHaveBeenCalled();
    });

    test('returns null data when disabled', () => {
      const { result } = renderHook(() => useMetrics({ enabled: false }));

      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('System Metrics (new feature)', () => {
    test('AC1: fetches system metrics alongside summary', async () => {
      const mockMetrics = {
        total_jobs: 100,
        successful_jobs: 100,
        failed_jobs: 0,
        avg_duration_ms: 1000,
        total_cost_usd: 25.00,
        cost_today: 1.00,
        agents_active: 3,
        last_24h_duration: 200000,
      };

      const mockSystemMetrics = {
        period_days: 30,
        snapshots: [
          {
            recorded_at: '2026-02-28T10:00:00Z',
            cpu_pct: 45.5,
            mem_pct: 62.3,
            db_pool_active: 3,
            db_pool_idle: 2,
          },
        ],
        endpoints: [],
      };

      (api.getMetricsSummary as jest.Mock).mockResolvedValue(mockMetrics);
      (api.getSystemMetrics as jest.Mock).mockResolvedValue(mockSystemMetrics);

      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.latestSnapshot).toEqual(mockSystemMetrics.snapshots[0]);
      expect(api.getMetricsSummary).toHaveBeenCalledTimes(1);
      expect(api.getSystemMetrics).toHaveBeenCalledTimes(1);
    });

    test('exposes latest snapshot from system metrics response', async () => {
      const mockMetrics = {
        total_jobs: 50,
        successful_jobs: 50,
        failed_jobs: 0,
        avg_duration_ms: 1500,
        total_cost_usd: 30.00,
        cost_today: 2.00,
        agents_active: 4,
        last_24h_duration: 300000,
      };

      const mockSystemMetrics = {
        period_days: 30,
        snapshots: [
          { recorded_at: '2026-02-28T09:00:00Z', cpu_pct: 40.0, mem_pct: 55.0, db_pool_active: 2, db_pool_idle: 3 },
          { recorded_at: '2026-02-28T10:00:00Z', cpu_pct: 50.0, mem_pct: 65.0, db_pool_active: 4, db_pool_idle: 1 },
        ],
        endpoints: [],
      };

      (api.getMetricsSummary as jest.Mock).mockResolvedValue(mockMetrics);
      (api.getSystemMetrics as jest.Mock).mockResolvedValue(mockSystemMetrics);

      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should expose the last snapshot in the array
      expect(result.current.latestSnapshot).toEqual(mockSystemMetrics.snapshots[1]);
      expect(result.current.latestSnapshot?.cpu_pct).toBe(50.0);
      expect(result.current.latestSnapshot?.db_pool_active).toBe(4);
    });

    test('gracefully handles system metrics API failure while summary succeeds', async () => {
      const mockMetrics = {
        total_jobs: 100,
        successful_jobs: 100,
        failed_jobs: 0,
        avg_duration_ms: 1000,
        total_cost_usd: 25.00,
        cost_today: 1.00,
        agents_active: 3,
        last_24h_duration: 200000,
      };

      (api.getMetricsSummary as jest.Mock).mockResolvedValue(mockMetrics);
      (api.getSystemMetrics as jest.Mock).mockRejectedValue(new Error('System metrics unavailable'));

      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Summary data should still be available
      expect(result.current.data).toEqual(mockMetrics);
      // Snapshot should remain null
      expect(result.current.latestSnapshot).toBeNull();
      // No error should be set (graceful degradation)
      expect(result.current.error).toBeNull();
    });

    test('clears snapshot when system metrics returns empty snapshots array', async () => {
      const mockMetrics = {
        total_jobs: 100,
        successful_jobs: 100,
        failed_jobs: 0,
        avg_duration_ms: 1000,
        total_cost_usd: 25.00,
        cost_today: 1.00,
        agents_active: 3,
        last_24h_duration: 200000,
      };

      (api.getMetricsSummary as jest.Mock).mockResolvedValue(mockMetrics);
      (api.getSystemMetrics as jest.Mock).mockResolvedValue({ period_days: 30, snapshots: [], endpoints: [] });

      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockMetrics);
      expect(result.current.latestSnapshot).toBeNull();
    });
  });
});
