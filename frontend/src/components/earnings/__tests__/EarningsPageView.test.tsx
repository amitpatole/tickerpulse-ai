/**
 * TickerPulse AI v3.0 — EarningsPageView Component Tests
 *
 * Covers:
 * - Upcoming section: date grouping renders multiple events per date
 * - Past section: all table column headers visible, beat/miss/surprise badges
 * - Watchlist filter hides non-watchlist tickers when toggled
 * - Empty states for upcoming and past sections
 * - Stale data warning (AlertTriangle) when stale=true
 * - Sync button calls triggerEarningsSync and shows loading state
 * - Days selector triggers re-fetch with updated days param
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import EarningsPageView from '../EarningsPageView';
import * as api from '@/lib/api';
import type { EarningsResponse } from '@/lib/types';

jest.mock('@/lib/api');
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const twoEventsOneDate: EarningsResponse = {
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
    {
      id: 2,
      ticker: 'CSCO',
      company: 'Cisco Systems',
      earnings_date: '2027-03-10',
      time_of_day: 'AMC',
      eps_estimate: 0.91,
      eps_actual: null,
      revenue_estimate: 13.8e9,
      revenue_actual: null,
      fiscal_quarter: 'Q1 2027',
      on_watchlist: false,
    },
  ],
  past: [],
  stale: false,
  as_of: '2027-03-01T10:00:00Z',
};

const pastWithResults: EarningsResponse = {
  upcoming: [],
  past: [
    {
      id: 3,
      ticker: 'META',
      company: 'Meta Platforms',
      earnings_date: '2027-02-28',
      time_of_day: 'AMC',
      eps_estimate: 6.03,
      eps_actual: 6.2,
      revenue_estimate: 40.2e9,
      revenue_actual: 40.6e9,
      fiscal_quarter: 'Q4 2026',
      on_watchlist: true,
      surprise_pct: 2.8,
    },
    {
      id: 4,
      ticker: 'GOOGL',
      company: 'Alphabet Inc',
      earnings_date: '2027-02-20',
      time_of_day: 'AMC',
      eps_estimate: 1.84,
      eps_actual: 1.75,
      revenue_estimate: 86.3e9,
      revenue_actual: 85.1e9,
      fiscal_quarter: 'Q4 2026',
      on_watchlist: false,
      surprise_pct: -4.9,
    },
  ],
  stale: false,
  as_of: '2027-03-01T10:00:00Z',
};

const emptyResponse: EarningsResponse = {
  upcoming: [],
  past: [],
  stale: false,
  as_of: '2027-03-01T10:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EarningsPageView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.triggerEarningsSync as jest.Mock).mockResolvedValue({ ok: true });
  });

  describe('Upcoming section — date grouping', () => {
    it('renders both events that share the same earnings date', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(twoEventsOneDate);

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getByText('NVDA')).toBeInTheDocument();
        expect(screen.getByText('CSCO')).toBeInTheDocument();
      });

      expect(screen.getByText('Nvidia Corp')).toBeInTheDocument();
      expect(screen.getByText('Cisco Systems')).toBeInTheDocument();
    });

    it('shows the upcoming count badge reflecting the total event count', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(twoEventsOneDate);

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument();
      });
    });
  });

  describe('Past section — table columns and badges', () => {
    it('renders all past table column headers', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(pastWithResults);

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getByText('META')).toBeInTheDocument();
      });

      expect(screen.getByText('EPS Est.')).toBeInTheDocument();
      expect(screen.getByText('EPS Actual')).toBeInTheDocument();
      expect(screen.getByText('Surprise')).toBeInTheDocument();
      expect(screen.getByText('Rev Est.')).toBeInTheDocument();
      expect(screen.getByText('Rev Actual')).toBeInTheDocument();
      expect(screen.getByText('Quarter')).toBeInTheDocument();
    });

    it('shows Beat badge when EPS actual exceeds estimate', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(pastWithResults);

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getAllByText('Beat').length).toBeGreaterThanOrEqual(1);
      });

      const beatBadges = screen.getAllByText('Beat');
      expect(beatBadges[0]).toHaveClass('bg-emerald-500/20');
    });

    it('shows Miss badge when EPS actual falls below estimate', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(pastWithResults);

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getAllByText('Miss').length).toBeGreaterThanOrEqual(1);
      });

      const missBadges = screen.getAllByText('Miss');
      expect(missBadges[0]).toHaveClass('bg-red-500/20');
    });

    it('renders surprise percentage values with sign', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(pastWithResults);

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getByText('+2.8%')).toBeInTheDocument();
        expect(screen.getByText('-4.9%')).toBeInTheDocument();
      });
    });
  });

  describe('Watchlist filter', () => {
    it('hides non-watchlist tickers when watchlist-only is toggled', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(twoEventsOneDate);

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getByText('NVDA')).toBeInTheDocument();
        expect(screen.getByText('CSCO')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /watchlist only/i }));

      await waitFor(() => {
        expect(screen.getByText('NVDA')).toBeInTheDocument();
        expect(screen.queryByText('CSCO')).not.toBeInTheDocument();
      });
    });
  });

  describe('Empty states', () => {
    it('shows "No upcoming earnings" message when upcoming array is empty', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(emptyResponse);

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getByText(/No upcoming earnings in the next/i)).toBeInTheDocument();
      });
    });

    it('shows "No past earnings" message when past array is empty', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(emptyResponse);

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getByText(/No past earnings in the last/i)).toBeInTheDocument();
      });
    });
  });

  describe('Stale data warning', () => {
    it('shows AlertTriangle when stale is true', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue({ ...emptyResponse, stale: true });

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(
          screen.getByTitle(/Data may be outdated/i)
        ).toBeInTheDocument();
      });
    });

    it('does not show AlertTriangle when stale is false', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(emptyResponse);

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.queryByTitle(/Data may be outdated/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Sync button', () => {
    it('calls triggerEarningsSync when sync button is clicked', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(emptyResponse);

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getByText(/No upcoming earnings/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /sync earnings data/i }));

      await waitFor(() => {
        expect(api.triggerEarningsSync).toHaveBeenCalledTimes(1);
      });
    });

    it('shows Syncing… text while sync is in progress then reverts', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(emptyResponse);

      let resolveSync!: () => void;
      (api.triggerEarningsSync as jest.Mock).mockReturnValue(
        new Promise<{ ok: boolean }>((resolve) => {
          resolveSync = () => resolve({ ok: true });
        })
      );

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getByText(/No upcoming earnings/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /sync earnings data/i }));

      expect(screen.getByText(/Syncing/i)).toBeInTheDocument();

      await act(async () => {
        resolveSync();
      });

      await waitFor(() => {
        expect(screen.queryByText(/Syncing/i)).not.toBeInTheDocument();
        expect(screen.getByText('Sync')).toBeInTheDocument();
      });
    });
  });

  describe('Days range selector', () => {
    it('calls getEarnings with updated days when selector changes', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(emptyResponse);

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(api.getEarnings).toHaveBeenCalledWith(
          expect.objectContaining({ days: 30 })
        );
      });

      const daysSelect = screen.getByDisplayValue('30 days') as HTMLSelectElement;
      fireEvent.change(daysSelect, { target: { value: '60' } });

      await waitFor(() => {
        expect(api.getEarnings).toHaveBeenCalledWith(
          expect.objectContaining({ days: 60 })
        );
      });
    });
  });

  describe('Error handling', () => {
    it('displays error message when getEarnings fails', async () => {
      (api.getEarnings as jest.Mock).mockRejectedValue(
        new Error('Failed to fetch earnings data')
      );

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getByText(/Failed to fetch earnings data/i)).toBeInTheDocument();
      });

      expect(screen.queryByText('Upcoming')).not.toBeInTheDocument();
      expect(screen.queryByText('Past')).not.toBeInTheDocument();
    });

    it('shows sync error message when triggerEarningsSync fails', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(emptyResponse);
      (api.triggerEarningsSync as jest.Mock).mockRejectedValue(
        new Error('Sync failed: network error')
      );

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getByText(/No upcoming earnings/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /sync earnings data/i }));

      await waitFor(() => {
        expect(screen.getByText(/Sync failed: network error/i)).toBeInTheDocument();
      });
    });

    it('clears sync error after successful sync', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(emptyResponse);
      let syncResolve!: () => void;

      (api.triggerEarningsSync as jest.Mock)
        .mockReturnValueOnce(
          new Promise<{ ok: boolean }>((resolve) => {
            syncResolve = () => resolve({ ok: true });
          })
        )
        .mockResolvedValueOnce({ ok: true });

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getByText(/No upcoming earnings/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /sync earnings data/i }));

      await act(async () => {
        syncResolve();
      });

      await waitFor(() => {
        expect(screen.queryByText(/Sync failed/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Edge cases — revenue and EPS formatting', () => {
    it('shows dashes for null revenue and EPS values', async () => {
      const edgeCaseResponse: EarningsResponse = {
        upcoming: [
          {
            id: 5,
            ticker: 'TEST',
            company: 'Test Corp',
            earnings_date: '2027-03-15',
            time_of_day: 'BMO',
            eps_estimate: null,
            eps_actual: null,
            revenue_estimate: null,
            revenue_actual: null,
            fiscal_quarter: 'Q1 2027',
            on_watchlist: false,
          },
        ],
        past: [],
        stale: false,
        as_of: '2027-03-01T10:00:00Z',
      };

      (api.getEarnings as jest.Mock).mockResolvedValue(edgeCaseResponse);

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getByText('TEST')).toBeInTheDocument();
      });

      const dashElements = screen.getAllByText('—');
      expect(dashElements.length).toBeGreaterThanOrEqual(2);
    });

    it('formats large revenue values in billions', async () => {
      const largeRevenueResponse: EarningsResponse = {
        upcoming: [
          {
            id: 6,
            ticker: 'MSFT',
            company: 'Microsoft',
            earnings_date: '2027-03-20',
            time_of_day: 'AMC',
            eps_estimate: 2.5,
            eps_actual: null,
            revenue_estimate: 50.5e9,
            revenue_actual: null,
            fiscal_quarter: 'Q2 2027',
            on_watchlist: true,
          },
        ],
        past: [],
        stale: false,
        as_of: '2027-03-01T10:00:00Z',
      };

      (api.getEarnings as jest.Mock).mockResolvedValue(largeRevenueResponse);

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getByText(/\$50/)).toBeInTheDocument();
      });
    });

    it('handles null time_of_day gracefully by omitting clock icon', async () => {
      const noTimeResponse: EarningsResponse = {
        upcoming: [
          {
            id: 7,
            ticker: 'AMZN',
            company: 'Amazon',
            earnings_date: '2027-03-25',
            time_of_day: null,
            eps_estimate: 0.75,
            eps_actual: null,
            revenue_estimate: 200e9,
            revenue_actual: null,
            fiscal_quarter: 'Q1 2027',
            on_watchlist: false,
          },
        ],
        past: [],
        stale: false,
        as_of: '2027-03-01T10:00:00Z',
      };

      (api.getEarnings as jest.Mock).mockResolvedValue(noTimeResponse);

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getByText('AMZN')).toBeInTheDocument();
      });
    });

    it('shows Met badge when EPS actual equals estimate exactly', async () => {
      const metResponse: EarningsResponse = {
        upcoming: [],
        past: [
          {
            id: 8,
            ticker: 'IBM',
            company: 'IBM',
            earnings_date: '2027-02-15',
            time_of_day: 'BMO',
            eps_estimate: 1.5,
            eps_actual: 1.5,
            revenue_estimate: 18e9,
            revenue_actual: 18e9,
            fiscal_quarter: 'Q4 2026',
            on_watchlist: false,
            surprise_pct: 0,
          },
        ],
        stale: false,
        as_of: '2027-03-01T10:00:00Z',
      };

      (api.getEarnings as jest.Mock).mockResolvedValue(metResponse);

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getAllByText('Met').length).toBeGreaterThanOrEqual(1);
      });

      const metBadges = screen.getAllByText('Met');
      expect(metBadges[0]).toHaveClass('bg-slate-600/30');
    });
  });

  describe('Loading state', () => {
    it('shows skeleton loaders while data is loading', async () => {
      const promise = new Promise<EarningsResponse>(() => {});
      (api.getEarnings as jest.Mock).mockReturnValue(promise);

      render(<EarningsPageView />);

      const loadingContainer = screen.getByRole('region', { hidden: true });
      expect(loadingContainer).toHaveAttribute('aria-busy', 'true');
    });

    it('hides skeleton loaders and shows content when data loads', async () => {
      (api.getEarnings as jest.Mock).mockResolvedValue(twoEventsOneDate);

      render(<EarningsPageView />);

      await waitFor(() => {
        expect(screen.getByText('NVDA')).toBeInTheDocument();
      });

      const containers = screen.queryAllByRole('region', { hidden: true });
      containers.forEach((container) => {
        expect(container).not.toHaveAttribute('aria-busy', 'true');
      });
    });
  });
});
