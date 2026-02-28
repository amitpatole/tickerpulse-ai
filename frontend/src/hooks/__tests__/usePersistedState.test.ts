/**
 * Tests for usePersistedState hook — persisted UI state backed by /api/state.
 *
 * Coverage (9 tests):
 *  - isLoading lifecycle: starts true, clears after hydration
 *  - Hydration on mount: fetches server state, populates local state
 *  - Network error: server failure exposes error, still clears isLoading
 *  - setState triggers PATCH: optimistic local update before debounce fires
 *  - Batch debounce: multiple rapid setState calls coalesced into one PATCH
 *  - Undefined keys: getState returns undefined without throwing
 *  - Null values: dict containing null values stored and retrieved correctly
 *  - Retry exhausted: error surfaced after both PATCH attempts fail
 *  - Optimistic persistence: local state NOT rolled back on PATCH failure
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import * as apiModule from '@/lib/api';
import { usePersistedState } from '../usePersistedState';

jest.mock('@/lib/api');

const mockGetState = apiModule.getState as jest.MockedFunction<typeof apiModule.getState>;
const mockPatchState = apiModule.patchState as jest.MockedFunction<typeof apiModule.patchState>;

/** Build a resolved GetStateResponse with the given state dict. */
function mkStateResponse(
  state: Record<string, Record<string, unknown>> = {},
): ReturnType<typeof apiModule.getState> extends Promise<infer R> ? R : never {
  return { success: true, state };
}

describe('usePersistedState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetState.mockResolvedValue(mkStateResponse());
    mockPatchState.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // isLoading lifecycle
  // -----------------------------------------------------------------------

  it('isLoading is true on initial render before server responds', () => {
    const { result } = renderHook(() => usePersistedState());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Hydration on mount
  // -----------------------------------------------------------------------

  it('hydrates state from server and sets isLoading false', async () => {
    mockGetState.mockResolvedValue(
      mkStateResponse({ dashboard: { watchlist_id: 1 }, sidebar: { collapsed: false } }),
    );

    const { result } = renderHook(() => usePersistedState());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetState).toHaveBeenCalledTimes(1);
    expect(result.current.getState('dashboard')).toEqual({ watchlist_id: 1 });
    expect(result.current.getState('sidebar')).toEqual({ collapsed: false });
  });

  // -----------------------------------------------------------------------
  // Network error on hydration
  // -----------------------------------------------------------------------

  it('sets error and clears isLoading when server hydration fails', async () => {
    mockGetState.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => usePersistedState());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toMatch(/Failed to load state/);
  });

  // -----------------------------------------------------------------------
  // setState — optimistic update before PATCH
  // -----------------------------------------------------------------------

  it('setState updates local state immediately without waiting for PATCH', async () => {
    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setState('prefs', { theme: 'dark' });
    });

    // Local state updated synchronously
    expect(result.current.getState('prefs')).toEqual({ theme: 'dark' });
    // PATCH not yet called (debounce pending)
    expect(mockPatchState).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Batch debounce
  // -----------------------------------------------------------------------

  it('batches multiple rapid setState calls into a single PATCH after debounce', async () => {
    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setState('dashboard', { watchlist_id: 1 });
      result.current.setState('dashboard', { watchlist_id: 2 }); // overwrites previous
      result.current.setState('sidebar', { collapsed: true });
    });

    expect(mockPatchState).not.toHaveBeenCalled();

    // Advance past DEBOUNCE_MS (500 ms)
    act(() => jest.advanceTimersByTime(600));

    await waitFor(() => expect(mockPatchState).toHaveBeenCalledTimes(1));

    expect(mockPatchState).toHaveBeenCalledWith({
      dashboard: { watchlist_id: 2 },
      sidebar: { collapsed: true },
    });
  });

  // -----------------------------------------------------------------------
  // Undefined keys
  // -----------------------------------------------------------------------

  it('getState returns undefined for unknown key without throwing', async () => {
    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(() => result.current.getState('nonexistent_key')).not.toThrow();
    expect(result.current.getState('nonexistent_key')).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Null values
  // -----------------------------------------------------------------------

  it('handles null values inside a state dict correctly', async () => {
    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setState('layout', { selectedTicker: null, activeTab: 0 });
    });

    expect(result.current.getState('layout')).toEqual({
      selectedTicker: null,
      activeTab: 0,
    });
  });

  // -----------------------------------------------------------------------
  // Retry exhausted → error surfaced
  // -----------------------------------------------------------------------

  it('exposes error after PATCH fails on both initial attempt and retry', async () => {
    mockPatchState.mockRejectedValue(new Error('Persistent failure'));

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setState('key', { val: 1 }));

    // Fire debounce
    act(() => jest.advanceTimersByTime(600));
    await waitFor(() => expect(mockPatchState).toHaveBeenCalledTimes(1));

    // Fire retry (RETRY_DELAY_MS = 1500 ms)
    act(() => jest.advanceTimersByTime(1500));
    await waitFor(() => {
      expect(mockPatchState).toHaveBeenCalledTimes(2);
      expect(result.current.error).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Optimistic state not rolled back on failure
  // -----------------------------------------------------------------------

  it('does not roll back local state when PATCH fails (optimistic design)', async () => {
    mockPatchState.mockRejectedValue(new Error('Save failed'));

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setState('prefs', { theme: 'dark' }));

    // Let debounce and retry both fire
    act(() => jest.advanceTimersByTime(600));
    act(() => jest.advanceTimersByTime(1500));

    await waitFor(() => expect(result.current.error).not.toBeNull());

    // Local state must still hold the value despite server error
    expect(result.current.getState('prefs')).toEqual({ theme: 'dark' });
  });

  // -----------------------------------------------------------------------
  // setState clears previous error
  // -----------------------------------------------------------------------

  it('setState clears a pre-existing error immediately', async () => {
    mockGetState.mockRejectedValue(new Error('Load error'));

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    // Calling setState should optimistically clear the error
    mockPatchState.mockResolvedValue({ success: true });
    act(() => result.current.setState('key', { val: 1 }));

    expect(result.current.error).toBeNull();
  });
});