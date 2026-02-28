import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import JobsTable from '../JobsTable';
import type { JobMetric } from '@/lib/types';

/**
 * Factory for creating JobMetric test data
 */
function createJobMetric(overrides?: Partial<JobMetric>): JobMetric {
  return {
    job_id: 'job-001',
    job_name: 'daily-refresh',
    total_executions: 100,
    success_executions: 95,
    success_rate: 0.95,
    avg_duration_ms: 2000,
    max_duration_ms: 8000,
    total_cost: 0.05,
    last_executed_at: '2026-02-28T14:30:00Z',
    ...overrides,
  };
}

describe('JobsTable', () => {
  describe('Happy Path: Renders jobs with correct data', () => {
    it('should display job name, ID, and metrics correctly', () => {
      const jobs: JobMetric[] = [
        createJobMetric({
          job_id: 'price-refresh-001',
          job_name: 'Price Refresh Job',
          total_executions: 150,
          success_executions: 142,
          success_rate: 0.9467,
          avg_duration_ms: 3500,
          max_duration_ms: 15000,
          total_cost: 0.075,
          last_executed_at: '2026-02-28T10:00:00Z',
        }),
      ];

      render(<JobsTable jobs={jobs} loading={false} />);

      // Verify job name and ID
      expect(screen.getByText('Price Refresh Job')).toBeInTheDocument();
      expect(screen.getByText('price-refresh-001')).toBeInTheDocument();

      // Verify metrics are displayed and formatted
      expect(screen.getByText('150')).toBeInTheDocument(); // total_executions with locale string
      expect(screen.getByText('94.7%')).toBeInTheDocument(); // success_rate as percentage
      expect(screen.getByText('3.5s')).toBeInTheDocument(); // 3500ms formatted
      expect(screen.getByText('15.0s')).toBeInTheDocument(); // 15000ms formatted
      expect(screen.getByText('$0.0750')).toBeInTheDocument(); // total_cost
    });

    it('should display multiple jobs in table rows', () => {
      const jobs: JobMetric[] = [
        createJobMetric({
          job_id: 'job-001',
          job_name: 'Morning Refresh',
        }),
        createJobMetric({
          job_id: 'job-002',
          job_name: 'Evening Refresh',
        }),
      ];

      render(<JobsTable jobs={jobs} loading={false} />);

      expect(screen.getByText('Morning Refresh')).toBeInTheDocument();
      expect(screen.getByText('Evening Refresh')).toBeInTheDocument();
      expect(screen.getByText('job-001')).toBeInTheDocument();
      expect(screen.getByText('job-002')).toBeInTheDocument();
    });

    it('should format large execution counts with commas', () => {
      const jobs: JobMetric[] = [
        createJobMetric({
          job_name: 'High-Volume Job',
          total_executions: 1234567,
        }),
      ];

      render(<JobsTable jobs={jobs} loading={false} />);

      // toLocaleString() should format as "1,234,567"
      expect(screen.getByText('1,234,567')).toBeInTheDocument();
    });
  });

  describe('Loading State: Shows skeleton loaders', () => {
    it('should display 4 skeleton loader divs while loading', () => {
      render(<JobsTable jobs={[]} loading={true} />);

      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBe(4);
      skeletons.forEach((skeleton) => {
        expect(skeleton).toHaveClass('h-10', 'rounded-lg', 'bg-slate-800/60');
      });
    });

    it('should not display job data while loading', () => {
      const jobs: JobMetric[] = [
        createJobMetric({
          job_name: 'Hidden Job',
        }),
      ];

      render(<JobsTable jobs={jobs} loading={true} />);

      expect(screen.queryByText('Hidden Job')).not.toBeInTheDocument();
    });
  });

  describe('Empty State: No jobs for period', () => {
    it('should display empty state message when no jobs', () => {
      render(<JobsTable jobs={[]} loading={false} />);

      expect(screen.getByText('No job data for selected period')).toBeInTheDocument();
    });

    it('should not display table when no jobs', () => {
      render(<JobsTable jobs={[]} loading={false} />);

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('Success Rate Badge: Color coding', () => {
    it('should show green badge for high success rate (>= 90%)', () => {
      const jobs: JobMetric[] = [
        createJobMetric({
          job_name: 'Reliable Job',
          success_rate: 0.92,
        }),
      ];

      render(<JobsTable jobs={jobs} loading={false} />);

      const badge = screen.getByText('92.0%');
      expect(badge).toHaveClass('text-emerald-400', 'bg-emerald-500/10');
    });

    it('should show amber badge for moderate success rate (70-89%)', () => {
      const jobs: JobMetric[] = [
        createJobMetric({
          job_name: 'Moderate Job',
          success_rate: 0.78,
        }),
      ];

      render(<JobsTable jobs={jobs} loading={false} />);

      const badge = screen.getByText('78.0%');
      expect(badge).toHaveClass('text-amber-400', 'bg-amber-500/10');
    });

    it('should show red badge for low success rate (< 70%)', () => {
      const jobs: JobMetric[] = [
        createJobMetric({
          job_name: 'Failing Job',
          success_rate: 0.45,
        }),
      ];

      render(<JobsTable jobs={jobs} loading={false} />);

      const badge = screen.getByText('45.0%');
      expect(badge).toHaveClass('text-red-400', 'bg-red-500/10');
    });
  });

  describe('Formatting Functions: Edge cases', () => {
    it('should format cost correctly for very small amounts', () => {
      const jobs: JobMetric[] = [
        createJobMetric({
          job_name: 'Cheap Job',
          total_cost: 0.00003, // Less than 0.0001
        }),
      ];

      render(<JobsTable jobs={jobs} loading={false} />);

      expect(screen.getByText('<$0.0001')).toBeInTheDocument();
    });

    it('should format cost as $0.0000 for zero cost', () => {
      const jobs: JobMetric[] = [
        createJobMetric({
          job_name: 'Free Job',
          total_cost: 0,
        }),
      ];

      render(<JobsTable jobs={jobs} loading={false} />);

      expect(screen.getByText('$0.0000')).toBeInTheDocument();
    });

    it('should format duration in seconds when >= 1000ms', () => {
      const jobs: JobMetric[] = [
        createJobMetric({
          job_name: 'Slow Job',
          avg_duration_ms: 5500,
          max_duration_ms: 12000,
        }),
      ];

      render(<JobsTable jobs={jobs} loading={false} />);

      expect(screen.getByText('5.5s')).toBeInTheDocument();
      expect(screen.getByText('12.0s')).toBeInTheDocument();
    });

    it('should format duration in ms when < 1000ms', () => {
      const jobs: JobMetric[] = [
        createJobMetric({
          job_name: 'Fast Job',
          avg_duration_ms: 350,
          max_duration_ms: 800,
        }),
      ];

      render(<JobsTable jobs={jobs} loading={false} />);

      expect(screen.getByText('350ms')).toBeInTheDocument();
      expect(screen.getByText('800ms')).toBeInTheDocument();
    });

    it('should display dash for null last_executed_at', () => {
      const jobs: JobMetric[] = [
        createJobMetric({
          job_name: 'Never-Run Job',
          last_executed_at: null,
        }),
      ];

      render(<JobsTable jobs={jobs} loading={false} />);

      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('should format date correctly when present', () => {
      const jobs: JobMetric[] = [
        createJobMetric({
          job_name: 'Recent Job',
          last_executed_at: '2026-02-28T16:45:00Z',
        }),
      ];

      render(<JobsTable jobs={jobs} loading={false} />);

      // Date should be formatted (exact format depends on locale, but should contain month, day, time)
      const lastRunCell = screen.getByText(/Feb.*28.*16:45/);
      expect(lastRunCell).toBeInTheDocument();
    });
  });

  describe('Table Structure: Headers and styling', () => {
    it('should render table with correct headers', () => {
      const jobs: JobMetric[] = [
        createJobMetric(),
      ];

      render(<JobsTable jobs={jobs} loading={false} />);

      expect(screen.getByText('Job')).toBeInTheDocument();
      expect(screen.getByText('Executions')).toBeInTheDocument();
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByText('Avg Duration')).toBeInTheDocument();
      expect(screen.getByText('Max Duration')).toBeInTheDocument();
      expect(screen.getByText('Total Cost')).toBeInTheDocument();
      expect(screen.getByText('Last Run')).toBeInTheDocument();
    });

    it('should render table body with job rows', () => {
      const jobs: JobMetric[] = [
        createJobMetric(),
      ];

      render(<JobsTable jobs={jobs} loading={false} />);

      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();

      const rows = table.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
    });
  });
});
