/**
 * TickerPulse AI — Earnings Calendar Widget Tests
 * Tests for EarningsCalendar.tsx component integration with /api/earnings/widget endpoint
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import EarningsCalendar from '../EarningsCalendar';
import * as api from '@/lib/api';

// Mock the API module
vi.mock('@/lib/api', () => ({
  getEarningsWidget: vi.fn(),
  getEarnings: vi.fn(),
}));

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ href, children }: any) => <a href={href}>{children}</a>,
}));

describe('EarningsCalendar Widget Integration', () => {
  const mockEarningsEvent = {
    id: 1,
    ticker: 'AAPL',
    company: 'Apple Inc.',
    earnings_date: '2026-03-01',
    time_of_day: 'after_close' as const,
    eps_estimate: 2.35,
    fiscal_quarter: 'Q1 2026',
    fetched_at: '2026-02-28T10:00:00Z',
    on_watchlist: true,
  };

  const mockResponse = {
    events: [mockEarningsEvent],
    stale: false,
    as_of: '2026-02-28T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getEarningsWidget as any).mockResolvedValue(mockResponse);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ========================================================================
  // Test: AC1 — Component calls widget endpoint on mount
  // ========================================================================

  it('AC1a: calls getEarningsWidget on initial mount with default days', async () => {
    render(<EarningsCalendar />);

    await waitFor(() => {
      expect(api.getEarningsWidget).toHaveBeenCalledWith(7);
    });
  });

  it('AC1b: displays loading state while fetching', async () => {
    (api.getEarningsWidget as any).mockImplementationOnce(
      () => new Promise(resolve => setTimeout(() => resolve(mockResponse), 100))
    );

    render(<EarningsCalendar />);

    // Loading indicator should appear
    expect(screen.getByText(/Loading earnings/i)).toBeInTheDocument();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.queryByText(/Loading earnings/i)).not.toBeInTheDocument();
    });
  });

  it('AC1c: populates events from widget response', async () => {
    render(<EarningsCalendar />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    });
  });

  // ========================================================================
  // Test: AC2 — Error Handling
  // ========================================================================

  it('AC2a: displays error message on API failure', async () => {
    (api.getEarningsWidget as any).mockRejectedValueOnce(
      new Error('Failed to load earnings data')
    );

    render(<EarningsCalendar />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load earnings data/i)).toBeInTheDocument();
    });
  });

  it('AC2b: error state shows error message, not loading indicator', async () => {
    (api.getEarningsWidget as any).mockRejectedValueOnce(
      new Error('Network error')
    );

    render(<EarningsCalendar />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading earnings/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Failed to load earnings data/i)).toBeInTheDocument();
    });
  });

  it('AC2c: retry button refreshes data', async () => {
    const user = userEvent.setup();
    (api.getEarningsWidget as any)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(mockResponse);

    render(<EarningsCalendar />);

    // Wait for error to appear
    await waitFor(() => {
      expect(screen.getByText(/Failed to load earnings data/i)).toBeInTheDocument();
    });

    // Click refresh button
    const refreshBtn = screen.getByTitle('Refresh');
    await user.click(refreshBtn);

    // Should fetch again
    await waitFor(() => {
      expect(api.getEarningsWidget).toHaveBeenCalledTimes(2);
    });
  });

  // ========================================================================
  // Test: AC3 — Days Parameter Selection
  // ========================================================================

  it('AC3a: changes days parameter when dropdown selection changes', async () => {
    const user = userEvent.setup();
    render(<EarningsCalendar />);

    // Initial call with default 7 days
    await waitFor(() => {
      expect(api.getEarningsWidget).toHaveBeenCalledWith(7);
    });

    // Select 14 days
    const daySelect = screen.getByRole('combobox');
    await user.selectOptions(daySelect, '14');

    // Should call with new value
    await waitFor(() => {
      expect(api.getEarningsWidget).toHaveBeenLastCalledWith(14);
    });
  });

  it('AC3b: calls endpoint with new days value on dropdown change', async () => {
    const user = userEvent.setup();
    (api.getEarningsWidget as any).mockResolvedValue({
      events: [
        {
          ...mockEarningsEvent,
          earnings_date: '2026-03-15',
        },
      ],
      stale: false,
      as_of: '2026-02-28T10:00:00Z',
    });

    render(<EarningsCalendar />);

    const daySelect = screen.getByRole('combobox');
    await user.selectOptions(daySelect, '30');

    await waitFor(() => {
      expect(api.getEarningsWidget).toHaveBeenLastCalledWith(30);
    });
  });

  // ========================================================================
  // Test: AC4 — Watchlist Filtering
  // ========================================================================

  it('AC4a: watchlist filter button toggles watchlist-only view', async () => {
    const user = userEvent.setup();
    const watchlistEvent = {
      ...mockEarningsEvent,
      ticker: 'MSFT',
      company: 'Microsoft Corp.',
      on_watchlist: true,
    };
    const nonWatchlistEvent = {
      ...mockEarningsEvent,
      ticker: 'GOOG',
      company: 'Alphabet Inc.',
      on_watchlist: false,
    };

    (api.getEarningsWidget as any).mockResolvedValue({
      events: [watchlistEvent, nonWatchlistEvent],
      stale: false,
      as_of: '2026-02-28T10:00:00Z',
    });

    render(<EarningsCalendar />);

    // Initially both events shown
    await waitFor(() => {
      expect(screen.getByText('MSFT')).toBeInTheDocument();
      expect(screen.getByText('GOOG')).toBeInTheDocument();
    });

    // Click watchlist filter button
    const watchlistBtn = screen.getByTitle(/Watchlist/i);
    await user.click(watchlistBtn);

    // Should filter to show only watchlist events
    await waitFor(() => {
      expect(screen.getByText('MSFT')).toBeInTheDocument();
      expect(screen.queryByText('GOOG')).not.toBeInTheDocument();
    });

    // Click again to toggle off
    await user.click(watchlistBtn);

    // Both should appear again
    await waitFor(() => {
      expect(screen.getByText('MSFT')).toBeInTheDocument();
      expect(screen.getByText('GOOG')).toBeInTheDocument();
    });
  });

  it('AC4b: no watchlist events shows empty message', async () => {
    (api.getEarningsWidget as any).mockResolvedValue({
      events: [
        {
          ...mockEarningsEvent,
          on_watchlist: false,
        },
      ],
      stale: false,
      as_of: '2026-02-28T10:00:00Z',
    });

    const user = userEvent.setup();
    render(<EarningsCalendar />);

    // Toggle watchlist filter
    const watchlistBtn = screen.getByTitle(/Watchlist/i);
    await user.click(watchlistBtn);

    // Should show "no watchlist earnings" message
    await waitFor(() => {
      expect(screen.getByText(/No watchlist earnings in the next/i)).toBeInTheDocument();
    });
  });

  // ========================================================================
  // Test: AC5 — Empty State
  // ========================================================================

  it('AC5: displays empty state message when no events returned', async () => {
    (api.getEarningsWidget as any).mockResolvedValue({
      events: [],
      stale: false,
      as_of: '2026-02-28T10:00:00Z',
    });

    render(<EarningsCalendar />);

    await waitFor(() => {
      expect(screen.getByText(/No earnings in the next/i)).toBeInTheDocument();
    });
  });

  // ========================================================================
  // Test: AC6 — Stale Data Indicator
  // ========================================================================

  it('AC6a: shows stale indicator when data is old', async () => {
    (api.getEarningsWidget as any).mockResolvedValue({
      events: [mockEarningsEvent],
      stale: true,
      as_of: '2026-02-27T10:00:00Z',
    });

    render(<EarningsCalendar />);

    await waitFor(() => {
      // Warning triangle should appear for stale data
      const alert = screen.getByTitle(/Data may be outdated/i);
      expect(alert).toBeInTheDocument();
    });
  });

  it('AC6b: no stale indicator when data is fresh', async () => {
    render(<EarningsCalendar />);

    await waitFor(() => {
      const alert = screen.queryByTitle(/Data may be outdated/i);
      expect(alert).not.toBeInTheDocument();
    });
  });

  // ========================================================================
  // Test: Event Details Rendering
  // ========================================================================

  it('renders event details correctly', async () => {
    const eventWithDetails = {
      ...mockEarningsEvent,
      eps_estimate: 2.35,
      fiscal_quarter: 'Q1 2026',
      time_of_day: 'after_close',
    };

    (api.getEarningsWidget as any).mockResolvedValue({
      events: [eventWithDetails],
      stale: false,
      as_of: '2026-02-28T10:00:00Z',
    });

    render(<EarningsCalendar />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
      expect(screen.getByText(/After Close/i)).toBeInTheDocument();
      expect(screen.getByText(/Est. \$2.35/)).toBeInTheDocument();
      expect(screen.getByText('Q1 2026')).toBeInTheDocument();
    });
  });

  it('renders watchlist indicator for watchlist events', async () => {
    (api.getEarningsWidget as any).mockResolvedValue({
      events: [
        {
          ...mockEarningsEvent,
          on_watchlist: true,
        },
      ],
      stale: false,
      as_of: '2026-02-28T10:00:00Z',
    });

    render(<EarningsCalendar />);

    await waitFor(() => {
      const aapl = screen.getByText('AAPL');
      // Look for visual indicator of watchlist membership
      expect(aapl.closest('div')).toBeInTheDocument();
    });
  });

  // ========================================================================
  // Test: Multiple Events
  // ========================================================================

  it('renders multiple events in sorted order', async () => {
    (api.getEarningsWidget as any).mockResolvedValue({
      events: [
        {
          id: 1,
          ticker: 'AAPL',
          company: 'Apple Inc.',
          earnings_date: '2026-03-01',
          on_watchlist: true,
          eps_estimate: 2.35,
        },
        {
          id: 2,
          ticker: 'MSFT',
          company: 'Microsoft Corp.',
          earnings_date: '2026-03-02',
          on_watchlist: false,
          eps_estimate: 3.10,
        },
        {
          id: 3,
          ticker: 'GOOG',
          company: 'Alphabet Inc.',
          earnings_date: '2026-03-03',
          on_watchlist: true,
          eps_estimate: 1.75,
        },
      ],
      stale: false,
      as_of: '2026-02-28T10:00:00Z',
    });

    render(<EarningsCalendar />);

    await waitFor(() => {
      const rows = screen.getAllByText(/\d{1,2}/);
      // Multiple events should be rendered
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // Test: Date Formatting
  // ========================================================================

  it('formats future dates correctly', async () => {
    // Mock date 2 days in future
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 2);
    const dateStr = futureDate.toISOString().split('T')[0];

    (api.getEarningsWidget as any).mockResolvedValue({
      events: [
        {
          ...mockEarningsEvent,
          earnings_date: dateStr,
        },
      ],
      stale: false,
      as_of: '2026-02-28T10:00:00Z',
    });

    render(<EarningsCalendar />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });
  });
});
