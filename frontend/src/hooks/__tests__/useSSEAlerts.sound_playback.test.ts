import { renderHook, act, waitFor } from '@testing-library/react';
import { useSSEAlerts } from '../useSSEAlerts';
import { useAlertSound } from '../useAlertSound';
import { usePersistedState } from '../usePersistedState';

jest.mock('../useAlertSound');
jest.mock('../usePersistedState');

describe('useSSEAlerts - Sound Playback Integration', () => {
  let mockPlaySound: jest.Mock;
  let mockEventSource: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock useAlertSound hook
    mockPlaySound = jest.fn();
    (useAlertSound as jest.Mock).mockReturnValue({
      playAlertSound: mockPlaySound
    });

    // Mock usePersistedState for sound settings
    (usePersistedState as jest.Mock).mockReturnValue([
      { sound_enabled: true, sound_type: 'default' },
      jest.fn(),
      { syncing: false, error: null }
    ]);

    // Mock EventSource
    mockEventSource = {
      addEventListener: jest.fn(),
      close: jest.fn(),
      onerror: null,
      onmessage: null
    };

    (global.EventSource as any) = jest.fn(() => mockEventSource);
  });

  describe('AC1: Play alert sound when SSE price_alert event triggers', () => {
    test('plays sound with sound_type from SSE alert payload', async () => {
      const { result } = renderHook(() => useSSEAlerts());

      // Simulate SSE price_alert event with sound_type
      const alertEvent = new MessageEvent('price_alert', {
        data: JSON.stringify({
          id: 123,
          ticker: 'AAPL',
          price_target: 150.0,
          sound_type: 'chime',
          triggered_at: '2026-02-28T10:30:00Z'
        })
      });

      act(() => {
        // Trigger the alert event listener
        const listener = mockEventSource.addEventListener.mock.calls.find(
          call => call[0] === 'price_alert'
        )?.[1];
        if (listener) listener(alertEvent);
      });

      await waitFor(() => {
        expect(mockPlaySound).toHaveBeenCalledWith('chime');
      });
    });

    test('plays sound for alarm type alerts', async () => {
      const { result } = renderHook(() => useSSEAlerts());

      const alertEvent = new MessageEvent('price_alert', {
        data: JSON.stringify({
          id: 456,
          ticker: 'TSLA',
          price_target: 200.0,
          sound_type: 'alarm',
          triggered_at: '2026-02-28T10:35:00Z'
        })
      });

      act(() => {
        const listener = mockEventSource.addEventListener.mock.calls.find(
          call => call[0] === 'price_alert'
        )?.[1];
        if (listener) listener(alertEvent);
      });

      await waitFor(() => {
        expect(mockPlaySound).toHaveBeenCalledWith('alarm');
      });
    });
  });

  describe('AC2: Respect global sound_enabled setting at alert time', () => {
    test('does not play sound when global sound_enabled is false', async () => {
      (usePersistedState as jest.Mock).mockReturnValue([
        { sound_enabled: false, sound_type: 'default' },
        jest.fn(),
        { syncing: false, error: null }
      ]);

      const { result } = renderHook(() => useSSEAlerts());

      const alertEvent = new MessageEvent('price_alert', {
        data: JSON.stringify({
          id: 789,
          ticker: 'MSFT',
          price_target: 300.0,
          sound_type: 'chime',
          triggered_at: '2026-02-28T10:40:00Z'
        })
      });

      act(() => {
        const listener = mockEventSource.addEventListener.mock.calls.find(
          call => call[0] === 'price_alert'
        )?.[1];
        if (listener) listener(alertEvent);
      });

      // Should not call playSound when global setting is disabled
      expect(mockPlaySound).not.toHaveBeenCalled();
    });

    test('silently handles alert with silent sound_type', async () => {
      const { result } = renderHook(() => useSSEAlerts());

      const alertEvent = new MessageEvent('price_alert', {
        data: JSON.stringify({
          id: 999,
          ticker: 'GOOG',
          price_target: 2500.0,
          sound_type: 'silent',
          triggered_at: '2026-02-28T10:45:00Z'
        })
      });

      act(() => {
        const listener = mockEventSource.addEventListener.mock.calls.find(
          call => call[0] === 'price_alert'
        )?.[1];
        if (listener) listener(alertEvent);
      });

      // Should pass 'silent' to playSound (frontend decides not to play)
      await waitFor(() => {
        expect(mockPlaySound).toHaveBeenCalledWith('silent');
      });
    });
  });

  describe('Error handling and edge cases', () => {
    test('handles malformed SSE payload gracefully', async () => {
      const { result } = renderHook(() => useSSEAlerts());

      const invalidEvent = new MessageEvent('price_alert', {
        data: 'not valid json'
      });

      expect(() => {
        act(() => {
          const listener = mockEventSource.addEventListener.mock.calls.find(
            call => call[0] === 'price_alert'
          )?.[1];
          if (listener) listener(invalidEvent);
        });
      }).not.toThrow();
    });

    test('falls back gracefully when sound_type is missing from payload', async () => {
      const { result } = renderHook(() => useSSEAlerts());

      const alertEvent = new MessageEvent('price_alert', {
        data: JSON.stringify({
          id: 555,
          ticker: 'AMD',
          price_target: 150.0
          // No sound_type provided
        })
      });

      act(() => {
        const listener = mockEventSource.addEventListener.mock.calls.find(
          call => call[0] === 'price_alert'
        )?.[1];
        if (listener) listener(alertEvent);
      });

      // Should use default sound type fallback
      await waitFor(() => {
        expect(mockPlaySound).toHaveBeenCalledWith(
          expect.stringMatching(/default|undefined/)
        );
      });
    });

    test('plays multiple sounds for multiple concurrent alerts', async () => {
      const { result } = renderHook(() => useSSEAlerts());

      const alertEvent1 = new MessageEvent('price_alert', {
        data: JSON.stringify({
          id: 111,
          ticker: 'AAPL',
          sound_type: 'chime'
        })
      });

      const alertEvent2 = new MessageEvent('price_alert', {
        data: JSON.stringify({
          id: 222,
          ticker: 'TSLA',
          sound_type: 'alarm'
        })
      });

      act(() => {
        const listener = mockEventSource.addEventListener.mock.calls.find(
          call => call[0] === 'price_alert'
        )?.[1];
        if (listener) {
          listener(alertEvent1);
          listener(alertEvent2);
        }
      });

      await waitFor(() => {
        expect(mockPlaySound).toHaveBeenCalledTimes(2);
        expect(mockPlaySound).toHaveBeenNthCalledWith(1, 'chime');
        expect(mockPlaySound).toHaveBeenNthCalledWith(2, 'alarm');
      });
    });
  });
});
