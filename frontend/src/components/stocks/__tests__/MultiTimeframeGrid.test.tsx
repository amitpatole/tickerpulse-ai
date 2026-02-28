```typescript
/**
 * Test MultiTimeframeGrid component: multi-timeframe chart grid rendering.
 *
 * Coverage:
 * - AC1: Component renders cells for all provided timeframes
 * - AC2: Each cell shows loading spinner while fetching
 * - AC3: Each cell displays error message on fetch failure
 * - AC4: Component calls onTimeframeSelect when cell clicked
 * - AC5: All timeframes failed shows global error alert
 */

import React from 'react';
import { vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MultiTimeframeGrid from '../MultiTimeframeGrid';
import * as apiModule from '@/lib/api';
import type { Timeframe, Candle } from '@/lib/types';

// Mock the API
vi.mock('@/lib/api');

const mockGetStockCandles = vi.mocked(apiModule.getStockCandles);

// Sample valid candles
const mockCandles: Candle[] = [
  { time: 1609459200, open: 100.0, high: 101.0, low: 99.0, close: 100.5, volume: 1000000 },
  { time: 1609545600, open: 100.5, high: 102.0, low: 100.0, close: 101.5, volume: 1100000 },
  { time: 1609632000, open: 101.5, high: 103.0, low: 101.0, close: 102.5, volume: 1200000 },
];

describe('MultiTimeframeGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC1: Renders cells for all provided timeframes', async () => {
    /**
     * Given timeframes ['1D', '1W', '1M']
     * When component mounts
     * Then it should render 3 cells with the timeframe labels
     */
    mockGetStockCandles.mockResolvedValue(mockCandles);

    const timeframes: Timeframe[] = ['1D', '1W', '1M'];
    const onSelect = vi.fn();

    render(
      <MultiTimeframeGrid
        ticker="AAPL"
        timeframes={timeframes}
        onTimeframeSelect={onSelect}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('1D')).toBeInTheDocument();
      expect(screen.getByText('1W')).toBeInTheDocument();
      expect(screen.getByText('1M')).toBeInTheDocument();
    });
  });

  it('AC2: Shows loading spinner while fetching', () => {
    /**
     * When component first mounts before data arrives,
     * each cell should show a loading spinner
     */
    // Delay the candles indefinitely
    mockGetStockCandles.mockImplementation(
      () => new Promise(() => {
        /* never resolves */
      }),
    );

    const timeframes: Timeframe[] = ['1D', '1W'];
    const onSelect = vi.fn();

    const { container } = render(
      <MultiTimeframeGrid
        ticker="AAPL"
        timeframes={timeframes}
        onTimeframeSelect={onSelect}
      />,
    );

    // Should have 2 spinners (one per timeframe)
    const spinners = container.querySelectorAll('svg[class*="animate-spin"]');
    expect(spinners.length).toBeGreaterThanOrEqual(2);
  });

  it('AC3: Displays error message on fetch failure', async () => {
    /**
     * When getStockCandles rejects for a timeframe,
     * that cell should display the error message
     */
    const errorMsg = 'Failed to load candles';
    // Mock: 1D fails, 1W succeeds — so individual error shows for 1D
    mockGetStockCandles.mockImplementation(async (ticker, timeframe) => {
      if (timeframe === '1D') throw new Error(errorMsg);
      return mockCandles;
    });

    const timeframes: Timeframe[] = ['1D', '1W'];
    const onSelect = vi.fn();

    render(
      <MultiTimeframeGrid
        ticker="AAPL"
        timeframes={timeframes}
        onTimeframeSelect={onSelect}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
    });
  });

  it('AC4: Calls onTimeframeSelect when cell clicked', async () => {
    /**
     * When user clicks a timeframe cell with valid data,
     * onTimeframeSelect should be called with that timeframe
     */
    mockGetStockCandles.mockResolvedValue(mockCandles);

    const timeframes: Timeframe[] = ['1D', '1W'];
    const onSelect = vi.fn();

    const user = userEvent.setup();
    render(
      <MultiTimeframeGrid
        ticker="AAPL"
        timeframes={timeframes}
        onTimeframeSelect={onSelect}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('1D')).toBeInTheDocument();
    });

    // Click the 1D cell
    const button1D = screen.getByRole('listitem', { name: /1D chart/ });
    await user.click(button1D);

    expect(onSelect).toHaveBeenCalledWith('1D');
  });

  it('AC4: Disabled cell button when loading or error', async () => {
    /**
     * When a cell is loading or has an error,
     * its button should be disabled (not clickable)
     */
    mockGetStockCandles.mockImplementation(
      () => new Promise(() => {
        /* never resolves */
      }),
    );

    const timeframes: Timeframe[] = ['1D'];
    const onSelect = vi.fn();

    render(
      <MultiTimeframeGrid
        ticker="AAPL"
        timeframes={timeframes}
        onTimeframeSelect={onSelect}
      />,
    );

    const button = screen.getByRole('listitem', { name: /1D chart/ });
    expect(button).toBeDisabled();
  });

  it('AC5: Shows global error alert when all timeframes fail', async () => {
    /**
     * When getStockCandles fails for ALL timeframes,
     * show a global error alert instead of individual errors
     */
    mockGetStockCandles.mockRejectedValue(new Error('API error'));

    const timeframes: Timeframe[] = ['1D', '1W', '1M'];
    const onSelect = vi.fn();

    render(
      <MultiTimeframeGrid
        ticker="BADTICKER"
        timeframes={timeframes}
        onTimeframeSelect={onSelect}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Could not load chart data for BADTICKER/),
      ).toBeInTheDocument();
    });
  });

  it('Shows percentage change in cell header', async () => {
    /**
     * When candles are loaded, cell should display % change
     * calculated from first to last close price
     */
    const candles: Candle[] = [
      { time: 1609459200, open: 100.0, high: 101.0, low: 99.0, close: 100.0, volume: 1000000 },
      { time: 1609545600, open: 100.0, high: 102.0, low: 100.0, close: 105.0, volume: 1100000 },
    ];
    mockGetStockCandles.mockResolvedValue(candles);

    const timeframes: Timeframe[] = ['1W'];
    const onSelect = vi.fn();

    render(
      <MultiTimeframeGrid
        ticker="AAPL"
        timeframes={timeframes}
        onTimeframeSelect={onSelect}
      />,
    );

    // 5% change: (105 - 100) / 100 * 100
    await waitFor(() => {
      expect(screen.getByText('+5.00%')).toBeInTheDocument();
    });
  });

  it('Shows negative percentage change in red', async () => {
    /**
     * When price decreased, % change should be displayed in red
     */
    const candles: Candle[] = [
      { time: 1609459200, open: 100.0, high: 101.0, low: 99.0, close: 100.0, volume: 1000000 },
      { time: 1609545600, open: 100.0, high: 100.0, low: 95.0, close: 95.0, volume: 1100000 },
    ];
    mockGetStockCandles.mockResolvedValue(candles);

    const timeframes: Timeframe[] = ['1M'];
    const onSelect = vi.fn();

    render(
      <MultiTimeframeGrid
        ticker="AAPL"
        timeframes={timeframes}
        onTimeframeSelect={onSelect}
      />,
    );

    await waitFor(() => {
      const negChange = screen.getByText('-5.00%');
      // Should have red color class
      expect(negChange).toHaveClass('text-red-400');
    });
  });

  it('Fetches new candles when ticker changes', async () => {
    /**
     * When ticker prop changes, component should
     * refetch candles for all timeframes
     */
    mockGetStockCandles.mockResolvedValue(mockCandles);

    const timeframes: Timeframe[] = ['1D'];
    const onSelect = vi.fn();

    const { rerender } = render(
      <MultiTimeframeGrid
        ticker="AAPL"
        timeframes={timeframes}
        onTimeframeSelect={onSelect}
      />,
    );

    await waitFor(() => {
      expect(mockGetStockCandles).toHaveBeenCalledWith('AAPL', '1D');
    });

    vi.clearAllMocks();
    mockGetStockCandles.mockResolvedValue(mockCandles);

    // Change ticker
    rerender(
      <MultiTimeframeGrid
        ticker="MSFT"
        timeframes={timeframes}
        onTimeframeSelect={onSelect}
      />,
    );

    await waitFor(() => {
      expect(mockGetStockCandles).toHaveBeenCalledWith('MSFT', '1D');
    });
  });
});
```