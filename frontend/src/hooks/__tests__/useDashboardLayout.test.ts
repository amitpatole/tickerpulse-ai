/**
 * Tests for useDashboardLayout hook
 *
 * Coverage:
 * - Default layout values returned
 * - Persisted state merged with defaults
 * - setLayout() performs partial updates (merge semantics)
 * - isLoading flag propagation
 */

import { renderHook, act } from '@testing-library/react';
import { useDashboardLayout } from '../useDashboardLayout';
import * as usePersistedStateModule from '../usePersistedState';

// Mock usePersistedState
jest.mock('../usePersistedState');

describe('useDashboardLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns default layout when no persisted state', () => {
    /**
     * AC1: Hook provides sensible defaults when user has not customized layout
     */
    const mockGetState = jest.fn(() => undefined);
    const mockSetState = jest.fn();

    (usePersistedStateModule.usePersistedState as jest.Mock).mockReturnValue({
      getState: mockGetState,
      setState: mockSetState,
      isLoading: false,
    });

    const { result } = renderHook(() => useDashboardLayout());

    expect(result.current.layout.columns).toBe(3);
    expect(result.current.layout.sortBy).toBe('rating');
    expect(result.current.layout.sortDir).toBe('desc');
    expect(result.current.isLoading).toBe(false);
  });

  test('merges persisted state with defaults', () => {
    /**
     * AC2: Persisted partial state correctly overlays defaults
     * (e.g., only columns persisted → sortBy/sortDir use defaults)
     */
    const mockGetState = jest.fn(() => ({ columns: 2 }));
    const mockSetState = jest.fn();

    (usePersistedStateModule.usePersistedState as jest.Mock).mockReturnValue({
      getState: mockGetState,
      setState: mockSetState,
      isLoading: false,
    });

    const { result } = renderHook(() => useDashboardLayout());

    expect(result.current.layout).toEqual({
      columns: 2,
      sortBy: 'rating',
      sortDir: 'desc',
    });
  });

  test('setLayout performs partial updates (merge semantics)', () => {
    /**
     * AC3: setLayout() merges new values with current state
     * (does not replace entire layout)
     */
    const mockGetState = jest.fn(key => {
      if (key === 'dashboard.layout') {
        return { columns: 2, sortBy: 'price' };
      }
      return undefined;
    });
    const mockSetState = jest.fn();

    (usePersistedStateModule.usePersistedState as jest.Mock).mockReturnValue({
      getState: mockGetState,
      setState: mockSetState,
      isLoading: false,
    });

    const { result } = renderHook(() => useDashboardLayout());

    act(() => {
      result.current.setLayout({ sortDir: 'asc' });
    });

    // Verify setState was called with merged state (not just { sortDir: 'asc' })
    expect(mockSetState).toHaveBeenCalledWith(
      'dashboard.layout',
      { columns: 2, sortBy: 'price', sortDir: 'asc' }
    );
  });

  test('propagates isLoading flag from usePersistedState', () => {
    /**
     * AC4: Hook transparently passes through loading state
     * while persisted state is being fetched
     */
    const mockGetState = jest.fn(() => undefined);
    const mockSetState = jest.fn();

    (usePersistedStateModule.usePersistedState as jest.Mock).mockReturnValue({
      getState: mockGetState,
      setState: mockSetState,
      isLoading: true,
    });

    const { result } = renderHook(() => useDashboardLayout());

    expect(result.current.isLoading).toBe(true);
  });
});
