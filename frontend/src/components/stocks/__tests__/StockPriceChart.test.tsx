```typescript
/**
 * Test StockPriceChart: view-mode toggle and multi-timeframe integration.
 *
 * Coverage:
 * - AC1: Default view is chart mode — TimeframeToggle visible, grid hidden
 * - AC2: Clicking toggle switches to multi mode — grid visible, TimeframeToggle hidden
 * - AC3: Second click reverts to chart mode
 * - AC4: Grid cell drill-down calls setTimeframe and returns to chart mode
 * - AC5: Multi-TF checkbox strip — selected state and disabled guards at min/max
 *
 * Note: vi.mock() (not jest.mock()) is used throughout so vitest hoists the mocks
 * correctly above the import statements, ensuring the test file sees mocked modules.
 */

import React from 'react';
import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StockPriceChart from '../StockPriceChart';
import * as useChartTimeframeModule from '@/hooks/useChartTimeframe';
import * as useChartTimeframesModule from '@/hooks/useChartTimeframes';
import * as useApiModule from '@/hooks/useApi';
import type { Timeframe } from '@/lib/types';

// ---------------------------------------------------------------------------
// Module mocks — must use vi.mock() so vitest hoists them above the imports
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/hooks/useChartTimeframe', () => ({
  useChartTimeframe: vi.fn(),
}));
vi.mock('@/hooks/useChartTimeframes', () => ({
  useChartTimeframes: vi.fn(),
}));
vi.mock('@/hooks/useApi', () => ({
  useApi: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  getStockDetail: vi.fn().mockResolvedValue({ quote: {}, candles: [], indicators: {}, news: [] }),
  getCompareData: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/components/charts/PriceChart', () => ({
  default: () => <div data-testid="price-chart" />,
}));

vi.mock('../TimeframeToggle', () => ({
  default: () => <div data-testid="timeframe-toggle" />,
}));

vi.mock('../CompareInput', () => ({
  default: () => <div data-testid="compare-input" />,
}));

// MultiTimeframeGrid stub — exposes a button to fire onTimeframeSelect
vi.mock('../MultiTimeframeGrid', () => ({
  default: ({
    onTimeframeSelect,
  }: {
    ticker: string;
    timeframes: Timeframe[];
    onTimeframeSelect: (tf: Timeframe) => void;
  }) => (
    <div data-testid="multi-timeframe-grid">
      <button data-testid="grid-cell-1D" onClick={() => onTimeframeSelect('1D')}>
        Select 1D
      </button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------

const mockUseChartTimeframe = vi.mocked(useChartTimeframeModule.useChartTimeframe);
const mockUseChartTimeframes = vi.mocked(useChartTimeframesModule.useChartTimeframes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUseApi = useApiModule.useApi as unknown as { mockReturnValue: (v: any) => void };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTimeframeHook(
  overrides?: Partial<useChartTimeframeModule.UseChartTimeframeResult>,
): useChartTimeframeModule.UseChartTimeframeResult {
  return {
    timeframe: '1M' as Timeframe,
    setTimeframe: vi.fn(),
    isLoading: false,
    ...overrides,
  };
}

function makeTimeframesHook(
  overrides?: Partial<useChartTimeframesModule.UseChartTimeframesResult>,
): useChartTimeframesModule.UseChartTimeframesResult {
  return {
    selected: ['1D', '1W', '1M', '3M'] as Timeframe[],
    toggle: vi.fn(),
    canSelect: vi.fn().mockReturnValue(true),
    canDeselect: vi.fn().mockReturnValue(true),
    isLoading: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StockPriceChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChartTimeframe.mockReturnValue(makeTimeframeHook());
    mockUseChartTimeframes.mockReturnValue(makeTimeframesHook());
    mockUseApi.mockReturnValue({ data: null, loading: false, error: null });
  });

  it('AC1: Defaults to chart mode — TimeframeToggle visible, grid hidden', () => {
    /**
     * On first render viewMode is 'chart'.
     * TimeframeToggle must be visible and MultiTimeframeGrid must not exist.
     * The toggle button reports aria-pressed=false.
     */
    render(<StockPriceChart ticker="AAPL" />);

    expect(screen.getByTestId('timeframe-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('multi-timeframe-grid')).not.toBeInTheDocument();

    const toggleBtn = screen.getByRole('button', { name: 'Switch to multi-timeframe view' });
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('AC2: Toggle click switches to multi mode — grid visible, TimeframeToggle hidden', async () => {
    /**
     * After one click on the view toggle:
     * - MultiTimeframeGrid becomes visible
     * - TimeframeToggle is removed
     * - Toggle button aria-label updates and aria-pressed becomes true
     */
    const user = userEvent.setup();
    render(<StockPriceChart ticker="AAPL" />);

    await user.click(screen.getByRole('button', { name: 'Switch to multi-timeframe view' }));

    expect(screen.getByTestId('multi-timeframe-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('timeframe-toggle')).not.toBeInTheDocument();

    const activeToggle = screen.getByRole('button', { name: 'Switch to chart view' });
    expect(activeToggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('AC3: Second click on toggle reverts to chart mode', async () => {
    /**
     * Clicking toggle twice brings the component back to chart mode.
     */
    const user = userEvent.setup();
    render(<StockPriceChart ticker="AAPL" />);

    await user.click(screen.getByRole('button', { name: 'Switch to multi-timeframe view' }));
    expect(screen.getByTestId('multi-timeframe-grid')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Switch to chart view' }));

    expect(screen.getByTestId('timeframe-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('multi-timeframe-grid')).not.toBeInTheDocument();
  });

  it('AC4: Grid cell drill-down calls setTimeframe and returns to chart mode', async () => {
    /**
     * When a cell in MultiTimeframeGrid fires onTimeframeSelect('1D'):
     * 1. setTimeframe must be called with '1D'
     * 2. viewMode must revert to 'chart'
     */
    const mockSetTimeframe = vi.fn();
    mockUseChartTimeframe.mockReturnValue(makeTimeframeHook({ setTimeframe: mockSetTimeframe }));

    const user = userEvent.setup();
    render(<StockPriceChart ticker="AAPL" />);

    // Enter multi mode
    await user.click(screen.getByRole('button', { name: 'Switch to multi-timeframe view' }));
    expect(screen.getByTestId('multi-timeframe-grid')).toBeInTheDocument();

    // Simulate clicking a grid cell (stub fires onTimeframeSelect('1D'))
    await user.click(screen.getByTestId('grid-cell-1D'));

    expect(mockSetTimeframe).toHaveBeenCalledWith('1D');
    expect(mockSetTimeframe).toHaveBeenCalledTimes(1);

    // Must revert to chart mode
    expect(screen.getByTestId('timeframe-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('multi-timeframe-grid')).not.toBeInTheDocument();
  });

  it('AC5: Multi mode renders checkbox strip with all timeframe options', async () => {
    /**
     * In multi mode a role=group strip appears with buttons for every timeframe
     * in ALL_TIMEFRAMES = ['1D','1W','1M','3M','6M','1Y','All'].
     */
    const user = userEvent.setup();
    render(<StockPriceChart ticker="AAPL" />);

    await user.click(screen.getByRole('button', { name: 'Switch to multi-timeframe view' }));

    const group = screen.getByRole('group', { name: 'Select timeframes for grid (2–4)' });
    expect(group).toBeInTheDocument();

    for (const tf of ['1D', '1W', '1M', '3M', '6M', '1Y', 'All']) {
      expect(screen.getByRole('button', { name: tf })).toBeInTheDocument();
    }
  });

  it('AC5: Selected timeframes show aria-pressed=true in checkbox strip', async () => {
    /**
     * Buttons for timeframes in `selected` have aria-pressed=true;
     * all others have aria-pressed=false.
     */
    mockUseChartTimeframes.mockReturnValue(
      makeTimeframesHook({ selected: ['1D', '1W', '1M', '3M'] as Timeframe[] }),
    );

    const user = userEvent.setup();
    render(<StockPriceChart ticker="AAPL" />);

    await user.click(screen.getByRole('button', { name: 'Switch to multi-timeframe view' }));

    expect(screen.getByRole('button', { name: '1D' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '3M' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '6M' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('AC5: Selected buttons disabled when canDeselect returns false (at minimum)', async () => {
    /**
     * When selected.length === 2 (minimum), canDeselect returns false.
     * The selected buttons must be disabled; unselected buttons remain enabled.
     */
    mockUseChartTimeframes.mockReturnValue(
      makeTimeframesHook({
        selected: ['1D', '1W'] as Timeframe[],
        canDeselect: vi.fn().mockReturnValue(false),
        canSelect: vi.fn().mockReturnValue(true),
      }),
    );

    const user = userEvent.setup();
    render(<StockPriceChart ticker="AAPL" />);

    await user.click(screen.getByRole('button', { name: 'Switch to multi-timeframe view' }));

    // Selected at min → disabled (isSelected && !canDeselect)
    expect(screen.getByRole('button', { name: '1D' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '1W' })).toBeDisabled();
    // Unselected with canSelect=true → enabled (!isSelected && canSelect)
    expect(screen.getByRole('button', { name: '1M' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '6M' })).not.toBeDisabled();
  });

  it('AC5: Unselected buttons disabled when canSelect returns false (at maximum)', async () => {
    /**
     * When selected.length === 4 (maximum), canSelect returns false.
     * Unselected buttons must be disabled; selected buttons remain enabled.
     */
    mockUseChartTimeframes.mockReturnValue(
      makeTimeframesHook({
        selected: ['1D', '1W', '1M', '3M'] as Timeframe[],
        canDeselect: vi.fn().mockReturnValue(true),
        canSelect: vi.fn().mockReturnValue(false),
      }),
    );

    const user = userEvent.setup();
    render(<StockPriceChart ticker="AAPL" />);

    await user.click(screen.getByRole('button', { name: 'Switch to multi-timeframe view' }));

    // Unselected at max → disabled (!isSelected && !canSelect)
    expect(screen.getByRole('button', { name: '6M' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '1Y' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'All' })).toBeDisabled();
    // Selected with canDeselect=true → enabled (isSelected && canDeselect)
    expect(screen.getByRole('button', { name: '1D' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '3M' })).not.toBeDisabled();
  });

  it('AC5: Clicking a strip button calls toggle with that timeframe', async () => {
    /**
     * When an enabled strip button is clicked, toggle() must be invoked
     * with the matching Timeframe value.
     */
    const mockToggle = vi.fn();
    mockUseChartTimeframes.mockReturnValue(makeTimeframesHook({ toggle: mockToggle }));

    const user = userEvent.setup();
    render(<StockPriceChart ticker="AAPL" />);

    await user.click(screen.getByRole('button', { name: 'Switch to multi-timeframe view' }));

    // Click an unselected (enabled) timeframe button
    await user.click(screen.getByRole('button', { name: '6M' }));

    expect(mockToggle).toHaveBeenCalledWith('6M');
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });
});
```