```typescript
/**
 * Test useChartTimeframes hook: multi-timeframe selection with persistence.
 *
 * Coverage:
 * - AC1: Hook returns default 4 timeframes on first load
 * - AC2: Toggle adds/removes timeframes while respecting min/max bounds (2-4)
 * - AC3: canSelect and canDeselect enforce boundary conditions
 * - AC4: Invalid persisted state falls back to defaults
 */

import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useChartTimeframes } from '../useChartTimeframes';
import * as persistedStateModule from '../usePersistedState';
import type { Timeframe } from '@/lib/types';

// Mock usePersistedState
vi.mock('../usePersistedState');

const mockUsePersistedState = vi.mocked(persistedStateModule.usePersistedState);

describe('useChartTimeframes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC1: Returns default 4 timeframes on first load', () => {
    /**
     * When user loads the component and no persisted state exists,
     * should return ['1D', '1W', '1M', '3M']
     */
    mockUsePersistedState.mockReturnValue({
      getState: vi.fn().mockReturnValue(null),
      setState: vi.fn(),
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useChartTimeframes());

    expect(result.current.selected).toEqual(['1D', '1W', '1M', '3M']);
    expect(result.current.isLoading).toBe(false);
  });

  it('AC2: Toggle adds timeframe when below max (4)', () => {
    /**
     * When user selects a 4th timeframe (3 currently selected),
     * toggle should add it
     */
    const mockGetState = vi.fn((key: string) => {
      if (key === 'vo_chart_multi_timeframes') return { timeframes: ['1D', '1W', '1M'] };
      return null;
    });
    const mockSetState = vi.fn();

    mockUsePersistedState.mockReturnValue({
      getState: mockGetState,
      setState: mockSetState,
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useChartTimeframes());

    act(() => {
      result.current.toggle('3M' as Timeframe);
    });

    expect(mockSetState).toHaveBeenCalledWith('vo_chart_multi_timeframes', {
      timeframes: ['1D', '1W', '1M', '3M'],
    });
  });

  it('AC2: Toggle removes timeframe when above min (2)', () => {
    /**
     * When user deselects a timeframe (3 currently selected),
     * toggle should remove it
     */
    const mockGetState = vi.fn((key: string) => {
      if (key === 'vo_chart_multi_timeframes') return { timeframes: ['1D', '1W', '1M'] };
      return null;
    });
    const mockSetState = vi.fn();

    mockUsePersistedState.mockReturnValue({
      getState: mockGetState,
      setState: mockSetState,
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useChartTimeframes());

    act(() => {
      result.current.toggle('1D' as Timeframe);
    });

    expect(mockSetState).toHaveBeenCalledWith('vo_chart_multi_timeframes', {
      timeframes: ['1W', '1M'],
    });
  });

  it('AC2: Toggle does not add when at max (4)', () => {
    /**
     * When user tries to add a 5th timeframe (already at max 4),
     * toggle should be no-op
     */
    const mockGetState = vi.fn((key: string) => {
      if (key === 'vo_chart_multi_timeframes')
        return { timeframes: ['1D', '1W', '1M', '3M'] };
      return null;
    });
    const mockSetState = vi.fn();

    mockUsePersistedState.mockReturnValue({
      getState: mockGetState,
      setState: mockSetState,
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useChartTimeframes());

    act(() => {
      result.current.toggle('6M' as Timeframe);
    });

    // setState should NOT be called (no-op)
    expect(mockSetState).not.toHaveBeenCalled();
  });

  it('AC2: Toggle does not remove when at min (2)', () => {
    /**
     * When user tries to remove to below min 2 timeframes,
     * toggle should be no-op
     */
    const mockGetState = vi.fn((key: string) => {
      if (key === 'vo_chart_multi_timeframes') return { timeframes: ['1D', '1W'] };
      return null;
    });
    const mockSetState = vi.fn();

    mockUsePersistedState.mockReturnValue({
      getState: mockGetState,
      setState: mockSetState,
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useChartTimeframes());

    act(() => {
      result.current.toggle('1D' as Timeframe);
    });

    // setState should NOT be called (no-op)
    expect(mockSetState).not.toHaveBeenCalled();
  });

  it('AC3: canDeselect returns false when at min (2)', () => {
    /**
     * When selected.length === 2 (min), canDeselect should return false
     * even for selected timeframes
     */
    mockUsePersistedState.mockReturnValue({
      getState: vi.fn((key: string) => {
        if (key === 'vo_chart_multi_timeframes') return { timeframes: ['1D', '1W'] };
        return null;
      }),
      setState: vi.fn(),
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useChartTimeframes());

    expect(result.current.canDeselect('1D' as Timeframe)).toBe(false);
    expect(result.current.canDeselect('1W' as Timeframe)).toBe(false);
  });

  it('AC3: canDeselect returns true when selected and above min', () => {
    /**
     * When selected.length > 2, canDeselect should return true
     * for selected timeframes
     */
    mockUsePersistedState.mockReturnValue({
      getState: vi.fn((key: string) => {
        if (key === 'vo_chart_multi_timeframes')
          return { timeframes: ['1D', '1W', '1M'] };
        return null;
      }),
      setState: vi.fn(),
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useChartTimeframes());

    expect(result.current.canDeselect('1D' as Timeframe)).toBe(true);
    expect(result.current.canDeselect('1W' as Timeframe)).toBe(true);
  });

  it('AC3: canSelect returns false when at max (4)', () => {
    /**
     * When selected.length === 4 (max), canSelect should return false
     */
    mockUsePersistedState.mockReturnValue({
      getState: vi.fn((key: string) => {
        if (key === 'vo_chart_multi_timeframes')
          return { timeframes: ['1D', '1W', '1M', '3M'] };
        return null;
      }),
      setState: vi.fn(),
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useChartTimeframes());

    expect(result.current.canSelect('6M' as Timeframe)).toBe(false);
  });

  it('AC3: canSelect returns true when below max and not selected', () => {
    /**
     * When selected.length < 4, canSelect should return true
     * for unselected timeframes
     */
    mockUsePersistedState.mockReturnValue({
      getState: vi.fn((key: string) => {
        if (key === 'vo_chart_multi_timeframes') return { timeframes: ['1D', '1W'] };
        return null;
      }),
      setState: vi.fn(),
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useChartTimeframes());

    expect(result.current.canSelect('1M' as Timeframe)).toBe(true);
    expect(result.current.canSelect('3M' as Timeframe)).toBe(true);
  });

  it('AC4: Falls back to defaults when persisted state is invalid (empty)', () => {
    /**
     * When persisted state has empty timeframes array (< min 2),
     * should return default 4 timeframes
     */
    mockUsePersistedState.mockReturnValue({
      getState: vi.fn().mockReturnValue({ timeframes: [] }),
      setState: vi.fn(),
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useChartTimeframes());

    expect(result.current.selected).toEqual(['1D', '1W', '1M', '3M']);
  });

  it('AC4: Falls back to defaults when persisted state is not array', () => {
    /**
     * When persisted timeframes field is not an array,
     * should return default 4 timeframes
     */
    mockUsePersistedState.mockReturnValue({
      getState: vi.fn().mockReturnValue({ timeframes: 'invalid' }),
      setState: vi.fn(),
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useChartTimeframes());

    expect(result.current.selected).toEqual(['1D', '1W', '1M', '3M']);
  });

  it('Propagates isLoading flag from usePersistedState', () => {
    /**
     * The isLoading flag should reflect the loading state of persistence
     */
    mockUsePersistedState.mockReturnValue({
      getState: vi.fn().mockReturnValue({ timeframes: ['1D', '1W'] }),
      setState: vi.fn(),
      isLoading: true,
    } as any);

    const { result } = renderHook(() => useChartTimeframes());

    expect(result.current.isLoading).toBe(true);
  });
});
```