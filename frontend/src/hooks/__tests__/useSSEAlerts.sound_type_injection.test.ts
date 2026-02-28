/**
 * VO-515: Frontend sound_type validation regression tests
 *
 * Ensures that untrusted sound_type values from SSE cannot bypass the
 * VALID_SOUND_TYPES allowlist before calling playAlertSound.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useSSEAlerts } from '../useSSEAlerts';
import * as useSSEModule from '../useSSE';
import * as alertSoundModule from '@/lib/alertSound';
import * as apiModule from '@/lib/api';
import type { AlertEvent } from '@/lib/types';

jest.mock('../useSSE');
jest.mock('@/lib/toastBus');
jest.mock('@/lib/alertSound');
jest.mock('@/lib/api');

describe('VO-515: useSSEAlerts sound_type injection prevention', () => {
  const mockUseSSE = useSSEModule.useSSE as jest.Mock;
  const mockPlayAlertSound = alertSoundModule.playAlertSound as jest.Mock;
  const mockGetAlertSoundSettings = apiModule.getAlertSoundSettings as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseSSE.mockReturnValue({
      recentAlerts: [],
      connected: true,
    });

    mockPlayAlertSound.mockImplementation(() => {});
    mockGetAlertSoundSettings.mockResolvedValue({
      enabled: true,
      sound_type: 'chime',
      volume: 70,
      mute_when_active: false,
    });
  });

  test('AC3: Invalid sound_type is rejected before playAlertSound', async () => {
    /**
     * AC3 states: useSSEAlerts rejects invalid sound_type values
     * (path traversal, injection payloads) before calling playAlertSound.
     */
    const evilAlert: AlertEvent = {
      ticker: 'AAPL',
      message: 'price alert',
      sound_type: '../../../etc/passwd.mp3' as any,
      type: 'price_alert',
      severity: 'high',
      alert_id: 1,
      condition_type: 'price_above',
      threshold: 150.0,
      current_price: 151.5,
      fire_count: 1,
    };

    mockUseSSE.mockReturnValue({
      recentAlerts: [evilAlert],
      connected: true,
    });

    const { rerender } = renderHook(() => useSSEAlerts());

    // First render: initialize (no side effects)
    expect(mockPlayAlertSound).not.toHaveBeenCalled();

    // Rerender with the malicious alert
    rerender();

    await waitFor(() => {
      // Even though malicious sound_type was in the alert,
      // playAlertSound should be called with a safe value (the global setting)
      expect(mockPlayAlertSound).toHaveBeenCalled();
    });

    // Verify the injected value was NOT passed through
    const callArgs = mockPlayAlertSound.mock.calls[0];
    expect(callArgs[0]).toBe('chime'); // Global setting, not the payload
    expect(callArgs[0]).not.toBe('../../../etc/passwd.mp3');
  });

  test('valid sound_types pass through unmodified', async () => {
    /**
     * Ensure that intentional per-alert sounds are preserved and not
     * filtered out by the allowlist check.
     */
    const validSounds: Array<'default' | 'chime' | 'alarm' | 'silent'> = [
      'default',
      'chime',
      'alarm',
      'silent',
    ];

    for (const soundType of validSounds) {
      jest.clearAllMocks();

      const alert: AlertEvent = {
        ticker: 'AAPL',
        message: 'price alert',
        sound_type: soundType,
        type: 'price_alert',
        severity: 'high',
        alert_id: 1,
        condition_type: 'price_above',
        threshold: 150.0,
        current_price: 151.5,
        fire_count: 1,
      };

      mockUseSSE.mockReturnValue({
        recentAlerts: [alert],
        connected: true,
      });

      const { rerender } = renderHook(() => useSSEAlerts());
      rerender();

      await waitFor(() => {
        if (soundType === 'silent') {
          // Silent should not trigger playAlertSound
          expect(mockPlayAlertSound).not.toHaveBeenCalled();
        } else {
          expect(mockPlayAlertSound).toHaveBeenCalled();
          const actualType = mockPlayAlertSound.mock.calls[0][0];
          // For 'default', hook falls back to global setting (chime)
          // For others, they pass through
          expect(['chime', 'alarm']).toContain(actualType);
        }
      });
    }
  });

  test('SQL injection in sound_type is neutralized', async () => {
    /**
     * Common injection pattern: SQL in string field.
     * Hook should reject it and use safe default.
     */
    const alert: AlertEvent = {
      ticker: 'MSFT',
      message: 'test',
      sound_type: "'; DROP TABLE alerts;--" as any,
      type: 'price_alert',
      severity: 'high',
      alert_id: 1,
      condition_type: 'price_above',
      threshold: 150.0,
      current_price: 151.5,
      fire_count: 1,
    };

    mockUseSSE.mockReturnValue({
      recentAlerts: [alert],
      connected: true,
    });

    const { rerender } = renderHook(() => useSSEAlerts());
    rerender();

    await waitFor(() => {
      expect(mockPlayAlertSound).toHaveBeenCalled();
      const soundType = mockPlayAlertSound.mock.calls[0][0];
      // Must be safe value, not injection payload
      expect(soundType).toBe('chime');
      expect(soundType).not.toContain("'");
      expect(soundType).not.toContain('DROP');
    });
  });

  test('XSS-like payloads in sound_type are rejected', async () => {
    /**
     * JavaScript-like injection attempt.
     * Sound type should never contain executable code.
     */
    const alert: AlertEvent = {
      ticker: 'GOOG',
      message: 'test',
      sound_type: 'javascript:void(alert(1))' as any,
      type: 'price_alert',
      severity: 'high',
      alert_id: 1,
      condition_type: 'price_above',
      threshold: 150.0,
      current_price: 151.5,
      fire_count: 1,
    };

    mockUseSSE.mockReturnValue({
      recentAlerts: [alert],
      connected: true,
    });

    const { rerender } = renderHook(() => useSSEAlerts());
    rerender();

    await waitFor(() => {
      expect(mockPlayAlertSound).toHaveBeenCalled();
      const soundType = mockPlayAlertSound.mock.calls[0][0];
      expect(soundType).not.toMatch(/javascript:/i);
      expect(soundType).not.toMatch(/alert/i);
    });
  });

  test('null/undefined sound_type falls back safely', async () => {
    /**
     * Edge case: malformed alert with null/undefined sound_type.
     * Should fall back to global settings without crashing.
     */
    const alert: AlertEvent = {
      ticker: 'TSLA',
      message: 'test',
      sound_type: null as any,
      type: 'price_alert',
      severity: 'high',
      alert_id: 1,
      condition_type: 'price_above',
      threshold: 150.0,
      current_price: 151.5,
      fire_count: 1,
    };

    mockUseSSE.mockReturnValue({
      recentAlerts: [alert],
      connected: true,
    });

    const { rerender } = renderHook(() => useSSEAlerts());
    rerender();

    await waitFor(() => {
      expect(mockPlayAlertSound).toHaveBeenCalled();
      const soundType = mockPlayAlertSound.mock.calls[0][0];
      expect(['chime', 'alarm']).toContain(soundType);
    });
  });
});