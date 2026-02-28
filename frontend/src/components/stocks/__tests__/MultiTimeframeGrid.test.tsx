import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MultiTimeframeGrid from '../MultiTimeframeGrid';
import * as api from '@/lib/api';

jest.mock('@/lib/api');

// Mock recharts to avoid canvas rendering in tests
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children, data }: any) => (
    <div data-testid="line-chart" data-point-count={data?.length || 0}>
      {children}
    </div>
  ),
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
}));

// Test data factory — creates realistic stock candle data
const createMockCandles = (count: number = 5) => {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(Date.now() - i * 86400000).toISOString(),
    open: 150 + Math.random() * 10,
    high: 160 + Math.random() * 10,
    low: 145 + Math.random() * 5,
    close: 152 + Math.random() * 10,
    volume: 50000000 + Math.random() * 20000000,
  }));
};

describe('MultiTimeframeGrid', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (api.getStockCandles as jest.Mock).mockResolvedValue(createMockCandles());
  });

  test('AC1: Renders 2×2 grid displaying 1D, 1W, 1M, 1Y timeframes in parallel', async () => {
    const onTimeframeSelect = jest.fn();

    render(
      <MultiTimeframeGrid ticker="AAPL" onTimeframeSelect={onTimeframeSelect} />
    );

    // Verify all 4 mini charts render
    await waitFor(() => {
      expect(screen.getByTestId('grid-timeframe-1D')).toBeInTheDocument();
      expect(screen.getByTestId('grid-timeframe-1W')).toBeInTheDocument();
      expect(screen.getByTestId('grid-timeframe-1M')).toBeInTheDocument();
      expect(screen.getByTestId('grid-timeframe-1Y')).toBeInTheDocument();
    });

    // Verify API called 4 times in parallel (one per timeframe)
    expect(api.getStockCandles).toHaveBeenCalledTimes(4);
    expect(api.getStockCandles).toHaveBeenCalledWith('AAPL', '1D');
    expect(api.getStockCandles).toHaveBeenCalledWith('AAPL', '1W');
    expect(api.getStockCandles).toHaveBeenCalledWith('AAPL', '1M');
    expect(api.getStockCandles).toHaveBeenCalledWith('AAPL', '1Y');
  });

  test('Happy path: Clicking mini chart promotes it to single view', async () => {
    const onTimeframeSelect = jest.fn();

    render(
      <MultiTimeframeGrid ticker="AAPL" onTimeframeSelect={onTimeframeSelect} />
    );

    // Wait for the loaded button (not the loading placeholder div)
    const weekChart = await screen.findByRole('button', { name: 'View 1W chart' });
    fireEvent.click(weekChart);

    // Verify callback fired with correct timeframe
    expect(onTimeframeSelect).toHaveBeenCalledWith('1W');
    expect(onTimeframeSelect).toHaveBeenCalledTimes(1);
  });

  test('Edge case: Successfully handles missing/empty data without crashing', async () => {
    (api.getStockCandles as jest.Mock)
      .mockResolvedValueOnce(createMockCandles())
      .mockResolvedValueOnce([]) // Empty data for 1W
      .mockResolvedValueOnce(createMockCandles())
      .mockResolvedValueOnce(createMockCandles());

    const onTimeframeSelect = jest.fn();

    render(
      <MultiTimeframeGrid ticker="TSLA" onTimeframeSelect={onTimeframeSelect} />
    );

    // Grid should render even with one empty dataset
    await waitFor(() => {
      expect(screen.getByTestId('grid-timeframe-1D')).toBeInTheDocument();
      expect(screen.getByTestId('grid-timeframe-1W-empty')).toBeInTheDocument();
      expect(screen.getByTestId('grid-timeframe-1M')).toBeInTheDocument();
      expect(screen.getByTestId('grid-timeframe-1Y')).toBeInTheDocument();
    });
  });

  test('Edge case: View mode persists to localStorage and restores on remount', async () => {
    const onTimeframeSelect = jest.fn();

    // First render
    const { unmount } = render(
      <MultiTimeframeGrid ticker="GOOGL" onTimeframeSelect={onTimeframeSelect} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('grid-timeframe-1D')).toBeInTheDocument();
    });

    // Verify localStorage was set to 'multi' mode
    const viewMode = localStorage.getItem('stock-chart-view-GOOGL');
    expect(viewMode).toBe('multi');

    unmount();

    // Second render should restore grid view from localStorage
    render(
      <MultiTimeframeGrid ticker="GOOGL" onTimeframeSelect={onTimeframeSelect} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('multi-grid-container')).toBeInTheDocument();
    });
  });

  test('Error case: API failure for all timeframes shows error state gracefully', async () => {
    const apiError = new Error('Network timeout');
    (api.getStockCandles as jest.Mock).mockRejectedValue(apiError);

    const onTimeframeSelect = jest.fn();

    render(
      <MultiTimeframeGrid ticker="MSFT" onTimeframeSelect={onTimeframeSelect} />
    );

    // Grid should show error placeholder instead of crashing
    await waitFor(() => {
      expect(screen.getByTestId('grid-error-message')).toBeInTheDocument();
    });

    // Callback should never be invoked on error state
    expect(onTimeframeSelect).not.toHaveBeenCalled();

    // Verify API was attempted for at least one timeframe
    expect(api.getStockCandles).toHaveBeenCalled();
  });

  test('Partial failure: Some timeframes fail while others succeed, shows mixed states', async () => {
    const apiError = new Error('Data unavailable');
    (api.getStockCandles as jest.Mock)
      .mockResolvedValueOnce(createMockCandles(5)) // 1D success
      .mockRejectedValueOnce(apiError) // 1W failure
      .mockResolvedValueOnce(createMockCandles(4)) // 1M success
      .mockRejectedValueOnce(apiError); // 1Y failure

    const onTimeframeSelect = jest.fn();

    render(
      <MultiTimeframeGrid ticker="NVDA" onTimeframeSelect={onTimeframeSelect} />
    );

    // Successful timeframes should render as clickable buttons
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /View 1D chart/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /View 1M chart/i })).toBeInTheDocument();
    });

    // Failed timeframes should show error text
    expect(screen.getByTestId('grid-timeframe-1W')).toHaveTextContent('Data unavailable');
    expect(screen.getByTestId('grid-timeframe-1Y')).toHaveTextContent('Data unavailable');

    // Grid should not show overall error message (some succeeded)
    expect(screen.queryByTestId('grid-error-message')).not.toBeInTheDocument();

    // Clicking a successful chart should trigger callback
    fireEvent.click(screen.getByRole('button', { name: /View 1D chart/i }));
    expect(onTimeframeSelect).toHaveBeenCalledWith('1D');
  });

  test('Sparkline color and percentage display: Up trend shows green with +, down trend shows red', async () => {
    // 1D: up trend (150 → 155), should be green with +
    const upCandles = [
      { timestamp: '2024-01-01', open: 150, high: 152, low: 148, close: 150, volume: 1000000 },
      { timestamp: '2024-01-02', open: 150, high: 158, low: 150, close: 155, volume: 1000000 },
    ];

    // 1W: down trend (160 → 145), should be red without +
    const downCandles = [
      { timestamp: '2024-01-01', open: 160, high: 162, low: 155, close: 160, volume: 1000000 },
      { timestamp: '2024-01-08', open: 145, high: 148, low: 140, close: 145, volume: 1000000 },
    ];

    (api.getStockCandles as jest.Mock)
      .mockResolvedValueOnce(upCandles) // 1D
      .mockResolvedValueOnce(downCandles) // 1W
      .mockResolvedValueOnce(createMockCandles()) // 1M
      .mockResolvedValueOnce(createMockCandles()); // 1Y

    const onTimeframeSelect = jest.fn();

    render(
      <MultiTimeframeGrid ticker="SPY" onTimeframeSelect={onTimeframeSelect} />
    );

    // Wait for all 4 buttons to be clickable (loaded, not in loading state)
    const dayButton = await screen.findByRole('button', { name: /View 1D chart/i });
    const weekButton = await screen.findByRole('button', { name: /View 1W chart/i });

    // 1D chart button should contain green percentage with +
    expect(dayButton).toHaveTextContent('+3.33%');
    // Verify green color class is applied to the percentage span
    const dayPercentages = dayButton.querySelectorAll('p');
    expect(dayPercentages[1]).toHaveClass('text-emerald-400');

    // 1W chart should contain red percentage without +
    expect(weekButton).toHaveTextContent('-9.38%');
    // Red text class should be present
    const weekPercentages = weekButton.querySelectorAll('p');
    expect(weekPercentages[1]).toHaveClass('text-red-400');
  });

  test('Custom timeframes prop: Renders only specified timeframes instead of default 4', async () => {
    const customTimeframes: Array<'1D' | '1M'> = ['1D', '1M'];
    (api.getStockCandles as jest.Mock)
      .mockResolvedValueOnce(createMockCandles()) // 1D
      .mockResolvedValueOnce(createMockCandles()); // 1M

    const onTimeframeSelect = jest.fn();

    render(
      <MultiTimeframeGrid
        ticker="QQQ"
        onTimeframeSelect={onTimeframeSelect}
        timeframes={customTimeframes}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('grid-timeframe-1D')).toBeInTheDocument();
      expect(screen.getByTestId('grid-timeframe-1M')).toBeInTheDocument();
    });

    // Only custom timeframes should be fetched (not 1W or 1Y)
    expect(api.getStockCandles).toHaveBeenCalledTimes(2);
    expect(api.getStockCandles).toHaveBeenCalledWith('QQQ', '1D');
    expect(api.getStockCandles).toHaveBeenCalledWith('QQQ', '1M');

    // Default timeframes (1W, 1Y) should NOT be present
    expect(screen.queryByTestId('grid-timeframe-1W')).not.toBeInTheDocument();
    expect(screen.queryByTestId('grid-timeframe-1Y')).not.toBeInTheDocument();
  });

  test('Prop change: Changing timeframes prop re-fetches with new set', async () => {
    (api.getStockCandles as jest.Mock).mockResolvedValue(createMockCandles());
    const onTimeframeSelect = jest.fn();

    const { rerender } = render(
      <MultiTimeframeGrid
        ticker="AAPL"
        onTimeframeSelect={onTimeframeSelect}
        timeframes={['1D', '1W']}
      />
    );

    await waitFor(() => {
      expect(api.getStockCandles).toHaveBeenCalledWith('AAPL', '1D');
      expect(api.getStockCandles).toHaveBeenCalledWith('AAPL', '1W');
    });

    jest.clearAllMocks();
    (api.getStockCandles as jest.Mock).mockResolvedValue(createMockCandles());

    // Update to a different set of timeframes
    rerender(
      <MultiTimeframeGrid
        ticker="AAPL"
        onTimeframeSelect={onTimeframeSelect}
        timeframes={['1M', '1Y']}
      />
    );

    await waitFor(() => {
      expect(api.getStockCandles).toHaveBeenCalledWith('AAPL', '1M');
      expect(api.getStockCandles).toHaveBeenCalledWith('AAPL', '1Y');
    });

    // Previous timeframes should not have been re-fetched
    expect(api.getStockCandles).not.toHaveBeenCalledWith('AAPL', '1D');
    expect(api.getStockCandles).not.toHaveBeenCalledWith('AAPL', '1W');
  });
});
