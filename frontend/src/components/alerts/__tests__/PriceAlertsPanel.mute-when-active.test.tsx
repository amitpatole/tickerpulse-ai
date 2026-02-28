/**
 * TickerPulse AI — PriceAlertsPanel Mute When Active Tests
 * Covers: sound mute behavior when tab is focused, persistence, integration
 * Tests focus on: toggle persistence, playback suppression, error handling
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PriceAlertsPanel from '@/components/alerts/PriceAlertsPanel';
import * as api from '@/lib/api';
import * as alertSound from '@/lib/alertSound';
import { useAlerts } from '@/hooks/useAlerts';

jest.mock('@/lib/api');
jest.mock('@/lib/alertSound');
jest.mock('@/hooks/useAlerts');

describe('PriceAlertsPanel — Mute When Active Feature', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Test 1: Mute when active toggle loads from settings and displays correctly
   * AC1: Toggle initially reflects persisted mute_when_active value
   */
  test('loads and displays mute_when_active toggle from settings', async () => {
    const mockSettings = {
      enabled: true,
      sound_type: 'chime' as const,
      volume: 70,
      mute_when_active: true,
    };

    (api.getAlertSoundSettings as jest.Mock).mockResolvedValue(mockSettings);
    (useAlerts as jest.Mock).mockReturnValue({
      alerts: [],
      loading: false,
      error: null,
      createAlert: jest.fn(),
      updateAlert: jest.fn(),
      removeAlert: jest.fn(),
      toggleAlert: jest.fn(),
    } as any);

    render(<PriceAlertsPanel />);

    await waitFor(() => {
      const muteToggle = screen.getByRole('switch', {
        name: /Mute when tab is focused/i,
      });
      expect(muteToggle).toBeChecked();
    });
  });

  /**
   * Test 2: Toggling mute_when_active persists to backend
   * AC2: Toggle change triggers updateAlertSoundSettings API call
   */
  test('persists mute_when_active toggle change to backend', async () => {
    const mockSettings = {
      enabled: true,
      sound_type: 'chime' as const,
      volume: 70,
      mute_when_active: false,
    };

    (api.getAlertSoundSettings as jest.Mock).mockResolvedValue(mockSettings);
    (api.updateAlertSoundSettings as jest.Mock).mockResolvedValue({
      ...mockSettings,
      mute_when_active: true,
    });
    (useAlerts as jest.Mock).mockReturnValue({
      alerts: [],
      loading: false,
      error: null,
      createAlert: jest.fn(),
      updateAlert: jest.fn(),
      removeAlert: jest.fn(),
      toggleAlert: jest.fn(),
    } as any);

    render(<PriceAlertsPanel />);

    await waitFor(() => {
      expect(screen.getByRole('switch', {
        name: /Mute when tab is focused/i,
      })).toBeInTheDocument();
    });

    const muteToggle = screen.getByRole('switch', {
      name: /Mute when tab is focused/i,
    });

    await userEvent.click(muteToggle);

    await waitFor(() => {
      expect(api.updateAlertSoundSettings).toHaveBeenCalledWith({
        mute_when_active: true,
      });
    });
  });

  /**
   * Test 3: Mute when active toggle disabled during saving
   * AC2: UI prevents changes while API request pending
   */
  test('disables mute toggle while saving settings', async () => {
    const mockSettings = {
      enabled: true,
      sound_type: 'chime' as const,
      volume: 70,
      mute_when_active: false,
    };

    // Delay the response to keep saving state active
    const settingsPromise = new Promise((resolve) =>
      setTimeout(() => resolve({ ...mockSettings, mute_when_active: true }), 100),
    );
    (api.getAlertSoundSettings as jest.Mock).mockResolvedValue(mockSettings);
    (api.updateAlertSoundSettings as jest.Mock).mockReturnValue(settingsPromise as any);
    (useAlerts as jest.Mock).mockReturnValue({
      alerts: [],
      loading: false,
      error: null,
      createAlert: jest.fn(),
      updateAlert: jest.fn(),
      removeAlert: jest.fn(),
      toggleAlert: jest.fn(),
    } as any);

    render(<PriceAlertsPanel />);

    await waitFor(() => {
      expect(screen.getByRole('switch', {
        name: /Mute when tab is focused/i,
      })).toBeInTheDocument();
    });

    const muteToggle = screen.getByRole('switch', {
      name: /Mute when tab is focused/i,
    });

    await userEvent.click(muteToggle);

    // During save, toggle should be disabled
    expect(muteToggle).toBeDisabled();
  });

  /**
   * Test 4: Save error on mute toggle reverts UI to previous state
   * AC3: Failed update rolls back toggle to original state
   */
  test('reverts mute toggle on settings save failure', async () => {
    const mockSettings = {
      enabled: true,
      sound_type: 'chime' as const,
      volume: 70,
      mute_when_active: false,
    };

    (api.getAlertSoundSettings as jest.Mock).mockResolvedValue(mockSettings);
    (api.updateAlertSoundSettings as jest.Mock).mockRejectedValueOnce(
      new Error('Save failed'),
    );
    (useAlerts as jest.Mock).mockReturnValue({
      alerts: [],
      loading: false,
      error: null,
      createAlert: jest.fn(),
      updateAlert: jest.fn(),
      removeAlert: jest.fn(),
      toggleAlert: jest.fn(),
    } as any);

    render(<PriceAlertsPanel />);

    await waitFor(() => {
      expect(screen.getByRole('switch', {
        name: /Mute when tab is focused/i,
      })).toBeInTheDocument();
    });

    const muteToggle = screen.getByRole('switch', {
      name: /Mute when tab is focused/i,
    });

    // Verify initial unchecked state
    expect(muteToggle).not.toBeChecked();

    await userEvent.click(muteToggle);

    // After error, should revert to unchecked
    await waitFor(() => {
      expect(muteToggle).not.toBeChecked();
    });
  });

  /**
   * Test 5: Mute when active has descriptive help text
   * AC1: Description visible explaining the feature
   */
  test('displays descriptive help text for mute_when_active toggle', async () => {
    const mockSettings = {
      enabled: true,
      sound_type: 'chime' as const,
      volume: 70,
      mute_when_active: false,
    };

    (api.getAlertSoundSettings as jest.Mock).mockResolvedValue(mockSettings);
    (useAlerts as jest.Mock).mockReturnValue({
      alerts: [],
      loading: false,
      error: null,
      createAlert: jest.fn(),
      updateAlert: jest.fn(),
      removeAlert: jest.fn(),
      toggleAlert: jest.fn(),
    } as any);

    render(<PriceAlertsPanel />);

    await waitFor(() => {
      expect(screen.getByText(/Suppress sounds while you're actively viewing the app/i))
        .toBeInTheDocument();
    });
  });

  /**
   * Test 6: Mute toggle respects disabled state when sounds disabled globally
   * AC2: If enabled=false, mute toggle still visible but muted context applies
   */
  test('mute toggle visible even when sounds globally disabled', async () => {
    const mockSettings = {
      enabled: false,
      sound_type: 'chime' as const,
      volume: 70,
      mute_when_active: false,
    };

    (api.getAlertSoundSettings as jest.Mock).mockResolvedValue(mockSettings);
    (useAlerts as jest.Mock).mockReturnValue({
      alerts: [],
      loading: false,
      error: null,
      createAlert: jest.fn(),
      updateAlert: jest.fn(),
      removeAlert: jest.fn(),
      toggleAlert: jest.fn(),
    } as any);

    render(<PriceAlertsPanel />);

    await waitFor(() => {
      const muteToggle = screen.getByRole('switch', {
        name: /Mute when tab is focused/i,
      });
      // Should be visible but in the disabled sound context section
      expect(muteToggle).toBeInTheDocument();
    });
  });

  /**
   * Test 7: Mute when active state independent from other settings
   * AC2: Toggle one setting without affecting mute_when_active
   */
  test('changing volume does not affect mute_when_active state', async () => {
    const mockSettings = {
      enabled: true,
      sound_type: 'chime' as const,
      volume: 70,
      mute_when_active: true,
    };

    (api.getAlertSoundSettings as jest.Mock).mockResolvedValue(mockSettings);
    (api.updateAlertSoundSettings as jest.Mock).mockImplementation((patch) =>
      Promise.resolve({ ...mockSettings, ...patch }),
    );
    (useAlerts as jest.Mock).mockReturnValue({
      alerts: [],
      loading: false,
      error: null,
      createAlert: jest.fn(),
      updateAlert: jest.fn(),
      removeAlert: jest.fn(),
      toggleAlert: jest.fn(),
    } as any);

    render(<PriceAlertsPanel />);

    await waitFor(() => {
      const muteToggle = screen.getByRole('switch', {
        name: /Mute when tab is focused/i,
      });
      expect(muteToggle).toBeChecked();
    });

    const volumeSlider = screen.getByRole('slider', {
      name: /Alert notification volume/i,
    });

    // Adjust volume
    await userEvent.pointer({ keys: '[MouseLeft>]', target: volumeSlider });
    volumeSlider.setAttribute('value', '85');
    await userEvent.pointer({ keys: '[/MouseLeft]' });

    // Mute toggle should still be checked
    await waitFor(() => {
      const muteToggle = screen.getByRole('switch', {
        name: /Mute when tab is focused/i,
      });
      expect(muteToggle).toBeChecked();
    });
  });

  /**
   * Test 8: Mute when active accessible via keyboard
   * AC3: Toggle is keyboard-navigable and activatable with Space/Enter
   */
  test('mute toggle is keyboard accessible', async () => {
    const mockSettings = {
      enabled: true,
      sound_type: 'chime' as const,
      volume: 70,
      mute_when_active: false,
    };

    (api.getAlertSoundSettings as jest.Mock).mockResolvedValue(mockSettings);
    (api.updateAlertSoundSettings as jest.Mock).mockResolvedValue({
      ...mockSettings,
      mute_when_active: true,
    });
    (useAlerts as jest.Mock).mockReturnValue({
      alerts: [],
      loading: false,
      error: null,
      createAlert: jest.fn(),
      updateAlert: jest.fn(),
      removeAlert: jest.fn(),
      toggleAlert: jest.fn(),
    } as any);

    render(<PriceAlertsPanel />);

    await waitFor(() => {
      expect(screen.getByRole('switch', {
        name: /Mute when tab is focused/i,
      })).toBeInTheDocument();
    });

    const muteToggle = screen.getByRole('switch', {
      name: /Mute when tab is focused/i,
    });

    // Can receive focus
    muteToggle.focus();
    expect(muteToggle).toHaveFocus();

    // Can toggle with keyboard (userEvent handles this)
    await userEvent.keyboard(' '); // Space key
    expect(api.updateAlertSoundSettings).toHaveBeenCalledWith({
      mute_when_active: true,
    });
  });
});
