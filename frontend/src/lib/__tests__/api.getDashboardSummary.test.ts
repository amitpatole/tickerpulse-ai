import { getDashboardSummary, ApiError } from '../api';
import type { DashboardSummary } from '../types';

describe('getDashboardSummary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call GET /api/dashboard/summary and return typed DashboardSummary', async () => {
    const mockSummary: DashboardSummary = {
      stock_count: 50,
      active_stock_count: 45,
      active_alert_count: 3,
      market_regime: 'bullish',
      agent_status: {
        total: 5,
        running: 2,
        idle: 3,
        error: 0,
      },
      timestamp: '2026-02-27T12:00:00Z',
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(JSON.stringify(mockSummary)),
    });

    const result = await getDashboardSummary();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/dashboard/summary'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );

    expect(result).toEqual(mockSummary);
    expect(result.stock_count).toBe(50);
    expect(result.agent_status.running).toBe(2);
  });

  it('should throw ApiError with 404 status when endpoint not found', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'Not found' })),
    });

    await expect(getDashboardSummary()).rejects.toThrow(ApiError);
    await expect(getDashboardSummary()).rejects.toMatchObject({
      status: 404,
    });
  });

  it('should throw ApiError with 500 status for server errors', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'Internal server error' })),
    });

    await expect(getDashboardSummary()).rejects.toThrow(ApiError);
    await expect(getDashboardSummary()).rejects.toMatchObject({
      status: 500,
    });
  });

  it('should throw ApiError with connection failure message on network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(
      new TypeError('Failed to fetch')
    );

    await expect(getDashboardSummary()).rejects.toThrow(ApiError);
    await expect(getDashboardSummary()).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('Failed to connect to API'),
    });
  });

  it('should handle empty response body gracefully', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(''),
    });

    const result = await getDashboardSummary();

    expect(result).toEqual({});
  });

  it('should parse error message from JSON response body', async () => {
    const errorMessage = 'Database connection timeout';

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({ error: errorMessage })
      ),
    });

    await expect(getDashboardSummary()).rejects.toThrow(errorMessage);
  });

  it('should include API_BASE from environment variable in URL', async () => {
    const originalEnv = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(JSON.stringify({})),
    });

    try {
      await getDashboardSummary();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/api/dashboard/summary',
        expect.any(Object)
      );
    } finally {
      process.env.NEXT_PUBLIC_API_URL = originalEnv;
    }
  });
});
