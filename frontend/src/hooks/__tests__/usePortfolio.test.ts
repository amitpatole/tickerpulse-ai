/**
 * Test suite for usePortfolio hook — data loading, mutations, and polling.
 *
 * Focus: Initial state defaults, addPosition/updatePosition/removePosition flows,
 * mutating flag lifecycle, error propagation, and 60-second auto-refresh.
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { usePortfolio } from '../usePortfolio';
import {
  getPortfolio,
  addPortfolioPosition,
  updatePortfolioPosition,
  deletePortfolioPosition,
} from '@/lib/api';
import type { PortfolioResponse } from '@/lib/types';

jest.mock('@/lib/api', () => ({
  getPortfolio: jest.fn(),
  addPortfolioPosition: jest.fn(),
  updatePortfolioPosition: jest.fn(),
  deletePortfolioPosition: jest.fn(),
}));

const mockGetPortfolio = getPortfolio as jest.Mock;
const mockAddPortfolioPosition = addPortfolioPosition as jest.Mock;
const mockUpdatePortfolioPosition = updatePortfolioPosition as jest.Mock;
const mockDeletePortfolioPosition = deletePortfolioPosition as jest.Mock;

const baseResponse: PortfolioResponse = {
  positions: [
    {
      id: 1,
      ticker: 'AAPL',
      quantity: 100,
      avg_cost: 150.0,
      currency: 'USD',
      cost_basis: 15000.0,
      opened_at: '2026-01-01',
      current_price: 180.0,
      pnl: 3000.0,
      pnl_pct: 20.0,
      allocation_pct: 100.0,
    },
  ],
  summary: {
    total_value: 18000.0,
    total_cost: 15000.0,
    total_pnl: 3000.0,
    total_pnl_pct: 20.0,
    position_count: 1,
  },
};

describe('usePortfolio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetPortfolio.mockResolvedValue(baseResponse);
    mockAddPortfolioPosition.mockResolvedValue({ id: 2, message: 'Position added' });
    mockUpdatePortfolioPosition.mockResolvedValue({ id: 1, message: 'Position updated' });
    mockDeletePortfolioPosition.mockResolvedValue({ id: 1, message: 'Position removed' });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  describe('Initial state', () => {
    it('starts in loading state', () => {
      const { result } = renderHook(() => usePortfolio());
      expect(result.current.loading).toBe(true);
    });

    it('positions defaults to empty array before load', () => {
      const { result } = renderHook(() => usePortfolio());
      expect(result.current.positions).toEqual([]);
    });

    it('summary defaults to null before load', () => {
      const { result } = renderHook(() => usePortfolio());
      expect(result.current.summary).toBeNull();
    });

    it('mutating defaults to false', () => {
      const { result } = renderHook(() => usePortfolio());
      expect(result.current.mutating).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  describe('Data loading', () => {
    it('loads positions and summary after successful fetch', async () => {
      const { result } = renderHook(() => usePortfolio());

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.positions).toHaveLength(1);
      expect(result.current.positions[0].ticker).toBe('AAPL');
      expect(result.current.summary?.total_value).toBe(18000.0);
      expect(result.current.summary?.position_count).toBe(1);
      expect(result.current.error).toBeNull();
    });

    it('surfaces API errors via the error property', async () => {
      mockGetPortfolio.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => usePortfolio());

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe('Network error');
      expect(result.current.positions).toEqual([]);
      expect(result.current.summary).toBeNull();
    });

    it('clears error and reloads data after successful refetch', async () => {
      mockGetPortfolio
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce(baseResponse);

      const { result } = renderHook(() => usePortfolio());

      await waitFor(() => expect(result.current.error).toBe('Timeout'));

      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
        expect(result.current.positions).toHaveLength(1);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // addPosition
  // ---------------------------------------------------------------------------

  describe('addPosition', () => {
    it('calls addPortfolioPosition with the provided data', async () => {
      const { result } = renderHook(() => usePortfolio());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.addPosition({
          ticker: 'TSLA',
          quantity: 10,
          avg_cost: 250.0,
          currency: 'USD',
        });
      });

      expect(mockAddPortfolioPosition).toHaveBeenCalledTimes(1);
      expect(mockAddPortfolioPosition).toHaveBeenCalledWith({
        ticker: 'TSLA',
        quantity: 10,
        avg_cost: 250.0,
        currency: 'USD',
      });
    });

    it('triggers a refetch after successful add', async () => {
      const { result } = renderHook(() => usePortfolio());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const callsBefore = mockGetPortfolio.mock.calls.length;

      await act(async () => {
        await result.current.addPosition({ ticker: 'TSLA', quantity: 10, avg_cost: 250.0 });
      });

      await waitFor(() => {
        expect(mockGetPortfolio.mock.calls.length).toBeGreaterThan(callsBefore);
      });
    });

    it('resets mutating to false after successful add', async () => {
      const { result } = renderHook(() => usePortfolio());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.addPosition({ ticker: 'TSLA', quantity: 10, avg_cost: 250.0 });
      });

      expect(result.current.mutating).toBe(false);
    });

    it('resets mutating to false even when addPortfolioPosition throws', async () => {
      mockAddPortfolioPosition.mockRejectedValue(new Error('Server error'));

      const { result } = renderHook(() => usePortfolio());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        try {
          await result.current.addPosition({ ticker: 'TSLA', quantity: 10, avg_cost: 250.0 });
        } catch {
          // expected — error propagates to caller
        }
      });

      expect(result.current.mutating).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // updatePosition
  // ---------------------------------------------------------------------------

  describe('updatePosition', () => {
    it('calls updatePortfolioPosition with the correct id and patch data', async () => {
      const { result } = renderHook(() => usePortfolio());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.updatePosition(1, { quantity: 50, avg_cost: 160.0 });
      });

      expect(mockUpdatePortfolioPosition).toHaveBeenCalledTimes(1);
      expect(mockUpdatePortfolioPosition).toHaveBeenCalledWith(1, {
        quantity: 50,
        avg_cost: 160.0,
      });
    });

    it('triggers a refetch after successful update', async () => {
      const { result } = renderHook(() => usePortfolio());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const callsBefore = mockGetPortfolio.mock.calls.length;

      await act(async () => {
        await result.current.updatePosition(1, { quantity: 50 });
      });

      await waitFor(() => {
        expect(mockGetPortfolio.mock.calls.length).toBeGreaterThan(callsBefore);
      });
    });

    it('resets mutating to false after successful update', async () => {
      const { result } = renderHook(() => usePortfolio());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.updatePosition(1, { quantity: 50 });
      });

      expect(result.current.mutating).toBe(false);
    });

    it('resets mutating to false even when updatePortfolioPosition throws', async () => {
      mockUpdatePortfolioPosition.mockRejectedValue(new Error('Not found'));

      const { result } = renderHook(() => usePortfolio());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        try {
          await result.current.updatePosition(999, { quantity: 1 });
        } catch {
          // expected
        }
      });

      expect(result.current.mutating).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // removePosition
  // ---------------------------------------------------------------------------

  describe('removePosition', () => {
    it('calls deletePortfolioPosition with the position id', async () => {
      const { result } = renderHook(() => usePortfolio());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.removePosition(1);
      });

      expect(mockDeletePortfolioPosition).toHaveBeenCalledTimes(1);
      expect(mockDeletePortfolioPosition).toHaveBeenCalledWith(1);
    });

    it('triggers a refetch after successful removal', async () => {
      const { result } = renderHook(() => usePortfolio());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const callsBefore = mockGetPortfolio.mock.calls.length;

      await act(async () => {
        await result.current.removePosition(1);
      });

      await waitFor(() => {
        expect(mockGetPortfolio.mock.calls.length).toBeGreaterThan(callsBefore);
      });
    });

    it('resets mutating to false after successful removal', async () => {
      const { result } = renderHook(() => usePortfolio());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.removePosition(1);
      });

      expect(result.current.mutating).toBe(false);
    });

    it('resets mutating to false even when deletePortfolioPosition throws', async () => {
      mockDeletePortfolioPosition.mockRejectedValue(new Error('Already removed'));

      const { result } = renderHook(() => usePortfolio());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        try {
          await result.current.removePosition(999);
        } catch {
          // expected
        }
      });

      expect(result.current.mutating).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Polling interval (60s auto-refresh)
  // ---------------------------------------------------------------------------

  describe('Polling interval', () => {
    it('polls again after 60 seconds', async () => {
      const { result } = renderHook(() => usePortfolio());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const callsBefore = mockGetPortfolio.mock.calls.length;

      act(() => {
        jest.advanceTimersByTime(60_000);
      });

      await waitFor(() => {
        expect(mockGetPortfolio.mock.calls.length).toBeGreaterThan(callsBefore);
      });
    });

    it('does not poll before 60 seconds elapse', async () => {
      const { result } = renderHook(() => usePortfolio());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const callsBefore = mockGetPortfolio.mock.calls.length;

      act(() => {
        jest.advanceTimersByTime(59_000);
      });

      expect(mockGetPortfolio.mock.calls.length).toBe(callsBefore);
    });
  });
});
