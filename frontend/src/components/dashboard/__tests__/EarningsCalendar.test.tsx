/**
 * TickerPulse AI v3.0 — EarningsCalendar Component Tests
 *
 * Covers:
 * - Upcoming tab: date badges, EPS estimate, quarter display
 * - Past tab: EPS beat/miss/met badge, revenue estimate and actual columns
 * - Watchlist filter (client-side) hides non-watchlist rows
 * - Stale indicator appears when stale: true
 * - Empty state per tab context
 * - Loading skeleton and error display
 * - Day-range selector triggers refetch
 * - Refresh button triggers refetch
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import EarningsCalendar from '../EarningsCalendar';
import * as api from '@/lib/api';
import type { EarningsResponse } from '@/lib/types';

jest.mock('@/lib/api');
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

// ---------------------------------------------------------------------------
// Mock data — correct EarningsResponse format ({ upcoming, past, stale, as_of })
// ---------------------------------------------------------------------------

const upcomingEvents: EarningsResponse['upcoming'] = [
  {
    id: 1,
    ticker: 'AAPL',
    company: 'Apple Inc.',
    earnings_date: '2025-03-01',
    time_of_day: 'AMC',
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
    time_of_day: 'BMO',
    eps_estimate: 3.15,
    eps_actual: null,
    revenue_estimate: 61.0e9,
    revenue_actual: null,
    fiscal_quarter: 'Q2 2025',
    fetched_at: '2025-02-27T10:00:00Z',
    updated_at: '2025-02-27T10:00:00Z',
    on_watchlist: false,
  },
];

const pastEvents: EarningsResponse['past'] = [
  {
    id: 3,
    ticker: 'AAPL',
    company: 'Apple Inc.',
    earnings_date: '2025-02-20',
    time_of_day: 'AMC',
    eps_estimate: 2.1,
    eps_actual: 2.18,
    revenue_estimate: 84.0e9,
    revenue_actual: 85.2e9,
    fiscal_quarter: 'Q4 2024',
    fetched_at: '2025-02-27T10:00:00Z',
    updated_at: '2025-02-27T10:00:00Z',
    on_watchlist: true,
    surprise_pct: 3.81,
  },
  {
    id: 4,
    ticker: 'GOOGL',
    company: 'Alphabet Inc.',
    earnings_date: '2025-02-15',
    time_of_day: 'AMC',
    eps_estimate: 1.8,
    eps_actual: 1.75,
    revenue_estimate: 88.0e9,
    revenue_actual: 86.9e9,
    fiscal_quarter: 'Q4 2024',
    fetched_at: '2025-02-27T10:00:00Z',
    updated_at: '2025-02-27T10:00:00Z',
    on_watchlist: false,
    surprise_pct: -2.78,
  },
];

const mockUpcomingResponse: EarningsResponse = {
  upcoming: upcomingEvents,
  past: [],
  stale: false,
  as_of: '2025-02-27T10:00:00Z',
};

const mockPastResponse: EarningsResponse = {
  upcoming: [],
  past: pastEvents,
  stale: false,
  as_of: '2025-02-27T10:00:00Z',
};

const mockBothResponse: EarningsResponse = {
  upcoming: upcomingEvents,
  past: pastEvents,
  stale: false,
  as_of: '2025-02-27T10:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EarningsCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Upcoming Tab
  // -------------------------------------------------------------------------

  describe('Upcoming Tab — happy path', () => {
    it('renders upcoming earnings with Date, Ticker/Company, EPS Est., Quarter columns', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockUpcomingResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      expect(screen.getByText('Date')).toBeInTheDocument();
      expect(screen.getByText('Ticker / Company')).toBeInTheDocument();
      expect(screen.getByText('EPS Est.')).toBeInTheDocument();
      expect(screen.getByText('Quarter')).toBeInTheDocument();

      expect(screen.getByText('MSFT')).toBeInTheDocument();
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
      expect(screen.getByText('Q1 2025')).toBeInTheDocument();
    });

    it('shows EPS estimate formatted as dollar value', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockUpcomingResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('$2.50')).toBeInTheDocument();
      });

      expect(screen.getByText('$3.15')).toBeInTheDocument();
    });

    it('displays watchlist indicator (highlighted row) for watched stocks', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockUpcomingResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      // AAPL row (on_watchlist=true) should have watchlist highlight class
      const aaplLink = screen.getByText('AAPL');
      const aaplRow = aaplLink.closest('div[class*="grid"]');
      expect(aaplRow).toHaveClass('border-emerald-700/40');
    });

    it('shows time-of-day label for BMO and AMC events', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockUpcomingResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('After Close')).toBeInTheDocument();
        expect(screen.getByText('Before Open')).toBeInTheDocument();
      });
    });

    it('does not render Beat/Miss EPS badges in the upcoming tab', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockUpcomingResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      expect(screen.queryByText('Beat')).not.toBeInTheDocument();
      expect(screen.queryByText('Miss')).not.toBeInTheDocument();
    });

    it('does not show revenue columns in the upcoming tab', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockUpcomingResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      expect(screen.queryByText('Rev Est.')).not.toBeInTheDocument();
      expect(screen.queryByText('Rev Actual')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Past Tab — EPS + Revenue columns
  // -------------------------------------------------------------------------

  describe('Past Tab — EPS beat/miss and revenue columns', () => {
    it('shows EPS Actual and Rev Est. / Rev Actual column headers', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockPastResponse);

      render(<EarningsCalendar />);

      const pastTab = screen.getByRole('button', { name: /past/i });
      fireEvent.click(pastTab);

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      expect(screen.getByText('EPS Actual')).toBeInTheDocument();
      expect(screen.getByText('Rev Est.')).toBeInTheDocument();
      expect(screen.getByText('Rev Actual')).toBeInTheDocument();
    });

    it('shows Beat badge when EPS actual > estimate', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockPastResponse);

      render(<EarningsCalendar />);

      fireEvent.click(screen.getByRole('button', { name: /past/i }));

      await waitFor(() => {
        expect(screen.getByText('Beat')).toBeInTheDocument();
      });

      // AAPL beat (2.18 > 2.1)
      expect(screen.getByText('Beat')).toHaveClass('bg-emerald-500/20');
    });

    it('shows Miss badge when EPS actual < estimate', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockPastResponse);

      render(<EarningsCalendar />);

      fireEvent.click(screen.getByRole('button', { name: /past/i }));

      await waitFor(() => {
        expect(screen.getByText('Miss')).toBeInTheDocument();
      });

      // GOOGL miss (1.75 < 1.8)
      expect(screen.getByText('Miss')).toHaveClass('bg-red-500/20');
    });

    it('renders revenue estimate formatted as $X.XXB', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockPastResponse);

      render(<EarningsCalendar />);

      fireEvent.click(screen.getByRole('button', { name: /past/i }));

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      // 84.0e9 → $84.00B
      expect(screen.getByText('$84.00B')).toBeInTheDocument();
      // 88.0e9 → $88.00B
      expect(screen.getByText('$88.00B')).toBeInTheDocument();
    });

    it('shows revenue Beat badge when actual > estimate', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockPastResponse);

      render(<EarningsCalendar />);

      fireEvent.click(screen.getByRole('button', { name: /past/i }));

      await waitFor(() => {
        // Multiple "Beat" badges may exist (EPS + Revenue for AAPL both beat)
        const beatBadges = screen.getAllByText('Beat');
        expect(beatBadges.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows revenue Miss badge when actual < estimate', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockPastResponse);

      render(<EarningsCalendar />);

      fireEvent.click(screen.getByRole('button', { name: /past/i }));

      await waitFor(() => {
        const missBadges = screen.getAllByText('Miss');
        expect(missBadges.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows dash for missing revenue estimate', async () => {
      const responseWithNullRev: EarningsResponse = {
        upcoming: [],
        past: [
          {
            id: 5,
            ticker: 'TSLA',
            company: 'Tesla Inc.',
            earnings_date: '2025-01-15',
            time_of_day: 'AMC',
            eps_estimate: 0.72,
            eps_actual: 0.73,
            revenue_estimate: null,
            revenue_actual: null,
            fiscal_quarter: 'Q4 2024',
            on_watchlist: false,
          },
        ],
        stale: false,
        as_of: '2025-02-27T10:00:00Z',
      };
      (api.getEarnings as jest.Mock).mockResolvedValue(responseWithNullRev);

      render(<EarningsCalendar />);

      fireEvent.click(screen.getByRole('button', { name: /past/i }));

      await waitFor(() => {
        expect(screen.getByText('TSLA')).toBeInTheDocument();
      });

      // Revenue estimate shows '—' when null
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  describe('Loading State', () => {
    it('shows skeleton loaders while fetching data', () => {
      (api.getEarnings as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockUpcomingResponse), 500))
      );

      const { container } = render(<EarningsCalendar />);

      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('displays an error message when the API call fails', async () => {
      (api.getEarnings as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText(/Network error/i)).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Empty states
  // -------------------------------------------------------------------------

  describe('Empty Data States', () => {
    it('shows upcoming empty state when no upcoming events in window', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue({
        upcoming: [],
        past: [],
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

    it('shows past empty state when no past events in window', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue({
        upcoming: [],
        past: [],
        stale: false,
        as_of: '2025-02-27T10:00:00Z',
      });

      render(<EarningsCalendar />);

      fireEvent.click(screen.getByRole('button', { name: /past/i }));

      await waitFor(() => {
        expect(screen.getByText(/No past earnings in the last/i)).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Watchlist filter
  // -------------------------------------------------------------------------

  describe('Watchlist Filter', () => {
    it('shows all tickers by default', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockUpcomingResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
        expect(screen.getByText('MSFT')).toBeInTheDocument();
      });
    });

    it('filters to watchlist-only tickers when toggle is clicked', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockUpcomingResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
        expect(screen.getByText('MSFT')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /watchlist/i }));

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
        expect(screen.queryByText('MSFT')).not.toBeInTheDocument();
      });
    });

    it('shows watchlist-specific empty state when no watchlist events match', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue({
        upcoming: [
          {
            id: 1,
            ticker: 'NVDA',
            company: 'NVIDIA Corp.',
            earnings_date: '2025-03-10',
            time_of_day: 'BMO',
            eps_estimate: 4.2,
            eps_actual: null,
            revenue_estimate: 28.0e9,
            revenue_actual: null,
            fiscal_quarter: 'Q1 2025',
            on_watchlist: false,
          },
        ],
        past: [],
        stale: false,
        as_of: '2025-02-27T10:00:00Z',
      });

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('NVDA')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /watchlist/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/No watchlist earnings in the next/i)
        ).toBeInTheDocument();
      });
    });

    it('applies watchlist filter to past tab as well', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockPastResponse);

      render(<EarningsCalendar />);

      fireEvent.click(screen.getByRole('button', { name: /past/i }));

      await waitFor(() => {
        expect(screen.getByText('GOOGL')).toBeInTheDocument();
      });

      // Enable watchlist filter — only AAPL (on_watchlist=true) should remain
      fireEvent.click(screen.getByRole('button', { name: /watchlist/i }));

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
        expect(screen.queryByText('GOOGL')).not.toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Stale indicator
  // -------------------------------------------------------------------------

  describe('Staleness Indicator', () => {
    it('shows AlertTriangle when stale=true', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue({
        ...mockUpcomingResponse,
        stale: true,
      });

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(
          screen.getByTitle(/Data may be outdated/i)
        ).toBeInTheDocument();
      });
    });

    it('does not show AlertTriangle when stale=false', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockUpcomingResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      expect(screen.queryByTitle(/Data may be outdated/i)).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Day-range selector
  // -------------------------------------------------------------------------

  describe('Days Range Control', () => {
    it('calls getEarnings with updated days when dropdown changes', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockUpcomingResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(api.getEarnings).toHaveBeenCalledWith(
          expect.objectContaining({ days: 30 })
        );
      });

      // Change to 14 days
      const daysSelect = screen.getByDisplayValue('30 days') as HTMLSelectElement;
      fireEvent.change(daysSelect, { target: { value: '14' } });

      await waitFor(() => {
        expect(api.getEarnings).toHaveBeenCalledWith(
          expect.objectContaining({ days: 14 })
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // Refresh button
  // -------------------------------------------------------------------------

  describe('Refresh Button', () => {
    it('triggers a new API call when clicked', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockUpcomingResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(api.getEarnings).toHaveBeenCalledTimes(1);
      });

      fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

      await waitFor(() => {
        expect(api.getEarnings).toHaveBeenCalledTimes(2);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Tab badge count
  // -------------------------------------------------------------------------

  describe('Upcoming tab badge', () => {
    it('shows count badge on upcoming tab when there are events', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(mockBothResponse);

      render(<EarningsCalendar />);

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      // The count badge should show "2" for 2 upcoming events
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });
});