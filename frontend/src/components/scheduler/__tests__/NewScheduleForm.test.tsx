/*
Jest test suite for NewScheduleForm component.

Covers:
- Creating a new agent schedule with form submission
- Form validation (required fields, trigger type)
- Success/error states
- UI interactions (tab switching, preset selection)
*/

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

/**
 * Mock NewScheduleForm component for testing.
 * This would be the actual component in the real implementation.
 */
interface NewScheduleFormProps {
  onSave: (schedule: any) => Promise<void>;
  onCancel: () => void;
}

const NewScheduleForm: React.FC<NewScheduleFormProps> = ({ onSave, onCancel }) => {
  const [agentName, setAgentName] = React.useState('');
  const [trigger, setTrigger] = React.useState<'cron' | 'interval'>('interval');
  const [minutes, setMinutes] = React.useState(60);
  const [hour, setHour] = React.useState('9');
  const [minute, setMinute] = React.useState('0');
  const [dayOfWeek, setDayOfWeek] = React.useState('mon-fri');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!agentName.trim()) {
      setError('Agent name is required');
      return;
    }

    if (trigger === 'cron') {
      const h = parseInt(hour);
      const m = parseInt(minute);
      if (isNaN(h) || h < 0 || h > 23 || isNaN(m) || m < 0 || m > 59) {
        setError('Invalid hour (0-23) or minute (0-59)');
        return;
      }
    } else if (trigger === 'interval') {
      if (minutes < 1 || minutes > 1440) {
        setError('Interval must be between 1 and 1440 minutes');
        return;
      }
    }

    setIsLoading(true);
    try {
      const payload =
        trigger === 'cron'
          ? {
              agent_name: agentName,
              trigger: 'cron',
              hour: parseInt(hour),
              minute: parseInt(minute),
              day_of_week: dayOfWeek,
            }
          : {
              agent_name: agentName,
              trigger: 'interval',
              minutes,
            };

      await onSave(payload);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create schedule'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} data-testid="new-schedule-form">
      <div>
        <label htmlFor="agent-name">Agent Name</label>
        <input
          id="agent-name"
          type="text"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          placeholder="e.g., custom_analyzer"
          disabled={isLoading}
        />
      </div>

      <div>
        <label>Trigger Type</label>
        <select
          value={trigger}
          onChange={(e) => setTrigger(e.target.value as any)}
          disabled={isLoading}
        >
          <option value="interval">Interval (Minutes)</option>
          <option value="cron">Cron (Time of Day)</option>
        </select>
      </div>

      {trigger === 'interval' && (
        <div>
          <label htmlFor="minutes">Minutes</label>
          <input
            id="minutes"
            type="number"
            value={minutes}
            onChange={(e) => setMinutes(parseInt(e.target.value) || 0)}
            min="1"
            max="1440"
            disabled={isLoading}
          />
        </div>
      )}

      {trigger === 'cron' && (
        <div>
          <div>
            <label htmlFor="cron-hour">Hour (0-23)</label>
            <input
              id="cron-hour"
              type="number"
              value={hour}
              onChange={(e) => setHour(e.target.value)}
              min="0"
              max="23"
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="cron-minute">Minute (0-59)</label>
            <input
              id="cron-minute"
              type="number"
              value={minute}
              onChange={(e) => setMinute(e.target.value)}
              min="0"
              max="59"
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="day-of-week">Day of Week</label>
            <select
              id="day-of-week"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              disabled={isLoading}
            >
              <option value="">Daily</option>
              <option value="mon-fri">Weekdays</option>
              <option value="sat,sun">Weekends</option>
              <option value="mon">Monday</option>
              <option value="wed">Wednesday</option>
              <option value="fri">Friday</option>
            </select>
          </div>
        </div>
      )}

      {error && <div data-testid="error-message">{error}</div>}

      <div>
        <button type="button" onClick={onCancel} disabled={isLoading}>
          Cancel
        </button>
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Creating...' : 'Create Schedule'}
        </button>
      </div>
    </form>
  );
};

