import { renderHook, waitFor, act } from '@testing-library/react';
import { useEarnings } from '../useEarnings';
import { getEarnings } from '@/lib/api';
import type { EarningsResponse } from '@/lib/types';

jest.mock('@/lib/api', () => ({
  getEarnings: jest.fn(),
}));

const mockGetEarnings = getEarnings as jest.Mock;

const baseResponse: EarningsResponse = {
  upcoming: [
    {
      id: 1,
      ticker: 'NVDA',
      company: 'Nvidia Corp',
      earnings_date: '2027-03-10',
      time_of_day: 'BMO',
      eps_estimate: 0.7,
      eps_actual: null,
      revenue_estimate: 17.2e9,
      revenue_actual: null,
      fiscal_quarter: 'Q1 2027',
      on_watchlist: true,
    },
  ],
  past: [
    {
      id: 2,
      ticker: 'META',
      company: 'Meta Platforms',
      earnings_date: '2027-02-15',
      time_of_day: 'AMC',
      eps_estimate: 6.0,
      eps_actual: 6.2,
      revenue_estimate: 40e9,
      revenue_actual: 40.5e9,
      fiscal_quarter: 'Q4 2026',
      on_watchlist: false,
      surprise_pct: 3.33,
    },
  ],
  stale: false,
  as_of: '2027-03-01T10:00:00Z',
};

describe('useEarnings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetEarnings.mockResolvedValue(baseResponse);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Initial fetch
  // -------------------------------------------------------------------------

  describe('Initial fetch', () => {
    it('starts in loading state', () => {
      const { result } = renderHook(() => useEarnings());
      expect(result.current.isLoading).toBe(true);
    });

    it('fetches and exposes upcoming and past arrays after load', async () => {
      const { result } = renderHook(() => useEarnings());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.upcoming).toHaveLength(1);
      expect(result.current.past).toHaveLength(1);
      expect(result.current.upcoming[0].ticker).toBe('NVDA');
      expect(result.current.past[0].ticker).toBe('META');
      expect(result.current.error).toBeNull();
    });

    it('exposes stale=true flag when API response is stale', async () => {
      mockGetEarnings.mockResolvedValue({ ...baseResponse, stale: true });

      const { result } = renderHook(() => useEarnings());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.stale).toBe(true);
    });

    it('defaults stale to false when response is fresh', async () => {
      const { result } = renderHook(() => useEarnings());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.stale).toBe(false);
    });

    it('returns empty arrays when API returns no events', async () => {
      mockGetEarnings.mockResolvedValue({
        upcoming: [],
        past: [],
        stale: true,
        as_of: '',
      });

      const { result } = renderHook(() => useEarnings());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.upcoming).toEqual([]);
      expect(result.current.past).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Parameters passed to getEarnings
  // -------------------------------------------------------------------------

  describe('Parameters', () => {
    it('calls getEarnings with default days=30 and no watchlistId', async () => {
      const { result } = renderHook(() => useEarnings());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetEarnings).toHaveBeenCalledWith({
        days: 30,
        watchlist_id: undefined,
      });
    });

    it('calls getEarnings with custom days param', async () => {
      const { result } = renderHook(() => useEarnings(undefined, 60));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetEarnings).toHaveBeenCalledWith({
        days: 60,
        watchlist_id: undefined,
      });
    });

    it('calls getEarnings with watchlistId when provided', async () => {
      const { result } = renderHook(() => useEarnings(2, 14));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetEarnings).toHaveBeenCalledWith({
        days: 14,
        watchlist_id: 2,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('Error handling', () => {
    it('surfaces API errors via error property', async () => {
      mockGetEarnings.mockRejectedValue(new Error('Network timeout'));

      const { result } = renderHook(() => useEarnings());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Network timeout');
      expect(result.current.upcoming).toEqual([]);
      expect(result.current.past).toEqual([]);
    });

    it('clears error and loads data after successful refetch', async () => {
      mockGetEarnings
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce(baseResponse);

      const { result } = renderHook(() => useEarnings());

      await waitFor(() => {
        expect(result.current.error).toBe('Timeout');
      });

      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
        expect(result.current.upcoming).toHaveLength(1);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Polling interval
  // -------------------------------------------------------------------------

  describe('Polling interval', () => {
    it('polls again after 15 minutes', async () => {
      const { result } = renderHook(() => useEarnings());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCalls = mockGetEarnings.mock.calls.length;

      act(() => {
        jest.advanceTimersByTime(15 * 60 * 1000);
      });

      await waitFor(() => {
        expect(mockGetEarnings.mock.calls.length).toBeGreaterThan(initialCalls);
      });
    });

    it('does not poll before 15 minutes elapse', async () => {
      const { result } = renderHook(() => useEarnings());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCalls = mockGetEarnings.mock.calls.length;

      act(() => {
        jest.advanceTimersByTime(14 * 60 * 1000);
      });

      expect(mockGetEarnings.mock.calls.length).toBe(initialCalls);
    });
  });

  // -------------------------------------------------------------------------
  // Refetch
  // -------------------------------------------------------------------------

  describe('Refetch', () => {
    it('exposes a refetch function that re-fetches data on demand', async () => {
      const { result } = renderHook(() => useEarnings());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const callsBeforeRefetch = mockGetEarnings.mock.calls.length;

      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(mockGetEarnings.mock.calls.length).toBeGreaterThan(callsBeforeRefetch);
      });
    });
  });
});