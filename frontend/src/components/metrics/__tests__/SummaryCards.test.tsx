import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SummaryCards from '../SummaryCards';
import type { MetricsSummary } from '@/lib/types';

function createSummary(overrides?: Partial<MetricsSummary>): MetricsSummary {
  return {
    period_days: 30,
    agents: {
      total_runs: 100,
      success_runs: 95,
      error_runs: 5,
      success_rate: 0.95,
      avg_duration_ms: 1500,
      total_cost: 1.2,
      total_tokens: 45000,
    },
    jobs: {
      total_executions: 50,
      success_executions: 47,
      success_rate: 0.94,
      avg_duration_ms: 4000,
      total_cost: 0.3,
    },
    top_cost_agents: [],
    error_trend: [],
    ...overrides,
  } as MetricsSummary;
}

describe('SummaryCards', () => {
  describe('Loading State', () => {
    it('renders 5 skeleton cards when loading', () => {
      render(<SummaryCards summary={null} loading={true} />);

      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBe(5);
    });

    it('renders skeletons when summary is null and not loading', () => {
      render(<SummaryCards summary={null} loading={false} />);

      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBe(5);
    });

    it('does not render KPI values while loading', () => {
      render(<SummaryCards summary={createSummary()} loading={true} />);

      expect(screen.queryByText('Total Runs')).not.toBeInTheDocument();
      expect(screen.queryByText('Success Rate')).not.toBeInTheDocument();
    });
  });

  describe('Happy Path: KPI tiles rendered', () => {
    it('renders all 5 card labels', () => {
      render(<SummaryCards summary={createSummary()} loading={false} />);

      expect(screen.getByText('Total Runs')).toBeInTheDocument();
      expect(screen.getByText('Success Rate')).toBeInTheDocument();
      expect(screen.getByText('Total Cost')).toBeInTheDocument();
      expect(screen.getByText('Tokens Used')).toBeInTheDocument();
      expect(screen.getByText('Avg Duration')).toBeInTheDocument();
    });

    it('computes Total Runs as sum of agent runs + job executions', () => {
      const summary = createSummary({
        agents: {
          total_runs: 80,
          success_runs: 75,
          error_runs: 5,
          success_rate: 0.9375,
          avg_duration_ms: 1000,
          total_cost: 0.5,
          total_tokens: 10000,
        },
        jobs: {
          total_executions: 20,
          success_executions: 18,
          success_rate: 0.9,
          avg_duration_ms: 2000,
          total_cost: 0.1,
        },
      });

      render(<SummaryCards summary={summary} loading={false} />);

      // 80 + 20 = 100
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('80 agent · 20 job')).toBeInTheDocument();
    });

    it('computes overall success rate from combined runs', () => {
      // (72 + 18) / (80 + 20) * 100 = 90.0%
      const summary = createSummary({
        agents: {
          total_runs: 80,
          success_runs: 72,
          error_runs: 8,
          success_rate: 0.9,
          avg_duration_ms: 1000,
          total_cost: 0.5,
          total_tokens: 10000,
        },
        jobs: {
          total_executions: 20,
          success_executions: 18,
          success_rate: 0.9,
          avg_duration_ms: 2000,
          total_cost: 0.1,
        },
      });

      render(<SummaryCards summary={summary} loading={false} />);

      expect(screen.getByText('90.0%')).toBeInTheDocument();
    });

    it('computes Total Cost as sum of agent + job costs', () => {
      const summary = createSummary({
        agents: {
          total_runs: 10,
          success_runs: 10,
          error_runs: 0,
          success_rate: 1,
          avg_duration_ms: 500,
          total_cost: 0.5,
          total_tokens: 5000,
        },
        jobs: {
          total_executions: 5,
          success_executions: 5,
          success_rate: 1,
          avg_duration_ms: 1000,
          total_cost: 0.25,
        },
      });

      render(<SummaryCards summary={summary} loading={false} />);

      // 0.5 + 0.25 = 0.75
      expect(screen.getByText('$0.7500')).toBeInTheDocument();
    });

    it('shows Tokens from agents.total_tokens with period_days in subtext', () => {
      const summary = createSummary({
        period_days: 7,
        agents: {
          total_runs: 10,
          success_runs: 10,
          error_runs: 0,
          success_rate: 1,
          avg_duration_ms: 500,
          total_cost: 0.1,
          total_tokens: 123456,
        },
      });

      render(<SummaryCards summary={summary} loading={false} />);

      expect(screen.getByText('123.5K')).toBeInTheDocument();
      expect(screen.getByText('7d window')).toBeInTheDocument();
    });

    it('shows Avg Duration from agents.avg_duration_ms with subtext', () => {
      const summary = createSummary({
        agents: {
          total_runs: 5,
          success_runs: 5,
          error_runs: 0,
          success_rate: 1,
          avg_duration_ms: 2500,
          total_cost: 0,
          total_tokens: 0,
        },
      });

      render(<SummaryCards summary={summary} loading={false} />);

      expect(screen.getByText('2.5s')).toBeInTheDocument();
      expect(screen.getByText('successful agent runs')).toBeInTheDocument();
    });

    it('shows agent error count in success rate subtext', () => {
      const summary = createSummary({
        agents: {
          total_runs: 100,
          success_runs: 90,
          error_runs: 10,
          success_rate: 0.9,
          avg_duration_ms: 1000,
          total_cost: 1.0,
          total_tokens: 50000,
        },
      });

      render(<SummaryCards summary={summary} loading={false} />);

      expect(screen.getByText('10 agent errors')).toBeInTheDocument();
    });
  });

  describe('Success Rate Color Coding', () => {
    it('shows emerald icon for >= 90% success rate', () => {
      const summary = createSummary({
        agents: { total_runs: 100, success_runs: 95, error_runs: 5, success_rate: 0.95, avg_duration_ms: 1000, total_cost: 0, total_tokens: 0 },
        jobs: { total_executions: 0, success_executions: 0, success_rate: 0, avg_duration_ms: 0, total_cost: 0 },
      });

      const { container } = render(<SummaryCards summary={summary} loading={false} />);

      expect(screen.getByText('95.0%')).toBeInTheDocument();
      expect(container.querySelector('[class*="emerald"]')).toBeInTheDocument();
    });

    it('shows amber icon for 70–89% success rate', () => {
      const summary = createSummary({
        agents: { total_runs: 100, success_runs: 75, error_runs: 25, success_rate: 0.75, avg_duration_ms: 1000, total_cost: 0, total_tokens: 0 },
        jobs: { total_executions: 0, success_executions: 0, success_rate: 0, avg_duration_ms: 0, total_cost: 0 },
      });

      const { container } = render(<SummaryCards summary={summary} loading={false} />);

      expect(screen.getByText('75.0%')).toBeInTheDocument();
      expect(container.querySelector('[class*="amber"]')).toBeInTheDocument();
    });

    it('shows red icon for < 70% success rate', () => {
      const summary = createSummary({
        agents: { total_runs: 100, success_runs: 60, error_runs: 40, success_rate: 0.6, avg_duration_ms: 1000, total_cost: 0, total_tokens: 0 },
        jobs: { total_executions: 0, success_executions: 0, success_rate: 0, avg_duration_ms: 0, total_cost: 0 },
      });

      const { container } = render(<SummaryCards summary={summary} loading={false} />);

      expect(screen.getByText('60.0%')).toBeInTheDocument();
      expect(container.querySelector('[class*="red"]')).toBeInTheDocument();
    });
  });

  describe('fmtCost formatting', () => {
    it('shows $0.0000 for zero total cost', () => {
      const summary = createSummary({
        agents: { total_runs: 0, success_runs: 0, error_runs: 0, success_rate: 0, avg_duration_ms: 0, total_cost: 0, total_tokens: 0 },
        jobs: { total_executions: 0, success_executions: 0, success_rate: 0, avg_duration_ms: 0, total_cost: 0 },
      });

      render(<SummaryCards summary={summary} loading={false} />);

      expect(screen.getByText('$0.0000')).toBeInTheDocument();
    });

    it('shows <$0.0001 for extremely small cost', () => {
      const summary = createSummary({
        agents: { total_runs: 1, success_runs: 1, error_runs: 0, success_rate: 1, avg_duration_ms: 100, total_cost: 0.000005, total_tokens: 10 },
        jobs: { total_executions: 0, success_executions: 0, success_rate: 0, avg_duration_ms: 0, total_cost: 0 },
      });

      render(<SummaryCards summary={summary} loading={false} />);

      expect(screen.getByText('<$0.0001')).toBeInTheDocument();
    });

    it('shows agents cost in subtext of Total Cost card', () => {
      const summary = createSummary({
        agents: { total_runs: 10, success_runs: 10, error_runs: 0, success_rate: 1, avg_duration_ms: 500, total_cost: 0.1234, total_tokens: 5000 },
        jobs: { total_executions: 5, success_executions: 5, success_rate: 1, avg_duration_ms: 1000, total_cost: 0.0 },
      });

      render(<SummaryCards summary={summary} loading={false} />);

      expect(screen.getByText('Agents: $0.1234')).toBeInTheDocument();
    });
  });

  describe('fmtTokens formatting', () => {
    it('shows M suffix for tokens >= 1M', () => {
      const summary = createSummary({
        agents: { total_runs: 10, success_runs: 10, error_runs: 0, success_rate: 1, avg_duration_ms: 1000, total_cost: 0, total_tokens: 2500000 },
      });

      render(<SummaryCards summary={summary} loading={false} />);

      expect(screen.getByText('2.5M')).toBeInTheDocument();
    });

    it('shows K suffix for tokens in the thousands', () => {
      const summary = createSummary({
        agents: { total_runs: 10, success_runs: 10, error_runs: 0, success_rate: 1, avg_duration_ms: 1000, total_cost: 0, total_tokens: 7800 },
      });

      render(<SummaryCards summary={summary} loading={false} />);

      expect(screen.getByText('7.8K')).toBeInTheDocument();
    });

    it('shows raw count for tokens < 1000', () => {
      const summary = createSummary({
        agents: { total_runs: 1, success_runs: 1, error_runs: 0, success_rate: 1, avg_duration_ms: 100, total_cost: 0, total_tokens: 500 },
      });

      render(<SummaryCards summary={summary} loading={false} />);

      expect(screen.getByText('500')).toBeInTheDocument();
    });
  });

  describe('fmtMs duration formatting', () => {
    it('shows duration in ms when < 1000ms', () => {
      const summary = createSummary({
        agents: { total_runs: 5, success_runs: 5, error_runs: 0, success_rate: 1, avg_duration_ms: 750, total_cost: 0, total_tokens: 0 },
      });

      render(<SummaryCards summary={summary} loading={false} />);

      expect(screen.getByText('750ms')).toBeInTheDocument();
    });

    it('shows duration in seconds when >= 1000ms', () => {
      const summary = createSummary({
        agents: { total_runs: 5, success_runs: 5, error_runs: 0, success_rate: 1, avg_duration_ms: 3200, total_cost: 0, total_tokens: 0 },
      });

      render(<SummaryCards summary={summary} loading={false} />);

      expect(screen.getByText('3.2s')).toBeInTheDocument();
    });
  });

  describe('Zero-run edge case', () => {
    it('shows 0.0% success rate when there are no runs', () => {
      const summary = createSummary({
        agents: { total_runs: 0, success_runs: 0, error_runs: 0, success_rate: 0, avg_duration_ms: 0, total_cost: 0, total_tokens: 0 },
        jobs: { total_executions: 0, success_executions: 0, success_rate: 0, avg_duration_ms: 0, total_cost: 0 },
      });

      render(<SummaryCards summary={summary} loading={false} />);

      expect(screen.getByText('0.0%')).toBeInTheDocument();
    });
  });

  describe('DB Pool Stats (new feature)', () => {
    it('renders 7 skeleton cards when poolStats is defined and loading', () => {
      const poolStats = {
        recorded_at: '2026-02-28T10:00:00Z',
        cpu_pct: 45.5,
        mem_pct: 62.3,
        db_pool_active: 3,
        db_pool_idle: 2,
      };

      render(<SummaryCards summary={null} loading={true} poolStats={poolStats} />);

      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBe(7);
    });

    it('renders 5 skeleton cards when poolStats is undefined and loading', () => {
      render(<SummaryCards summary={null} loading={true} />);

      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBe(5);
    });

    it('renders DB Active and DB Idle cards when poolStats is provided', () => {
      const summary = createSummary();
      const poolStats = {
        recorded_at: '2026-02-28T10:00:00Z',
        cpu_pct: 45.5,
        mem_pct: 62.3,
        db_pool_active: 3,
        db_pool_idle: 2,
      };

      render(<SummaryCards summary={summary} loading={false} poolStats={poolStats} />);

      expect(screen.getByText('DB Active')).toBeInTheDocument();
      expect(screen.getByText('DB Idle')).toBeInTheDocument();
      expect(screen.getByText('pool connections in use')).toBeInTheDocument();
      expect(screen.getByText('pool connections free')).toBeInTheDocument();
    });

    it('displays correct pool connection values', () => {
      const summary = createSummary();
      const poolStats = {
        recorded_at: '2026-02-28T10:00:00Z',
        cpu_pct: 45.5,
        mem_pct: 62.3,
        db_pool_active: 4,
        db_pool_idle: 1,
      };

      render(<SummaryCards summary={summary} loading={false} poolStats={poolStats} />);

      expect(screen.getByText('4')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('does not render pool cards when poolStats is null', () => {
      const summary = createSummary();

      render(<SummaryCards summary={summary} loading={false} poolStats={null} />);

      expect(screen.queryByText('DB Active')).not.toBeInTheDocument();
      expect(screen.queryByText('DB Idle')).not.toBeInTheDocument();
    });

    it('shows all 7 cards when poolStats is provided and data is loaded', () => {
      const summary = createSummary();
      const poolStats = {
        recorded_at: '2026-02-28T10:00:00Z',
        cpu_pct: 45.5,
        mem_pct: 62.3,
        db_pool_active: 3,
        db_pool_idle: 2,
      };

      const { container } = render(<SummaryCards summary={summary} loading={false} poolStats={poolStats} />);

      // 5 standard cards + 2 pool cards = 7 total
      const cards = container.querySelectorAll('[class*="rounded-xl"][class*="border-slate-700"]');
      expect(cards.length).toBe(7);
    });
  });
});
