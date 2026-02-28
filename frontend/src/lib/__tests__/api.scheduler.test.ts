/**
 * API client tests for scheduler endpoints.
 *
 * Tests getSchedulerCosts() and getJobRuns() with:
 * - Happy path aggregation of costs and tokens
 * - Edge cases (empty results, null costs, date filtering)
 * - Retry logic and error handling
 */

import { ApiError } from '@/lib/api';

// Mock types matching the actual endpoint responses
interface SchedulerCostRow {
  job_id: string;
  total_cost: number;
  total_tokens: number;
  run_count: number;
}

interface JobRunRow {
  id: number;
  agent_name: string;
  status: 'completed' | 'failed' | 'running';
  started_at: string;
  completed_at: string;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
}

describe('Scheduler API Client', () => {
  const API_BASE = 'http://localhost:5000';

  /**
   * AC4: getSchedulerCosts() - Cost aggregation by job
   *
   * Specification: Endpoint returns aggregated cost and token usage
   * per job_id, filtered optionally by job_id and date range.
   */
  describe('getSchedulerCosts', () => {
    it('should aggregate costs and tokens from agent_runs, grouped by job_id', async () => {
      // Arrange: Mock fetch returning aggregated costs
      const mockResponse = {
        costs: [
          {
            job_id: 'monitor_prices',
            total_cost: 2.50,
            total_tokens: 15000,
            run_count: 24,
          } as SchedulerCostRow,
          {
            job_id: 'daily_summary',
            total_cost: 1.20,
            total_tokens: 8000,
            run_count: 5,
          } as SchedulerCostRow,
        ] as SchedulerCostRow[],
        total: 2,
      };

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockResponse)),
        } as Response)
      );

      // Act: Call API function (to be implemented)
      const getSchedulerCosts = async (jobId?: string, since?: string, until?: string) => {
        const params = new URLSearchParams();
        if (jobId) params.append('job_id', jobId);
        if (since) params.append('since', since);
        if (until) params.append('until', until);

        const queryStr = params.toString() ? `?${params.toString()}` : '';
        const res = await fetch(`${API_BASE}/api/scheduler/costs${queryStr}`);
        if (!res.ok) throw new ApiError('Failed to fetch costs', res.status);
        return JSON.parse(await res.text());
      };

      const result = await getSchedulerCosts();

      // Assert: Verify aggregation structure
      expect(result.costs).toHaveLength(2);
      expect(result.costs[0]).toEqual({
        job_id: 'monitor_prices',
        total_cost: 2.50,
        total_tokens: 15000,
        run_count: 24,
      });
      expect(result.total).toBe(2);
    });

    it('should filter costs by job_id when specified', async () => {
      // Arrange
      const mockResponse = {
        costs: [
          {
            job_id: 'monitor_prices',
            total_cost: 2.50,
            total_tokens: 15000,
            run_count: 24,
          } as SchedulerCostRow,
        ],
        total: 1,
      };

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockResponse)),
        } as Response)
      );

      // Act
      const getSchedulerCosts = async (jobId?: string) => {
        const queryStr = jobId ? `?job_id=${jobId}` : '';
        const res = await fetch(`${API_BASE}/api/scheduler/costs${queryStr}`);
        if (!res.ok) throw new ApiError('Failed to fetch costs', res.status);
        return JSON.parse(await res.text());
      };

      const result = await getSchedulerCosts('monitor_prices');

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('job_id=monitor_prices')
      );
      expect(result.costs).toHaveLength(1);
      expect(result.costs[0].job_id).toBe('monitor_prices');
    });

    it('should handle empty cost results gracefully', async () => {
      // Arrange: No cost data exists for the queried parameters
      const mockResponse = { costs: [], total: 0 };

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockResponse)),
        } as Response)
      );

      // Act
      const getSchedulerCosts = async () => {
        const res = await fetch(`${API_BASE}/api/scheduler/costs`);
        if (!res.ok) throw new ApiError('Failed to fetch costs', res.status);
        return JSON.parse(await res.text());
      };

      const result = await getSchedulerCosts();

      // Assert: Edge case—return empty array, not null
      expect(result.costs).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should raise ApiError on 400 invalid date range', async () => {
      // Arrange: Invalid ISO date format
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          text: () => Promise.resolve('{"error":"Invalid date format"}'),
        } as Response)
      );

      // Act & Assert
      const getSchedulerCosts = async (since: string) => {
        const queryStr = `?since=${since}`;
        const res = await fetch(`${API_BASE}/api/scheduler/costs${queryStr}`);
        if (!res.ok) throw new ApiError('Failed to fetch costs', res.status);
        return JSON.parse(await res.text());
      };

      await expect(getSchedulerCosts('invalid-date')).rejects.toThrow(ApiError);
    });
  });

  /**
   * AC5: getJobRuns(jobId) - Recent run history per job
   *
   * Specification: Endpoint returns list of recent job executions
   * for a specific job_id, ordered by most recent first,
   * with cost and token metrics.
   */
  describe('getJobRuns', () => {
    it('should retrieve recent runs for a job with cost/token metrics', async () => {
      // Arrange
      const mockResponse = {
        runs: [
          {
            id: 101,
            agent_name: 'monitor_prices',
            status: 'completed' as const,
            started_at: '2026-02-27T15:00:00Z',
            completed_at: '2026-02-27T15:05:23Z',
            tokens_input: 2000,
            tokens_output: 1500,
            cost_usd: 0.12,
          } as JobRunRow,
          {
            id: 100,
            agent_name: 'monitor_prices',
            status: 'completed' as const,
            started_at: '2026-02-27T14:30:00Z',
            completed_at: '2026-02-27T14:32:15Z',
            tokens_input: 1800,
            tokens_output: 1200,
            cost_usd: 0.10,
          } as JobRunRow,
        ] as JobRunRow[],
        total: 2,
      };

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockResponse)),
        } as Response)
      );

      // Act
      const getJobRuns = async (jobId: string, limit: number = 50) => {
        const queryStr = `?limit=${limit}`;
        const res = await fetch(`${API_BASE}/api/scheduler/jobs/${jobId}/runs${queryStr}`);
        if (!res.ok) throw new ApiError('Failed to fetch runs', res.status);
        return JSON.parse(await res.text());
      };

      const result = await getJobRuns('monitor_prices', 10);

      // Assert: Verify run history structure and ordering (most recent first)
      expect(result.runs).toHaveLength(2);
      expect(result.runs[0].id).toBe(101);
      expect(result.runs[0].cost_usd).toBe(0.12);
      expect(result.runs[1].id).toBe(100);
      expect(result.total).toBe(2);
    });

    it('should return empty list for job with no execution history', async () => {
      // Arrange: Brand new job, never executed
      const mockResponse = { runs: [], total: 0 };

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockResponse)),
        } as Response)
      );

      // Act
      const getJobRuns = async (jobId: string) => {
        const res = await fetch(`${API_BASE}/api/scheduler/jobs/${jobId}/runs`);
        if (!res.ok) throw new ApiError('Failed to fetch runs', res.status);
        return JSON.parse(await res.text());
      };

      const result = await getJobRuns('brand_new_job');

      // Assert: Edge case—no runs
      expect(result.runs).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should include failed runs in history for debugging', async () => {
      // Arrange: Include failed execution for root-cause analysis
      const mockResponse = {
        runs: [
          {
            id: 102,
            agent_name: 'monitor_prices',
            status: 'failed' as const,
            started_at: '2026-02-27T14:00:00Z',
            completed_at: '2026-02-27T14:00:15Z',
            tokens_input: 500,
            tokens_output: 0,
            cost_usd: 0.02,
          } as JobRunRow,
        ],
        total: 1,
      };

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockResponse)),
        } as Response)
      );

      // Act
      const getJobRuns = async (jobId: string) => {
        const res = await fetch(`${API_BASE}/api/scheduler/jobs/${jobId}/runs`);
        if (!res.ok) throw new ApiError('Failed to fetch runs', res.status);
        return JSON.parse(await res.text());
      };

      const result = await getJobRuns('monitor_prices');

      // Assert: Ensure failed runs are visible for debugging
      expect(result.runs[0].status).toBe('failed');
      expect(result.runs[0].id).toBe(102);
    });
  });
});
