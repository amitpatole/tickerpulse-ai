/**
 * Tests for metrics API endpoints.
 *
 * Coverage:
 * - AC1: GET /api/metrics/summary returns aggregated metrics
 * - AC2: GET /api/metrics/agents returns per-agent breakdown
 * - AC3: GET /api/metrics/timeseries returns time-series data with filters
 * - AC4: GET /api/metrics/jobs returns per-job breakdown with cost rollup
 * - Error handling: API errors captured and typed correctly
 */

import {
  getMetricsSummary,
  getAgentMetrics,
  getMetricsTimeseries,
  getJobMetrics,
  ApiError,
} from '../api';

describe('Metrics API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMetricsSummary()', () => {
    test('AC1: fetches aggregated metrics summary', async () => {
      const mockData = {
        total_jobs: 150,
        successful_jobs: 145,
        failed_jobs: 5,
        avg_duration_ms: 2500,
        total_cost_usd: 45.67,
        cost_today: 3.25,
        agents_active: 5,
        last_24h_duration: 356000,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockData)),
      });

      const result = await getMetricsSummary();

      expect(result).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/metrics/summary'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    test('includes expected fields in summary response', async () => {
      const mockData = {
        total_jobs: 100,
        successful_jobs: 95,
        failed_jobs: 5,
        avg_duration_ms: 2000,
        total_cost_usd: 30.50,
        cost_today: 2.10,
        agents_active: 4,
        last_24h_duration: 250000,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockData)),
      });

      const result = await getMetricsSummary();

      // Verify response structure
      expect(result).toHaveProperty('total_jobs');
      expect(result).toHaveProperty('successful_jobs');
      expect(result).toHaveProperty('avg_duration_ms');
      expect(result).toHaveProperty('total_cost_usd');
      expect(typeof result.total_jobs).toBe('number');
      expect(typeof result.avg_duration_ms).toBe('number');
    });
  });

  describe('getAgentMetrics()', () => {
    test('AC2: fetches per-agent metrics breakdown', async () => {
      const mockData = {
        agents: [
          {
            agent_name: 'price_scanner',
            runs: 45,
            successful: 43,
            failed: 2,
            avg_duration_ms: 1500,
            total_cost_usd: 12.35,
          },
          {
            agent_name: 'sentiment_analyzer',
            runs: 32,
            successful: 32,
            failed: 0,
            avg_duration_ms: 3200,
            total_cost_usd: 15.67,
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockData)),
      });

      const result = await getAgentMetrics();

      expect(result.agents).toHaveLength(2);
      expect(result.agents[0].agent_name).toBe('price_scanner');
      expect(result.agents[0].runs).toBe(45);
      expect(result.agents[1].total_cost_usd).toBe(15.67);
    });

    test('calculates success rate correctly', async () => {
      const mockData = {
        agents: [
          {
            agent_name: 'test_agent',
            runs: 100,
            successful: 95,
            failed: 5,
            avg_duration_ms: 2000,
            total_cost_usd: 50,
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockData)),
      });

      const result = await getAgentMetrics();
      const agent = result.agents[0];

      const successRate = (agent.successful / agent.runs) * 100;
      expect(successRate).toBe(95);
    });
  });

  describe('getMetricsTimeseries()', () => {
    test('AC3: fetches time-series data with optional filters', async () => {
      const mockData = {
        datapoints: [
          {
            recorded_at: '2026-02-28T10:00:00Z',
            metric_name: 'duration_ms',
            value: 2100,
            source: 'job',
            job_name: 'morning_briefing',
          },
          {
            recorded_at: '2026-02-28T10:30:00Z',
            metric_name: 'duration_ms',
            value: 1900,
            source: 'job',
            job_name: 'morning_briefing',
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockData)),
      });

      const result = await getMetricsTimeseries({
        metric: 'duration_ms',
        source: 'job',
        hours: 24,
      });

      expect(result.datapoints).toHaveLength(2);
      expect(result.datapoints[0].metric_name).toBe('duration_ms');
      expect(result.datapoints[0].source).toBe('job');
    });

    test('accepts optional filters in request', async () => {
      const mockData = { datapoints: [] };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockData)),
      });

      await getMetricsTimeseries({
        metric: 'cost_usd',
        source: 'job',
        job_name: 'earnings_sync',
        hours: 48,
      });

      const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(callUrl).toContain('metric=cost_usd');
      expect(callUrl).toContain('source=job');
      expect(callUrl).toContain('job_name=earnings_sync');
      expect(callUrl).toContain('hours=48');
    });

    test('handles missing optional filters gracefully', async () => {
      const mockData = { datapoints: [] };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockData)),
      });

      const result = await getMetricsTimeseries({ metric: 'success' });

      expect(result.datapoints).toBeDefined();
      const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(callUrl).toContain('metric=success');
    });
  });

  describe('getJobMetrics()', () => {
    test('AC4: fetches per-job breakdown with cost rollup', async () => {
      const mockData = {
        jobs: [
          {
            job_name: 'morning_briefing',
            runs: 28,
            successful: 26,
            failed: 2,
            avg_duration_ms: 3500,
            total_cost_usd: 18.90,
          },
          {
            job_name: 'earnings_sync',
            runs: 42,
            successful: 42,
            failed: 0,
            avg_duration_ms: 1200,
            total_cost_usd: 5.60,
          },
        ],
        total_cost_usd: 24.50,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockData)),
      });

      const result = await getJobMetrics();

      expect(result.jobs).toHaveLength(2);
      expect(result.jobs[0].job_name).toBe('morning_briefing');
      expect(result.jobs[0].total_cost_usd).toBe(18.90);
      expect(result.total_cost_usd).toBe(24.50);
    });

    test('includes cost rollup across all jobs', async () => {
      const mockData = {
        jobs: [
          {
            job_name: 'job1',
            runs: 10,
            successful: 10,
            failed: 0,
            avg_duration_ms: 1000,
            total_cost_usd: 10.00,
          },
          {
            job_name: 'job2',
            runs: 15,
            successful: 15,
            failed: 0,
            avg_duration_ms: 800,
            total_cost_usd: 8.50,
          },
        ],
        total_cost_usd: 18.50,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockData)),
      });

      const result = await getJobMetrics();

      const calculatedTotal = result.jobs.reduce((sum, job) => sum + job.total_cost_usd, 0);
      expect(calculatedTotal).toBeCloseTo(result.total_cost_usd, 2);
    });
  });

  describe('Error handling', () => {
    test('throws ApiError on 404 not found', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('{"error": "Metrics not found"}'),
      });

      await expect(api.getMetricsSummary()).rejects.toThrow('API error');
    });

    test('throws ApiError on 500 server error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('{"error": "Internal server error"}'),
      });

      await expect(api.getMetricsSummary()).rejects.toThrow();
    });

    test('includes error_code in thrown error when present', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve(JSON.stringify({
          error: 'Rate limited',
          code: 'RATE_LIMIT_EXCEEDED',
        })),
      });

      try {
        await getMetricsSummary();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
      }
    });

    test('handles network errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await expect(api.getMetricsSummary()).rejects.toThrow('Network error');
    });
  });

  describe('Request structure', () => {
    test('sends GET request with correct headers', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{}'),
      });

      await getMetricsSummary();

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init?.method).toBe('GET');
      expect(init?.headers?.['Content-Type']).toBe('application/json');
    });

    test('constructs correct API path', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{}'),
      });

      await getMetricsSummary();
      const url = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(url).toContain('http://localhost:3000');
      expect(url).toContain('/api/metrics/summary');
    });
  });
});
