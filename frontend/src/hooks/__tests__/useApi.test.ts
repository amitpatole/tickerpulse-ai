/**
 * Tests for the useApi hook.
 *
 * Tests cover:
 * - Happy path: fetches data and transitions loading→data
 * - Error state: handles rejected promises and sets error message
 * - Loading state: starts as loading=true before fetch resolves
 * - Refresh interval: automatically re-fetches on interval
 * - enabled=false: skips the initial fetch entirely
 * - refetch: manual refetch replaces stale data
 * - Unmount cleanup: no state updates after component unmounts
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useApi } from '../useApi';

describe('useApi hook', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ===========================================================================
  // Happy Path: fetches data successfully
  // ===========================================================================

  describe('happy path: fetches data and returns it', () => {
    it('returns fetched data after promise resolves', async () => {
      // Arrange
      const mockData = [{ id: 1, name: 'AAPL' }];
      const fetcher = jest.fn().mockResolvedValue(mockData);

      // Act
      const { result } = renderHook(() => useApi(fetcher, []));

      // Assert: starts loading
      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();

      // Wait for fetch to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Assert: data is set, no error
      expect(result.current.data).toEqual(mockData);
      expect(result.current.error).toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('calls fetcher once on mount with no deps', async () => {
      // Arrange
      const fetcher = jest.fn().mockResolvedValue({ ok: true });

      // Act
      renderHook(() => useApi(fetcher, []));

      await waitFor(() => {
        expect(fetcher).toHaveBeenCalledTimes(1);
      });
    });

    it('re-fetches when deps change', async () => {
      // Arrange
      const fetcher = jest.fn().mockResolvedValue('data');
      let dep = 1;

      const { rerender } = renderHook(() => useApi(fetcher, [dep]));

      await waitFor(() => {
        expect(fetcher).toHaveBeenCalledTimes(1);
      });

      // Act: change dep
      dep = 2;
      rerender();

      await waitFor(() => {
        expect(fetcher).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ===========================================================================
  // Error State: handles rejected fetch
  // ===========================================================================

  describe('error state: handles rejected fetcher', () => {
    it('sets error message when fetcher throws an Error', async () => {
      // Arrange
      const errorMessage = 'Network request failed';
      const fetcher = jest.fn().mockRejectedValue(new Error(errorMessage));

      // Act
      const { result } = renderHook(() => useApi(fetcher, []));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Assert
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBe(errorMessage);
    });

    it('sets generic error message when fetcher throws non-Error value', async () => {
      // Arrange
      const fetcher = jest.fn().mockRejectedValue('string error');

      // Act
      const { result } = renderHook(() => useApi(fetcher, []));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Assert: falls back to generic message
      expect(result.current.error).toBe('An error occurred');
    });

    it('clears previous error on successful refetch', async () => {
      // Arrange: first call fails, second succeeds
      const fetcher = jest
        .fn()
        .mockRejectedValueOnce(new Error('API down'))
        .mockResolvedValue([{ id: 1 }]);

      const { result } = renderHook(() => useApi(fetcher, []));

      await waitFor(() => {
        expect(result.current.error).toBe('API down');
      });

      // Act: manual refetch
      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });

      expect(result.current.data).toEqual([{ id: 1 }]);
    });
  });

  // ===========================================================================
  // Loading State: transitions correctly
  // ===========================================================================

  describe('loading state: transitions from loading to resolved', () => {
    it('starts with loading=true before data arrives', () => {
      // Arrange: fetch never resolves during this assertion
      const fetcher = jest.fn().mockReturnValue(new Promise(() => {}));

      // Act
      const { result } = renderHook(() => useApi(fetcher, []));

      // Assert: loading immediately
      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();
    });

    it('sets loading=false after data arrives', async () => {
      // Arrange
      const fetcher = jest.fn().mockResolvedValue({ value: 42 });

      // Act
      const { result } = renderHook(() => useApi(fetcher, []));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual({ value: 42 });
    });

    it('sets loading=false after error', async () => {
      // Arrange
      const fetcher = jest.fn().mockRejectedValue(new Error('fail'));

      // Act
      const { result } = renderHook(() => useApi(fetcher, []));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('fail');
    });
  });

  // ===========================================================================
  // Refresh Interval: auto re-fetches
  // ===========================================================================

  describe('refresh interval: auto re-fetches at configured interval', () => {
    it('calls fetcher again after refreshInterval ms', async () => {
      // Arrange
      const fetcher = jest.fn().mockResolvedValue('data');

      // Act
      renderHook(() => useApi(fetcher, [], { refreshInterval: 5000 }));

      await waitFor(() => {
        expect(fetcher).toHaveBeenCalledTimes(1);
      });

      // Advance timer past the interval
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(fetcher).toHaveBeenCalledTimes(2);
      });
    });

    it('does not set up interval when refreshInterval is not provided', async () => {
      // Arrange
      const fetcher = jest.fn().mockResolvedValue('data');

      // Act
      renderHook(() => useApi(fetcher, []));

      await waitFor(() => {
        expect(fetcher).toHaveBeenCalledTimes(1);
      });

      // Advance time — no second call should happen
      act(() => {
        jest.advanceTimersByTime(60_000);
      });

      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('clears interval on unmount', async () => {
      // Arrange
      const fetcher = jest.fn().mockResolvedValue('data');

      // Act
      const { unmount } = renderHook(() =>
        useApi(fetcher, [], { refreshInterval: 5000 })
      );

      await waitFor(() => {
        expect(fetcher).toHaveBeenCalledTimes(1);
      });

      unmount();

      // Advance — no more calls after unmount
      act(() => {
        jest.advanceTimersByTime(15_000);
      });

      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // enabled=false: skips the fetch
  // ===========================================================================

  describe('enabled option: skips fetch when false', () => {
    it('does not call fetcher when enabled=false', () => {
      // Arrange
      const fetcher = jest.fn().mockResolvedValue('data');

      // Act
      const { result } = renderHook(() =>
        useApi(fetcher, [], { enabled: false })
      );

      // Assert: fetcher never called, loading=false
      expect(fetcher).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBeNull();
    });

    it('fetches when enabled transitions from false to true', async () => {
      // Arrange
      const fetcher = jest.fn().mockResolvedValue('loaded');
      let enabled = false;

      const { result, rerender } = renderHook(() =>
        useApi(fetcher, [], { enabled })
      );

      expect(fetcher).not.toHaveBeenCalled();

      // Act: enable it
      enabled = true;
      rerender();

      await waitFor(() => {
        expect(result.current.data).toBe('loaded');
      });

      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // refetch: manual refetch
  // ===========================================================================

  describe('refetch: manual refetch triggers a new request', () => {
    it('calls fetcher again when refetch() is invoked', async () => {
      // Arrange
      const fetcher = jest.fn().mockResolvedValue('initial');

      const { result } = renderHook(() => useApi(fetcher, []));

      await waitFor(() => {
        expect(result.current.data).toBe('initial');
      });

      expect(fetcher).toHaveBeenCalledTimes(1);

      // Act
      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(fetcher).toHaveBeenCalledTimes(2);
      });
    });

    it('updates data after refetch resolves with new value', async () => {
      // Arrange
      const fetcher = jest
        .fn()
        .mockResolvedValueOnce('old value')
        .mockResolvedValueOnce('new value');

      const { result } = renderHook(() => useApi(fetcher, []));

      await waitFor(() => {
        expect(result.current.data).toBe('old value');
      });

      // Act
      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.data).toBe('new value');
      });
    });
  });
});
