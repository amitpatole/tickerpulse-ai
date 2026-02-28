/**
 * Critical path tests for usePersistedState debounce + batching behavior.
 *
 * AC1: Multiple setState calls within 500ms are batched into single PATCH
 * AC2: Debounce timer resets on each setState call (not rapid-fire)
 * AC3: PATCH includes all queued changes (not just the last one)
 * AC4: Failed PATCH triggers automatic retry + error state
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { usePersistedState } from '../usePersistedState';

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
// AC1: Multiple setState calls within 500ms batched into single PATCH
// -----------------------------------------------------------------------

describe('usePersistedState - AC1: Debounce & Batching', () => {
  it('AC1: three setState calls within 500ms result in single PATCH', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Act: Three rapid setState calls
    act(() => {
      result.current.setState('prefs', { theme: 'dark' });
      jest.advanceTimersByTime(100);

      result.current.setState('sidebar', { collapsed: true });
      jest.advanceTimersByTime(100);

      result.current.setState('chart', { interval: '1h' });
      jest.advanceTimersByTime(100);
    });

    // Assert: Only one PATCH sent at 500ms mark
    expect(mockFetch).toHaveBeenCalledTimes(1); // GET on mount
    mockFetch.mockClear();

    // Trigger debounce timer (300ms + buffer)
    act(() => {
      jest.advanceTimersByTime(400);
    });

    // Assert: Exactly one PATCH request sent (batched)
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const patchCall = mockFetch.mock.calls[0];
    expect(patchCall[0]).toContain('/api/app-state');
    expect(patchCall[1]?.method).toBe('PATCH');

    const payload = JSON.parse(patchCall[1]?.body);
    assert(Object.keys(payload).length === 3); // All three keys batched
    assert('prefs' in payload);
    assert('sidebar' in payload);
    assert('chart' in payload);
  });

  it('AC1: single setState waits full 500ms debounce before sending PATCH', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockFetch.mockClear();

    // Act: Single setState
    act(() => {
      result.current.setState('theme', { mode: 'dark' });
    });

    // Assert: No PATCH sent immediately
    expect(mockFetch).not.toHaveBeenCalled();

    // Advance to 400ms (before debounce ends)
    act(() => {
      jest.advanceTimersByTime(400);
    });

    // Still no PATCH
    expect(mockFetch).not.toHaveBeenCalled();

    // Advance past debounce (500ms total)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    act(() => {
      jest.advanceTimersByTime(150);
    });

    // Now PATCH is sent
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});

// -----------------------------------------------------------------------
// AC2: Debounce timer resets on each setState (not rapid-fire)
// -----------------------------------------------------------------------

describe('usePersistedState - AC2: Debounce Reset', () => {
  it('AC2: timer resets when setState called before debounce expires', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockFetch.mockClear();

    // Act: Call setState, wait 300ms (before 500ms debounce)
    act(() => {
      result.current.setState('key1', { val: 1 });
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Assert: No PATCH sent yet
    expect(mockFetch).not.toHaveBeenCalled();

    // Act: Call setState again, resetting timer
    act(() => {
      result.current.setState('key2', { val: 2 });
    });

    // Still at 300ms total elapsed (timer reset to 0)
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Assert: Still no PATCH (only 600ms total, but timer resets at 300)
    expect(mockFetch).not.toHaveBeenCalled();

    // Advance past the reset debounce
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    act(() => {
      jest.advanceTimersByTime(250);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});

// -----------------------------------------------------------------------
// AC3: PATCH includes all queued changes (accumulated)
// -----------------------------------------------------------------------

describe('usePersistedState - AC3: Batched Payload', () => {
  it('AC3: PATCH body contains all accumulated setState calls', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockFetch.mockClear();

    // Act: Multiple setState calls with different keys and values
    act(() => {
      result.current.setState('dashboard', { refreshInterval: 30 });
      result.current.setState('sidebar', { width: 250, collapsed: false });
      result.current.setState('preferences', { lang: 'en', timezone: 'UTC' });
    });

    // Trigger debounce
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    act(() => {
      jest.advanceTimersByTime(600);
    });

    // Assert: PATCH sent with all three keys
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [url, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options?.body);

    expect(Object.keys(body).length).toBe(3);
    expect(body.dashboard).toEqual({ refreshInterval: 30 });
    expect(body.sidebar).toEqual({ width: 250, collapsed: false });
    expect(body.preferences).toEqual({ lang: 'en', timezone: 'UTC' });
  });

  it('AC3: later setState overwrites earlier one for same key', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockFetch.mockClear();

    // Act: setState called twice for same key
    act(() => {
      result.current.setState('theme', { mode: 'light' });
      jest.advanceTimersByTime(100);

      result.current.setState('theme', { mode: 'dark' });
      // Timer resets here
    });

    // Trigger debounce
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    act(() => {
      jest.advanceTimersByTime(600);
    });

    // Assert: Only latest value sent
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options?.body);

    expect(body.theme).toEqual({ mode: 'dark' });
  });
});

// -----------------------------------------------------------------------
// AC4: Failed PATCH triggers retry + error state
// -----------------------------------------------------------------------

describe('usePersistedState - AC4: Error Recovery', () => {
  it('AC4: failed PATCH sets error state and retries on next setState', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockFetch.mockClear();

    // Act: setState followed by failed PATCH
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    act(() => {
      result.current.setState('key1', { val: 1 });
    });

    act(() => {
      jest.advanceTimersByTime(600);
    });

    // Assert: Error state is set
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    // Act: Next setState retries
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    act(() => {
      result.current.setState('key2', { val: 2 });
    });

    // Assert: Error is cleared on new setState
    expect(result.current.error).toBeNull();
  });

  it('AC4: failed PATCH retry includes new accumulated changes', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => usePersistedState());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockFetch.mockClear();

    // Act: First setState fails
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    act(() => {
      result.current.setState('key1', { val: 1 });
    });

    act(() => {
      jest.advanceTimersByTime(600);
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    mockFetch.mockClear();

    // Act: Second setState during retry
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    act(() => {
      result.current.setState('key2', { val: 2 });
    });

    act(() => {
      jest.advanceTimersByTime(600);
    });

    // Assert: Retry PATCH includes both key1 and key2
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options?.body);

    expect('key1' in body).toBe(true);
    expect('key2' in body).toBe(true);
  });
});

// Helper assertion function
function assert(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}
