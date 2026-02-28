/**
 * Test useChartTimeframe hook: single timeframe selection with server persistence.
 *
 * Coverage:
 * - AC1: Default '1M' when no persisted state exists
 * - AC2: Returns valid stored timeframe (all 8 values accepted)
 * - AC3: setTimeframe writes to 'chart.timeframe' key via usePersistedState
 * - AC4: Invalid stored value falls back to default '1M'
 * - AC5: isLoading flag propagated from usePersistedState
 */

import { renderHook, act } from '@testing-library/react';
import { useChartTimeframe } from '../useChartTimeframe';
import * as persistedStateModule from '../usePersistedState';

jest.mock('../usePersistedState');

const mockUsePersistedState = persistedStateModule.usePersistedState as jest.MockedFunction<
  typeof persistedStateModule.usePersistedState
>;

describe('useChartTimeframe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('AC1: Returns default "1M" when no persisted state', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue(undefined),
      setState: jest.fn(),
      isLoading: false,
    } as ReturnType<typeof persistedStateModule.usePersistedState>);

    const { result } = renderHook(() => useChartTimeframe());

    expect(result.current.timeframe).toBe('1M');
    expect(result.current.isLoading).toBe(false);
  });

  it('AC1: Returns default "1M" when persisted state is null', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue(null),
      setState: jest.fn(),
      isLoading: false,
    } as ReturnType<typeof persistedStateModule.usePersistedState>);

    const { result } = renderHook(() => useChartTimeframe());

    expect(result.current.timeframe).toBe('1M');
  });

  it('AC2: Returns valid stored timeframe "6M"', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue('6M'),
      setState: jest.fn(),
      isLoading: false,
    } as ReturnType<typeof persistedStateModule.usePersistedState>);

    const { result } = renderHook(() => useChartTimeframe());

    expect(result.current.timeframe).toBe('6M');
  });

  it('AC2: Accepts all 8 valid timeframe values', () => {
    const validTimeframes = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'All'];

    for (const tf of validTimeframes) {
      mockUsePersistedState.mockReturnValue({
        getState: jest.fn().mockReturnValue(tf),
        setState: jest.fn(),
        isLoading: false,
      } as ReturnType<typeof persistedStateModule.usePersistedState>);

      const { result } = renderHook(() => useChartTimeframe());
      expect(result.current.timeframe).toBe(tf);
    }
  });

  it('AC3: setTimeframe calls setState with "chart.timeframe" key', () => {
    const mockSetState = jest.fn();
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue('1M'),
      setState: mockSetState,
      isLoading: false,
    } as ReturnType<typeof persistedStateModule.usePersistedState>);

    const { result } = renderHook(() => useChartTimeframe());

    act(() => {
      result.current.setTimeframe('3M');
    });

    expect(mockSetState).toHaveBeenCalledWith('chart.timeframe', '3M');
  });

  it('AC3: setTimeframe works for "All" timeframe', () => {
    const mockSetState = jest.fn();
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue('1M'),
      setState: mockSetState,
      isLoading: false,
    } as ReturnType<typeof persistedStateModule.usePersistedState>);

    const { result } = renderHook(() => useChartTimeframe());

    act(() => {
      result.current.setTimeframe('All');
    });

    expect(mockSetState).toHaveBeenCalledWith('chart.timeframe', 'All');
  });

  it('AC3: setTimeframe works for "5Y" timeframe', () => {
    const mockSetState = jest.fn();
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue('1M'),
      setState: mockSetState,
      isLoading: false,
    } as ReturnType<typeof persistedStateModule.usePersistedState>);

    const { result } = renderHook(() => useChartTimeframe());

    act(() => {
      result.current.setTimeframe('5Y');
    });

    expect(mockSetState).toHaveBeenCalledWith('chart.timeframe', '5Y');
  });

  it('AC4: Falls back to "1M" when stored value is an unknown string', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue('2W'),
      setState: jest.fn(),
      isLoading: false,
    } as ReturnType<typeof persistedStateModule.usePersistedState>);

    const { result } = renderHook(() => useChartTimeframe());

    expect(result.current.timeframe).toBe('1M');
  });

  it('AC4: Falls back to "1M" when stored value is a number', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue(30),
      setState: jest.fn(),
      isLoading: false,
    } as ReturnType<typeof persistedStateModule.usePersistedState>);

    const { result } = renderHook(() => useChartTimeframe());

    expect(result.current.timeframe).toBe('1M');
  });

  it('AC4: Falls back to "1M" when stored value is an array', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue(['1M', '3M']),
      setState: jest.fn(),
      isLoading: false,
    } as ReturnType<typeof persistedStateModule.usePersistedState>);

    const { result } = renderHook(() => useChartTimeframe());

    expect(result.current.timeframe).toBe('1M');
  });

  it('AC5: Propagates isLoading = true from usePersistedState', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue(null),
      setState: jest.fn(),
      isLoading: true,
    } as ReturnType<typeof persistedStateModule.usePersistedState>);

    const { result } = renderHook(() => useChartTimeframe());

    expect(result.current.isLoading).toBe(true);
  });

  it('AC5: isLoading = false when state is loaded', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue('1Y'),
      setState: jest.fn(),
      isLoading: false,
    } as ReturnType<typeof persistedStateModule.usePersistedState>);

    const { result } = renderHook(() => useChartTimeframe());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.timeframe).toBe('1Y');
  });
});
