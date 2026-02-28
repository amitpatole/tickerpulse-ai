import { getStockCandles } from '@/lib/api';
import type { StockDetail, StockDetailCandle } from '@/lib/types';
import type { StockCandle } from '@/lib/api';

// Mock getStockDetail to avoid network calls
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return {
    ...actual,
    getStockDetail: jest.fn(),
  };
});

import { getStockDetail } from '@/lib/api';

describe('getStockCandles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('transforms Unix timestamp to ISO string for each candle', async () => {
    const unixSeconds = Math.floor(new Date('2026-02-28T10:30:00Z').getTime() / 1000);
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

    (getStockDetail as jest.Mock).mockResolvedValue(mockDetail);

    const result = await getStockCandles('AAPL', '1D');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      open: 150.0,
      high: 152.5,
      low: 149.8,
      close: 151.2,
      volume: 1000000,
    });
    // Verify timestamp is ISO string
    expect(result[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Verify it's the correct time
    expect(new Date(result[0].timestamp).getTime() / 1000).toBe(unixSeconds);
  });

  it('handles empty candles array gracefully', async () => {
    const mockDetail: StockDetail = {
      ticker: 'AAPL',
      candles: [],
    };

    (getStockDetail as jest.Mock).mockResolvedValue(mockDetail);

    const result = await getStockCandles('AAPL', '1W');

    expect(result).toEqual([]);
  });

  it('handles missing candles property', async () => {
    const mockDetail: StockDetail = {
      ticker: 'AAPL',
      // candles undefined
    };

    (getStockDetail as jest.Mock).mockResolvedValue(mockDetail);

    const result = await getStockCandles('AAPL', '1M');

    expect(result).toEqual([]);
  });

  it('processes multiple candles maintaining order', async () => {
    const baseTime = Math.floor(new Date('2026-02-28T10:30:00Z').getTime() / 1000);
    const mockDetail: StockDetail = {
      ticker: 'AAPL',
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
      ],
    };

    (getStockDetail as jest.Mock).mockResolvedValue(mockDetail);

    const result = await getStockCandles('AAPL', '1Y');

    expect(result).toHaveLength(2);
    expect(result[0].close).toBe(151.0);
    expect(result[1].close).toBe(152.5);
    // Verify order is preserved and timestamps differ by 1 hour
    const diff =
      (new Date(result[1].timestamp).getTime() - new Date(result[0].timestamp).getTime()) /
      1000;
    expect(diff).toBe(3600);
  });
});
