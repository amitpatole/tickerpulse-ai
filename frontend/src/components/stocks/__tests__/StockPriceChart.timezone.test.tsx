```typescript
/**
 * StockPriceChart - Timezone Integration Tests
 * Covers: TimezoneToggle rendering, mode persistence wiring, integration with useTimezoneMode
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StockPriceChart from '../StockPriceChart';
import * as useTimezoneModuleModule from '@/hooks/useTimezoneMode';
import * as useChartTimeframeModule from '@/hooks/useChartTimeframe';
import * as useChartTimeframesModule from '@/hooks/useChartTimeframes';
import * as useApiModule from '@/hooks/useApi';

// Mock dependencies
vi.mock('@/hooks/useTimezoneMode');
vi.mock('@/hooks/useChartTimeframe');
vi.mock('@/hooks/useChartTimeframes');
vi.mock('@/hooks/useApi');
vi.mock('@/lib/api', () => ({
  getStockDetail: vi.fn().mockResolvedValue({ candles: [] }),
  getCompareData: vi.fn().mockResolvedValue({}),
  getStockCandles: vi.fn().mockResolvedValue([]),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
}));

const mockUseTimezoneMode = vi.mocked(useTimezoneModuleModule.useTimezoneMode);
const mockUseChartTimeframe = vi.mocked(useChartTimeframeModule.useChartTimeframe);
const mockUseChartTimeframes = vi.mocked(useChartTimeframesModule.useChartTimeframes);
const mockUseApi = vi.mocked(useApiModule.useApi);

describe('StockPriceChart - Timezone Integration', () => {
  const defaultMockTimeframe = {
    timeframe: '1D' as const,
    setTimeframe: vi.fn(),
  };

  const defaultMockTimezone = {
    mode: 'local' as const,
    setMode: vi.fn(),
    isLoading: false,
  };

  const defaultMockTimeframes = {
    selected: ['1D', '1W'],
    toggle: vi.fn(),
    canSelect: () => true,
    canDeselect: () => true,
  };

  const defaultMockApi = {
    data: { candles: [] },
    loading: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChartTimeframe.mockReturnValue(defaultMockTimeframe);
    mockUseTimezoneMode.mockReturnValue(defaultMockTimezone);
    mockUseChartTimeframes.mockReturnValue(defaultMockTimeframes);
    mockUseApi.mockReturnValue(defaultMockApi);
  });

  it('should render TimezoneToggle in chart view with TimeframeToggle', () => {
    render(<StockPriceChart ticker="AAPL" />);

    // AC1: TimezoneToggle appears next to TimeframeToggle in chart mode
    const timezoneGroup = screen.getByRole('group', { name: /timezone display mode/i });
    expect(timezoneGroup).toBeInTheDocument();
  });

  it('should call useTimezoneMode hook and wire mode to TimezoneToggle', () => {
    render(<StockPriceChart ticker="AAPL" />);

    // AC2: useTimezoneMode hook is invoked during component render
    expect(mockUseTimezoneMode).toHaveBeenCalled();
  });

  it('should call setMode when timezone toggle button is clicked', async () => {
    const user = userEvent.setup();
    const mockSetMode = vi.fn();

    mockUseTimezoneMode.mockReturnValue({
      mode: 'local',
      setMode: mockSetMode,
      isLoading: false,
    });

    render(<StockPriceChart ticker="AAPL" />);

    // Click the ET button to switch timezone
    const etButton = screen.getByRole('button', { name: /^ET \(Market\)$/i });
    await user.click(etButton);

    // AC3: Clicking TimezoneToggle triggers setMode callback
    expect(mockSetMode).toHaveBeenCalled();
  });

  it('should display persisted ET timezone mode in TimezoneToggle', () => {
    mockUseTimezoneMode.mockReturnValue({
      mode: 'ET',
      setMode: vi.fn(),
      isLoading: false,
    });

    render(<StockPriceChart ticker="AAPL" />);

    // AC4: Persisted timezone mode (ET) is reflected in TimezoneToggle
    const etButton = screen.getByRole('button', { name: /^ET \(Market\)$/i });
    expect(etButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('should hide TimezoneToggle in multi-timeframe grid view', async () => {
    const user = userEvent.setup();

    render(<StockPriceChart ticker="AAPL" />);

    // Switch to multi-view by clicking the grid button
    const gridButton = screen.getByRole('button', { name: /switch to multi/i });
    await user.click(gridButton);

    // TimezoneToggle group should not be in the document
    const timezoneGroup = screen.queryByRole('group', { name: /timezone display mode/i });
    expect(timezoneGroup).not.toBeInTheDocument();
  });
});
```