// Mock must be at the TOP before any imports
jest.mock('../api');

import type { StockDetail, StockDetailCandle } from '../types';
import { getStockCandles, getStockDetail } from '../api';

const mockGetStockDetail = getStockDetail as jest.Mock;

describe('getStockCandles', () => {
  beforeEach(() => {
    mockGetStockDetail.mockClear();
  });

  it('transforms Unix timestamp to ISO 8601 string format', async () => {
    const unixSeconds = 1709112600; // 2024-02-28T10:30:00Z
    const mockDetail: StockDetail = {
      ticker: 'AAPL',
      candles: [
        {
          time: unixSeconds,
          open: 150.0,
          high: 152.5,
          low: 149.8,
          close: 151.2,
          volume: 1000000,
        } as StockDetailCandle,
      ],
    };

    mockGetStockDetail.mockResolvedValue(mockDetail);

    const result = await getStockCandles('AAPL', '1D');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      open: 150.0,
      high: 152.5,
      low: 149.8,
      close: 151.2,
      volume: 1000000,
    });

    // AC: Timestamp must be ISO string matching pattern
    expect(result[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // Verify timestamp is derived from Unix seconds
    const parsedTime = new Date(result[0].timestamp).getTime() / 1000;
    expect(parsedTime).toBe(unixSeconds);
  });

  it('handles empty candles array gracefully', async () => {
    const mockDetail: StockDetail = {
      ticker: 'TSLA',
      candles: [],
    };

    mockGetStockDetail.mockResolvedValue(mockDetail);

    const result = await getStockCandles('TSLA', '1W');

    expect(result).toEqual([]);
  });

  it('handles missing candles property (undefined)', async () => {
    const mockDetail: StockDetail = {
      ticker: 'MSFT',
      // candles is undefined
    };

    mockGetStockDetail.mockResolvedValue(mockDetail);

    const result = await getStockCandles('MSFT', '1M');

    expect(result).toEqual([]);
  });

  it('transforms multiple candles maintaining order and preserving OHLCV data', async () => {
    const baseTime = 1709112600;
    const mockDetail: StockDetail = {
      ticker: 'GOOGL',
      candles: [
        {
          time: baseTime,
          open: 150.0,
          high: 152.0,
          low: 149.0,
          close: 151.0,
          volume: 1000000,
        } as StockDetailCandle,
        {
          time: baseTime + 3600, // +1 hour
          open: 151.0,
          high: 153.0,
          low: 150.5,
          close: 152.5,
          volume: 1100000,
        } as StockDetailCandle,
        {
          time: baseTime + 7200, // +2 hours
          open: 152.5,
          high: 154.0,
          low: 152.0,
          close: 153.5,
          volume: 1200000,
        } as StockDetailCandle,
      ],
    };

    mockGetStockDetail.mockResolvedValue(mockDetail);

    const result = await getStockCandles('GOOGL', '1Y');

    expect(result).toHaveLength(3);

    // Verify close prices in order
    expect(result[0].close).toBe(151.0);
    expect(result[1].close).toBe(152.5);
    expect(result[2].close).toBe(153.5);

    // Verify timestamps are correctly spaced
    const ts0 = new Date(result[0].timestamp).getTime() / 1000;
    const ts1 = new Date(result[1].timestamp).getTime() / 1000;
    const ts2 = new Date(result[2].timestamp).getTime() / 1000;

    expect(ts1 - ts0).toBe(3600); // 1 hour apart
    expect(ts2 - ts1).toBe(3600); // 1 hour apart
  });

  it('calls getStockDetail with correct ticker and timeframe parameters', async () => {
    const mockDetail: StockDetail = { candles: [] };
    mockGetStockDetail.mockResolvedValue(mockDetail);

    await api.getStockCandles('AAPL', '3M');

    expect(mockGetStockDetail).toHaveBeenCalledWith('AAPL', '3M');
    expect(mockGetStockDetail).toHaveBeenCalledTimes(1);
  });

  it('propagates API errors from getStockDetail', async () => {
    const testError = new Error('Network timeout');
    mockGetStockDetail.mockRejectedValue(testError);

    await expect(api.getStockCandles('AAPL', '6M')).rejects.toThrow('Network timeout');
  });
});
