/**
 * Integration tests for StockPriceChart view-mode and multi-timeframe persistence.
 *
 * AC1: Renders in single mode by default
 * AC2: Clicking Multi switches to multi-grid view and writes mode to localStorage
 * AC3: Multi-mode picker changes are written to localStorage
 * AC4: Persisted multi-mode selection is restored on remount
 * AC5: Clicking a mini-chart in multi mode promotes it to single view
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import StockPriceChart from '../StockPriceChart';
import * as api from '@/lib/api';

// ── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('@/lib/api');

jest.mock('@/components/charts/PriceChart', () =>
  function MockPriceChart() {
    return <div data-testid="price-chart" />;
  }
);

// CompareInput uses lucide-react icons; silence them
jest.mock('lucide-react', () => ({
  Loader2: ({ className }: { className?: string }) => (
    <div data-testid="loader" className={className} />
  ),
  X: () => <span>X</span>,
  Plus: () => <span>+</span>,
  GitCompare: () => <span>Compare</span>,
  Search: () => <span>Search</span>,
  ChevronDown: () => <span>▾</span>,
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

const VIEW_MODE_KEY = 'vo_chart_view_mode';
const MULTI_TF_KEY = 'vo_chart_multi_timeframes';

const mockCandles = [
  { timestamp: '2024-01-01', open: 150, high: 155, low: 145, close: 150, volume: 1_000_000 },
  { timestamp: '2024-01-02', open: 150, high: 158, low: 148, close: 155, volume: 1_100_000 },
];

// ── Test suite ────────────────────────────────────────────────────────────────

describe('StockPriceChart — view mode integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();

    (api.getStockDetail as jest.Mock).mockResolvedValue({
      ticker: 'AAPL',
      quote: { ticker: 'AAPL', price: 150, change: 1, change_pct: 0.67 },
      candles: mockCandles,
      news: [],
      indicators: {},
    });
    (api.getStockCandles as jest.Mock).mockResolvedValue(mockCandles);
    (api.getCompareData as jest.Mock).mockResolvedValue({});
  });

  test('AC1: Renders in single mode by default when localStorage is empty', () => {
    render(<StockPriceChart ticker="AAPL" />);

    const singleBtn = screen.getByRole('button', { name: /Single/i });
    const multiBtn = screen.getByRole('button', { name: /Multi/i });

    expect(singleBtn).toHaveAttribute('aria-pressed', 'true');
    expect(multiBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('AC2: Clicking Multi switches to grid view and writes mode to localStorage', async () => {
    render(<StockPriceChart ticker="AAPL" />);

    fireEvent.click(screen.getByRole('button', { name: /Multi/i }));

    await waitFor(() => {
      expect(screen.getByTestId('multi-grid-container')).toBeInTheDocument();
    });

    expect(localStorage.getItem(VIEW_MODE_KEY)).toBe('multi');
  });

  test('AC3: Multi-mode picker change is written to localStorage', async () => {
    // Start in multi mode with the default selection ['1W', '1M', '3M', '1Y']
    localStorage.setItem(VIEW_MODE_KEY, 'multi');

    render(<StockPriceChart ticker="AAPL" />);

    await waitFor(() => {
      expect(screen.getByTestId('multi-grid-container')).toBeInTheDocument();
    });

    // The "Chart timeframe" group is the multi-select TimeframeToggle
    const tfGroup = screen.getByRole('group', { name: 'Chart timeframe' });

    // '1D' is not in the default selection (['1W','1M','3M','1Y']), clicking it adds it
    const button1D = within(tfGroup).getByRole('button', { name: '1D' });
    fireEvent.click(button1D);

    const stored: string[] = JSON.parse(localStorage.getItem(MULTI_TF_KEY) || '[]');
    expect(stored).toContain('1D');
    // Selection grew by one (was 4, now clamped at 4 with 1D replacing nothing — or remains 4)
    expect(stored.length).toBeLessThanOrEqual(4);
  });

  test('AC4: Persisted multi-mode selection is restored on remount', async () => {
    const savedTfs = ['1D', '1W'];
    localStorage.setItem(VIEW_MODE_KEY, 'multi');
    localStorage.setItem(MULTI_TF_KEY, JSON.stringify(savedTfs));

    const { unmount } = render(<StockPriceChart ticker="AAPL" />);

    await waitFor(() => {
      expect(screen.getByTestId('multi-grid-container')).toBeInTheDocument();
    });

    unmount();
    jest.clearAllMocks();
    (api.getStockCandles as jest.Mock).mockResolvedValue(mockCandles);

    render(<StockPriceChart ticker="AAPL" />);

    await waitFor(() => {
      expect(screen.getByTestId('multi-grid-container')).toBeInTheDocument();
    });

    // Grid should have fetched exactly the saved timeframes
    expect(api.getStockCandles).toHaveBeenCalledWith('AAPL', '1D');
    expect(api.getStockCandles).toHaveBeenCalledWith('AAPL', '1W');
    expect(api.getStockCandles).not.toHaveBeenCalledWith('AAPL', '1M');
    expect(api.getStockCandles).not.toHaveBeenCalledWith('AAPL', '3M');
  });

  test('AC5: Clicking a mini-chart in multi mode promotes it to single view', async () => {
    localStorage.setItem(VIEW_MODE_KEY, 'multi');

    render(<StockPriceChart ticker="AAPL" />);

    const miniChartBtn = await screen.findByRole('button', { name: /View 1W chart/i });
    fireEvent.click(miniChartBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Single/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    // The promoted timeframe is locked in as the single-mode selection
    expect(localStorage.getItem('vo_chart_timeframe')).toBe('1W');
  });
});
