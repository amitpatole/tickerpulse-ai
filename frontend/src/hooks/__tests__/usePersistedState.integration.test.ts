/**
 * Integration tests for usePersistedState — concurrent updates, cleanup, error recovery.
 *
 * Tests critical scenarios that verify the hook works correctly with:
 * - Concurrent rapid updates (batching/debouncing)
 * - Component cleanup (no memory leaks)
 * - Error recovery (retry mechanism)
 * - Large state objects
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

describe('usePersistedState — integration scenarios', () => {
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

  it('batches multiple rapid setState calls into single PATCH, respecting debounce', async () => {
    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Trigger 5 rapid setState calls
    act(() => {
      result.current.setState('key1', { val: 1 });
      result.current.setState('key2', { val: 2 });
      result.current.setState('key1', { val: 1.5 }); // overwrites first
      result.current.setState('key3', { val: 3 });
      result.current.setState('key2', { val: 2.5 }); // overwrites second
    });

    // No PATCH yet
    expect(mockPatchState).not.toHaveBeenCalled();

    // Fire debounce
    act(() => jest.advanceTimersByTime(600));

    // All 5 calls batched into 1 PATCH with final values
    await waitFor(() => expect(mockPatchState).toHaveBeenCalledTimes(1));
    expect(mockPatchState).toHaveBeenCalledWith({
      key1: { val: 1.5 },
      key2: { val: 2.5 },
      key3: { val: 3 },
    });
  });

  it('clears debounce timer and prevents PATCH if unmounted before debounce fires', async () => {
    const { result, unmount } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setState('key', { val: 1 });
    });

    // Unmount immediately, before debounce fires
    act(() => {
      unmount();
    });

    // Advance past debounce
    act(() => jest.advanceTimersByTime(600));

    // PATCH should never be called (component already unmounted)
    expect(mockPatchState).not.toHaveBeenCalled();
  });

  it('retries failed PATCH and surfaces error only after both attempts fail', async () => {
    mockPatchState.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setState('key', { val: 1 }));
    act(() => jest.advanceTimersByTime(600));

    // First attempt fails
    await waitFor(() => expect(mockPatchState).toHaveBeenCalledTimes(1));
    expect(result.current.error).toBeNull(); // Error not yet surfaced (retry pending)

    // Fire retry
    act(() => jest.advanceTimersByTime(1500));

    // Second attempt also fails
    await waitFor(() => {
      expect(mockPatchState).toHaveBeenCalledTimes(2);
      expect(result.current.error).not.toBeNull();
    });
  });

  it('succeeds on retry after initial PATCH failure', async () => {
    // First call fails, second succeeds
    mockPatchState
      .mockRejectedValueOnce(new Error('Temporary network error'))
      .mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setState('key', { val: 1 }));
    act(() => jest.advanceTimersByTime(600));

    // First attempt fails
    await waitFor(() => expect(mockPatchState).toHaveBeenCalledTimes(1));
    expect(result.current.error).toBeNull();

    // Fire retry
    act(() => jest.advanceTimersByTime(1500));

    // Second attempt succeeds
    await waitFor(() => {
      expect(mockPatchState).toHaveBeenCalledTimes(2);
      expect(result.current.error).toBeNull();
    });
  });

  it('handles large deeply-nested state objects without error', async () => {
    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Build a large nested object
    const largeState = {
      deep: {
        a: { b: { c: { d: { e: { f: { g: 'value' } } } } } },
        array: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `item${i}` })),
        text: 'x'.repeat(500),
      },
    };

    act(() => {
      result.current.setState('cache', largeState);
    });

    act(() => jest.advanceTimersByTime(600));

    await waitFor(() => expect(mockPatchState).toHaveBeenCalled());

    // Verify state was stored and retrieved correctly
    expect(result.current.getState('cache')).toEqual(largeState);
  });

  it('maintains independent state across multiple keys after concurrent updates', async () => {
    mockGetState.mockResolvedValue(
      mkStateResponse({
        prefs: { theme: 'light' },
        layout: { sidebar: true },
      }),
    );

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Verify initial state from server
    expect(result.current.getState('prefs')).toEqual({ theme: 'light' });
    expect(result.current.getState('layout')).toEqual({ sidebar: true });

    // Update both keys independently
    act(() => {
      result.current.setState('prefs', { theme: 'dark', fontSize: 14 });
      result.current.setState('layout', { sidebar: false, width: 400 });
    });

    act(() => jest.advanceTimersByTime(600));

    await waitFor(() => expect(mockPatchState).toHaveBeenCalled());

    // Both keys updated correctly
    expect(result.current.getState('prefs')).toEqual({
      theme: 'dark',
      fontSize: 14,
    });
    expect(result.current.getState('layout')).toEqual({
      sidebar: false,
      width: 400,
    });
  });
});
