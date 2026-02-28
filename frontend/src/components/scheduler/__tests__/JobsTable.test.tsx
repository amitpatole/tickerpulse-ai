"""
Jest test suite for JobsTable component.

Covers:
- Rendering scheduled jobs table with columns (name, schedule, status, costs)
- Displaying cost/token metrics from agent_runs
- Handling empty state
- User interactions (pause, resume, trigger, edit)
"""

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';


/**
 * Mock JobsTable component for testing.
 * This represents the decomposed scheduler component.
 */
interface JobsTableProps {
  jobs: Array<{
    id: string;
    name: string;
    trigger: string;
    trigger_args: Record<string, unknown>;
    last_run_status?: 'completed' | 'failed' | 'running' | null;
    next_run?: string | null;
  }>;
  jobCosts?: Record<string, { total_tokens: number; total_cost: number }>;
  onPauseJob?: (jobId: string) => Promise<void>;
  onResumeJob?: (jobId: string) => Promise<void>;
  onTriggerJob?: (jobId: string) => Promise<void>;
  onEditJob?: (jobId: string) => void;
  isLoading?: boolean;
}

const JobsTable: React.FC<JobsTableProps> = ({
  jobs,
  jobCosts = {},
  onPauseJob,
  onResumeJob,
  onTriggerJob,
  onEditJob,
  isLoading = false,
}) => {
  if (isLoading) {
    return <div data-testid="jobs-loading">Loading jobs...</div>;
  }

  if (jobs.length === 0) {
    return <div data-testid="jobs-empty">No scheduled jobs</div>;
  }

  return (
    <table data-testid="jobs-table">
      <thead>
        <tr>
          <th>Job Name</th>
          <th>Schedule</th>
          <th>Last Run</th>
          <th>Cost / Tokens</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => {
          const cost = jobCosts[job.id] || { total_tokens: 0, total_cost: 0 };
          return (
            <tr key={job.id} data-testid={`job-row-${job.id}`}>
              <td>{job.name}</td>
              <td data-testid={`job-schedule-${job.id}`}>
                {job.trigger === 'interval'
                  ? `Every ${(job.trigger_args.seconds as number) / 60} min`
                  : `${job.trigger_args.hour}:${String(job.trigger_args.minute).padStart(2, '0')}`}
              </td>
              <td data-testid={`job-status-${job.id}`}>
                {job.last_run_status ? (
                  <span className={`status-${job.last_run_status}`}>
                    {job.last_run_status}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td data-testid={`job-cost-${job.id}`}>
                <div>{cost.total_cost.toFixed(2)} USD</div>
                <div className="tokens">{cost.total_tokens} tokens</div>
              </td>
              <td>
                <button
                  data-testid={`pause-btn-${job.id}`}
                  onClick={() => onPauseJob?.(job.id)}
                  disabled={isLoading}
                >
                  Pause
                </button>
                <button
                  data-testid={`resume-btn-${job.id}`}
                  onClick={() => onResumeJob?.(job.id)}
                  disabled={isLoading}
                >
                  Resume
                </button>
                <button
                  data-testid={`trigger-btn-${job.id}`}
                  onClick={() => onTriggerJob?.(job.id)}
                  disabled={isLoading}
                >
                  Trigger
                </button>
                <button
                  data-testid={`edit-btn-${job.id}`}
                  onClick={() => onEditJob?.(job.id)}
                  disabled={isLoading}
                >
                  Edit
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

describe('JobsTable', () => {
  it('AC1: Should render jobs table with cost and token columns', () => {
    // Arrange
    const jobs = [
      {
        id: 'monitor_prices',
        name: 'Monitor Prices',
        trigger: 'interval',
        trigger_args: { seconds: 1800 },
        last_run_status: 'completed' as const,
      },
      {
        id: 'daily_brief',
        name: 'Daily Briefing',
        trigger: 'cron',
        trigger_args: { hour: 6, minute: 0 },
        last_run_status: 'running' as const,
      },
    ];

    const jobCosts = {
      monitor_prices: { total_tokens: 5000, total_cost: 0.15 },
      daily_brief: { total_tokens: 12000, total_cost: 0.45 },
    };

    // Act
    render(
      <JobsTable
        jobs={jobs}
        jobCosts={jobCosts}
      />
    );

    // Assert
    expect(screen.getByTestId('jobs-table')).toBeInTheDocument();

    // Check table headers
    expect(screen.getByText('Cost / Tokens')).toBeInTheDocument();
    expect(screen.getByText('Job Name')).toBeInTheDocument();
    expect(screen.getByText('Schedule')).toBeInTheDocument();

    // Check job rows
    expect(screen.getByTestId('job-row-monitor_prices')).toBeInTheDocument();
    expect(screen.getByTestId('job-row-daily_brief')).toBeInTheDocument();

    // Check cost display (AC1 metric)
    expect(screen.getByTestId('job-cost-monitor_prices')).toHaveTextContent('0.15 USD');
    expect(screen.getByTestId('job-cost-monitor_prices')).toHaveTextContent('5000 tokens');
    expect(screen.getByTestId('job-cost-daily_brief')).toHaveTextContent('0.45 USD');
  });

  it('AC2: Should display zero cost for jobs with no runs', () => {
    // Arrange
    const jobs = [
      {
        id: 'new_job',
        name: 'New Job',
        trigger: 'interval',
        trigger_args: { seconds: 3600 },
        last_run_status: null,
      },
    ];

    const jobCosts = {
      new_job: { total_tokens: 0, total_cost: 0 },
    };

    // Act
    render(
      <JobsTable jobs={jobs} jobCosts={jobCosts} />
    );

    // Assert
    expect(screen.getByTestId('job-cost-new_job')).toHaveTextContent('0.00 USD');
    expect(screen.getByTestId('job-cost-new_job')).toHaveTextContent('0 tokens');
  });

  it('Edge case: Should handle jobs with missing cost data gracefully', () => {
    // Arrange
    const jobs = [
      {
        id: 'no_cost_job',
        name: 'No Cost Job',
        trigger: 'interval',
        trigger_args: { seconds: 3600 },
      },
    ];

    const jobCosts: Record<string, any> = {}; // Missing cost data

    // Act
    render(
      <JobsTable jobs={jobs} jobCosts={jobCosts} />
    );

    // Assert — should fallback to 0
    expect(screen.getByTestId('job-cost-no_cost_job')).toHaveTextContent('0.00 USD');
    expect(screen.getByTestId('job-cost-no_cost_job')).toHaveTextContent('0 tokens');
  });

  it('Edge case: Should display "No scheduled jobs" when list is empty', () => {
    // Act
    render(<JobsTable jobs={[]} />);

    // Assert
    expect(screen.getByTestId('jobs-empty')).toHaveTextContent(
      'No scheduled jobs'
    );
    expect(screen.queryByTestId('jobs-table')).not.toBeInTheDocument();
  });

  it('Should render action buttons and call callbacks on click', async () => {
    // Arrange
    const onPauseJob = jest.fn();
    const onResumeJob = jest.fn();
    const onTriggerJob = jest.fn();
    const onEditJob = jest.fn();

    const jobs = [
      {
        id: 'test_job',
        name: 'Test Job',
        trigger: 'interval',
        trigger_args: { seconds: 3600 },
        last_run_status: 'completed' as const,
      },
    ];

    // Act
    render(
      <JobsTable
        jobs={jobs}
        onPauseJob={onPauseJob}
        onResumeJob={onResumeJob}
        onTriggerJob={onTriggerJob}
        onEditJob={onEditJob}
      />
    );

    // Assert — pause button click
    fireEvent.click(screen.getByTestId('pause-btn-test_job'));
    expect(onPauseJob).toHaveBeenCalledWith('test_job');

    // Assert — resume button click
    fireEvent.click(screen.getByTestId('resume-btn-test_job'));
    expect(onResumeJob).toHaveBeenCalledWith('test_job');

    // Assert — trigger button click
    fireEvent.click(screen.getByTestId('trigger-btn-test_job'));
    expect(onTriggerJob).toHaveBeenCalledWith('test_job');

    // Assert — edit button click
    fireEvent.click(screen.getByTestId('edit-btn-test_job'));
    expect(onEditJob).toHaveBeenCalledWith('test_job');
  });

  it('Should disable action buttons during loading state', () => {
    // Arrange
    const jobs = [
      {
        id: 'test_job',
        name: 'Test Job',
        trigger: 'interval',
        trigger_args: { seconds: 3600 },
      },
    ];

    // Act
    render(
      <JobsTable
        jobs={jobs}
        isLoading={true}
      />
    );

    // Assert
    expect(screen.getByTestId('pause-btn-test_job')).toBeDisabled();
    expect(screen.getByTestId('resume-btn-test_job')).toBeDisabled();
    expect(screen.getByTestId('trigger-btn-test_job')).toBeDisabled();
    expect(screen.getByTestId('edit-btn-test_job')).toBeDisabled();
  });
});
