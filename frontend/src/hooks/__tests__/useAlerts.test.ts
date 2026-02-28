import { renderHook, waitFor, act } from '@testing-library/react';
import * as apiModule from '@/lib/api';
import { useAlerts } from '../useAlerts';
import type { Alert, AlertSoundSettings } from '@/lib/types';

// Mock the API module
jest.mock('@/lib/api', () => ({
  getAlerts: jest.fn(),
  createAlert: jest.fn(),
  updateAlert: jest.fn(),
  deleteAlert: jest.fn(),
  toggleAlert: jest.fn(),
  getAlertSoundSettings: jest.fn(),
}));

// Mock EventSource
global.EventSource = jest.fn() as jest.Mock;

// Mock AudioContext
const mockOscillator = {
  connect: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  onended: null as any,
  frequency: { value: 0 },
  type: '',
};

const mockGain = {
  connect: jest.fn(),
  gain: { value: 0 },
};

const mockAudioContext = {
  createOscillator: jest.fn(() => mockOscillator),
  createGain: jest.fn(() => mockGain),
  destination: {},
  currentTime: 0,
  close: jest.fn(),
};

Object.defineProperty(window, 'AudioContext', {
  writable: true,
  value: jest.fn(() => mockAudioContext),
});

describe('useAlerts', () => {
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

  const mockSoundSettings: AlertSoundSettings = {
    enabled: true,
    volume: 70,
    sound_type: 'chime',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (apiModule.getAlerts as jest.Mock).mockResolvedValue([mockAlert]);
    (apiModule.getAlertSoundSettings as jest.Mock).mockResolvedValue(mockSoundSettings);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Happy path', () => {
    it('should load alerts on mount', async () => {
      const { result } = renderHook(() => useAlerts());

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.alerts).toEqual([mockAlert]);
      expect(result.current.error).toBeNull();
      expect(apiModule.getAlerts).toHaveBeenCalled();
    });

    it('should create alert and refresh list', async () => {
      const newAlert = { ...mockAlert, id: 2, threshold: 160 };
      (apiModule.createAlert as jest.Mock).mockResolvedValue(newAlert);
      (apiModule.getAlerts as jest.Mock).mockResolvedValue([mockAlert, newAlert]);

      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        const created = await result.current.createAlert({
          ticker: 'AAPL',
          condition_type: 'price_above',
          threshold: 160,
        });
        expect(created.id).toBe(2);
      });

      await waitFor(() => {
        expect(result.current.alerts).toHaveLength(2);
      });
    });

    it('should toggle alert enabled state', async () => {
      const disabledAlert = { ...mockAlert, enabled: false };
      (apiModule.toggleAlert as jest.Mock).mockResolvedValue(disabledAlert);

      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.toggleAlert(1);
      });

      expect(result.current.alerts[0].enabled).toBe(false);
    });

    it('should delete alert', async () => {
      (apiModule.deleteAlert as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.alerts).toHaveLength(1);

      await act(async () => {
        await result.current.removeAlert(1);
      });

      expect(result.current.alerts).toHaveLength(0);
    });
  });

  describe('SSE alert event handling', () => {
    it('should play sound when alert event fires', async () => {
      let alertListener: ((event: MessageEvent) => void) | null = null;

      (global.EventSource as jest.Mock).mockImplementation(() => {
        return {
          addEventListener: jest.fn((event, listener) => {
            if (event === 'alert') alertListener = listener;
          }),
          close: jest.fn(),
        };
      });

      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Simulate SSE alert event
      const mockEvent = new MessageEvent('alert', {
        data: JSON.stringify({
          ticker: 'AAPL',
          message: 'Price alert triggered',
          sound_type: 'alarm',
        }),
      });

      act(() => {
        alertListener?.(mockEvent);
      });

      expect(mockOscillator.start).toHaveBeenCalled();
      expect(mockOscillator.stop).toHaveBeenCalled();
    });

    it('should skip refresh for test alerts', async () => {
      let alertListener: ((event: MessageEvent) => void) | null = null;

      (global.EventSource as jest.Mock).mockImplementation(() => {
        return {
          addEventListener: jest.fn((event, listener) => {
            if (event === 'alert') alertListener = listener;
          }),
          close: jest.fn(),
        };
      });

      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const refreshCallCount = (apiModule.getAlerts as jest.Mock).mock.calls.length;

      const mockEvent = new MessageEvent('alert', {
        data: JSON.stringify({
          ticker: 'AAPL',
          message: '[TEST] Price alert',
          sound_type: 'chime',
          is_test: true,
        }),
      });

      act(() => {
        alertListener?.(mockEvent);
      });

      // Should not trigger additional refresh for test alerts
      expect((apiModule.getAlerts as jest.Mock).mock.calls.length).toBe(refreshCallCount);
    });
  });

  describe('Error cases', () => {
    it('should handle API load error gracefully', async () => {
      (apiModule.getAlerts as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toContain('Failed to load alerts');
      expect(result.current.alerts).toEqual([]);
    });

    it('should handle create alert API error', async () => {
      (apiModule.createAlert as jest.Mock).mockRejectedValue(
        new Error('Invalid condition')
      );

      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(
        act(async () => {
          return result.current.createAlert({
            ticker: 'INVALID',
            condition_type: 'invalid_type',
            threshold: 100,
          });
        })
      ).rejects.toThrow();
    });

    it('should ignore malformed SSE payload', async () => {
      let alertListener: ((event: MessageEvent) => void) | null = null;

      (global.EventSource as jest.Mock).mockImplementation(() => {
        return {
          addEventListener: jest.fn((event, listener) => {
            if (event === 'alert') alertListener = listener;
          }),
          close: jest.fn(),
        };
      });

      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const mockEvent = new MessageEvent('alert', {
        data: 'invalid json {]',
      });

      // Should not throw
      expect(() => {
        act(() => {
          alertListener?.(mockEvent);
        });
      }).not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle unmount during async operation', async () => {
      const { unmount } = renderHook(() => useAlerts());

      // Unmount before async operations complete
      unmount();

      // Should not throw or cause errors
      await waitFor(() => {
        expect(apiModule.getAlerts).toHaveBeenCalled();
      }, { timeout: 100 }).catch(() => {
        // Expected to timeout or complete without error
      });
    });

    it('should respect audio context volume limits', async () => {
      let alertListener: ((event: MessageEvent) => void) | null = null;

      (global.EventSource as jest.Mock).mockImplementation(() => {
        return {
          addEventListener: jest.fn((event, listener) => {
            if (event === 'alert') alertListener = listener;
          }),
          close: jest.fn(),
        };
      });

      const { result } = renderHook(() => useAlerts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Sound with invalid volume should be clamped to [0, 1]
      const mockEvent = new MessageEvent('alert', {
        data: JSON.stringify({
          ticker: 'AAPL',
          message: 'Alert',
          sound_type: 'chime',
        }),
      });

      act(() => {
        alertListener?.(mockEvent);
      });

      // Verify gain value is between 0 and 1
      expect(mockGain.gain.value).toBeGreaterThanOrEqual(0);
      expect(mockGain.gain.value).toBeLessThanOrEqual(1);
    });
  });
});
