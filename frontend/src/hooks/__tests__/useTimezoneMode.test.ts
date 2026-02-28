/**
 * useTimezoneMode Hook Tests
 * Covers: State persistence, timezone mode validation, setter function, loading flag
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimezoneMode } from '../useTimezoneMode';
import * as usePersistedStateModule from '../usePersistedState';

// Mock usePersistedState
vi.mock('../usePersistedState');

const mockUsePersistedState = vi.mocked(usePersistedStateModule.usePersistedState);

describe('useTimezoneMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 1: Happy path - returns default 'local' when no persisted state exists
  // ─────────────────────────────────────────────────────────────────────────────

  it('should return default mode "local" when no persisted state exists', () => {
    mockUsePersistedState.mockReturnValue({
      getState: vi.fn().mockReturnValue(null),
      setState: vi.fn(),
      isLoading: false,
    });

    const { result } = renderHook(() => useTimezoneMode());

    // AC1: Happy path - returns default timezone mode
    expect(result.current.mode).toBe('local');
    expect(result.current.isLoading).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 2: Returns persisted mode value ('ET')
  // ─────────────────────────────────────────────────────────────────────────────

  it('should return persisted mode value from state', () => {
    mockUsePersistedState.mockReturnValue({
      getState: vi.fn().mockReturnValue({ mode: 'ET' }),
      setState: vi.fn(),
      isLoading: false,
    });

    const { result } = renderHook(() => useTimezoneMode());

    // AC2: Respects persisted timezone mode
    expect(result.current.mode).toBe('ET');
    expect(result.current.isLoading).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 3: setMode calls setState with correct state key and payload
  // ─────────────────────────────────────────────────────────────────────────────

  it('should call setState with correct key when setMode is invoked', () => {
    const mockSetState = vi.fn();
    mockUsePersistedState.mockReturnValue({
      getState: vi.fn().mockReturnValue(null),
      setState: mockSetState,
      isLoading: false,
    });

    const { result } = renderHook(() => useTimezoneMode());

    act(() => {
      result.current.setMode('ET');
    });

    // AC3: Setter persists timezone mode to localStorage via setState
    expect(mockSetState).toHaveBeenCalledWith('timezone', { mode: 'ET' });
    expect(mockSetState).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 4: Invalid persisted value falls back to default 'local'
  // ─────────────────────────────────────────────────────────────────────────────

  it('should fall back to default mode when persisted value is invalid', () => {
    mockUsePersistedState.mockReturnValue({
      getState: vi.fn().mockReturnValue({ mode: 'invalid_mode' }),
      setState: vi.fn(),
      isLoading: false,
    });

    const { result } = renderHook(() => useTimezoneMode());

    // AC4: Invalid mode values (not 'ET' or 'local') safely revert to default
    expect(result.current.mode).toBe('local');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 5: Loading state propagated from usePersistedState
  // ─────────────────────────────────────────────────────────────────────────────

  it('should propagate loading state from usePersistedState', () => {
    mockUsePersistedState.mockReturnValue({
      getState: vi.fn().mockReturnValue(null),
      setState: vi.fn(),
      isLoading: true,
    });

    const { result } = renderHook(() => useTimezoneMode());

    expect(result.current.isLoading).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 6: Multiple setMode calls with different values
  // ─────────────────────────────────────────────────────────────────────────────

  it('should allow multiple setMode calls with different values', () => {
    const mockSetState = vi.fn();
    mockUsePersistedState.mockReturnValue({
      getState: vi.fn().mockReturnValue(null),
      setState: mockSetState,
      isLoading: false,
    });

    const { result } = renderHook(() => useTimezoneMode());

    act(() => {
      result.current.setMode('ET');
    });

    act(() => {
      result.current.setMode('local');
    });

    expect(mockSetState).toHaveBeenCalledTimes(2);
    expect(mockSetState).toHaveBeenNthCalledWith(1, 'timezone', { mode: 'ET' });
    expect(mockSetState).toHaveBeenNthCalledWith(2, 'timezone', { mode: 'local' });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 7: Return type validation
  // ─────────────────────────────────────────────────────────────────────────────

  it('should return object with mode, setMode, and isLoading properties', () => {
    mockUsePersistedState.mockReturnValue({
      getState: vi.fn().mockReturnValue({ mode: 'ET' }),
      setState: vi.fn(),
      isLoading: false,
    });

    const { result } = renderHook(() => useTimezoneMode());

    expect(result.current).toHaveProperty('mode');
    expect(result.current).toHaveProperty('setMode');
    expect(result.current).toHaveProperty('isLoading');
    expect(typeof result.current.setMode).toBe('function');
    expect(result.current.mode).toMatch(/^(ET|local)$/);
  });
});
