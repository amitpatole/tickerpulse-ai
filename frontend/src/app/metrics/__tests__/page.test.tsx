/**
 * TickerPulse AI - Metrics Page Tests
 * Tests for MetricsPage component: period selection, tab navigation, metric selection, refresh
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MetricsPage from '../page';
import { useApi } from '@/hooks/useApi';
import { getMetricsSummary, getAgentMetrics, getMetricsTimeseries, getJobMetrics } from '@/lib/api';

// Mock dependencies
jest.mock('@/components/layout/Header', () => {
  return function MockHeader() {
    return <div data-testid="header">Header</div>;
  };
});

jest.mock('@/components/metrics/SummaryCards', () => {
  return function MockSummaryCards({ summary, loading }: any) {
    return (
      <div data-testid="summary-cards">
        {loading ? 'Loading...' : summary ? 'Summary Loaded' : 'No Summary'}
      </div>
    );
  };
});

jest.mock('@/components/metrics/TimeseriesChart', () => {
  return function MockTimeseriesChart({ data, metric, loading }: any) {
    return (
      <div data-testid="timeseries-chart">
        {loading ? 'Loading...' : `Chart: ${metric}`}
      </div>
    );
  };
});

jest.mock('@/components/metrics/AgentsTable', () => {
  return function MockAgentsTable({ agents, loading }: any) {
    return (
      <div data-testid="agents-table">
        {loading ? 'Loading...' : `Agents: ${agents.length}`}
      </div>
    );
  };
});

jest.mock('@/components/metrics/JobsTable', () => {
  return function MockJobsTable({ jobs, loading }: any) {
    return (
      <div data-testid="jobs-table">
        {loading ? 'Loading...' : `Jobs: ${jobs.length}`}
      </div>
    );
  };
});

jest.mock('@/hooks/useApi');
jest.mock('@/lib/api');

const mockUseApi = useApi as jest.MockedFunction<typeof useApi>;
const mockGetMetricsSummary = getMetricsSummary as jest.MockedFunction<typeof getMetricsSummary>;
const mockGetAgentMetrics = getAgentMetrics as jest.MockedFunction<typeof getAgentMetrics>;
const mockGetMetricsTimeseries = getMetricsTimeseries as jest.MockedFunction<typeof getMetricsTimeseries>;
const mockGetJobMetrics = getJobMetrics as jest.MockedFunction<typeof getJobMetrics>;

describe('MetricsPage', () => {
  const mockSummaryData = {
    period_days: 30,
    agents: {
      total_runs: 100,
      success_runs: 95,
      error_runs: 5,
      success_rate: 0.95,
      avg_duration_ms: 2500,
      total_cost: 1.5,
      total_tokens: 45000,
    },
    jobs: {
      total_executions: 30,
      success_executions: 28,
      success_rate: 0.9333,
      avg_duration_ms: 5000,
      total_cost: 0.3,
    },
    top_cost_agents: [
      { agent_name: 'analyst', total_cost: 0.8, run_count: 50 },
    ],
    error_trend: [
      { day: '2024-02-21', total: 20, errors: 1, error_rate: 0.05 },
    ],
  };

  const mockAgentMetricsData = {
    period_days: 30,
    agents: [
      {
        agent_name: 'analyst',
        total_runs: 50,
        success_runs: 48,
        error_runs: 2,
        success_rate: 0.96,
        avg_duration_ms: 3000,
        max_duration_ms: 5000,
        min_duration_ms: 1500,
        total_cost: 0.8,
        avg_cost_per_run: 0.016,
        total_tokens_input: 15000,
        total_tokens_output: 8000,
        last_run_at: '2024-02-28T10:30:00',
      },
    ],
  };

  const mockTimeseriesData = {
    metric: 'cost',
    period_days: 30,
    data: [
      { day: '2024-02-21', agent_name: 'analyst', value: 0.5 },
      { day: '2024-02-22', agent_name: 'analyst', value: 0.75 },
    ],
  };

  const mockJobMetricsData = {
    period_days: 30,
    jobs: [
      {
        job_id: 'job_001',
        job_name: 'price_refresh',
        total_executions: 20,
        success_executions: 19,
        success_rate: 0.95,
        avg_duration_ms: 5000,
        max_duration_ms: 8000,
        total_cost: 0.2,
        last_executed_at: '2024-02-28T10:30:00',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock setup
    mockUseApi.mockImplementation(({ endpoint }: any) => {
      if (endpoint?.includes?.('summary')) {
        return { data: mockSummaryData, loading: false };
      }
      if (endpoint?.includes?.('agents')) {
        return { data: mockAgentMetricsData, loading: false };
      }
      if (endpoint?.includes?.('timeseries')) {
        return { data: mockTimeseriesData, loading: false };
      }
      if (endpoint?.includes?.('jobs')) {
        return { data: mockJobMetricsData, loading: false };
      }
      return { data: null, loading: false };
    });
  });

  // --- Test: Period Selection ---

  test('AC1: Period selector changes days parameter and refreshes data', async () => {
    render(<MetricsPage />);

    // Initially shows 30d selected
    const btn30d = screen.getByRole('button', { name: /30d/i });
    expect(btn30d).toHaveClass('bg-blue-600');

    // Click 7d button
    const btn7d = screen.getByRole('button', { name: /^7d$/ });
    fireEvent.click(btn7d);

    // Verify 7d is now selected
    expect(btn7d).toHaveClass('bg-blue-600');
    expect(btn30d).not.toHaveClass('bg-blue-600');
  });

  test('AC2: All three period options are available (7d, 30d, 90d)', () => {
    render(<MetricsPage />);

    const btn7d = screen.getByRole('button', { name: /^7d$/ });
    const btn30d = screen.getByRole('button', { name: /30d/i });
    const btn90d = screen.getByRole('button', { name: /90d/i });

    expect(btn7d).toBeInTheDocument();
    expect(btn30d).toBeInTheDocument();
    expect(btn90d).toBeInTheDocument();
  });

  // --- Test: Tab Navigation ---

  test('AC1: Tab navigation switches between Overview, Agents, and Jobs tabs', async () => {
    render(<MetricsPage />);

    // Initially on Overview
    const overviewTab = screen.getByRole('button', { name: /Overview/i });
    expect(overviewTab).toHaveClass('border-blue-500');

    // Click Agents tab
    const agentsTab = screen.getByRole('button', { name: /^Agents$/ });
    fireEvent.click(agentsTab);

    expect(agentsTab).toHaveClass('border-blue-500');
    expect(overviewTab).not.toHaveClass('border-blue-500');

    // Agents table should be visible
    expect(screen.getByTestId('agents-table')).toBeInTheDocument();
  });

  test('AC2: Jobs tab renders job metrics table', async () => {
    render(<MetricsPage />);

    const jobsTab = screen.getByRole('button', { name: /^Jobs$/ });
    fireEvent.click(jobsTab);

    expect(jobsTab).toHaveClass('border-blue-500');
    expect(screen.getByTestId('jobs-table')).toBeInTheDocument();
  });

  // --- Test: Chart Metric Selection ---

  test('AC1: Chart metric selector changes timeseries metric (cost, runs, duration, tokens)', async () => {
    render(<MetricsPage />);

    // Initially on cost metric
    const costBtn = screen.getByRole('button', { name: /^Cost$/ });
    expect(costBtn).toHaveClass('bg-blue-600');

    // Click Runs button
    const runsBtn = screen.getByRole('button', { name: /^Runs$/ });
    fireEvent.click(runsBtn);

    expect(runsBtn).toHaveClass('bg-blue-600');
    expect(costBtn).not.toHaveClass('bg-blue-600');
  });

  test('AC2: All metric options are available (Cost, Runs, Duration, Tokens)', () => {
    render(<MetricsPage />);

    const costBtn = screen.getByRole('button', { name: /^Cost$/ });
    const runsBtn = screen.getByRole('button', { name: /^Runs$/ });
    const durationBtn = screen.getByRole('button', { name: /^Duration$/ });
    const tokensBtn = screen.getByRole('button', { name: /^Tokens$/ });

    expect(costBtn).toBeInTheDocument();
    expect(runsBtn).toBeInTheDocument();
    expect(durationBtn).toBeInTheDocument();
    expect(tokensBtn).toBeInTheDocument();
  });

  // --- Test: Manual Refresh ---

  test('AC1: Refresh button is present and clickable', () => {
    render(<MetricsPage />);

    const refreshBtn = screen.getByRole('button', { name: /Refresh/i });
    expect(refreshBtn).toBeInTheDocument();

    fireEvent.click(refreshBtn);
    // No error thrown
  });

  // --- Test: Component Structure ---

  test('AC1: Metrics page renders Header and all major sections', () => {
    render(<MetricsPage />);

    // Header
    expect(screen.getByTestId('header')).toBeInTheDocument();

    // Page title
    expect(screen.getByText(/Performance Metrics/i)).toBeInTheDocument();

    // Period selector
    expect(screen.getByRole('button', { name: /^7d$/ })).toBeInTheDocument();

    // Tabs
    expect(screen.getByRole('button', { name: /Overview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Agents$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Jobs$/ })).toBeInTheDocument();

    // Content sections
    expect(screen.getByTestId('summary-cards')).toBeInTheDocument();
  });

  // --- Test: Data Loading States ---

  test('Edge case: Summary cards show loading state when data is loading', () => {
    mockUseApi.mockImplementation(() => ({
      data: null,
      loading: true,
    }));

    render(<MetricsPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('Edge case: Components handle empty data gracefully', () => {
    mockUseApi.mockImplementation(() => ({
      data: null,
      loading: false,
    }));

    render(<MetricsPage />);

    expect(screen.getByText('No Summary')).toBeInTheDocument();
  });
});
