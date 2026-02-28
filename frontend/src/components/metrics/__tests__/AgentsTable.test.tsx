import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AgentsTable from '../AgentsTable';
import type { AgentMetric } from '@/lib/types';

/**
 * Factory for creating AgentMetric test data
 */
function createAgentMetric(overrides?: Partial<AgentMetric>): AgentMetric {
  return {
    agent_name: 'test-agent',
    total_runs: 100,
    success_runs: 95,
    error_runs: 5,
    success_rate: 0.95,
    avg_duration_ms: 1500,
    max_duration_ms: 5000,
    min_duration_ms: 500,
    total_cost: 0.0234,
    avg_cost_per_run: 0.000234,
    total_tokens_input: 50000,
    total_tokens_output: 25000,
    last_run_at: '2026-02-28T14:30:00Z',
    ...overrides,
  };
}

describe('AgentsTable', () => {
  describe('Happy Path: Renders agents with correct data', () => {
    it('should display agent name, metrics, and formatting correctly', () => {
      const agents: AgentMetric[] = [
        createAgentMetric({
          agent_name: 'email-agent',
          total_runs: 200,
          success_runs: 190,
          success_rate: 0.95,
          avg_duration_ms: 2000,
          total_cost: 0.05,
          avg_cost_per_run: 0.00025,
          total_tokens_input: 100000,
          total_tokens_output: 50000,
          last_run_at: '2026-02-28T10:00:00Z',
        }),
      ];

      render(<AgentsTable agents={agents} loading={false} />);

      // Verify agent name is displayed
      expect(screen.getByText('email-agent')).toBeInTheDocument();

      // Verify metrics are displayed and formatted
      expect(screen.getByText('200')).toBeInTheDocument(); // total_runs
      expect(screen.getByText('95.0%')).toBeInTheDocument(); // success_rate as percentage
      expect(screen.getByText('$0.0500')).toBeInTheDocument(); // total_cost formatted
      expect(screen.getByText('2.0s')).toBeInTheDocument(); // 2000ms formatted as 2.0s
      // Total tokens = input + output = 100000 + 50000 = 150000 = 150K
      expect(screen.getByText('150.0K')).toBeInTheDocument(); // total tokens (input + output)
    });

    it('should display multiple agents in order', () => {
      const agents: AgentMetric[] = [
        createAgentMetric({
          agent_name: 'agent-alpha',
          total_runs: 100,
        }),
        createAgentMetric({
          agent_name: 'agent-beta',
          total_runs: 50,
        }),
      ];

      render(<AgentsTable agents={agents} loading={false} />);

      expect(screen.getByText('agent-alpha')).toBeInTheDocument();
      expect(screen.getByText('agent-beta')).toBeInTheDocument();
    });
  });

  describe('Loading State: Shows skeleton loaders', () => {
    it('should display skeleton loaders while loading', () => {
      render(<AgentsTable agents={[]} loading={true} />);

      // Check for skeleton elements (animate-pulse divs)
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should not display agent data while loading', () => {
      const agents: AgentMetric[] = [
        createAgentMetric({
          agent_name: 'email-agent',
        }),
      ];

      render(<AgentsTable agents={agents} loading={true} />);

      // Agent name should not be visible during loading
      expect(screen.queryByText('email-agent')).not.toBeInTheDocument();
    });
  });

  describe('Formatting Functions: Edge cases', () => {
    it('should format cost correctly for very small amounts', () => {
      const agents: AgentMetric[] = [
        createAgentMetric({
          agent_name: 'cheap-agent',
          total_cost: 0.00005, // Less than 0.0001
        }),
      ];

      render(<AgentsTable agents={agents} loading={false} />);

      // Should display "<$0.0001" for very small amounts
      expect(screen.getByText('<$0.0001')).toBeInTheDocument();
    });

    it('should format cost as $0.0000 for zero cost', () => {
      const agents: AgentMetric[] = [
        createAgentMetric({
          agent_name: 'free-agent',
          total_cost: 0,
        }),
      ];

      render(<AgentsTable agents={agents} loading={false} />);

      expect(screen.getByText('$0.0000')).toBeInTheDocument();
    });

    it('should format large token counts with K and M suffixes', () => {
      const agents: AgentMetric[] = [
        createAgentMetric({
          agent_name: 'token-heavy',
          total_tokens_input: 4000000, // 4M
          total_tokens_output: 1500000, // 1.5M -> combined: 5.5M
        }),
      ];

      render(<AgentsTable agents={agents} loading={false} />);

      // Tokens column displays sum of input + output: 4000000 + 1500000 = 5500000 = 5.5M
      expect(screen.getByText('5.5M')).toBeInTheDocument();
    });

    it('should format duration in seconds when >= 1000ms', () => {
      const agents: AgentMetric[] = [
        createAgentMetric({
          agent_name: 'slow-agent',
          avg_duration_ms: 3500, // 3.5 seconds
        }),
      ];

      render(<AgentsTable agents={agents} loading={false} />);

      expect(screen.getByText('3.5s')).toBeInTheDocument();
    });

    it('should format duration in ms when < 1000ms', () => {
      const agents: AgentMetric[] = [
        createAgentMetric({
          agent_name: 'fast-agent',
          avg_duration_ms: 450,
        }),
      ];

      render(<AgentsTable agents={agents} loading={false} />);

      expect(screen.getByText('450ms')).toBeInTheDocument();
    });

    it('should display dash for null last_run_at', () => {
      const agents: AgentMetric[] = [
        createAgentMetric({
          agent_name: 'never-run',
          last_run_at: null,
        }),
      ];

      render(<AgentsTable agents={agents} loading={false} />);

      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('should format date correctly when present', () => {
      const agents: AgentMetric[] = [
        createAgentMetric({
          agent_name: 'recent-agent',
          last_run_at: '2026-02-28T14:30:00Z',
        }),
      ];

      render(<AgentsTable agents={agents} loading={false} />);

      // Date should be formatted (exact format depends on locale, but should contain month, day, time)
      const lastRunCell = screen.getByText(/Feb.*28.*14:30/);
      expect(lastRunCell).toBeInTheDocument();
    });
  });

  describe('Success Rate Badge: Color coding', () => {
    it('should show green badge for high success rate (>= 90%)', () => {
      const agents: AgentMetric[] = [
        createAgentMetric({
          agent_name: 'reliable-agent',
          success_rate: 0.95,
        }),
      ];

      render(<AgentsTable agents={agents} loading={false} />);

      const badge = screen.getByText('95.0%');
      expect(badge).toHaveClass('text-emerald-400', 'bg-emerald-500/10');
    });

    it('should show amber badge for moderate success rate (70-89%)', () => {
      const agents: AgentMetric[] = [
        createAgentMetric({
          agent_name: 'flaky-agent',
          success_rate: 0.75,
        }),
      ];

      render(<AgentsTable agents={agents} loading={false} />);

      const badge = screen.getByText('75.0%');
      expect(badge).toHaveClass('text-amber-400', 'bg-amber-500/10');
    });

    it('should show red badge for low success rate (< 70%)', () => {
      const agents: AgentMetric[] = [
        createAgentMetric({
          agent_name: 'broken-agent',
          success_rate: 0.5,
        }),
      ];

      render(<AgentsTable agents={agents} loading={false} />);

      const badge = screen.getByText('50.0%');
      expect(badge).toHaveClass('text-red-400', 'bg-red-500/10');
    });
  });

  describe('Empty State: No agents', () => {
    it('should display empty state message when no agents', () => {
      render(<AgentsTable agents={[]} loading={false} />);

      expect(screen.getByText('No agent data for selected period')).toBeInTheDocument();
    });

    it('should not display table when no agents', () => {
      render(<AgentsTable agents={[]} loading={false} />);

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });
});