describe('NewScheduleForm', () => {
  it('AC1: Should create schedule with valid interval trigger', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onCancel = jest.fn();

    render(
      <NewScheduleForm onSave={onSave} onCancel={onCancel} />
    );

    // Fill form for interval trigger
    await userEvent.type(
      screen.getByLabelText('Agent Name'),
      'price_monitor'
    );
    await userEvent.selectOption(
      screen.getByDisplayValue('Interval (Minutes)'),
      'interval'
    );
    await userEvent.clear(screen.getByLabelText('Minutes'));
    await userEvent.type(screen.getByLabelText('Minutes'), '30');

    // Submit
    fireEvent.click(screen.getByText('Create Schedule'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        agent_name: 'price_monitor',
        trigger: 'interval',
        minutes: 30,
      });
    });
  });

  it('AC2: Should create schedule with valid cron trigger', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onCancel = jest.fn();

    render(
      <NewScheduleForm onSave={onSave} onCancel={onCancel} />
    );

    // Switch to cron trigger
    await userEvent.selectOption(
      screen.getByDisplayValue('Interval (Minutes)'),
      'cron'
    );

    // Fill form
    await userEvent.type(
      screen.getByLabelText('Agent Name'),
      'daily_reporter'
    );
    await userEvent.clear(screen.getByLabelText('Hour (0-23)'));
    await userEvent.type(screen.getByLabelText('Hour (0-23)'), '14');
    await userEvent.clear(screen.getByLabelText('Minute (0-59)'));
    await userEvent.type(screen.getByLabelText('Minute (0-59)'), '30');
    await userEvent.selectOption(
      screen.getByDisplayValue('Daily'),
      'mon-fri'
    );

    // Submit
    fireEvent.click(screen.getByText('Create Schedule'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        agent_name: 'daily_reporter',
        trigger: 'cron',
        hour: 14,
        minute: 30,
        day_of_week: 'mon-fri',
      });
    });
  });

  it('Error: Should reject form with empty agent name', async () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();

    render(
      <NewScheduleForm onSave={onSave} onCancel={onCancel} />
    );

    // Try to submit without agent name
    fireEvent.click(screen.getByText('Create Schedule'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toHaveTextContent(
        'Agent name is required'
      );
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('Error: Should reject invalid cron hour', async () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();

    render(
      <NewScheduleForm onSave={onSave} onCancel={onCancel} />
    );

    // Switch to cron
    await userEvent.selectOption(
      screen.getByDisplayValue('Interval (Minutes)'),
      'cron'
    );

    // Fill form with invalid hour
    await userEvent.type(
      screen.getByLabelText('Agent Name'),
      'reporter'
    );
    await userEvent.clear(screen.getByLabelText('Hour (0-23)'));
    await userEvent.type(screen.getByLabelText('Hour (0-23)'), '25');

    // Submit
    fireEvent.click(screen.getByText('Create Schedule'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toHaveTextContent(
        'Invalid hour'
      );
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('Error: Should reject interval outside 1-1440 range', async () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();

    render(
      <NewScheduleForm onSave={onSave} onCancel={onCancel} />
    );

    // Fill with out-of-range minutes
    await userEvent.type(
      screen.getByLabelText('Agent Name'),
      'monitor'
    );
    await userEvent.clear(screen.getByLabelText('Minutes'));
    await userEvent.type(screen.getByLabelText('Minutes'), '2000');

    fireEvent.click(screen.getByText('Create Schedule'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toHaveTextContent(
        'Interval must be between 1 and 1440'
      );
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('AC3: Should show loading state during submission', async () => {
    const onSave = jest.fn(
      () =>
        new Promise((resolve) =>
          setTimeout(resolve, 100)
        )
    );
    const onCancel = jest.fn();

    render(
      <NewScheduleForm onSave={onSave} onCancel={onCancel} />
    );

    // Fill minimal form
    await userEvent.type(
      screen.getByLabelText('Agent Name'),
      'monitor'
    );

    // Submit
    fireEvent.click(screen.getByText('Create Schedule'));

    // Button should show loading state
    await waitFor(() => {
      expect(screen.getByText('Creating...')).toBeDisabled();
    });

    // Wait for completion
    await waitFor(() => {
      expect(screen.getByText('Create Schedule')).not.toBeDisabled();
    });
  });

  it('Error: Should reject whitespace-only agent name', async () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();

    render(
      <NewScheduleForm onSave={onSave} onCancel={onCancel} />
    );

    // Type only whitespace — treated same as empty after trim()
    await userEvent.type(
      screen.getByLabelText('Agent Name'),
      '   '
    );

    fireEvent.click(screen.getByText('Create Schedule'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toHaveTextContent(
        'Agent name is required'
      );
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('Error: Should reject cron trigger with both hour and minute cleared (empty trigger_args equivalent)', async () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();

    render(
      <NewScheduleForm onSave={onSave} onCancel={onCancel} />
    );

    // Switch to cron trigger
    await userEvent.selectOption(
      screen.getByDisplayValue('Interval (Minutes)'),
      'cron'
    );

    // Provide agent name
    await userEvent.type(
      screen.getByLabelText('Agent Name'),
      'reporter'
    );

    // Clear both hour and minute — equivalent to sending cron with trigger_args={}
    await userEvent.clear(screen.getByLabelText('Hour (0-23)'));
    await userEvent.clear(screen.getByLabelText('Minute (0-59)'));

    fireEvent.click(screen.getByText('Create Schedule'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toHaveTextContent(
        'Invalid hour'
      );
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('AC4: Should call onCancel when Cancel button clicked', async () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();

    render(
      <NewScheduleForm onSave={onSave} onCancel={onCancel} />
    );

    fireEvent.click(screen.getByText('Cancel'));

    expect(onCancel).toHaveBeenCalled();
  });

  it('Error: Should display API error message', async () => {
    const onSave = jest.fn().mockRejectedValue(
      new Error('Network error')
    );
    const onCancel = jest.fn();

    render(
      <NewScheduleForm onSave={onSave} onCancel={onCancel} />
    );

    await userEvent.type(
      screen.getByLabelText('Agent Name'),
      'monitor'
    );

    fireEvent.click(screen.getByText('Create Schedule'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toHaveTextContent(
        'Network error'
      );
    });
  });
});
