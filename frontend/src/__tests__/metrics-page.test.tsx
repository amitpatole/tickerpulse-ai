/**
 * Performance Metrics Page - Integration Tests
 *
 * Tests for frontend/src/app/metrics/page.tsx covering:
 * - AC1: Tab switching shows/hides the correct panel
 * - AC2: Period selector triggers refetch with correct days argument
 * - AC3: Manual refresh button triggers additional API calls
 * - AC4: Summary cards show loading state then resolved data
 * - AC5: Timeseries metric picker passes the correct metric to the API
 * - AC6: Period and metric selections are combined correctly on refetch
 *
 * Strategy: mock only @/lib/api; let useApi run normally so API functions
 * are actually invoked and assertions on call arguments are valid.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MetricsPage from '@/app/metrics/page';
import * as api from '@/lib/api';

// ---------------------------------------------------------------------------
// Stub heavy child components to keep rendering fast / deterministic
// ---------------------------------------------------------------------------

jest.mock('@/components/layout/Header', () =>
  function Header() { return <div data-testid="header" />; }
);
jest.mock('@/components/metrics/SummaryCards', () =>
  function SummaryCards({ loading }: { loading: boolean }) {
    return <div data-testid="summary-cards">{loading ? 'Loading...' : 'Summary'}</div>;
  }
);
jest.mock('@/components/metrics/TimeseriesChart', () =>
  function TimeseriesChart({ loading }: { loading: boolean }) {
    return <div data-testid="timeseries-chart">{loading ? 'Loading...' : 'Chart'}</div>;
  }
);
jest.mock('@/components/metrics/AgentsTable', () =>
  function AgentsTable({ loading }: { loading: boolean }) {
    return <div data-testid="agents-table">{loading ? 'Loading...' : 'Agents data'}</div>;
  }
);
jest.mock('@/components/metrics/JobsTable', () =>
  function JobsTable({ loading }: { loading: boolean }) {
    return <div data-testid="jobs-table">{loading ? 'Loading...' : 'Jobs data'}</div>;
  }
);
jest.mock('@/components/metrics/SystemPanel', () =>
  function SystemPanel() { return <div data-testid="system-panel" />; }
);

// ---------------------------------------------------------------------------
// Mock the API module — real useApi hook runs, so fetchers ARE invoked
// ---------------------------------------------------------------------------

jest.mock('@/lib/api', () => ({
  getMetricsSummary:    jest.fn(),
  getAgentMetrics:      jest.fn(),
  getMetricsTimeseries: jest.fn(),
  getJobMetrics:        jest.fn(),
  getSystemMetrics:     jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_SUMMARY = {
  period_days: 30,
  agents: {
    total_runs: 10,
    success_runs: 10,
    error_runs: 0,
    success_rate: 1,
    avg_duration_ms: 1000,
    total_cost: 0.1,
    total_tokens: 5000,
  },
  jobs: {
    total_executions: 5,
    success_executions: 5,
    success_rate: 1,
    avg_duration_ms: 2000,
    total_cost: 0,
  },
  top_cost_agents: [],
  error_trend: [],
};

function setupMocks() {
  (api.getMetricsSummary    as jest.Mock).mockResolvedValue(DEFAULT_SUMMARY);
  (api.getAgentMetrics      as jest.Mock).mockResolvedValue({ period_days: 30, agents: [] });
  (api.getJobMetrics        as jest.Mock).mockResolvedValue({ period_days: 30, jobs: [] });
  (api.getMetricsTimeseries as jest.Mock).mockResolvedValue({ metric: 'cost', period_days: 30, data: [] });
  (api.getSystemMetrics     as jest.Mock).mockResolvedValue({ period_days: 7, snapshots: [], endpoints: [] });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MetricsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  // ── AC1: Tab Switching ─────────────────────────────────────────────────────

  describe('AC1: Tab Switching', () => {
    it('shows timeseries chart on Overview tab by default', () => {
      render(<MetricsPage />);
      expect(screen.getByTestId('timeseries-chart')).toBeInTheDocument();
      expect(screen.queryByTestId('agents-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('jobs-table')).not.toBeInTheDocument();
    });

    it('switches to Agents tab and shows agents table', async () => {
      render(<MetricsPage />);
      await userEvent.click(screen.getByRole('button', { name: /agents/i }));
      expect(screen.getByTestId('agents-table')).toBeInTheDocument();
      expect(screen.queryByTestId('timeseries-chart')).not.toBeInTheDocument();
    });

    it('switches to Jobs tab and shows jobs table', async () => {
      render(<MetricsPage />);
      await userEvent.click(screen.getByRole('button', { name: /jobs/i }));
      expect(screen.getByTestId('jobs-table')).toBeInTheDocument();
      expect(screen.queryByTestId('agents-table')).not.toBeInTheDocument();
    });

    it('highlights the active tab with blue text', async () => {
      render(<MetricsPage />);
      expect(screen.getByRole('button', { name: /overview/i })).toHaveClass('text-blue-400');

      await userEvent.click(screen.getByRole('button', { name: /agents/i }));
      expect(screen.getByRole('button', { name: /agents/i })).toHaveClass('text-blue-400');
      expect(screen.getByRole('button', { name: /overview/i })).not.toHaveClass('text-blue-400');
    });
  });

  // ── AC2: Period Selector ───────────────────────────────────────────────────

  describe('AC2: Period Selector', () => {
    it('defaults to 30 days and calls API with 30', async () => {
      render(<MetricsPage />);
      await waitFor(() => {
        expect(api.getMetricsSummary).toHaveBeenCalledWith(30);
      });
    });

    it('calls API with 7 after clicking 7d', async () => {
      render(<MetricsPage />);
      await userEvent.click(screen.getByRole('button', { name: '7d' }));
      await waitFor(() => {
        expect(api.getMetricsSummary).toHaveBeenCalledWith(7);
      });
    });

    it('calls API with 90 after clicking 90d', async () => {
      render(<MetricsPage />);
      await userEvent.click(screen.getByRole('button', { name: '90d' }));
      await waitFor(() => {
        expect(api.getMetricsSummary).toHaveBeenCalledWith(90);
      });
    });

    it('highlights the active period button', async () => {
      render(<MetricsPage />);
      expect(screen.getByRole('button', { name: '30d' })).toHaveClass('bg-blue-600');

      await userEvent.click(screen.getByRole('button', { name: '7d' }));
      expect(screen.getByRole('button', { name: '7d' })).toHaveClass('bg-blue-600');
      expect(screen.getByRole('button', { name: '30d' })).not.toHaveClass('bg-blue-600');
    });
  });

  // ── AC3: Manual Refresh ────────────────────────────────────────────────────

  describe('AC3: Manual Refresh', () => {
    it('renders an enabled Refresh button', () => {
      render(<MetricsPage />);
      const btn = screen.getByRole('button', { name: /refresh/i });
      expect(btn).toBeInTheDocument();
      expect(btn).not.toBeDisabled();
    });

    it('clicking Refresh triggers additional API calls', async () => {
      render(<MetricsPage />);
      await waitFor(() => expect(api.getMetricsSummary).toHaveBeenCalledTimes(1));

      await userEvent.click(screen.getByRole('button', { name: /refresh/i }));
      await waitFor(() => {
        expect(api.getMetricsSummary).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ── AC4: Summary Cards ─────────────────────────────────────────────────────

  describe('AC4: Summary Cards', () => {
    it('shows loading state before data arrives', () => {
      // Never-resolving promise keeps the component in loading state
      (api.getMetricsSummary as jest.Mock).mockImplementation(() => new Promise(() => {}));
      render(<MetricsPage />);
      expect(screen.getByTestId('summary-cards')).toHaveTextContent('Loading...');
    });

    it('renders summary content after data loads', async () => {
      render(<MetricsPage />);
      await waitFor(() => {
        expect(screen.getByTestId('summary-cards')).toHaveTextContent('Summary');
      });
    });
  });

  // ── AC5: Timeseries Metric Selector ───────────────────────────────────────

  describe('AC5: Timeseries Metric Selector', () => {
    it('defaults to cost metric — calls timeseries with (30, "cost")', async () => {
      render(<MetricsPage />);
      await waitFor(() => {
        expect(api.getMetricsTimeseries).toHaveBeenCalledWith(30, 'cost');
      });
    });

    it('switches to runs — calls timeseries with (30, "runs")', async () => {
      render(<MetricsPage />);
      await userEvent.click(screen.getByRole('button', { name: 'Runs' }));
      await waitFor(() => {
        expect(api.getMetricsTimeseries).toHaveBeenCalledWith(30, 'runs');
      });
    });

    it('switches to duration — calls timeseries with (30, "duration")', async () => {
      render(<MetricsPage />);
      await userEvent.click(screen.getByRole('button', { name: 'Duration' }));
      await waitFor(() => {
        expect(api.getMetricsTimeseries).toHaveBeenCalledWith(30, 'duration');
      });
    });

    it('switches to tokens — calls timeseries with (30, "tokens")', async () => {
      render(<MetricsPage />);
      await userEvent.click(screen.getByRole('button', { name: 'Tokens' }));
      await waitFor(() => {
        expect(api.getMetricsTimeseries).toHaveBeenCalledWith(30, 'tokens');
      });
    });

    it('highlights the active metric button', async () => {
      render(<MetricsPage />);
      // Cost is active by default
      expect(screen.getByRole('button', { name: 'Cost' })).toHaveClass('bg-blue-600');

      await userEvent.click(screen.getByRole('button', { name: 'Runs' }));
      expect(screen.getByRole('button', { name: 'Runs' })).toHaveClass('bg-blue-600');
      expect(screen.getByRole('button', { name: 'Cost' })).not.toHaveClass('bg-blue-600');
    });
  });

  // ── AC6: Combined period + metric ─────────────────────────────────────────

  describe('AC6: Combined period + metric', () => {
    it('preserves selected metric when period changes', async () => {
      render(<MetricsPage />);

      // Switch metric to 'runs'
      await userEvent.click(screen.getByRole('button', { name: 'Runs' }));
      await waitFor(() => expect(api.getMetricsTimeseries).toHaveBeenCalledWith(30, 'runs'));

      // Change period to 7d — should still use 'runs'
      await userEvent.click(screen.getByRole('button', { name: '7d' }));
      await waitFor(() => {
        expect(api.getMetricsTimeseries).toHaveBeenCalledWith(7, 'runs');
      });
    });

    it('preserves selected period when metric changes', async () => {
      render(<MetricsPage />);

      // Switch to 90 days
      await userEvent.click(screen.getByRole('button', { name: '90d' }));
      await waitFor(() => expect(api.getMetricsTimeseries).toHaveBeenCalledWith(90, 'cost'));

      // Switch metric to 'tokens' — should use 90 days
      await userEvent.click(screen.getByRole('button', { name: 'Tokens' }));
      await waitFor(() => {
        expect(api.getMetricsTimeseries).toHaveBeenCalledWith(90, 'tokens');
      });
    });
  });
});
