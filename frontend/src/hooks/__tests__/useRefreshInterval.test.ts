/**
 * useRefreshInterval Hook Tests
 * Covers: State persistence, setter function, loading flag
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRefreshInterval } from '../useRefreshInterval';
import * as usePersistedStateModule from '../usePersistedState';

// Mock usePersistedState
vi.mock('../usePersistedState');

const mockUsePersistedState = vi.mocked(usePersistedStateModule.usePersistedState);

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Happy path - returns initial state with getState/setState
// ─────────────────────────────────────────────────────────────────────────────

describe('useRefreshInterval', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return undefined seconds when no persisted state exists', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue(null),
      setState: jest.fn(),
      isLoading: false,
    });

    const { result } = renderHook(() => useRefreshInterval());

    expect(result.current.seconds).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('should return persisted seconds value from state', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue({ seconds: 60 }),
      setState: jest.fn(),
      isLoading: false,
    });

    const { result } = renderHook(() => useRefreshInterval());

    // AC1: Happy path - returns persisted refresh interval
    expect(result.current.seconds).toBe(60);
    expect(result.current.isLoading).toBe(false);
  });

  it('should call setState with correct key when setSeconds is invoked', () => {
    const mockSetState = jest.fn();
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue(null),
      setState: mockSetState,
      isLoading: false,
    });

    const { result } = renderHook(() => useRefreshInterval());

    act(() => {
      result.current.setSeconds(30);
    });

    // AC2: Setter persists to localStorage via setState
    expect(mockSetState).toHaveBeenCalledWith('dashboard.refreshInterval', { seconds: 30 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Loading state flag
// ─────────────────────────────────────────────────────────────────────────────

describe('useRefreshInterval - Loading State', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should indicate isLoading when persisted state is still loading', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue(null),
      setState: jest.fn(),
      isLoading: true,
    });

    const { result } = renderHook(() => useRefreshInterval());

    // AC3: Loading flag propagated from usePersistedState
    expect(result.current.isLoading).toBe(true);
  });

  it('should indicate !isLoading when persisted state is loaded', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue({ seconds: 45 }),
      setState: jest.fn(),
      isLoading: false,
    });

    const { result } = renderHook(() => useRefreshInterval());

    expect(result.current.isLoading).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Edge case - multiple setSeconds calls
// ─────────────────────────────────────────────────────────────────────────────

describe('useRefreshInterval - Multiple Updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow multiple setSeconds calls with different values', () => {
    const mockSetState = jest.fn();
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue(null),
      setState: mockSetState,
      isLoading: false,
    });

    const { result } = renderHook(() => useRefreshInterval());

    act(() => {
      result.current.setSeconds(30);
    });

    act(() => {
      result.current.setSeconds(60);
    });

    // AC4: Multiple updates persist sequentially
    expect(mockSetState).toHaveBeenCalledTimes(2);
    expect(mockSetState).toHaveBeenNthCalledWith(1, 'dashboard.refreshInterval', { seconds: 30 });
    expect(mockSetState).toHaveBeenNthCalledWith(2, 'dashboard.refreshInterval', { seconds: 60 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Return type validation
// ─────────────────────────────────────────────────────────────────────────────

describe('useRefreshInterval - Return Type', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return object with seconds, setSeconds, and isLoading properties', () => {
    mockUsePersistedState.mockReturnValue({
      getState: jest.fn().mockReturnValue({ seconds: 20 }),
      setState: jest.fn(),
      isLoading: false,
    });

    const { result } = renderHook(() => useRefreshInterval());

    // AC5: Return object has expected shape
    expect(result.current).toHaveProperty('seconds');
    expect(result.current).toHaveProperty('setSeconds');
    expect(result.current).toHaveProperty('isLoading');
    expect(typeof result.current.setSeconds).toBe('function');
  });
});
