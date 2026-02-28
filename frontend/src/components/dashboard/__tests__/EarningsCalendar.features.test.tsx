/**
 * EarningsCalendar — Feature Integration Tests
 *
 * Complementary tests for:
 * - AC2: Watchlist-only filter toggle
 * - AC3: Days window selector (7/14/30 days)
 * - AC4: EPS/Revenue Beat/Miss badges with indicators
 * - AC5: Stale data warning display
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import EarningsCalendar from '../EarningsCalendar';
import { useEarnings, UseEarningsResult } from '@/hooks/useEarnings';
import type { EarningsEvent } from '@/lib/types';

jest.mock('@/hooks/useEarnings');
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

const mockUseEarnings = useEarnings as jest.MockedFunction<typeof useEarnings>;

describe('EarningsCalendar — Feature Integration Tests', () => {
  // ---------------------------------------------------------------------------
  // Test Data Factory
  // ---------------------------------------------------------------------------

  const createEarningsEvent = (overrides = {}) => ({
    id: 1,
    ticker: 'AAPL',
    company: 'Apple Inc.',
    earnings_date: '2026-03-15',
    time_of_day: 'BMO' as const,
    eps_estimate: 1.50,
    eps_actual: null,
    revenue_estimate: 87.0e9,
    revenue_actual: null,
    fiscal_quarter: 'Q1 2026',
    fetched_at: '2026-02-27T10:00:00Z',
    updated_at: '2026-02-27T10:00:00Z',
    on_watchlist: false,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // AC2: Watchlist-Only Filter Toggle
  // ---------------------------------------------------------------------------

  test('AC2: watchlist-only toggle filters events, showing only on_watchlist=true items', async () => {
    // Setup: Mix of watchlist and non-watchlist upcoming events
    const watchlistEvent = createEarningsEvent({
      ticker: 'AAPL',
      on_watchlist: true,
    });
    const nonWatchlistEvent = createEarningsEvent({
      ticker: 'MSFT',
      on_watchlist: false,
    });

    mockUseEarnings.mockReturnValue({
      upcoming: [watchlistEvent, nonWatchlistEvent],
      past: [],
      stale: false,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    } as UseEarningsResult);

    render(<EarningsCalendar />);

    // Initially, both tickers visible
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('MSFT')).toBeInTheDocument();
    });

    // Click watchlist toggle
    const watchlistButton = screen.getByRole('button', { name: /watchlist/i });
    fireEvent.click(watchlistButton);

    // Now only watchlist ticker visible
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.queryByText('MSFT')).not.toBeInTheDocument();
    });

    // Toggle off — all tickers visible again
    fireEvent.click(watchlistButton);
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('MSFT')).toBeInTheDocument();
    });
  });

  test('Edge case: watchlist-only toggle with empty results shows filtered empty state message', async () => {
    mockUseEarnings.mockReturnValue({
      upcoming: [
        createEarningsEvent({
          ticker: 'MSFT',
          on_watchlist: false,
        }),
      ],
      past: [],
      stale: false,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    } as UseEarningsResult);

    render(<EarningsCalendar />);

    // Initially, event visible
    await waitFor(() => {
      expect(screen.getByText('MSFT')).toBeInTheDocument();
    });

    // Toggle watchlist filter
    const watchlistButton = screen.getByRole('button', { name: /watchlist/i });
    fireEvent.click(watchlistButton);

    // Should show empty state with watchlist-scoped message
    await waitFor(() => {
      expect(
        screen.getByText(/no watchlist earnings in the next/i)
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // AC3: Days Window Selector (7/14/30 days)
  // ---------------------------------------------------------------------------

  test('AC3: days selector (7/14/30) allows switching between time windows', async () => {
    mockUseEarnings.mockReturnValue({
      upcoming: [
        createEarningsEvent({
          id: 1,
          ticker: 'AAPL',
          earnings_date: '2026-03-05', // Within 7 days
        }),
      ],
      past: [],
      stale: false,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    } as UseEarningsResult);

    render(<EarningsCalendar />);

    // Initially showing 30 days (default)
    const daysSelect = screen.getByDisplayValue('30 days') as HTMLSelectElement;
    expect(daysSelect).toBeInTheDocument();

    // Select 7 days
    fireEvent.change(daysSelect, { target: { value: '7' } });

    // Verify select updated to 7 days
    await waitFor(() => {
      expect(screen.getByDisplayValue('7 days')).toBeInTheDocument();
    });

    // Select 14 days
    fireEvent.change(daysSelect, { target: { value: '14' } });

    await waitFor(() => {
      expect(screen.getByDisplayValue('14 days')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // AC4: EPS/Revenue Beat/Miss Badges
  // ---------------------------------------------------------------------------

  test('AC4: EPS Beat badge shows ChevronUp indicator when actual > estimate on past tab', async () => {
    const beatEvent = createEarningsEvent({
      earnings_date: '2026-01-15', // Past
      eps_estimate: 1.50,
      eps_actual: 1.75, // Beat: 1.75 > 1.50
    });

    mockUseEarnings.mockReturnValue({
      upcoming: [],
      past: [beatEvent],
      stale: false,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    } as UseEarningsResult);

    render(<EarningsCalendar />);

    // Switch to past tab
    const pastTab = screen.getByRole('button', { name: /past/i });
    fireEvent.click(pastTab);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      // Look for beat badge text and verify chevron-up is rendered
      const epsCell = screen.getByText(/1\.75/).closest('div');
      expect(epsCell).toBeInTheDocument();
      // Verify "Beat" label appears
      const beatLabel = screen.getByText(/beat/i);
      expect(beatLabel).toHaveClass('bg-emerald-500/20'); // Beat styling
    });
  });

  test('AC4: EPS Miss badge shows ChevronDown indicator when actual < estimate on past tab', async () => {
    const missEvent = createEarningsEvent({
      earnings_date: '2026-01-15', // Past
      eps_estimate: 1.50,
      eps_actual: 1.25, // Miss: 1.25 < 1.50
    });

    mockUseEarnings.mockReturnValue({
      upcoming: [],
      past: [missEvent],
      stale: false,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    } as UseEarningsResult);

    render(<EarningsCalendar />);

    // Switch to past tab
    const pastTab = screen.getByRole('button', { name: /past/i });
    fireEvent.click(pastTab);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      // Look for miss badge
      const missLabel = screen.getByText(/miss/i);
      expect(missLabel).toHaveClass('bg-red-500/20'); // Miss styling
    });
  });

  // ---------------------------------------------------------------------------
  // AC5: Stale Data Warning
  // ---------------------------------------------------------------------------

  test('AC5: stale data warning (AlertTriangle) displays when stale=true', async () => {
    mockUseEarnings.mockReturnValue({
      upcoming: [
        createEarningsEvent({
          earnings_date: '2026-03-15',
        }),
      ],
      past: [],
      stale: true, // Data is stale
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    } as UseEarningsResult);

    render(<EarningsCalendar />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    // Verify AlertTriangle icon is rendered with title about stale data
    const staleWarning = screen.getByTitle(
      /data may be outdated — last fetch was over 1 hour ago/i
    );
    expect(staleWarning).toBeInTheDocument();
  });

  test('Edge case: no stale warning when stale=false', async () => {
    mockUseEarnings.mockReturnValue({
      upcoming: [
        createEarningsEvent({
          earnings_date: '2026-03-15',
        }),
      ],
      past: [],
      stale: false, // Data is fresh
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    } as UseEarningsResult);

    render(<EarningsCalendar />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    // Verify stale warning is NOT present
    const staleWarning = screen.queryByTitle(
      /data may be outdated — last fetch was over 1 hour ago/i
    );
    expect(staleWarning).not.toBeInTheDocument();
  });
});
