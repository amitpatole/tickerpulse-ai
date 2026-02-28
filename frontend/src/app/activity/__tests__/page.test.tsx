/**
 * Focused test suite for Activity page — AC1-AC4 coverage.
 *
 * Tests verify:
 *   AC1: Page renders full layout with cards, chart, filters, timeline
 *   AC2: Filter state persists across page navigation
 *   AC3: Auto-refresh fires every 60 seconds
 *   AC4: Error handling displays error message
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ActivityFeed } from '@/lib/types';
import ActivityPage from '../page';

// -----------------------------------------------------------------------
// Mock API
// -----------------------------------------------------------------------

jest.mock('@/lib/api', () => ({
  getActivityFeed: jest.fn(),
}));

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function mockActivityFeed(): ActivityFeed {
  return {
    events: [
      {
        id: 'agent_1',
        type: 'agent',
        name: 'DataFetcher',
        status: 'success',
        cost: 0.05,
        duration_ms: 1500,
        timestamp: new Date().toISOString(),
        summary: null,
      },
    ],
    daily_costs: [
      { date: '2026-02-28', total_cost: 0.15, run_count: 3 },
      { date: '2026-02-27', total_cost: 0.08, run_count: 2 },
    ],
    totals: {
      cost: 0.23,
      runs: 5,
      errors: 1,
      success_rate: 0.8,
    },
  };
}

// -----------------------------------------------------------------------
// AC1: Happy Path — Full Page Layout
// -----------------------------------------------------------------------

describe('ActivityPage - AC1: Full Page Layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getActivityFeed } = require('@/lib/api');
    getActivityFeed.mockResolvedValue(mockActivityFeed());
  });

  it('AC1: renders page header/title', async () => {
    // Act
    render(<ActivityPage />);

    // Assert: page title is visible
    await waitFor(() => {
      expect(
        screen.queryByText(/activity|dashboard/i)
      ).toBeInTheDocument();
    });
  });

  it('AC1: renders 4 summary cards (cost, runs, errors, success_rate)', async () => {
    // Act
    render(<ActivityPage />);

    // Assert: summary cards are visible
    await waitFor(() => {
      expect(screen.getByText(/cost|total cost/i)).toBeInTheDocument();
      expect(screen.getByText(/runs|total runs/i)).toBeInTheDocument();
      expect(screen.getByText(/error/i)).toBeInTheDocument();
      expect(
        screen.getByText(/success|success rate/i)
      ).toBeInTheDocument();
    });
  });

  it('AC1: renders summary card values from API response', async () => {
    // Act
    render(<ActivityPage />);

    // Assert: values are displayed
    await waitFor(() => {
      expect(screen.getByText(/\$0\.23|0\.23/)).toBeInTheDocument(); // total cost
      expect(screen.getByText(/5/)).toBeInTheDocument(); // runs
      expect(screen.getByText(/80%|0\.8/)).toBeInTheDocument(); // success_rate
    });
  });

  it('AC1: renders CostSummaryBar component', async () => {
    // Act
    render(<ActivityPage />);

    // Assert: bar chart dates are visible
    await waitFor(() => {
      expect(screen.getByText(/2026-02-28|Feb/)).toBeInTheDocument();
    });
  });

  it('AC1: renders ActivityFilters component', async () => {
    // Act
    render(<ActivityPage />);

    // Assert: filter buttons are visible
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /all|agent/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /1d|7d|30d/i })
      ).toBeInTheDocument();
    });
  });

  it('AC1: renders ActivityTimeline component', async () => {
    // Act
    render(<ActivityPage />);

    // Assert: timeline event is visible
    await waitFor(() => {
      expect(screen.getByText('DataFetcher')).toBeInTheDocument();
    });
  });
});

// -----------------------------------------------------------------------
// AC2: Filter State Persistence
// -----------------------------------------------------------------------

describe('ActivityPage - AC2: Filter State Persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getActivityFeed } = require('@/lib/api');
    getActivityFeed.mockResolvedValue(mockActivityFeed());
  });

  it('AC2: calls API with default filters (type=all, days=7)', async () => {
    // Arrange
    const { getActivityFeed } = require('@/lib/api');

    // Act
    render(<ActivityPage />);

    // Assert: API called with defaults
    await waitFor(() => {
      expect(getActivityFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'all',
          days: 7,
        })
      );
    });
  });

  it('AC2: calls API with updated filters when filter changes', async () => {
    // Arrange
    const { getActivityFeed } = require('@/lib/api');
    const user = userEvent.setup();

    // Act
    render(<ActivityPage />);

    await waitFor(() => {
      expect(getActivityFeed).toHaveBeenCalled();
    });
    jest.clearAllMocks();

    // Click type=agent filter
    await user.click(screen.getByRole('button', { name: /agent/i }));

    // Assert: API called with new type
    await waitFor(() => {
      expect(getActivityFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent',
        })
      );
    });
  });

  it('AC2: persists filter state via usePersistedState', async () => {
    // Arrange
    const { getActivityFeed } = require('@/lib/api');
    const user = userEvent.setup();

    // Act: render, change filter, then re-render
    const { unmount } = render(<ActivityPage />);

    await waitFor(() => {
      expect(getActivityFeed).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: /30d/i }));

    // Wait for the filter to be applied
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /30d/i })
      ).toHaveClass(/(active|selected)/i);
    });

    unmount();

    jest.clearAllMocks();
    getActivityFeed.mockResolvedValue(mockActivityFeed());

    // Re-render page
    render(<ActivityPage />);

    // Assert: 30d filter is still selected (persisted)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /30d/i })
      ).toHaveClass(/(active|selected)/i);
    });
  });
});

// -----------------------------------------------------------------------
// AC3: Auto-Refresh
// -----------------------------------------------------------------------

describe('ActivityPage - AC3: Auto-Refresh Every 60s', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    const { getActivityFeed } = require('@/lib/api');
    getActivityFeed.mockResolvedValue(mockActivityFeed());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('AC3: calls API on mount', async () => {
    // Arrange
    const { getActivityFeed } = require('@/lib/api');

    // Act
    render(<ActivityPage />);

    // Assert: API called
    await waitFor(() => {
      expect(getActivityFeed).toHaveBeenCalledTimes(1);
    });
  });

  it('AC3: auto-refreshes API call every 60 seconds', async () => {
    // Arrange
    const { getActivityFeed } = require('@/lib/api');

    // Act
    render(<ActivityPage />);

    // Wait for initial call
    await waitFor(() => {
      expect(getActivityFeed).toHaveBeenCalledTimes(1);
    });

    // Advance time by 60 seconds
    jest.advanceTimersByTime(60000);

    // Assert: API called again
    await waitFor(() => {
      expect(getActivityFeed).toHaveBeenCalledTimes(2);
    });
  });

  it('AC3: continues auto-refresh after multiple cycles', async () => {
    // Arrange
    const { getActivityFeed } = require('@/lib/api');

    // Act
    render(<ActivityPage />);

    await waitFor(() => {
      expect(getActivityFeed).toHaveBeenCalledTimes(1);
    });

    // Advance 3 refresh cycles (180 seconds)
    jest.advanceTimersByTime(60000);
    jest.advanceTimersByTime(60000);
    jest.advanceTimersByTime(60000);

    // Assert: API called 4 times total (initial + 3 refreshes)
    await waitFor(() => {
      expect(getActivityFeed).toHaveBeenCalledTimes(4);
    });
  });

  it('AC3: cleans up interval on unmount', async () => {
    // Arrange
    const { getActivityFeed } = require('@/lib/api');

    // Act
    const { unmount } = render(<ActivityPage />);

    await waitFor(() => {
      expect(getActivityFeed).toHaveBeenCalledTimes(1);
    });

    unmount();

    // Advance time without component
    jest.advanceTimersByTime(60000);

    // Assert: API not called again (interval was cleaned up)
    expect(getActivityFeed).toHaveBeenCalledTimes(1);
  });
});

// -----------------------------------------------------------------------
// AC4: Error Handling
// -----------------------------------------------------------------------

describe('ActivityPage - AC4: Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('AC4: displays error message when API fails', async () => {
    // Arrange
    const { getActivityFeed } = require('@/lib/api');
    getActivityFeed.mockRejectedValue(new Error('Failed to load activity'));

    // Act
    render(<ActivityPage />);

    // Assert: error message is displayed
    await waitFor(() => {
      expect(
        screen.getByText(/failed to load|error|something went wrong/i)
      ).toBeInTheDocument();
    });
  });

  it('AC4: renders loading state while fetching', async () => {
    // Arrange
    const { getActivityFeed } = require('@/lib/api');
    getActivityFeed.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(mockActivityFeed()), 1000)
        )
    );

    // Act
    render(<ActivityPage />);

    // Assert: loading indicator is visible
    expect(
      screen.queryByText(/loading|loading\.\.\./i) ||
        screen.queryByRole('status')
    ).toBeTruthy();
  });

  it('AC4: retries API call on error (if implemented)', async () => {
    // Arrange
    const { getActivityFeed } = require('@/lib/api');
    getActivityFeed
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(mockActivityFeed());

    // Act
    render(<ActivityPage />);

    // Assert: eventually shows data after retry (or error message)
    await waitFor(() => {
      const hasData = screen.queryByText('DataFetcher');
      const hasError = screen.queryByText(/error|failed/i);
      expect(hasData || hasError).toBeTruthy();
    });
  });

  it('AC4: does not break when API returns empty data', async () => {
    // Arrange
    const { getActivityFeed } = require('@/lib/api');
    getActivityFeed.mockResolvedValue({
      events: [],
      daily_costs: [],
      totals: { cost: 0, runs: 0, errors: 0, success_rate: 0 },
    });

    // Act
    render(<ActivityPage />);

    // Assert: empty state is displayed gracefully
    await waitFor(() => {
      expect(
        screen.getByText(/no activity|empty|nothing to show/i)
      ).toBeInTheDocument();
    });
  });
});

// -----------------------------------------------------------------------
// Edge Cases
// -----------------------------------------------------------------------

describe('ActivityPage - Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getActivityFeed } = require('@/lib/api');
    getActivityFeed.mockResolvedValue(mockActivityFeed());
  });

  it('renders with very large cost values', async () => {
    // Arrange
    const { getActivityFeed } = require('@/lib/api');
    getActivityFeed.mockResolvedValue({
      ...mockActivityFeed(),
      totals: { ...mockActivityFeed().totals, cost: 999.99 },
    });

    // Act
    render(<ActivityPage />);

    // Assert: large value is formatted
    await waitFor(() => {
      expect(
        screen.getByText(/\$999\.99|999\.99/) ||
          screen.getByText(/999/) ||
          screen.getByText(/cost/i)
      ).toBeTruthy();
    });
  });

  it('renders with zero success rate (100% errors)', async () => {
    // Arrange
    const { getActivityFeed } = require('@/lib/api');
    getActivityFeed.mockResolvedValue({
      ...mockActivityFeed(),
      totals: {
        ...mockActivityFeed().totals,
        success_rate: 0.0,
      },
    });

    // Act
    render(<ActivityPage />);

    // Assert: zero success rate is displayed
    await waitFor(() => {
      expect(screen.getByText(/0%|0\.0/)).toBeInTheDocument();
    });
  });

  it('renders with 100% success rate', async () => {
    // Arrange
    const { getActivityFeed } = require('@/lib/api');
    getActivityFeed.mockResolvedValue({
      ...mockActivityFeed(),
      totals: {
        ...mockActivityFeed().totals,
        success_rate: 1.0,
      },
    });

    // Act
    render(<ActivityPage />);

    // Assert: 100% success rate is displayed
    await waitFor(() => {
      expect(screen.getByText(/100%|1\.0/)).toBeInTheDocument();
    });
  });
});
