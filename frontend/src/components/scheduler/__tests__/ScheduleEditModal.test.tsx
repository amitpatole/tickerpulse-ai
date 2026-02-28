import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ScheduleEditModal from '../ScheduleEditModal';
import type { ScheduledJob } from '@/lib/types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const MOCK_CRON_JOB: ScheduledJob = {
  id: 'morning_briefing',
  name: 'Morning Briefing',
  trigger: 'cron',
  trigger_args: { hour: 8, minute: 30, day_of_week: 'mon-fri' },
  enabled: true,
  next_run: null,
};

const MOCK_INTERVAL_JOB: ScheduledJob = {
  id: 'price_monitor',
  name: 'Price Monitor',
  trigger: 'interval',
  trigger_args: { seconds: 900 },
  enabled: true,
  next_run: null,
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderModal(
  overrides: Partial<React.ComponentProps<typeof ScheduleEditModal>> = {}
) {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const onClose = jest.fn();

  const props = {
    open: true,
    job: MOCK_CRON_JOB,
    onClose,
    onSave,
    ...overrides,
  };

  render(<ScheduleEditModal {...props} />);
  return { onSave, onClose };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScheduleEditModal', () => {

  describe('Rendering', () => {
    it('renders with job name in header', () => {
      renderModal();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Morning Briefing')).toBeInTheDocument();
      expect(screen.getByText('Edit Schedule')).toBeInTheDocument();
    });

    it('does not render when open is false', () => {
      renderModal({ open: false });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not render when job is null', () => {
      renderModal({ job: null });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('initialises in cron mode for a cron job', () => {
      renderModal({ job: MOCK_CRON_JOB });
      expect(screen.getByLabelText('Cron hour')).toBeInTheDocument();
      expect(screen.getByLabelText('Cron minute')).toBeInTheDocument();
    });

    it('initialises in interval mode for an interval job', () => {
      renderModal({ job: MOCK_INTERVAL_JOB });
      expect(screen.getByLabelText('Interval value')).toBeInTheDocument();
      expect(screen.queryByLabelText('Cron hour')).not.toBeInTheDocument();
    });

    it('pre-fills cron hour and minute from job trigger_args', () => {
      renderModal({ job: MOCK_CRON_JOB });
      expect(screen.getByLabelText('Cron hour')).toHaveValue(8);
      expect(screen.getByLabelText('Cron minute')).toHaveValue(30);
    });
  });

  // ---------------------------------------------------------------------------
  // AC: Cron empty-input validation — Save button disables on invalid state
  // ---------------------------------------------------------------------------

  describe('Cron validation', () => {
    it('disables Save button when both hour and minute are cleared', () => {
      renderModal({ job: MOCK_CRON_JOB });

      fireEvent.change(screen.getByLabelText('Cron hour'), { target: { value: '' } });
      fireEvent.change(screen.getByLabelText('Cron minute'), { target: { value: '' } });

      expect(screen.getByText('Save Schedule').closest('button')).toBeDisabled();
    });

    it('does not call onSave when Save button is disabled due to empty hour and minute', () => {
      const { onSave } = renderModal({ job: MOCK_CRON_JOB });

      fireEvent.change(screen.getByLabelText('Cron hour'), { target: { value: '' } });
      fireEvent.change(screen.getByLabelText('Cron minute'), { target: { value: '' } });

      fireEvent.click(screen.getByText('Save Schedule').closest('button')!);
      expect(onSave).not.toHaveBeenCalled();
    });

    it('disables Save button when hour is whitespace-only and minute is empty', () => {
      renderModal({ job: MOCK_CRON_JOB });

      fireEvent.change(screen.getByLabelText('Cron hour'), { target: { value: '   ' } });
      fireEvent.change(screen.getByLabelText('Cron minute'), { target: { value: '' } });

      expect(screen.getByText('Save Schedule').closest('button')).toBeDisabled();
    });

    it('disables Save button when minute is whitespace-only and hour is empty', () => {
      renderModal({ job: MOCK_CRON_JOB });

      fireEvent.change(screen.getByLabelText('Cron hour'), { target: { value: '' } });
      fireEvent.change(screen.getByLabelText('Cron minute'), { target: { value: '   ' } });

      expect(screen.getByText('Save Schedule').closest('button')).toBeDisabled();
    });

    it('enables Save button when hour is provided and minute is empty (hour-only cron)', () => {
      renderModal({ job: MOCK_CRON_JOB });

      fireEvent.change(screen.getByLabelText('Cron minute'), { target: { value: '' } });

      expect(screen.getByText('Save Schedule').closest('button')).not.toBeDisabled();
    });

    it('enables Save button when minute is provided and hour is empty (minute-only cron)', () => {
      renderModal({ job: MOCK_CRON_JOB });

      fireEvent.change(screen.getByLabelText('Cron hour'), { target: { value: '' } });

      expect(screen.getByText('Save Schedule').closest('button')).not.toBeDisabled();
    });

    it('accepts cron with hour only — calls onSave without minute', async () => {
      const { onSave } = renderModal({ job: MOCK_CRON_JOB });

      fireEvent.change(screen.getByLabelText('Cron minute'), { target: { value: '' } });
      fireEvent.click(screen.getByText('Save Schedule'));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
      });
    });

    it('accepts cron with minute only — calls onSave without hour', async () => {
      const { onSave } = renderModal({ job: MOCK_CRON_JOB });

      fireEvent.change(screen.getByLabelText('Cron hour'), { target: { value: '' } });
      fireEvent.click(screen.getByText('Save Schedule'));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
      });
    });

    it('disables Save button for out-of-range hour (> 23)', () => {
      renderModal({ job: MOCK_CRON_JOB });

      fireEvent.change(screen.getByLabelText('Cron hour'), { target: { value: '25' } });

      expect(screen.getByText('Save Schedule').closest('button')).toBeDisabled();
    });

    it('disables Save button for out-of-range minute (> 59)', () => {
      renderModal({ job: MOCK_CRON_JOB });

      fireEvent.change(screen.getByLabelText('Cron minute'), { target: { value: '60' } });

      expect(screen.getByText('Save Schedule').closest('button')).toBeDisabled();
    });

    it('calls onSave with correct cron args when form is valid', async () => {
      const { onSave } = renderModal({ job: MOCK_CRON_JOB });

      fireEvent.change(screen.getByLabelText('Cron hour'), { target: { value: '14' } });
      fireEvent.change(screen.getByLabelText('Cron minute'), { target: { value: '0' } });

      fireEvent.click(screen.getByText('Save Schedule'));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          'morning_briefing',
          'cron',
          expect.objectContaining({ hour: 14, minute: 0 })
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // AC: Partial cron args — Bug A fix (parseTriggerArgs defaults)
  // ---------------------------------------------------------------------------

  describe('Partial cron args loading', () => {
    it('loads hour as empty when trigger_args contains only minute', () => {
      const MINUTE_ONLY_JOB: ScheduledJob = {
        id: 'minute_only',
        name: 'Minute Only Job',
        trigger: 'cron',
        trigger_args: { minute: 30 },
        enabled: true,
        next_run: null,
      };
      renderModal({ job: MINUTE_ONLY_JOB });
      // hour field must be empty, not silently defaulted to '8'
      expect(screen.getByLabelText('Cron hour')).toHaveValue(null);
      expect(screen.getByLabelText('Cron minute')).toHaveValue(30);
    });

    it('loads minute as empty when trigger_args contains only hour', () => {
      const HOUR_ONLY_JOB: ScheduledJob = {
        id: 'hour_only',
        name: 'Hour Only Job',
        trigger: 'cron',
        trigger_args: { hour: 9 },
        enabled: true,
        next_run: null,
      };
      renderModal({ job: HOUR_ONLY_JOB });
      expect(screen.getByLabelText('Cron hour')).toHaveValue(9);
      // minute field must be empty, not silently defaulted to '30'
      expect(screen.getByLabelText('Cron minute')).toHaveValue(null);
    });

    it('Save is enabled with minute-only cron (hour-only is also sufficient)', () => {
      const MINUTE_ONLY_JOB: ScheduledJob = {
        id: 'minute_only_2',
        name: 'Minute Only Job 2',
        trigger: 'cron',
        trigger_args: { minute: 15 },
        enabled: true,
        next_run: null,
      };
      renderModal({ job: MINUTE_ONLY_JOB });
      // minute is set, hour is empty — one field is enough, Save should be enabled
      expect(screen.getByText('Save Schedule').closest('button')).not.toBeDisabled();
    });
  });

  describe('Interval validation', () => {
    it('disables Save button when 0 is entered in interval field', () => {
      // Entering 0 stores 0 in state; validate() rejects it as below minimum.
      renderModal({ job: MOCK_INTERVAL_JOB });

      fireEvent.change(screen.getByLabelText('Interval value'), { target: { value: '0' } });

      expect(screen.getByText('Save Schedule').closest('button')).toBeDisabled();
    });

    it('calls onSave with correct seconds when interval form is valid', async () => {
      const { onSave } = renderModal({ job: MOCK_INTERVAL_JOB });

      // MOCK_INTERVAL_JOB has 900 seconds (15 minutes) — no changes needed
      fireEvent.click(screen.getByText('Save Schedule'));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith('price_monitor', 'interval', { seconds: 900 });
      });
    });
  });

  describe('Mode switching', () => {
    it('switches to interval mode and shows interval form', () => {
      renderModal({ job: MOCK_CRON_JOB });

      fireEvent.click(screen.getByRole('button', { name: 'Interval' }));

      expect(screen.getByLabelText('Interval value')).toBeInTheDocument();
      expect(screen.queryByLabelText('Cron hour')).not.toBeInTheDocument();
    });

    it('switches to cron mode and shows cron form', () => {
      renderModal({ job: MOCK_INTERVAL_JOB });

      fireEvent.click(screen.getByRole('button', { name: 'Cron' }));

      expect(screen.getByLabelText('Cron hour')).toBeInTheDocument();
      expect(screen.queryByLabelText('Interval value')).not.toBeInTheDocument();
    });

    it('Save button re-enables when switching from invalid cron to valid interval mode', async () => {
      const { onSave } = renderModal({ job: MOCK_CRON_JOB });

      // Clear both cron fields → Save button is disabled
      fireEvent.change(screen.getByLabelText('Cron hour'), { target: { value: '' } });
      fireEvent.change(screen.getByLabelText('Cron minute'), { target: { value: '' } });
      expect(screen.getByText('Save Schedule').closest('button')).toBeDisabled();

      // Switch to interval mode (default 15 min = valid) → button re-enables
      fireEvent.click(screen.getByRole('button', { name: 'Interval' }));
      expect(screen.getByText('Save Schedule').closest('button')).not.toBeDisabled();

      // Can save successfully
      fireEvent.click(screen.getByText('Save Schedule'));
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith('morning_briefing', 'interval', expect.any(Object));
      });
    });
  });

  describe('Preset buttons', () => {
    it('applies a cron preset and populates hour and minute fields', () => {
      renderModal({ job: MOCK_INTERVAL_JOB });

      // Switch to cron then apply preset
      fireEvent.click(screen.getByRole('button', { name: 'Cron' }));
      fireEvent.click(screen.getByText('Weekdays 8:30 AM'));

      expect(screen.getByLabelText('Cron hour')).toHaveValue(8);
      expect(screen.getByLabelText('Cron minute')).toHaveValue(30);
    });

    it('re-enables Save button when a preset is applied after invalid state', () => {
      renderModal({ job: MOCK_CRON_JOB });

      // Trigger invalid state
      fireEvent.change(screen.getByLabelText('Cron hour'), { target: { value: '' } });
      fireEvent.change(screen.getByLabelText('Cron minute'), { target: { value: '' } });
      expect(screen.getByText('Save Schedule').closest('button')).toBeDisabled();

      // Apply a preset — sets valid values
      fireEvent.click(screen.getByText('Daily midnight'));

      expect(screen.getByText('Save Schedule').closest('button')).not.toBeDisabled();
    });
  });

  describe('Close behaviour', () => {
    it('calls onClose when Cancel button is clicked', () => {
      const { onClose } = renderModal();

      fireEvent.click(screen.getByText('Cancel'));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when the X button is clicked', () => {
      const { onClose } = renderModal();

      fireEvent.click(screen.getByLabelText('Close'));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling', () => {
    it('displays API error message when onSave throws', async () => {
      const onSave = jest.fn().mockRejectedValue(new Error('Server error'));
      renderModal({ onSave });

      fireEvent.click(screen.getByText('Save Schedule'));

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });
    });

    it('does not call onClose when onSave throws', async () => {
      const onSave = jest.fn().mockRejectedValue(new Error('Server error'));
      const { onClose } = renderModal({ onSave });

      fireEvent.click(screen.getByText('Save Schedule'));

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // BUG A FIX: Interval input empty-value edge cases
  // AC: Empty interval input should store 0, not coerce to 1, allowing smooth typing
  // ---------------------------------------------------------------------------

  describe('Interval input — empty-value handling (Bug A fix)', () => {
    it('stores 0 when interval field is cleared (not coerced to 1)', () => {
      renderModal({ job: MOCK_INTERVAL_JOB });

      const intervalInput = screen.getByLabelText('Interval value') as HTMLInputElement;
      fireEvent.change(intervalInput, { target: { value: '' } });

      // After fix: empty input stored as 0, not 1
      expect(intervalInput.value).toBe('0');
    });

    it('allows typing new interval after clearing field without snapping to 1', () => {
      renderModal({ job: MOCK_INTERVAL_JOB });

      const intervalInput = screen.getByLabelText('Interval value') as HTMLInputElement;

      // Clear field (simulating user deleting the current value to type a new one)
      fireEvent.change(intervalInput, { target: { value: '' } });
      expect(intervalInput.value).toBe('0');

      // Type new interval value (e.g., user types '20' for 20 minutes)
      fireEvent.change(intervalInput, { target: { value: '2' } });
      expect(intervalInput.value).toBe('2');

      // Continue typing without field snapping to 1 mid-keystroke
      fireEvent.change(intervalInput, { target: { value: '20' } });
      expect(intervalInput.value).toBe('20');
    });

    it('keeps field in neutral state (0) while user is typing new value', () => {
      renderModal({ job: MOCK_INTERVAL_JOB });

      const intervalInput = screen.getByLabelText('Interval value') as HTMLInputElement;
      const saveButton = screen.getByText('Save Schedule').closest('button')!;

      // Clear field to start fresh typing
      fireEvent.change(intervalInput, { target: { value: '' } });
      expect(intervalInput.value).toBe('0');
      expect(saveButton).toBeDisabled(); // 0 is invalid

      // While typing '30', intermediate state should not snap to 1
      fireEvent.change(intervalInput, { target: { value: '3' } });
      expect(intervalInput.value).toBe('3');
      expect(saveButton).not.toBeDisabled();

      // Complete the entry
      fireEvent.change(intervalInput, { target: { value: '30' } });
      expect(intervalInput.value).toBe('30');
      expect(saveButton).not.toBeDisabled();
    });
  });
});
