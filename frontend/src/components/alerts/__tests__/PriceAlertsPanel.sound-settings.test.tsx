/**
 * TickerPulse AI — PriceAlertsPanel Sound Settings Tests
 * Covers: alert sound configuration, volume control, per-alert overrides
 * Tests focus on: load state, draft/commit flow, error handling, default resolution
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PriceAlertsPanel from '@/components/alerts/PriceAlertsPanel';
import * as api from '@/lib/api';
import * as alertSound from '@/lib/alertSound';
import { useAlerts } from '@/hooks/useAlerts';

// ============================================================
// Mocks
// ============================================================

jest.mock('@/lib/api');
jest.mock('@/lib/alertSound');
jest.mock('@/hooks/useAlerts');

// ============================================================
// Test Suite
// ============================================================

describe('PriceAlertsPanel — Sound Settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────
  // Test 1: Load settings on mount, display skeleton while loading
  // AC: Sound settings load asynchronously, skeleton shown while pending
  // ────────────────────────────────────────────────────────

  test('loads sound settings on mount and displays skeleton shimmer while loading', async () => {
    const mockSettings = {
      enabled: true,
      sound_type: 'chime' as const,
      volume: 75,
      mute_when_active: false,
    };

    // Mock initial loading state (delayed resolve)
    const settingsPromise = new Promise((resolve) =>
      setTimeout(() => resolve(mockSettings), 50),
    );
    (api.getAlertSoundSettings as jest.Mock).mockReturnValue(
      settingsPromise as any,
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

    // Check for skeleton while loading
    const skeleton = screen.getByRole('generic', (role, element) =>
      element?.className.includes('animate-pulse'),
    );
    expect(skeleton).toBeInTheDocument();

    // Wait for settings to load
    await waitFor(() => {
      expect(screen.queryByRole('generic', (role, element) =>
        element?.className.includes('animate-pulse'),
      )).not.toBeInTheDocument();
    });

    // Verify loaded settings are displayed
    expect(screen.getByLabelText('Enable alert sounds')).toBeChecked();
    expect(screen.getByDisplayValue('75')).toBeInTheDocument(); // Volume slider
  });

  // ────────────────────────────────────────────────────────
  // Test 2: Volume slider draft/commit pattern
  // AC: Volume only saved on mouseUp/touchEnd, not during drag
  // ────────────────────────────────────────────────────────

  test('commits volume slider only on mouseUp, not during drag', async () => {
    const mockSettings = {
      enabled: true,
      sound_type: 'chime' as const,
      volume: 70,
      mute_when_active: false,
    };

    (api.getAlertSoundSettings as jest.Mock).mockResolvedValue(mockSettings);
    (api.updateAlertSoundSettings as jest.Mock).mockResolvedValue({
      ...mockSettings,
      volume: 85,
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
      expect(screen.getByDisplayValue('70')).toBeInTheDocument();
    });

    const volumeSlider = screen.getByRole('slider', {
      name: /Alert notification volume/i,
    });

    // Drag slider without releasing
    await userEvent.pointer({ keys: '[MouseLeft>]', target: volumeSlider });
    volumeSlider.setAttribute('value', '85');
    await userEvent.pointer({ keys: '[/MouseLeft]' });

    // Wait for mouseUp to trigger commit
    await waitFor(() => {
      expect(api.updateAlertSoundSettings).toHaveBeenCalledWith({
        volume: 85,
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // Test 3: Per-alert sound override resolves default through global setting
  // AC: Alert with sound_type='default' uses globalSoundType for preview
  // ────────────────────────────────────────────────────────

  test('per-alert sound default resolves to global setting for preview', async () => {
    const mockAlert = {
      id: 1,
      ticker: 'AAPL',
      condition_type: 'price_above',
      threshold: 150,
      enabled: true,
      sound_type: 'default' as const,
      triggered_at: null,
    };

    const mockSettings = {
      enabled: true,
      sound_type: 'alarm' as const,
      volume: 70,
      mute_when_active: false,
    };

    (api.getAlertSoundSettings).mockResolvedValue(mockSettings as jest.Mock);
    (useAlerts as jest.Mock).mockReturnValue({
      alerts: [mockAlert],
      loading: false,
      error: null,
      createAlert: jest.fn(),
      updateAlert: jest.fn(),
      removeAlert: jest.fn(),
      toggleAlert: jest.fn(),
    } as any);

    render(<PriceAlertsPanel />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('default')).toBeInTheDocument();
    });

    // Click preview button in alert row
    const previewButtons = screen.getAllByRole('button', {
      name: /Preview sound/i,
    });
    const alertPreviewButton = previewButtons[1]; // Second preview (first is global)

    await userEvent.click(alertPreviewButton);

    // Verify playAlertSound was called with resolved 'alarm' type (not 'default')
    expect(alertSound.playAlertSound).toHaveBeenCalledWith('alarm', 0.7);
  });

  // ────────────────────────────────────────────────────────
  // Test 4: Settings save error reverts optimistic update
  // AC: Failed save rolls back UI state and doesn't show success indicator
  // ────────────────────────────────────────────────────────

  test('reverts optimistic update on settings save failure', async () => {
    const mockSettings = {
      enabled: true,
      sound_type: 'chime' as const,
      volume: 70,
      mute_when_active: false,
    };

    (api.getAlertSoundSettings).mockResolvedValue(mockSettings as jest.Mock);
    (api.updateAlertSoundSettings as jest.Mock).mockRejectedValueOnce(
      new Error('Network error'),
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
      expect(screen.getByLabelText('Enable alert sounds')).toBeInTheDocument();
    });

    const enableToggle = screen.getByRole('switch', {
      name: /Enable alert sounds/i,
    });

    // Click to disable (optimistic update happens)
    await userEvent.click(enableToggle);
    expect(enableToggle).not.toBeChecked();

    // Wait for error and revert
    await waitFor(() => {
      expect(enableToggle).toBeChecked(); // Reverted to original state
    });
  });

  // ────────────────────────────────────────────────────────
  // Test 5: Empty alerts state shows creation prompt
  // AC: When no alerts exist, UX encourages creation
  // ────────────────────────────────────────────────────────

  test('displays empty state with creation prompt when no alerts exist', async () => {
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
      expect(
        screen.getByText('No price alerts yet.'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: /Create your first alert/i,
        }),
      ).toBeInTheDocument();
    });
  });

  // ────────────────────────────────────────────────────────
  // Test 6: Sound type picker hideDefault hides default option in global context
  // AC: Global settings use hideDefault prop to avoid circular UX
  // ────────────────────────────────────────────────────────

  test('global sound picker hides default option (hideDefault=true)', async () => {
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
      const globalSoundSelect = screen.getByDisplayValue('chime');
      const options = within(globalSoundSelect.closest('select')!).getAllByRole(
        'option',
      );

      // Should have: chime, alarm, silent (NOT default)
      expect(options).toHaveLength(3);
      expect(options.map((o) => o.textContent)).toEqual([
        'Chime',
        'Alarm',
        'Silent',
      ]);
    });
  });
});
