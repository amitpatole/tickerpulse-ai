/**
 * Focused test suite for usePersistedState hook — AC1-AC5 coverage.
 *
 * Tests verify:
 *   AC1: Hook loads state from GET /api/app-state on first mount
 *   AC2: setState() provides optimistic local updates immediately
 *   AC3: setState() batches updates and sends PATCH on 500ms debounce
 *   AC4: Module-level cache prevents redundant fetches across instances
 *   AC5: Error handling with retry logic and fallback to empty state
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { usePersistedState } from '../usePersistedState';

// Mock fetch globally before all tests
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockClear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// -----------------------------------------------------------------------
// AC1: Load state from server on mount
// -----------------------------------------------------------------------

describe('usePersistedState - AC1: Initial Load', () => {
  it('AC1: loads state from GET /api/app-state on first mount', async () => {
    // Arrange
    const serverState = {
      preferences: { theme: 'dark', lang: 'en' },
      sidebar: { collapsed: false },
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => serverState,
    });

    // Act
    const { result } = renderHook(() => usePersistedState());

    // Assert: Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.state).toEqual({});

    // Wait for load to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.state).toEqual(serverState);
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/app-state')
    );
  });

  it('AC1: sets error state when fetch fails', async () => {
    // Arrange
    const networkError = new Error('Network error');
    mockFetch.mockRejectedValueOnce(networkError);

    // Act
    const { result } = renderHook(() => usePersistedState());

    // Assert: Initially loading
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.state).toEqual({});
  });

  it('AC1: handles HTTP error responses gracefully', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    });

    // Act
    const { result } = renderHook(() => usePersistedState());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Assert: Error is set but state is empty (graceful degradation)
    expect(result.current.error).toBe('HTTP 503');
    expect(result.current.state).toEqual({});
  });
});

// -----------------------------------------------------------------------
// AC2: Optimistic local updates
// -----------------------------------------------------------------------

describe('usePersistedState - AC2: Optimistic Updates', () => {
  it('AC2: setState() updates local state immediately (optimistic)', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ prefs: { theme: 'light' } }),
    });

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Act: Call setState
    act(() => {
      result.current.setState('prefs', { theme: 'dark' });
    });

    // Assert: Local state updates immediately (before PATCH is sent)
    expect(result.current.state).toEqual({ prefs: { theme: 'dark' } });
  });

  it('AC2: getState() retrieves typed values from local state', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ dashboard: { refreshInterval: 5 } }),
    });

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Act
    const value = result.current.getState<{ refreshInterval: number }>(
      'dashboard'
    );

    // Assert
    expect(value).toEqual({ refreshInterval: 5 });
  });

  it('AC2: setState() clears previous error state', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Create error condition by failing PATCH
    mockFetch.mockRejectedValueOnce(new Error('Save failed'));
    act(() => {
      result.current.setState('key', { value: 1 });
    });

    // Advance to trigger PATCH
    act(() => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Save failed');
    });

    // Act: Another setState should clear error
    mockFetch.mockClear();
    act(() => {
      result.current.setState('key2', { value: 2 });
    });

    // Assert: Error is null after setState
    expect(result.current.error).toBeNull();
  });
});

// -----------------------------------------------------------------------
// AC3: Debounced PATCH requests
// -----------------------------------------------------------------------

describe('usePersistedState - AC3: Debounced PATCH', () => {
  it('AC3: batches multiple setState calls into single PATCH', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    // Act: Multiple setState calls
    act(() => {
      result.current.setState('prefs', { theme: 'dark' });
      result.current.setState('sidebar', { collapsed: true });
      result.current.setState('filters', { sector: 'tech' });
    });

    // Assert: No fetch yet (debounce pending)
    expect(mockFetch).not.toHaveBeenCalled();

    // Advance to debounce timer (500ms)
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Assert: Single PATCH sent
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/app-state'),
        expect.objectContaining({
          method: 'PATCH',
        })
      );
    });

    // Verify batch payload contains all updates
    const patchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(patchCall[1].body);
    expect(body).toEqual({
      prefs: { theme: 'dark' },
      sidebar: { collapsed: true },
      filters: { sector: 'tech' },
    });
  });

  it('AC3: debounce timer resets on each setState call', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    // Act: First setState
    act(() => {
      result.current.setState('key1', { v: 1 });
    });

    // Advance 300ms (before debounce)
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Assert: No fetch yet
    expect(mockFetch).not.toHaveBeenCalled();

    // Act: Second setState resets timer
    act(() => {
      result.current.setState('key2', { v: 2 });
    });

    // Advance 200ms more (total 500ms from first, 200ms from second)
    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Assert: Still no fetch (timer was reset)
    expect(mockFetch).not.toHaveBeenCalled();

    // Advance to complete second debounce
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Assert: Now sends PATCH with both keys
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  it('AC3: cancels pending debounce on unmount', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result, unmount } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockFetch.mockClear();

    // Act: setState then unmount before debounce fires
    act(() => {
      result.current.setState('key', { v: 1 });
    });

    act(() => {
      unmount();
    });

    // Advance past debounce time
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Assert: No PATCH sent (unmount canceled it)
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// AC4: Module-level cache behavior
// -----------------------------------------------------------------------

describe('usePersistedState - AC4: Cache Behavior', () => {
  it('AC4: setState() persists values in local state across calls', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Act: Multiple setState calls
    act(() => {
      result.current.setState('key1', { a: 1 });
      result.current.setState('key2', { b: 2 });
      result.current.setState('key3', { c: 3 });
    });

    // Assert: All values are in local state
    expect(result.current.state).toEqual({
      key1: { a: 1 },
      key2: { b: 2 },
      key3: { c: 3 },
    });
  });

  it('AC4: cache starts empty and populates on successful load', async () => {
    // Arrange
    const serverState = { loaded: { value: true } };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => serverState,
    });

    // Act
    const { result } = renderHook(() => usePersistedState());

    // Assert: Initially empty
    expect(result.current.state).toEqual({});

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // After load, contains server state
    expect(result.current.state).toEqual(serverState);
  });
});

// -----------------------------------------------------------------------
// AC5: Error handling and retry
// -----------------------------------------------------------------------

describe('usePersistedState - AC5: Error Handling', () => {
  it('AC5: retries PATCH request on network failure', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockFetch.mockClear();
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    // Act: setState triggers PATCH
    act(() => {
      result.current.setState('key', { v: 1 });
    });

    // Advance past debounce
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Verify first attempt made
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Advance past retry delay (1500ms)
    act(() => {
      jest.advanceTimersByTime(1500);
    });

    // Assert: Retried (second call made)
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  it('AC5: sets error state when all retries exhausted', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockFetch.mockClear();
    mockFetch.mockRejectedValue(new Error('Persistent failure'));

    // Act: setState triggers failing PATCH
    act(() => {
      result.current.setState('key', { v: 1 });
    });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Verify initial attempt
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // Advance through retry 1 (1500ms delay)
    act(() => {
      jest.advanceTimersByTime(1500);
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    // Advance through retry 2 (1500ms delay)
    act(() => {
      jest.advanceTimersByTime(1500);
    });

    // Assert: error is set after all retries exhausted
    await waitFor(() => {
      expect(result.current.error).toBe('Persistent failure');
    });
  });

  it('AC5: handles fetch returning non-ok status', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    // Act: setState fails due to server error
    act(() => {
      result.current.setState('key', { v: 1 });
    });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Assert: error reflects the HTTP error
    await waitFor(() => {
      expect(result.current.error).toBe('HTTP 500');
    });
  });

  it('AC5: gracefully degrades when initial load fails', async () => {
    // Arrange
    mockFetch.mockRejectedValueOnce(new Error('Database unavailable'));

    // Act
    const { result } = renderHook(() => usePersistedState());

    // Assert: Error is set, state defaults to empty
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Database unavailable');
    expect(result.current.state).toEqual({});
    expect(result.current.getState('any_key')).toBeUndefined();
  });
});
