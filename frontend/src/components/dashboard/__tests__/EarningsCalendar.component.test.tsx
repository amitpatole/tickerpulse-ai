```tsx
/**
 * EarningsCalendar — Component Structure Tests
 *
 * Covers:
 * - AC1: Upcoming tab selected by default, dates and time labels rendered
 * - AC2: Tab switching updates visible events
 * - AC3: Error string displayed when useEarnings returns an error
 * - AC4: Loading skeleton visible while isLoading=true
 * - AC5: Empty state message when no events in current tab
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import EarningsCalendar from '../EarningsCalendar';
import { useEarnings, type UseEarningsResult } from '@/hooks/useEarnings';

jest.mock('@/hooks/useEarnings');
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

const mockUseEarnings = useEarnings as jest.MockedFunction<typeof useEarnings>;

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

const baseEvent = {
  fetched_at: '2026-02-27T10:00:00Z',
  updated_at: '2026-02-27T10:00:00Z',
  on_watchlist: false,
  eps_estimate: null,
  eps_actual: null,
  revenue_estimate: null,
  revenue_actual: null,
  fiscal_quarter: null,
  time_of_day: null,
  company: null,
} as const;

const upcomingEvent = {
  ...baseEvent,
  id: 1,
  ticker: 'AAPL',
  company: 'Apple Inc.',
  earnings_date: '2026-03-15',
  time_of_day: 'BMO' as const,
  eps_estimate: 1.48,
  on_watchlist: true,
  fiscal_quarter: 'Q1 2026',
};

const pastEvent = {
  ...baseEvent,
  id: 2,
  ticker: 'MSFT',
  company: 'Microsoft Corp.',
  earnings_date: '2026-01-15',
  time_of_day: 'AMC' as const,
  eps_estimate: 2.93,
  eps_actual: 3.02,
  on_watchlist: false,
  fiscal_quarter: 'Q2 2025',
};

const emptyResult: UseEarningsResult = {
  upcoming: [],
  past: [],
  stale: false,
  isLoading: false,
  error: null,
  refetch: jest.fn(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withData(overrides: Partial<UseEarningsResult>): UseEarningsResult {
  return { ...emptyResult, ...overrides, refetch: jest.fn() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EarningsCalendar — Component Structure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // AC1: Upcoming tab default + date and time label rendering
  // -------------------------------------------------------------------------

  test('AC1: upcoming tab is active by default and shows event data', async () => {
    mockUseEarnings.mockReturnValue(
      withData({ upcoming: [upcomingEvent] }),
    );

    render(<EarningsCalendar />);

    // Verify upcoming content is visible by default
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
      expect(screen.getByText('Before Open')).toBeInTheDocument();
      expect(screen.getByText('Q1 2026')).toBeInTheDocument();
    });
  });

  test('AC1: count badge on upcoming tab reflects number of upcoming events', async () => {
    mockUseEarnings.mockReturnValue(
      withData({ upcoming: [upcomingEvent, { ...upcomingEvent, id: 9, ticker: 'NVDA' }] }),
    );

    render(<EarningsCalendar />);

    await waitFor(() => {
      // Count badge next to the "upcoming" tab label
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // AC2: Tab switching
  // -------------------------------------------------------------------------

  test('AC2: clicking the past tab shows past events and hides upcoming events', async () => {
    mockUseEarnings.mockReturnValue(
      withData({ upcoming: [upcomingEvent], past: [pastEvent] }),
    );

    render(<EarningsCalendar />);

    // Initially upcoming tab is shown
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });
    expect(screen.queryByText('MSFT')).not.toBeInTheDocument();

    // Switch to past
    fireEvent.click(screen.getByRole('button', { name: /past/i }));

    await waitFor(() => {
      expect(screen.getByText('MSFT')).toBeInTheDocument();
    });
    expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
  });

  test('AC2: past tab shows EPS Actual and revenue columns', async () => {
    mockUseEarnings.mockReturnValue(withData({ past: [pastEvent] }));

    render(<EarningsCalendar />);

    fireEvent.click(screen.getByRole('button', { name: /past/i }));

    await waitFor(() => {
      expect(screen.getByText('EPS Actual')).toBeInTheDocument();
      expect(screen.getByText('Rev Est.')).toBeInTheDocument();
      expect(screen.getByText('Rev Actual')).toBeInTheDocument();
    });
  });

  test('AC2: upcoming tab does not show revenue columns', async () => {
    mockUseEarnings.mockReturnValue(withData({ upcoming: [upcomingEvent] }));

    render(<EarningsCalendar />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    expect(screen.queryByText('Rev Est.')).not.toBeInTheDocument();
    expect(screen.queryByText('Rev Actual')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // AC3: Error state
  // -------------------------------------------------------------------------

  test('AC3: displays error message string when useEarnings returns an error', async () => {
    mockUseEarnings.mockReturnValue(
      withData({ error: 'Failed to load earnings data' }),
    );

    render(<EarningsCalendar />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load earnings data/i)).toBeInTheDocument();
    });
  });

  test('AC3: error state does not show event rows', async () => {
    mockUseEarnings.mockReturnValue(
      withData({ error: 'Network timeout', upcoming: [upcomingEvent] }),
    );

    render(<EarningsCalendar />);

    await waitFor(() => {
      expect(screen.getByText(/Network timeout/i)).toBeInTheDocument();
    });

    // Content rows must not be rendered during error state
    expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // AC4: Loading skeleton
  // -------------------------------------------------------------------------

  test('AC4: loading skeleton is visible while isLoading=true', () => {
    mockUseEarnings.mockReturnValue(withData({ isLoading: true }));

    const { container } = render(<EarningsCalendar />);

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    // Skeleton pulse elements rendered
    const pulseEls = container.querySelectorAll('.animate-pulse');
    expect(pulseEls.length).toBeGreaterThan(0);
  });

  test('AC4: skeleton disappears after data loads', async () => {
    mockUseEarnings.mockReturnValue(withData({ upcoming: [upcomingEvent] }));

    const { container } = render(<EarningsCalendar />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    expect(container.querySelector('[aria-busy="true"]')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // AC5: Empty state
  // -------------------------------------------------------------------------

  test('AC5: shows upcoming empty state message when upcoming list is empty', async () => {
    mockUseEarnings.mockReturnValue(emptyResult);

    render(<EarningsCalendar />);

    await waitFor(() => {
      expect(
        screen.getByText(/No upcoming earnings in the next/i),
      ).toBeInTheDocument();
    });
  });

  test('AC5: shows past empty state message when past list is empty', async () => {
    mockUseEarnings.mockReturnValue(emptyResult);

    render(<EarningsCalendar />);

    fireEvent.click(screen.getByRole('button', { name: /past/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/No past earnings in the last/i),
      ).toBeInTheDocument();
    });
  });

  test('AC5: shows watchlist-scoped empty state when watchlistOnly filter is active and no results match', async () => {
    mockUseEarnings.mockReturnValue(
      withData({
        upcoming: [{ ...upcomingEvent, on_watchlist: false }],
      }),
    );

    render(<EarningsCalendar />);

    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /watchlist/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/No watchlist earnings in the next/i),
      ).toBeInTheDocument();
    });
  });
});
```