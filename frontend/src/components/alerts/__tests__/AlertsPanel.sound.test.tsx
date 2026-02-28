/**
 * AlertsPanel — Sound Settings Toggle Tests
 *
 * Tests for the global sound mute/unmute button in the alerts panel header.
 * Covers: settings fetch, button visibility, toggle behavior, and rollback.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlertsPanel from '../AlertsPanel';
import * as useAlertsModule from '@/hooks/useAlerts';

// Mock useAlerts hook
jest.mock('@/hooks/useAlerts');
const mockUseAlerts = jest.mocked(useAlertsModule.useAlerts);

// Mock API calls
jest.mock('@/lib/api');
jest.mock('@/lib/alertSound');

describe('AlertsPanel — Sound Settings Toggle Button', () => {
  const mockOnClose = jest.fn();

  const defaultUseAlertsValue = {
    alerts: [],
    loading: false,
    error: null,
    createAlert: jest.fn(),
    updateAlert: jest.fn(),
    removeAlert: jest.fn(),
    toggleAlert: jest.fn(),
    refresh: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAlerts.mockReturnValue(defaultUseAlertsValue);
  });

  test('shows sound toggle button when sound settings load successfully', async () => {
    const apiModule = require('@/lib/api');
    apiModule.getAlertSoundSettings.mockResolvedValueOnce({
      enabled: true,
      sound_type: 'chime',
      volume: 70,
      mute_when_active: false,
    });

    render(<AlertsPanel onClose={mockOnClose} />);

    await waitFor(() => {
      const toggleButton = screen.queryByRole('button', {
        name: /mute alert sounds/i,
      });
      expect(toggleButton).toBeInTheDocument();
    });

    expect(apiModule.getAlertSoundSettings).toHaveBeenCalled();
  });

  test('hides sound toggle button when sound settings fetch fails', async () => {
    const apiModule = require('@/lib/api');
    apiModule.getAlertSoundSettings.mockRejectedValueOnce(
      new Error('Network error')
    );

    render(<AlertsPanel onClose={mockOnClose} />);

    await waitFor(() => {
      expect(apiModule.getAlertSoundSettings).toHaveBeenCalled();
    });

    const toggleButton = screen.queryByRole('button', {
      name: /mute alert sounds|unmute alert sounds/i,
    });
    expect(toggleButton).not.toBeInTheDocument();
  });

  test('displays correct styling when sounds are enabled', async () => {
    const apiModule = require('@/lib/api');
    apiModule.getAlertSoundSettings.mockResolvedValueOnce({
      enabled: true,
      sound_type: 'chime',
      volume: 70,
      mute_when_active: false,
    });

    render(<AlertsPanel onClose={mockOnClose} />);

    await waitFor(() => {
      const toggleButton = screen.getByRole('button', {
        name: /mute alert sounds/i,
      });
      expect(toggleButton).toBeInTheDocument();
    });

    const toggleButton = screen.getByRole('button', {
      name: /mute alert sounds/i,
    });
    expect(toggleButton).toHaveClass('text-slate-400');
  });

  test('displays correct styling when sounds are disabled', async () => {
    const apiModule = require('@/lib/api');
    apiModule.getAlertSoundSettings.mockResolvedValueOnce({
      enabled: false,
      sound_type: 'chime',
      volume: 70,
      mute_when_active: false,
    });

    render(<AlertsPanel onClose={mockOnClose} />);

    await waitFor(() => {
      const toggleButton = screen.getByRole('button', {
        name: /unmute alert sounds/i,
      });
      expect(toggleButton).toBeInTheDocument();
    });

    const toggleButton = screen.getByRole('button', {
      name: /unmute alert sounds/i,
    });
    expect(toggleButton).toHaveClass('text-amber-400');
  });

  test('toggles sound settings and calls API with optimistic update', async () => {
    const apiModule = require('@/lib/api');
    apiModule.getAlertSoundSettings.mockResolvedValueOnce({
      enabled: true,
      sound_type: 'chime',
      volume: 70,
      mute_when_active: false,
    });
    apiModule.updateAlertSoundSettings.mockResolvedValueOnce({
      enabled: false,
      sound_type: 'chime',
      volume: 70,
      mute_when_active: false,
    });

    render(<AlertsPanel onClose={mockOnClose} />);

    await waitFor(() => {
      const toggleButton = screen.getByRole('button', {
        name: /mute alert sounds/i,
      });
      expect(toggleButton).toBeInTheDocument();
    });

    const toggleButton = screen.getByRole('button', {
      name: /mute alert sounds/i,
    });

    await userEvent.click(toggleButton);

    expect(apiModule.updateAlertSoundSettings).toHaveBeenCalledWith({
      enabled: false,
    });
  });

  test('rolls back to previous state on API error', async () => {
    const apiModule = require('@/lib/api');
    apiModule.getAlertSoundSettings.mockResolvedValueOnce({
      enabled: true,
      sound_type: 'chime',
      volume: 70,
      mute_when_active: false,
    });
    apiModule.updateAlertSoundSettings.mockRejectedValueOnce(
      new Error('API error')
    );

    render(<AlertsPanel onClose={mockOnClose} />);

    await waitFor(() => {
      const toggleButton = screen.getByRole('button', {
        name: /mute alert sounds/i,
      });
      expect(toggleButton).toBeInTheDocument();
    });

    const toggleButton = screen.getByRole('button', {
      name: /mute alert sounds/i,
    });

    await userEvent.click(toggleButton);

    // After API error, should rollback to "Mute" (enabled: true)
    await waitFor(() => {
      const muteButton = screen.queryByRole('button', {
        name: /mute alert sounds/i,
      });
      expect(muteButton).toBeInTheDocument();
    });
  });

  test('disables toggle button while API request is in progress', async () => {
    const apiModule = require('@/lib/api');
    apiModule.getAlertSoundSettings.mockResolvedValueOnce({
      enabled: true,
      sound_type: 'chime',
      volume: 70,
      mute_when_active: false,
    });
    apiModule.updateAlertSoundSettings.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ enabled: false, sound_type: 'chime', volume: 70, mute_when_active: false }), 100);
        })
    );

    render(<AlertsPanel onClose={mockOnClose} />);

    await waitFor(() => {
      const toggleButton = screen.getByRole('button', {
        name: /mute alert sounds/i,
      });
      expect(toggleButton).toBeInTheDocument();
    });

    const toggleButton = screen.getByRole('button', {
      name: /mute alert sounds/i,
    }) as HTMLButtonElement;

    await userEvent.click(toggleButton);

    expect(toggleButton.disabled).toBe(true);

    await waitFor(() => {
      expect(toggleButton.disabled).toBe(false);
    });
  });

  test('toggle button has correct aria label when enabled', async () => {
    const apiModule = require('@/lib/api');
    apiModule.getAlertSoundSettings.mockResolvedValueOnce({
      enabled: true,
      sound_type: 'chime',
      volume: 70,
      mute_when_active: false,
    });

    render(<AlertsPanel onClose={mockOnClose} />);

    await waitFor(() => {
      const toggleButton = screen.getByRole('button', {
        name: /mute alert sounds/i,
      });
      expect(toggleButton).toHaveAttribute('aria-label', 'Mute alert sounds');
    });
  });

  test('toggle button has aria-pressed attribute reflecting state', async () => {
    const apiModule = require('@/lib/api');
    apiModule.getAlertSoundSettings.mockResolvedValueOnce({
      enabled: true,
      sound_type: 'chime',
      volume: 70,
      mute_when_active: false,
    });
    apiModule.updateAlertSoundSettings.mockResolvedValueOnce({
      enabled: false,
      sound_type: 'chime',
      volume: 70,
      mute_when_active: false,
    });

    render(<AlertsPanel onClose={mockOnClose} />);

    await waitFor(() => {
      const toggleButton = screen.getByRole('button', {
        name: /mute alert sounds/i,
      });
      expect(toggleButton).toHaveAttribute('aria-pressed', 'false');
    });

    const toggleButton = screen.getByRole('button', {
      name: /mute alert sounds/i,
    });
    await userEvent.click(toggleButton);

    await waitFor(() => {
      const unmuteButton = screen.getByRole('button', {
        name: /unmute alert sounds/i,
      });
      expect(unmuteButton).toHaveAttribute('aria-pressed', 'true');
    });
  });
});