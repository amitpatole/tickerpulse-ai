/**
 * useMetricsPeriod Hook Tests
 * Covers: Period validation, default values, setter with validation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMetricsPeriod } from '../useMetricsPeriod';
import * as usePersistedStateModule from '../usePersistedState';

// Mock usePersistedState
vi.mock('../usePersistedState');

const mockUsePersistedState = vi.mocked(usePersistedStateModule.usePersistedState);

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Happy path - returns default 30 days when no persisted state
// ─────────────────────────────────────────────────────────────────────────────

describe('useMetricsPeriod', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return default 30 days when no persisted state exists', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue(null),
      setState: jest.fn(),
      isLoading: false,
    });

    const { result } = renderHook(() => useMetricsPeriod());

    // AC1: Happy path - default 30 day period
    expect(result.current.days).toBe(30);
    expect(result.current.isLoading).toBe(false);
  });

  it('should return persisted days value when valid period in state', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue({ days: 90 }),
      setState: jest.fn(),
      isLoading: false,
    });

    const { result } = renderHook(() => useMetricsPeriod());

    // AC2: Returns valid persisted period
    expect(result.current.days).toBe(90);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: setDays validates period before persisting
// ─────────────────────────────────────────────────────────────────────────────

describe('useMetricsPeriod - Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should validate setDays and only accept valid periods (7, 14, 30, 90)', () => {
    const mockSetState = jest.fn();
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue(null),
      setState: mockSetState,
      isLoading: false,
    });

    const { result } = renderHook(() => useMetricsPeriod());

    act(() => {
      result.current.setDays(14);
    });

    // AC3: Valid period persisted
    expect(mockSetState).toHaveBeenCalledWith('metrics.period', { days: 14 });
  });

  it('should reject invalid period and persist default 30 instead', () => {
    const mockSetState = jest.fn();
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue(null),
      setState: mockSetState,
      isLoading: false,
    });

    const { result } = renderHook(() => useMetricsPeriod());

    act(() => {
      result.current.setDays(45); // Invalid period
    });

    // AC4: Invalid period rejected, default 30 persisted
    expect(mockSetState).toHaveBeenCalledWith('metrics.period', { days: 30 });
  });

  it('should handle negative and zero values by defaulting to 30', () => {
    const mockSetState = jest.fn();
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue(null),
      setState: mockSetState,
      isLoading: false,
    });

    const { result } = renderHook(() => useMetricsPeriod());

    act(() => {
      result.current.setDays(-5);
    });

    expect(mockSetState).toHaveBeenCalledWith('metrics.period', { days: 30 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Edge case - invalid persisted state defaults to 30
// ─────────────────────────────────────────────────────────────────────────────

describe('useMetricsPeriod - Invalid Persisted State', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should default to 30 when persisted value is invalid period', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue({ days: 60 }), // Invalid period
      setState: jest.fn(),
      isLoading: false,
    });

    const { result } = renderHook(() => useMetricsPeriod());

    // AC5: Invalid persisted state rejected
    expect(result.current.days).toBe(30);
  });

  it('should handle persisted non-numeric days value', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue({ days: 'invalid' }),
      setState: jest.fn(),
      isLoading: false,
    });

    const { result } = renderHook(() => useMetricsPeriod());

    // AC6: Non-numeric persisted value handled gracefully
    expect(result.current.days).toBe(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: All valid periods (7, 14, 30, 90) work correctly
// ─────────────────────────────────────────────────────────────────────────────

describe('useMetricsPeriod - All Valid Periods', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validPeriods = [7, 14, 30, 90];

  validPeriods.forEach((period) => {
    it(`should accept and persist valid period ${period}`, () => {
      mockUsePersistedState.mockReturnValue({
        getState: jest.fn().mockReturnValue({ days: period }),
        setState: jest.fn(),
        isLoading: false,
      });

      const { result } = renderHook(() => useMetricsPeriod());

      expect(result.current.days).toBe(period);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Loading state propagated from usePersistedState
// ─────────────────────────────────────────────────────────────────────────────

describe('useMetricsPeriod - Loading State', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should propagate isLoading flag from usePersistedState', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue(null),
      setState: jest.fn(),
      isLoading: true,
    });

    const { result } = renderHook(() => useMetricsPeriod());

    // AC7: Loading flag propagated
    expect(result.current.isLoading).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Return type validation
// ─────────────────────────────────────────────────────────────────────────────

describe('useMetricsPeriod - Return Type', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return object with days, setDays, and isLoading properties', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue({ days: 30 }),
      setState: jest.fn(),
      isLoading: false,
    });

    const { result } = renderHook(() => useMetricsPeriod());

    // AC8: Return object has expected shape
    expect(result.current).toHaveProperty('days');
    expect(result.current).toHaveProperty('setDays');
    expect(result.current).toHaveProperty('isLoading');
    expect(typeof result.current.setDays).toBe('function');
    expect(typeof result.current.days).toBe('number');
  });
});
