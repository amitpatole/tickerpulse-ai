import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import AgentScheduleForm from '../AgentScheduleForm';
import type { AgentSchedule } from '@/lib/types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const MOCK_AGENTS = [
  { job_id: 'morning_briefing', name: 'Morning Briefing', description: 'Pre-market summary' },
  { job_id: 'technical_monitor', name: 'Technical Monitor', description: 'RSI/MACD signals' },
  { job_id: 'daily_summary', name: 'Daily Summary', description: 'End-of-day digest' },
];

const EXISTING_SCHEDULE: AgentSchedule = {
  id: 42,
  job_id: 'technical_monitor',
  label: 'Tech Monitor (custom)',
  description: 'Runs every 30 minutes instead of 15',
  trigger: 'interval',
  trigger_args: { seconds: 1800 },
  enabled: true,
  created_at: '2026-02-27T10:00:00',
  updated_at: '2026-02-27T10:00:00',
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderForm(
  overrides: Partial<React.ComponentProps<typeof AgentScheduleForm>> = {}
) {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const onClose = jest.fn();

  const props = {
    open: true,
    schedule: null,
    agents: MOCK_AGENTS,
    onClose,
    onSave,
    ...overrides,
  };

  render(<AgentScheduleForm {...props} />);
  return { onSave, onClose };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentScheduleForm', () => {

  it('renders agent dropdown with all known agents in create mode', () => {
    renderForm();

    // Modal is visible
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('New Agent Schedule')).toBeInTheDocument();

    // All agents appear in the select
    const select = screen.getByLabelText('Select agent job');
    expect(select).toBeInTheDocument();
    MOCK_AGENTS.forEach((a) => {
      expect(screen.getByText(new RegExp(a.job_id))).toBeInTheDocument();
    });
  });

  it('auto-populates label when agent is selected', async () => {
    const user = userEvent.setup();
    renderForm();

    const labelInput = screen.getByLabelText('Schedule label') as HTMLInputElement;

    // Clear the pre-filled label first
    await user.clear(labelInput);

    const jobSelect = screen.getByLabelText('Select agent job');
    await user.selectOptions(jobSelect, 'technical_monitor');

    // Label should be populated from agent name
    await waitFor(() => {
      expect(labelInput.value).toBe('Technical Monitor');
    });
  });

  it('loads existing schedule data in edit mode', () => {
    renderForm({ schedule: EXISTING_SCHEDULE });

    // Title shows "Edit Schedule"
    expect(screen.getByText('Edit Schedule')).toBeInTheDocument();

    // Job ID shown as readonly text (not a dropdown)
    expect(screen.getByText('technical_monitor')).toBeInTheDocument();
    expect(screen.queryByLabelText('Select agent job')).not.toBeInTheDocument();

    // Label is pre-filled
    const labelInput = screen.getByLabelText('Schedule label') as HTMLInputElement;
    expect(labelInput.value).toBe('Tech Monitor (custom)');

    // Description is pre-filled
    const descInput = screen.getByLabelText('Schedule description') as HTMLTextAreaElement;
    expect(descInput.value).toBe('Runs every 30 minutes instead of 15');
  });

  it('calls onSave with correct payload on submit', async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = renderForm();

    // First agent is pre-selected; enter a label
    const labelInput = screen.getByLabelText('Schedule label');
    await user.clear(labelInput);
    await user.type(labelInput, 'My Briefing Override');

    // Select the "Hourly" preset (index 2)
    const presetSelect = screen.getByLabelText('Select schedule preset');
    await user.selectOptions(presetSelect, '2');

    // Submit
    fireEvent.click(screen.getByText('Create Schedule'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        job_id: 'morning_briefing',
        label: 'My Briefing Override',
        description: undefined,
        trigger: 'interval',
        trigger_args: { seconds: 3600 },
      });
    });

    // Modal should close after successful save
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('prevents submission when job_id is empty (no agents available)', () => {
    // AC: When no agents are available, the Save button should be disabled
    // This prevents the user from getting a form error; instead, they see a disabled button
    const { onSave } = renderForm({ agents: [] });

    const createButton = screen.getByText('Create Schedule') as HTMLButtonElement;

    // Button should be disabled because no agents are available
    expect(createButton).toBeDisabled();

    // Even if user tries to interact with disabled button, onSave won't be called
    fireEvent.click(createButton);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('disables Save button when label is empty', () => {
    renderForm();

    // Clear the pre-populated label
    const labelInput = screen.getByLabelText('Schedule label');
    fireEvent.change(labelInput, { target: { value: '' } });

    const saveButton = screen.getByText('Create Schedule') as HTMLButtonElement;
    expect(saveButton).toBeDisabled();
  });

  it('disables Save button when label is whitespace-only', () => {
    renderForm();

    const labelInput = screen.getByLabelText('Schedule label');
    fireEvent.change(labelInput, { target: { value: '   ' } });

    const saveButton = screen.getByText('Create Schedule') as HTMLButtonElement;
    expect(saveButton).toBeDisabled();
  });

  it('re-enables Save button when a non-blank label is entered after clearing', async () => {
    const user = userEvent.setup();
    renderForm();

    const labelInput = screen.getByLabelText('Schedule label');
    await user.clear(labelInput);

    // Button disabled while label is empty
    expect(screen.getByText('Create Schedule') as HTMLButtonElement).toBeDisabled();

    // Type something valid
    await user.type(labelInput, 'My Schedule');

    // Button re-enabled
    expect(screen.getByText('Create Schedule') as HTMLButtonElement).not.toBeDisabled();
  });

  it('calls onClose when Cancel button is clicked', () => {
    const { onSave, onClose } = renderForm();

    fireEvent.click(screen.getByText('Cancel'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls onClose when the X button is clicked', () => {
    const { onClose } = renderForm();

    fireEvent.click(screen.getByLabelText('Close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('displays error message when save throws', async () => {
    const onSave = jest.fn().mockRejectedValue(new Error('Duplicate job_id'));
    const onClose = jest.fn();
    renderForm({ onSave, onClose });

    fireEvent.click(screen.getByText('Create Schedule'));

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toHaveTextContent('Duplicate job_id');
    });
    // Modal should NOT close on error
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows loading state while saving', async () => {
    let resolvePromise!: () => void;
    const onSave = jest.fn(
      () => new Promise<void>((resolve) => { resolvePromise = resolve; })
    );
    renderForm({ onSave });

    fireEvent.click(screen.getByText('Create Schedule'));

    // Button shows "Saving…" while in-flight
    await waitFor(() => {
      expect(screen.getByText('Saving…')).toBeInTheDocument();
    });

    // Resolve the promise and verify button returns to normal
    resolvePromise();
    await waitFor(() => {
      expect(screen.queryByText('Saving…')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // AC: Edge case tests for empty input handling
  // ---------------------------------------------------------------------------

  it('disables Save button when agents list is empty in create mode', () => {
    renderForm({ agents: [] });

    const saveButton = screen.getByText('Create Schedule') as HTMLButtonElement;

    // Button should be disabled when there are no agents to select
    expect(saveButton).toBeDisabled();
  });

  it('shows no-agents notice when agents list is empty in create mode', () => {
    renderForm({ agents: [] });

    expect(screen.getByTestId('no-agents-notice')).toBeInTheDocument();
  });

  it('hides no-agents notice when agents list is populated', () => {
    renderForm({ agents: MOCK_AGENTS });

    expect(screen.queryByTestId('no-agents-notice')).not.toBeInTheDocument();
  });

  it('enables Save button when agents list is populated in create mode', () => {
    renderForm({ agents: MOCK_AGENTS });

    const saveButton = screen.getByText('Create Schedule') as HTMLButtonElement;

    // Button should be enabled when agents are available
    expect(saveButton).not.toBeDisabled();
  });

  it('does not disable Save button in edit mode even with empty agents list', () => {
    // In edit mode, job_id is fixed (read-only), so empty agents list shouldn't matter
    renderForm({
      schedule: EXISTING_SCHEDULE,
      agents: [],  // Empty agents list shouldn't affect edit mode
    });

    const saveButton = screen.getByText('Save Changes') as HTMLButtonElement;

    // Button should NOT be disabled in edit mode, even with empty agents
    expect(saveButton).not.toBeDisabled();
  });

  it('hides no-agents notice in edit mode even with empty agents list', () => {
    renderForm({ schedule: EXISTING_SCHEDULE, agents: [] });

    expect(screen.queryByTestId('no-agents-notice')).not.toBeInTheDocument();
  });

  it('auto-fills label when switching agents if label matches previous agent name', async () => {
    const user = userEvent.setup();
    renderForm({ agents: MOCK_AGENTS });

    // First agent "Morning Briefing" is pre-selected
    const labelInput = screen.getByLabelText('Schedule label') as HTMLInputElement;
    await waitFor(() => {
      expect(labelInput.value).toBe('Morning Briefing');
    });

    // User switches to "Technical Monitor"
    const jobSelect = screen.getByLabelText('Select agent job');
    await user.selectOptions(jobSelect, 'technical_monitor');

    // Label should auto-update to "Technical Monitor" because it still matches
    // the previous agent's name (wasn't manually customized)
    await waitFor(() => {
      expect(labelInput.value).toBe('Technical Monitor');
    });
  });

  it('preserves custom label when switching agents if label was manually edited', async () => {
    const user = userEvent.setup();
    renderForm({ agents: MOCK_AGENTS });

    const labelInput = screen.getByLabelText('Schedule label') as HTMLInputElement;

    // Wait for initial agent to be pre-filled
    await waitFor(() => {
      expect(labelInput.value).toBe('Morning Briefing');
    });

    // User manually customizes the label
    await user.clear(labelInput);
    await user.type(labelInput, 'My Custom Label');
    expect(labelInput.value).toBe('My Custom Label');

    // User switches to a different agent
    const jobSelect = screen.getByLabelText('Select agent job');
    await user.selectOptions(jobSelect, 'technical_monitor');

    // Label should NOT change because user customized it (doesn't match agent name anymore)
    await waitFor(() => {
      expect(labelInput.value).toBe('My Custom Label');
    });
  });

  it('updates stale label when user clears it then switches agents', async () => {
    const user = userEvent.setup();
    renderForm({ agents: MOCK_AGENTS });

    const labelInput = screen.getByLabelText('Schedule label') as HTMLInputElement;
    const jobSelect = screen.getByLabelText('Select agent job');

    // Initial state: first agent with auto-filled label
    await waitFor(() => {
      expect(labelInput.value).toBe('Morning Briefing');
    });

    // User manually clears the label (simulating "clear it then switch")
    await user.clear(labelInput);
    expect(labelInput.value).toBe('');

    // User switches agents
    await user.selectOptions(jobSelect, 'daily_summary');

    // Label should be auto-filled from the new agent's name
    // because the empty label is treated as "not customized"
    await waitFor(() => {
      expect(labelInput.value).toBe('Daily Summary');
    });
  });

  // ---------------------------------------------------------------------------
  // BUG B FIX: Async agents loading edge cases
  // AC: Late agents fetch should NOT clobber user-selected job_id/label;
  //     initializedRef guards against effect re-fire when agents arrive async
  // ---------------------------------------------------------------------------

  it('does not clobber user selection when agents load asynchronously after modal opens (Bug B fix)', async () => {
    const user = userEvent.setup();
    // Render with empty agents list (simulating initial state before async fetch)
    const { rerender } = render(
      <AgentScheduleForm
        open={true}
        schedule={null}
        agents={[]}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );

    // Wait for no-agents notice to appear
    await waitFor(() => {
      expect(screen.getByTestId('no-agents-notice')).toBeInTheDocument();
    });

    // Now agents load asynchronously
    rerender(
      <AgentScheduleForm
        open={true}
        schedule={null}
        agents={MOCK_AGENTS}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );

    // After agents load, the form should initialize (due to deferred initialization)
    const labelInput = screen.getByLabelText('Schedule label') as HTMLInputElement;
    await waitFor(() => {
      // Should be initialized to first agent, not clobbered by re-fire
      expect(labelInput.value).toBe('Morning Briefing');
    });

    // User selects a different agent
    const jobSelect = screen.getByLabelText('Select agent job');
    await user.selectOptions(jobSelect, 'daily_summary');

    // Label should update to the selected agent
    await waitFor(() => {
      expect(labelInput.value).toBe('Daily Summary');
    });

    // Re-render again (simulating agents prop change, e.g., a refetch)
    rerender(
      <AgentScheduleForm
        open={true}
        schedule={null}
        agents={MOCK_AGENTS}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );

    // User selection should NOT be clobbered by the re-render
    // (initializedRef prevents effect re-fire)
    await waitFor(() => {
      expect(labelInput.value).toBe('Daily Summary');
    });
  });

  it('resets initialization flag when modal closes and reopens (Bug B fix)', async () => {
    const onClose = jest.fn();
    const { rerender } = render(
      <AgentScheduleForm
        open={true}
        schedule={null}
        agents={MOCK_AGENTS}
        onClose={onClose}
        onSave={jest.fn()}
      />
    );

    // Form initializes with first agent
    const labelInput = screen.getByLabelText('Schedule label') as HTMLInputElement;
    await waitFor(() => {
      expect(labelInput.value).toBe('Morning Briefing');
    });

    // Close modal
    rerender(
      <AgentScheduleForm
        open={false}
        schedule={null}
        agents={MOCK_AGENTS}
        onClose={onClose}
        onSave={jest.fn()}
      />
    );

    // Modal should be hidden
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Reopen modal
    rerender(
      <AgentScheduleForm
        open={true}
        schedule={null}
        agents={MOCK_AGENTS}
        onClose={onClose}
        onSave={jest.fn()}
      />
    );

    // Form should re-initialize fresh (initializedRef was reset to false)
    // This verifies the flag is properly reset on close
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      const reopenedLabel = screen.getByLabelText('Schedule label') as HTMLInputElement;
      expect(reopenedLabel.value).toBe('Morning Briefing');
    });
  });

  it('defers initialization in create mode until agents list is non-empty (Bug B fix)', async () => {
    // Render in create mode with no agents
    const { rerender } = render(
      <AgentScheduleForm
        open={true}
        schedule={null}
        agents={[]}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );

    // Should show no-agents notice, form not yet initialized
    expect(screen.getByTestId('no-agents-notice')).toBeInTheDocument();

    // User triggers an agents fetch that resolves
    rerender(
      <AgentScheduleForm
        open={true}
        schedule={null}
        agents={MOCK_AGENTS}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );

    // Now initialization should complete and first agent should be selected
    const labelInput = screen.getByLabelText('Schedule label') as HTMLInputElement;
    await waitFor(() => {
      expect(labelInput.value).toBe('Morning Briefing');
    });

    // No-agents notice should be hidden
    expect(screen.queryByTestId('no-agents-notice')).not.toBeInTheDocument();
  });
});
