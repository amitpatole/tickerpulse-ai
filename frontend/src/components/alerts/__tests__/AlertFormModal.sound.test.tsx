/**
 * AlertFormModal — Sound Preview Tests
 *
 * Tests for the alert sound preview button added to the sound picker.
 * Covers: preview button disabled state, sound type mapping, and playback.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlertFormModal from '../AlertFormModal';
import * as alertSound from '@/lib/alertSound';

// Mock the sound playback module
jest.mock('@/lib/alertSound', () => ({
  playAlertSound: jest.fn(),
}));

describe('AlertFormModal — Sound Preview Button', () => {
  const mockOnSuccess = jest.fn();
  const mockOnClose = jest.fn();
  const mockOnCreate = jest.fn().mockResolvedValue({ id: 1, ticker: 'AAPL' });
  const mockOnUpdate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('disables preview button when sound_type is silent', () => {
    render(
      <AlertFormModal
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
        onUpdate={mockOnUpdate}
      />
    );

    // Get the sound select and change it to 'silent'
    const soundSelect = screen.getByRole('combobox', {
      name: /alert sound/i,
    }) as HTMLSelectElement;
    fireEvent.change(soundSelect, { target: { value: 'silent' } });

    // Preview button should be disabled
    const previewButton = screen.getByRole('button', {
      name: /preview selected alert sound/i,
    }) as HTMLButtonElement;
    expect(previewButton.disabled).toBe(true);
    expect(previewButton).toHaveClass('disabled:opacity-40');
  });

  test('enables preview button for non-silent sound types', () => {
    render(
      <AlertFormModal
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
        onUpdate={mockOnUpdate}
      />
    );

    const soundSelect = screen.getByRole('combobox', {
      name: /alert sound/i,
    }) as HTMLSelectElement;
    const previewButton = screen.getByRole('button', {
      name: /preview selected alert sound/i,
    }) as HTMLButtonElement;

    // Test each non-silent sound
    ['default', 'chime', 'alarm'].forEach((sound) => {
      fireEvent.change(soundSelect, { target: { value: sound } });
      expect(previewButton.disabled).toBe(false);
    });
  });

  test('plays chime sound when preview is clicked for default sound', async () => {
    render(
      <AlertFormModal
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
        onUpdate={mockOnUpdate}
      />
    );

    const soundSelect = screen.getByRole('combobox', {
      name: /alert sound/i,
    }) as HTMLSelectElement;
    const previewButton = screen.getByRole('button', {
      name: /preview selected alert sound/i,
    });

    // Set to 'default' and click preview
    fireEvent.change(soundSelect, { target: { value: 'default' } });
    await userEvent.click(previewButton);

    // playAlertSound should be called with 'chime' (not 'default')
    expect(alertSound.playAlertSound).toHaveBeenCalledWith('chime', 0.7);
  });

  test('plays selected sound directly for non-default sound types', async () => {
    render(
      <AlertFormModal
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
        onUpdate={mockOnUpdate}
      />
    );

    const soundSelect = screen.getByRole('combobox', {
      name: /alert sound/i,
    }) as HTMLSelectElement;
    const previewButton = screen.getByRole('button', {
      name: /preview selected alert sound/i,
    });

    // Test 'alarm'
    fireEvent.change(soundSelect, { target: { value: 'alarm' } });
    await userEvent.click(previewButton);
    expect(alertSound.playAlertSound).toHaveBeenCalledWith('alarm', 0.7);
    jest.clearAllMocks();

    // Test 'chime'
    fireEvent.change(soundSelect, { target: { value: 'chime' } });
    await userEvent.click(previewButton);
    expect(alertSound.playAlertSound).toHaveBeenCalledWith('chime', 0.7);
  });

  test('preview button does not trigger form submission', async () => {
    render(
      <AlertFormModal
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
        onUpdate={mockOnUpdate}
      />
    );

    const previewButton = screen.getByRole('button', {
      name: /preview selected alert sound/i,
    });

    // Click preview multiple times — onCreate should NOT be called
    await userEvent.click(previewButton);
    await userEvent.click(previewButton);

    expect(mockOnCreate).not.toHaveBeenCalled();
  });

  test('preview button has correct aria label for accessibility', () => {
    render(
      <AlertFormModal
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
        onUpdate={mockOnUpdate}
      />
    );

    const previewButton = screen.getByRole('button', {
      name: /preview selected alert sound/i,
    });
    expect(previewButton).toHaveAttribute(
      'aria-label',
      'Preview selected alert sound'
    );
  });
});