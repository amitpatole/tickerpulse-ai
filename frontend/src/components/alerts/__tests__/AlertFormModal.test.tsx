import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlertFormModal from '../AlertFormModal';
import type { Alert } from '@/lib/types';

describe('AlertFormModal', () => {
  const mockAlert: Alert = {
    id: 1,
    ticker: 'AAPL',
    condition_type: 'price_above',
    threshold: 150,
    enabled: true,
    sound_type: 'chime',
    fired_at: null,
    fire_count: 0,
    created_at: new Date().toISOString(),
  };

  const mockOnSuccess = jest.fn();
  const mockOnClose = jest.fn();
  const mockOnCreate = jest.fn();
  const mockOnUpdate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Create mode', () => {
    it('should render create form without alert prop', () => {
      render(
        <AlertFormModal
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      expect(screen.getByText('New Price Alert')).toBeInTheDocument();
      expect(screen.getByLabelText('Ticker')).toBeInTheDocument();
      expect(screen.getByLabelText('Condition')).toBeInTheDocument();
      expect(screen.getByLabelText('Threshold ($)')).toBeInTheDocument();
      expect(screen.getByText('Create Alert')).toBeInTheDocument();
    });

    it('should validate ticker required and format', async () => {
      const user = userEvent.setup();
      render(
        <AlertFormModal
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      const submitBtn = screen.getByText('Create Alert');

      // Empty ticker
      await user.click(submitBtn);
      expect(screen.getByText('Ticker is required')).toBeInTheDocument();

      // Invalid format (too long)
      const tickerInput = screen.getByLabelText('Ticker') as HTMLInputElement;
      await user.type(tickerInput, 'TOOLONG');
      await user.click(submitBtn);
      expect(screen.getByText(/Ticker must be 1–5 uppercase letters/)).toBeInTheDocument();
    });

    it('should validate threshold required and positive', async () => {
      const user = userEvent.setup();
      render(
        <AlertFormModal
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      const tickerInput = screen.getByLabelText('Ticker') as HTMLInputElement;
      const thresholdInput = screen.getByLabelText('Threshold ($)') as HTMLInputElement;
      const submitBtn = screen.getByText('Create Alert');

      // Valid ticker
      await user.type(tickerInput, 'AAPL');

      // Empty threshold
      await user.click(submitBtn);
      expect(screen.getByText('Threshold is required')).toBeInTheDocument();

      // Zero threshold
      await user.clear(thresholdInput);
      await user.type(thresholdInput, '0');
      await user.click(submitBtn);
      expect(screen.getByText('Threshold must be a number greater than 0')).toBeInTheDocument();

      // Negative threshold
      await user.clear(thresholdInput);
      await user.type(thresholdInput, '-10');
      await user.click(submitBtn);
      expect(screen.getByText('Threshold must be a number greater than 0')).toBeInTheDocument();
    });

    it('should validate max threshold boundary', async () => {
      const user = userEvent.setup();
      render(
        <AlertFormModal
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      const tickerInput = screen.getByLabelText('Ticker') as HTMLInputElement;
      const thresholdInput = screen.getByLabelText('Threshold ($)') as HTMLInputElement;
      const submitBtn = screen.getByText('Create Alert');

      await user.type(tickerInput, 'AAPL');
      await user.type(thresholdInput, '1000001');
      await user.click(submitBtn);

      expect(screen.getByText('Threshold must be ≤ 1,000,000')).toBeInTheDocument();
    });

    it('should validate percentage threshold max 100% for pct_change', async () => {
      const user = userEvent.setup();
      render(
        <AlertFormModal
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      const tickerInput = screen.getByLabelText('Ticker') as HTMLInputElement;
      const conditionSelect = screen.getByLabelText('Condition') as HTMLSelectElement;
      const thresholdInput = screen.getByLabelText('Threshold ($)') as HTMLInputElement;
      const submitBtn = screen.getByText('Create Alert');

      await user.type(tickerInput, 'AAPL');
      await user.selectOptions(conditionSelect, 'pct_change');

      // Threshold label should change to (%)
      await waitFor(() => {
        expect(screen.getByLabelText('Threshold (%)')).toBeInTheDocument();
      });

      const pctThresholdInput = screen.getByLabelText('Threshold (%)') as HTMLInputElement;
      await user.type(pctThresholdInput, '101');
      await user.click(submitBtn);

      expect(screen.getByText('% Change threshold must be ≤ 100')).toBeInTheDocument();
    });

    it('should submit with valid data and call onCreate', async () => {
      const user = userEvent.setup();
      mockOnCreate.mockResolvedValue(mockAlert);

      render(
        <AlertFormModal
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      const tickerInput = screen.getByLabelText('Ticker') as HTMLInputElement;
      const conditionSelect = screen.getByLabelText('Condition') as HTMLSelectElement;
      const thresholdInput = screen.getByLabelText('Threshold ($)') as HTMLInputElement;
      const soundSelect = screen.getByLabelText('Alert Sound') as HTMLSelectElement;
      const submitBtn = screen.getByText('Create Alert');

      await user.type(tickerInput, 'AAPL');
      await user.selectOptions(conditionSelect, 'price_above');
      await user.type(thresholdInput, '150.00');
      await user.selectOptions(soundSelect, 'chime');
      await user.click(submitBtn);

      await waitFor(() => {
        expect(mockOnCreate).toHaveBeenCalledWith({
          ticker: 'AAPL',
          condition_type: 'price_above',
          threshold: 150,
          sound_type: 'chime',
        });
        expect(mockOnSuccess).toHaveBeenCalledWith(mockAlert);
      });
    });

    it('should handle onCreate error', async () => {
      const user = userEvent.setup();
      mockOnCreate.mockRejectedValue(new Error('API error: ticker not found'));

      render(
        <AlertFormModal
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      const tickerInput = screen.getByLabelText('Ticker') as HTMLInputElement;
      const thresholdInput = screen.getByLabelText('Threshold ($)') as HTMLInputElement;
      const submitBtn = screen.getByText('Create Alert');

      await user.type(tickerInput, 'AAPL');
      await user.type(thresholdInput, '150');
      await user.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/API error: ticker not found/)).toBeInTheDocument();
      });

      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
  });

  describe('Edit mode', () => {
    it('should render edit form with alert data pre-filled', () => {
      render(
        <AlertFormModal
          alert={mockAlert}
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      expect(screen.getByText('Edit Alert')).toBeInTheDocument();
      expect(screen.queryByLabelText('Ticker')).not.toBeInTheDocument();
      expect((screen.getByLabelText('Condition') as HTMLSelectElement).value).toBe('price_above');
      expect((screen.getByLabelText('Threshold ($)') as HTMLInputElement).value).toBe('150');
      expect((screen.getByLabelText('Alert Sound') as HTMLSelectElement).value).toBe('chime');
    });

    it('should submit with updated data and call onUpdate', async () => {
      const user = userEvent.setup();
      const updatedAlert = { ...mockAlert, threshold: 160 };
      mockOnUpdate.mockResolvedValue(updatedAlert);

      render(
        <AlertFormModal
          alert={mockAlert}
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      const thresholdInput = screen.getByLabelText('Threshold ($)') as HTMLInputElement;
      const submitBtn = screen.getByText('Save Changes');

      await user.clear(thresholdInput);
      await user.type(thresholdInput, '160');
      await user.click(submitBtn);

      await waitFor(() => {
        expect(mockOnUpdate).toHaveBeenCalledWith(1, {
          condition_type: 'price_above',
          threshold: 160,
          sound_type: 'chime',
        });
        expect(mockOnSuccess).toHaveBeenCalledWith(updatedAlert);
      });
    });

    it('should handle onUpdate error', async () => {
      const user = userEvent.setup();
      mockOnUpdate.mockRejectedValue(new Error('Update failed'));

      render(
        <AlertFormModal
          alert={mockAlert}
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      const submitBtn = screen.getByText('Save Changes');
      await user.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Update failed')).toBeInTheDocument();
      });

      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
  });

  describe('User interactions', () => {
    it('should close modal on Cancel button', async () => {
      const user = userEvent.setup();
      render(
        <AlertFormModal
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      const cancelBtn = screen.getByText('Cancel');
      await user.click(cancelBtn);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should close modal on Escape key', () => {
      render(
        <AlertFormModal
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should close modal on backdrop click', async () => {
      const user = userEvent.setup();
      render(
        <AlertFormModal
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      const backdrop = screen.getByRole('dialog');
      await user.click(backdrop);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should close modal on close button click', async () => {
      const user = userEvent.setup();
      render(
        <AlertFormModal
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      const closeBtn = screen.getByLabelText('Close modal');
      await user.click(closeBtn);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should clear errors on field change', async () => {
      const user = userEvent.setup();
      render(
        <AlertFormModal
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      const thresholdInput = screen.getByLabelText('Threshold ($)') as HTMLInputElement;
      const submitBtn = screen.getByText('Create Alert');

      // Trigger validation error
      await user.click(submitBtn);
      expect(screen.getByText('Threshold is required')).toBeInTheDocument();

      // Type to clear error
      await user.type(thresholdInput, '100');

      await waitFor(() => {
        expect(screen.queryByText('Threshold is required')).not.toBeInTheDocument();
      });
    });

    it('should update threshold label based on condition type', async () => {
      const user = userEvent.setup();
      render(
        <AlertFormModal
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      // Initially price threshold
      expect(screen.getByLabelText('Threshold ($)')).toBeInTheDocument();

      // Change to pct_change
      const conditionSelect = screen.getByLabelText('Condition') as HTMLSelectElement;
      await user.selectOptions(conditionSelect, 'pct_change');

      await waitFor(() => {
        expect(screen.getByLabelText('Threshold (%)')).toBeInTheDocument();
      });

      // Change back to price_below
      await user.selectOptions(conditionSelect, 'price_below');

      await waitFor(() => {
        expect(screen.getByLabelText('Threshold ($)')).toBeInTheDocument();
      });
    });

    it('should disable submit button while submitting', async () => {
      const user = userEvent.setup();
      let resolveCreate: ((value: Alert) => void) | null = null;
      const createPromise = new Promise<Alert>((resolve) => {
        resolveCreate = resolve;
      });
      mockOnCreate.mockReturnValue(createPromise);

      render(
        <AlertFormModal
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      const tickerInput = screen.getByLabelText('Ticker') as HTMLInputElement;
      const thresholdInput = screen.getByLabelText('Threshold ($)') as HTMLInputElement;
      const submitBtn = screen.getByText('Create Alert') as HTMLButtonElement;

      await user.type(tickerInput, 'AAPL');
      await user.type(thresholdInput, '150');
      await user.click(submitBtn);

      expect(submitBtn).toBeDisabled();
      expect(screen.getByText('Saving…')).toBeInTheDocument();

      resolveCreate?.(mockAlert);

      await waitFor(() => {
        expect(submitBtn).not.toBeDisabled();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria attributes for modal', () => {
      render(
        <AlertFormModal
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'alert-modal-title');
    });

    it('should have proper aria attributes for error fields', async () => {
      const user = userEvent.setup();
      render(
        <AlertFormModal
          onSuccess={mockOnSuccess}
          onClose={mockOnClose}
          onCreate={mockOnCreate}
          onUpdate={mockOnUpdate}
        />
      );

      const submitBtn = screen.getByText('Create Alert');
      await user.click(submitBtn);

      const tickerInput = screen.getByLabelText('Ticker');
      expect(tickerInput).toHaveAttribute('aria-invalid', 'true');
      expect(tickerInput).toHaveAttribute('aria-describedby', 'ticker-error');
    });
  });
});
