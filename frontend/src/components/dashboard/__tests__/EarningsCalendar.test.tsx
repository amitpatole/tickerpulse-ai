/**
 * TickerPulse AI v3.0 — EarningsCalendar Component Tests
 *
 * Focused tests covering:
 * - Upcoming vs past tab switching
 * - Revenue/EPS display in each tab
 * - Watchlist highlighting and filtering
 * - Loading/error states
 * - Empty data handling
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import EarningsCalendar from '../EarningsCalendar';
import * as api from '@/lib/api';

jest.mock('@/lib/api');
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

const mockEarningsResponse = {
  events: [
    {
      id: 1,
      ticker: 'AAPL',
      company: 'Apple Inc.',
      earnings_date: '2025-03-01',
      time_of_day: 'AMC' as const,
      eps_estimate: 2.5,
      eps_actual: null,
      revenue_estimate: 87.0e9,
      revenue_actual: null,
      fiscal_quarter: 'Q1 2025',
      fetched_at: '2025-02-27T10:00:00Z',
      updated_at: '2025-02-27T10:00:00Z',
      on_watchlist: true,
    },
    {
      id: 2,
      ticker: 'MSFT',
      company: 'Microsoft Corp.',
      earnings_date: '2025-03-05',
      time_of_day: 'BMO' as const,
      eps_estimate: 3.15,
      eps_actual: null,
      revenue_estimate: 61.0e9,
      revenue_actual: null,
      fiscal_quarter: 'Q2 2025',
      fetched_at: '2025-02-27T10:00:00Z',
      updated_at: '2025-02-27T10:00:00Z',
      on_watchlist: false,
    },
  ],
  stale: false,
  as_of: '2025-02-27T10:00:00Z',
};

const mockPastResponse = {
  events: [
    {
      id: 3,
      ticker: 'AAPL',
      company: 'Apple Inc.',
      earnings_date: '2025-02-20',
      time_of_day: 'AMC' as const,
      eps_estimate: 2.1,
      eps_actual: 2.18,
      revenue_estimate: 84.0e9,
      revenue_actual: 85.2e9,
      fiscal_quarter: 'Q4 2024',
      fetched_at: '2025-02-27T10:00:00Z',
      updated_at: '2025-02-27T10:00:00Z',
      on_watchlist: true,
    },
    {
      id: 4,
      ticker: 'GOOGL',
      company: 'Alphabet Inc.',
      earnings_date: '2025-02-15',
      time_of_day: 'AMC' as const,
      eps_estimate: 1.8,
      eps_actual: 1.75,
      revenue_estimate: 88.0e9,
      revenue_actual: 86.9e9,
      fiscal_quarter: 'Q4 2024',
      fetched_at: '2025-02-27T10:00:00Z',
      updated_at: '2025-02-27T10:00:00Z',
      on_watchlist: false,
    },
  ],
  stale: false,
  as_of: '2025-02-27T10:00:00Z',
};

describe('EarningsCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Upcoming Tab - Happy Path', () => {
    it('renders upcoming earnings with correct columns and data', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockEarningsResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      // Verify table headers for upcoming tab
      expect(screen.getByText('Date')).toBeInTheDocument();
      expect(screen.getByText('Ticker / Company')).toBeInTheDocument();
      expect(screen.getByText('EPS Est.')).toBeInTheDocument();
      expect(screen.getByText('Quarter')).toBeInTheDocument();

      // Verify data is rendered
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('MSFT')).toBeInTheDocument();
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
      expect(screen.getByText('Q1 2025')).toBeInTheDocument();
    });

    it('displays watchlist indicator for watched stocks', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockEarningsResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      // AAPL is on watchlist, should have TrendingUp icon and highlighted row
      const aaplRow = screen.getByText('AAPL').closest('div');
      expect(aaplRow).toHaveClass('border-emerald-700/40');
    });

    it('shows time of day label (BMO/AMC)', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockEarningsResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('After Close')).toBeInTheDocument();
      });

      expect(screen.getByText('Before Open')).toBeInTheDocument();
    });
  });

  describe('Past Tab - EPS Actual & Beat/Miss', () => {
    it('shows past earnings with EPS Actual column and Beat/Miss badges', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockPastResponse);

      render(<EarningsCalendar />);

      // Click past tab
      const pastTab = screen.getByRole('button', { name: /past/i });
      fireEvent.click(pastTab);

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      // EPS Actual column should be visible in past tab
      expect(screen.getByText('Beat')).toBeInTheDocument();
      expect(screen.getByText('Miss')).toBeInTheDocument();
    });

    it('correctly calculates Beat badge when actual > estimate', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockPastResponse);

      render(<EarningsCalendar />);

      const pastTab = screen.getByRole('button', { name: /past/i });
      fireEvent.click(pastTab);

      await waitFor(() => {
        expect(screen.getByText('Beat')).toBeInTheDocument();
      });

      // AAPL beat (2.18 > 2.1)
      const beatBadge = screen.getByText('Beat');
      expect(beatBadge).toHaveClass('bg-emerald-500/20');
    });

    it('correctly calculates Miss badge when actual < estimate', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockPastResponse);

      render(<EarningsCalendar />);

      const pastTab = screen.getByRole('button', { name: /past/i });
      fireEvent.click(pastTab);

      await waitFor(() => {
        expect(screen.getByText('Miss')).toBeInTheDocument();
      });

      // GOOGL miss (1.75 < 1.8)
      const missBadge = screen.getByText('Miss');
      expect(missBadge).toHaveClass('bg-red-500/20');
    });

    it('does not show EPS Actual column in upcoming tab', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockEarningsResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      // Upcoming tab should not have Beat/Miss badges
      expect(screen.queryByText('Beat')).not.toBeInTheDocument();
      expect(screen.queryByText('Miss')).not.toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows skeleton loaders while fetching data', () => {
      (api.getEarnings as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mockEarningsResponse), 200);
          })
      );

      const { container } = render(<EarningsCalendar />);

      // Skeleton should be present
      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('displays error message when API fails', async () => {
      (api.getEarnings as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load earnings data')).toBeInTheDocument();
      });
    });

    it('shows error even if previous data exists', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValueOnce(mockEarningsResponse);

      const { rerender } = render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      // Simulate error on next fetch
      (api.getEarnings as jest.Mock).mockRejectedValueOnce(new Error('API error'));

      // Change tab to trigger new fetch
      const pastTab = screen.getByRole('button', { name: /past/i });
      fireEvent.click(pastTab);

      await waitFor(() => {
        expect(screen.getByText('Failed to load earnings data')).toBeInTheDocument();
      });
    });
  });

  describe('Empty Data State', () => {
    it('shows empty state for upcoming when no events in window', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue({
        events: [],
        stale: false,
        as_of: '2025-02-27T10:00:00Z',
      });

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(
          screen.getByText(/No upcoming earnings in the next/i)
        ).toBeInTheDocument();
      });
    });

    it('shows empty state for past when no events in window', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue({
        events: [],
        stale: false,
        as_of: '2025-02-27T10:00:00Z',
      });

      render(<EarningsCalendar />);

      const pastTab = screen.getByRole('button', { name: /past/i });
      fireEvent.click(pastTab);

      await waitFor(() => {
        expect(screen.getByText(/No past earnings in the last/i)).toBeInTheDocument();
      });
    });
  });

  describe('Watchlist Filter', () => {
    it('filters to watchlist only when toggle clicked', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockEarningsResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
        expect(screen.getByText('MSFT')).toBeInTheDocument();
      });

      // Click watchlist filter button
      const watchlistBtn = screen.getByRole('button', { name: /watchlist/i });
      fireEvent.click(watchlistBtn);

      // After filtering, only AAPL (on_watchlist=true) should be visible
      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
        expect(screen.queryByText('MSFT')).not.toBeInTheDocument();
      });
    });

    it('shows watchlist-specific empty state when filtered', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue({
        events: [
          {
            id: 1,
            ticker: 'NVDA',
            company: 'NVIDIA Corp.',
            earnings_date: '2025-03-10',
            time_of_day: 'BMO' as const,
            eps_estimate: 4.2,
            eps_actual: null,
            revenue_estimate: 28.0e9,
            revenue_actual: null,
            fiscal_quarter: 'Q1 2025',
            fetched_at: '2025-02-27T10:00:00Z',
            updated_at: '2025-02-27T10:00:00Z',
            on_watchlist: false, // Not on watchlist
          },
        ],
        stale: false,
        as_of: '2025-02-27T10:00:00Z',
      });

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('NVDA')).toBeInTheDocument();
      });

      // Click watchlist filter
      const watchlistBtn = screen.getByRole('button', { name: /watchlist/i });
      fireEvent.click(watchlistBtn);

      // Should show watchlist-specific empty state
      await waitFor(() => {
        expect(
          screen.getByText(/No watchlist earnings in the next/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('Days Range Control', () => {
    it('fetches with different day ranges when dropdown changes', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockEarningsResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(api.getEarnings).toHaveBeenCalledWith(14, 'upcoming');
      });

      // Change to 30 days
      const daysSelect = screen.getByDisplayValue('14 days') as HTMLSelectElement;
      fireEvent.change(daysSelect, { target: { value: '30' } });

      await waitFor(() => {
        expect(api.getEarnings).toHaveBeenCalledWith(30, 'upcoming');
      });
    });
  });

  describe('Staleness Indicator', () => {
    it('shows stale warning when data is old', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue({
        ...mockEarningsResponse,
        stale: true,
      });

      render(<EarningsCalendar />);

      await waitFor(() => {
        // AlertTriangle icon should be visible when stale=true
        expect(
          screen.getByTitle(/Data may be outdated/i)
        ).toBeInTheDocument();
      });
    });

    it('does not show stale warning when data is fresh', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue({
        ...mockEarningsResponse,
        stale: false,
      });

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      // Stale warning should not be present
      expect(screen.queryByTitle(/Data may be outdated/i)).not.toBeInTheDocument();
    });
  });

  describe('Refresh Button', () => {
    it('refetches data when refresh button clicked', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockEarningsResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(api.getEarnings).toHaveBeenCalledTimes(1);
      });

      // Click refresh button
      const refreshBtn = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshBtn);

      await waitFor(() => {
        expect(api.getEarnings).toHaveBeenCalledTimes(2);
      });
    });
  });
});
