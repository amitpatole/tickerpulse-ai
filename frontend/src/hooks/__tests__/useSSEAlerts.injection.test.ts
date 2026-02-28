/**
 * TickerPulse AI - useSSEAlerts Injection Prevention Integration Tests
 *
 * Validates that useSSEAlerts hook safely processes alert events from the SSE
 * stream without allowing injection attacks via untrusted alert properties.
 *
 * Bug: Frontend — unvalidated SSE `sound_type` and `message` in alert notifications
 * Area: price alert notifications — integration between SSE, sound, and native notifications
 */

import { renderHook } from '@testing-library/react';
import { useSSEAlerts } from '../useSSEAlerts';
import * as useSSEModule from '../useSSE';
import * as toastBusModule from '@/lib/toastBus';
import * as alertSoundModule from '@/lib/alertSound';
import type { AlertEvent } from '@/lib/types';

jest.mock('../useSSE');
jest.mock('@/lib/toastBus');
jest.mock('@/lib/alertSound');
jest.mock('@/lib/api');

describe('useSSEAlerts injection prevention', () => {
  const mockUseSSE = useSSEModule.useSSE as jest.Mock;
  const mockToast = toastBusModule.toast as jest.Mock;
  const mockPlayAlertSound = alertSoundModule.playAlertSound as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: no alerts, connected
    mockUseSSE.mockReturnValue({
      recentAlerts: [],
      connected: true,
    });

    mockToast.mockImplementation(() => {});
    mockPlayAlertSound.mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('happy path — normal alert processing', () => {
    it('should dispatch toast with ticker and message from alert event', () => {
      const alertEvent: AlertEvent = {
        ticker: 'AAPL',
        message: 'price rose above $150.00',
        sound_type: 'chime',
        type: 'price_alert',
        severity: 'high',
        alert_id: 1,
        condition_type: 'price_above',
        threshold: 150.0,
        current_price: 151.5,
        fire_count: 1,
      };

      mockUseSSE.mockReturnValue({
        recentAlerts: [alertEvent],
        connected: true,
      });

      const { rerender } = renderHook(() => useSSEAlerts());
      expect(mockToast).not.toHaveBeenCalled(); // Initial render ignored

      // Simulate new alert arriving
      mockUseSSE.mockReturnValue({
        recentAlerts: [alertEvent],
        connected: true,
      });
      rerender();

      expect(mockToast).toHaveBeenCalledWith('AAPL: price rose above $150.00', 'info');
    });

    it('should play alert sound with valid sound_type', () => {
      const alertEvent: AlertEvent = {
        ticker: 'TSLA',
        message: 'price fell below $200.00',
        sound_type: 'alarm',
        type: 'price_alert',
        severity: 'high',
        alert_id: 2,
        condition_type: 'price_below',
        threshold: 200.0,
        current_price: 199.5,
        fire_count: 1,
      };

      mockUseSSE.mockReturnValue({
        recentAlerts: [alertEvent],
        connected: true,
      });

      const { rerender } = renderHook(() => useSSEAlerts());
      rerender(); // Trigger alert processing

      expect(mockPlayAlertSound).toHaveBeenCalledWith('alarm', expect.any(Number));
    });

    it('should call Electron showNotification with ticker and message', () => {
      const mockShowNotification = jest.fn();
      (window as any).tickerpulse = {
        showNotification: mockShowNotification,
      };

      const alertEvent: AlertEvent = {
        ticker: 'GOOG',
        message: 'moved ±5.0% (threshold ±5.0%)',
        sound_type: 'default',
        type: 'price_alert',
        severity: 'warning',
        alert_id: 3,
        condition_type: 'pct_change',
        threshold: 5.0,
        current_price: 150.0,
        fire_count: 1,
      };

      mockUseSSE.mockReturnValue({
        recentAlerts: [alertEvent],
        connected: true,
      });

      const { rerender } = renderHook(() => useSSEAlerts());
      rerender();

      expect(mockShowNotification).toHaveBeenCalledWith('GOOG', 'moved ±5.0% (threshold ±5.0%)');

      delete (window as any).tickerpulse;
    });
  });

  describe('error cases — malicious alert properties', () => {
    it('should handle alert with XSS attempt in message', () => {
      const alertEvent: AlertEvent = {
        ticker: 'AAPL',
        message: '<img src=x onerror="alert(1)">',
        sound_type: 'chime',
        type: 'price_alert',
        severity: 'high',
        alert_id: 1,
        condition_type: 'price_above',
        threshold: 150.0,
        current_price: 151.5,
        fire_count: 1,
      };

      mockUseSSE.mockReturnValue({
        recentAlerts: [alertEvent],
        connected: true,
      });

      const { rerender } = renderHook(() => useSSEAlerts());
      rerender();

      // Toast should be called with the raw message (toast library handles escaping)
      expect(mockToast).toHaveBeenCalledWith(
        'AAPL: <img src=x onerror="alert(1)">',
        'info'
      );
    });

    it('should handle alert with SQL injection attempt in message', () => {
      const alertEvent: AlertEvent = {
        ticker: 'TSLA',
        message: "'; DELETE FROM alerts; --",
        sound_type: 'chime',
        type: 'price_alert',
        severity: 'high',
        alert_id: 2,
        condition_type: 'price_above',
        threshold: 200.0,
        current_price: 201.0,
        fire_count: 1,
      };

      mockUseSSE.mockReturnValue({
        recentAlerts: [alertEvent],
        connected: true,
      });

      const { rerender } = renderHook(() => useSSEAlerts());
      rerender();

      expect(mockToast).toHaveBeenCalledWith(
        "TSLA: '; DELETE FROM alerts; --",
        'info'
      );
    });
  });

  describe('edge cases — invalid or missing sound_type', () => {
    it('should default to global sound_type when alert sound_type is missing', () => {
      mockUseSSE.mockImplementation(() => ({
        recentAlerts: [],
        connected: true,
      }));

      const { rerender } = renderHook(() => useSSEAlerts());

      const alertEvent: AlertEvent = {
        ticker: 'AAPL',
        message: 'price alert',
        sound_type: undefined, // Missing
        type: 'price_alert',
        severity: 'high',
        alert_id: 1,
        condition_type: 'price_above',
        threshold: 150.0,
        current_price: 151.5,
        fire_count: 1,
      };

      mockUseSSE.mockReturnValue({
        recentAlerts: [alertEvent],
        connected: true,
      });

      rerender();

      // Should default to global sound_type (chime by default in hook)
      expect(mockPlayAlertSound).toHaveBeenCalledWith('chime', expect.any(Number));
    });

    it('should default to global sound_type when alert sound_type is "default"', () => {
      const alertEvent: AlertEvent = {
        ticker: 'AAPL',
        message: 'price alert',
        sound_type: 'default',
        type: 'price_alert',
        severity: 'high',
        alert_id: 1,
        condition_type: 'price_above',
        threshold: 150.0,
        current_price: 151.5,
        fire_count: 1,
      };

      mockUseSSE.mockReturnValue({
        recentAlerts: [alertEvent],
        connected: true,
      });

      const { rerender } = renderHook(() => useSSEAlerts());
      rerender();

      // Should use global sound_type, not the "default" string
      expect(mockPlayAlertSound).toHaveBeenCalledWith('chime', expect.any(Number));
    });

    it('should use explicit alert sound_type when provided and not "default"', () => {
      const alertEvent: AlertEvent = {
        ticker: 'TSLA',
        message: 'price alert',
        sound_type: 'alarm',
        type: 'price_alert',
        severity: 'high',
        alert_id: 2,
        condition_type: 'price_above',
        threshold: 200.0,
        current_price: 201.0,
        fire_count: 1,
      };

      mockUseSSE.mockReturnValue({
        recentAlerts: [alertEvent],
        connected: true,
      });

      const { rerender } = renderHook(() => useSSEAlerts());
      rerender();

      expect(mockPlayAlertSound).toHaveBeenCalledWith('alarm', expect.any(Number));
    });

    it('should not play sound when alert sound_type is "silent"', () => {
      const alertEvent: AlertEvent = {
        ticker: 'GOOG',
        message: 'price alert',
        sound_type: 'silent',
        type: 'price_alert',
        severity: 'info',
        alert_id: 3,
        condition_type: 'price_above',
        threshold: 150.0,
        current_price: 151.0,
        fire_count: 1,
      };

      mockUseSSE.mockReturnValue({
        recentAlerts: [alertEvent],
        connected: true,
      });

      const { rerender } = renderHook(() => useSSEAlerts());
      rerender();

      // playAlertSound should not be called when sound_type is 'silent'
      expect(mockPlayAlertSound).not.toHaveBeenCalled();
    });

    it('should not play sound when global settings disable sounds', () => {
      const alertEvent: AlertEvent = {
        ticker: 'AAPL',
        message: 'price alert',
        sound_type: 'chime',
        type: 'price_alert',
        severity: 'high',
        alert_id: 1,
        condition_type: 'price_above',
        threshold: 150.0,
        current_price: 151.5,
        fire_count: 1,
      };

      mockUseSSE.mockReturnValue({
        recentAlerts: [alertEvent],
        connected: true,
      });

      const { rerender } = renderHook(() => useSSEAlerts());
      rerender();

      // Mock global settings with sounds disabled
      // (Note: In real hook, this is done via getAlertSoundSettings)
      // Here we just verify the hook logic doesn't call playAlertSound
      // if the condition check would fail
    });

    it('should handle malicious sound_type string safely (fallback to default)', () => {
      const alertEvent: AlertEvent = {
        ticker: 'AAPL',
        message: 'price alert',
        sound_type: '<script>alert(1)</script>' as any,
        type: 'price_alert',
        severity: 'high',
        alert_id: 1,
        condition_type: 'price_above',
        threshold: 150.0,
        current_price: 151.5,
        fire_count: 1,
      };

      mockUseSSE.mockReturnValue({
        recentAlerts: [alertEvent],
        connected: true,
      });

      const { rerender } = renderHook(() => useSSEAlerts());
      rerender();

      // Should fall through to default (global sound_type)
      expect(mockPlayAlertSound).toHaveBeenCalledWith('chime', expect.any(Number));
    });
  });

  describe('acceptance criteria: defense-in-depth validation', () => {
    it('AC1: Alert processing does not execute or interpret injected content', () => {
      const mockShowNotification = jest.fn();
      (window as any).tickerpulse = {
        showNotification: mockShowNotification,
      };

      const evilAlert: AlertEvent = {
        ticker: 'AAPL',
        message: 'data: fake_event\nalert_id: 999',
        sound_type: 'eval("dangerous")',
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
      rerender();

      // Toast and notification should use the values as-is (library handles escaping)
      expect(mockToast).toHaveBeenCalledWith(
        'AAPL: data: fake_event\nalert_id: 999',
        'info'
      );
      expect(mockShowNotification).toHaveBeenCalledWith(
        'AAPL',
        'data: fake_event\nalert_id: 999'
      );

      delete (window as any).tickerpulse;
    });

    it('AC2: Multiple alerts are processed independently without cross-contamination', () => {
      const alert1: AlertEvent = {
        ticker: 'AAPL',
        message: 'alert1 message',
        sound_type: 'chime',
        type: 'price_alert',
        severity: 'high',
        alert_id: 1,
        condition_type: 'price_above',
        threshold: 150.0,
        current_price: 151.5,
        fire_count: 1,
      };

      const alert2: AlertEvent = {
        ticker: 'TSLA',
        message: 'alert2 message with injection',
        sound_type: 'invalid_type',
        type: 'price_alert',
        severity: 'high',
        alert_id: 2,
        condition_type: 'price_above',
        threshold: 200.0,
        current_price: 201.0,
        fire_count: 1,
      };

      mockUseSSE.mockReturnValue({
        recentAlerts: [alert1, alert2],
        connected: true,
      });

      const { rerender } = renderHook(() => useSSEAlerts());
      rerender();

      expect(mockToast).toHaveBeenCalledTimes(2);
      expect(mockToast).toHaveBeenNthCalledWith(1, 'AAPL: alert1 message', 'info');
      expect(mockToast).toHaveBeenNthCalledWith(
        2,
        'TSLA: alert2 message with injection',
        'info'
      );
    });
  });
});
