/**
 * useAlertSound — Settings Update Integration Tests
 *
 * AC1: updateSettings persists changes to API and refreshes local state
 * AC2: updateSettings with partial updates (volume, enabled, etc.)
 * AC3: Error handling for failed settings updates
 * AC4: Settings changes immediately reflected in subsequent playAlertSound calls
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useAlertSound } from '../useAlertSound';
import { getAlertSoundSettings, updateAlertSoundSettings } from '@/lib/api';
import type { AlertSoundSettings } from '@/lib/types';

jest.mock('@/lib/api');

describe('useAlertSound - Settings Update Integration', () => {
  let mockOscillator: any;
  let mockGain: any;
  let mockAudioContext: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Web Audio API
    mockOscillator = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      frequency: { setValueAtTime: jest.fn() },
      type: 'sine',
      start: jest.fn(),
      stop: jest.fn(),
      onended: null,
    };

    mockGain = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      gain: { value: 0 },
    };

    mockAudioContext = {
      createOscillator: jest.fn().mockReturnValue(mockOscillator),
      createGain: jest.fn().mockReturnValue(mockGain),
      destination: {},
      currentTime: 0,
      close: jest.fn(),
    };

    (global.AudioContext as any) = jest.fn(() => mockAudioContext);

    // Default: sound enabled, chime, volume 70
    (getAlertSoundSettings as jest.Mock).mockResolvedValue({
      enabled: true,
      sound_type: 'chime',
      volume: 70,
      mute_when_active: false,
    });

    (updateAlertSoundSettings as jest.Mock).mockResolvedValue({
      enabled: true,
      sound_type: 'chime',
      volume: 70,
      mute_when_active: false,
    });
  });

  describe('AC1: updateSettings persists to API and refreshes state', () => {
    test('updateSettings calls API with partial update', async () => {
      const { result } = renderHook(() => useAlertSound());

      await act(async () => {
        await result.current.updateSettings({ volume: 85 });
      });

      expect(updateAlertSoundSettings).toHaveBeenCalledWith({ volume: 85 });
    });

    test('updateSettings updates local settings state with API response', async () => {
      const newSettings: AlertSoundSettings = {
        enabled: false,
        sound_type: 'alarm',
        volume: 90,
        mute_when_active: true,
      };

      (updateAlertSoundSettings as jest.Mock).mockResolvedValueOnce(newSettings);

      const { result } = renderHook(() => useAlertSound());

      await act(async () => {
        await result.current.updateSettings({ enabled: false });
      });

      await waitFor(() => {
        expect(result.current.settings).toEqual(newSettings);
      });
    });

    test('updateSettings with sound_type change', async () => {
      const updatedSettings: AlertSoundSettings = {
        enabled: true,
        sound_type: 'alarm',
        volume: 70,
        mute_when_active: false,
      };

      (updateAlertSoundSettings as jest.Mock).mockResolvedValueOnce(updatedSettings);

      const { result } = renderHook(() => useAlertSound());

      await act(async () => {
        await result.current.updateSettings({ sound_type: 'alarm' });
      });

      await waitFor(() => {
        expect(result.current.settings.sound_type).toBe('alarm');
      });
    });

    test('updateSettings with multiple fields', async () => {
      const updatedSettings: AlertSoundSettings = {
        enabled: true,
        sound_type: 'chime',
        volume: 50,
        mute_when_active: true,
      };

      (updateAlertSoundSettings as jest.Mock).mockResolvedValueOnce(updatedSettings);

      const { result } = renderHook(() => useAlertSound());

      await act(async () => {
        await result.current.updateSettings({
          volume: 50,
          mute_when_active: true,
        });
      });

      await waitFor(() => {
        expect(updateAlertSoundSettings).toHaveBeenCalledWith({
          volume: 50,
          mute_when_active: true,
        });
        expect(result.current.settings.volume).toBe(50);
        expect(result.current.settings.mute_when_active).toBe(true);
      });
    });
  });

  describe('AC2: updateSettings with partial updates', () => {
    test('updateSettings with only volume change preserves other settings', async () => {
      const initialSettings: AlertSoundSettings = {
        enabled: true,
        sound_type: 'chime',
        volume: 70,
        mute_when_active: false,
      };

      (getAlertSoundSettings as jest.Mock).mockResolvedValueOnce(initialSettings);

      const updatedSettings: AlertSoundSettings = {
        enabled: true,
        sound_type: 'chime',
        volume: 40,
        mute_when_active: false,
      };

      (updateAlertSoundSettings as jest.Mock).mockResolvedValueOnce(updatedSettings);

      const { result } = renderHook(() => useAlertSound());

      await act(async () => {
        await Promise.resolve(); // Wait for initial fetch
      });

      await act(async () => {
        await result.current.updateSettings({ volume: 40 });
      });

      await waitFor(() => {
        expect(result.current.settings.volume).toBe(40);
        expect(result.current.settings.sound_type).toBe('chime');
        expect(result.current.settings.enabled).toBe(true);
      });
    });

    test('updateSettings with enabled toggle', async () => {
      const disabledSettings: AlertSoundSettings = {
        enabled: false,
        sound_type: 'chime',
        volume: 70,
        mute_when_active: false,
      };

      (updateAlertSoundSettings as jest.Mock).mockResolvedValueOnce(disabledSettings);

      const { result } = renderHook(() => useAlertSound());

      await act(async () => {
        await result.current.updateSettings({ enabled: false });
      });

      await waitFor(() => {
        expect(result.current.settings.enabled).toBe(false);
      });
    });

    test('updateSettings with mute_when_active toggle', async () => {
      const muteSettings: AlertSoundSettings = {
        enabled: true,
        sound_type: 'chime',
        volume: 70,
        mute_when_active: true,
      };

      (updateAlertSoundSettings as jest.Mock).mockResolvedValueOnce(muteSettings);

      const { result } = renderHook(() => useAlertSound());

      await act(async () => {
        await result.current.updateSettings({ mute_when_active: true });
      });

      await waitFor(() => {
        expect(result.current.settings.mute_when_active).toBe(true);
      });
    });
  });

  describe('AC3: Error handling for failed settings updates', () => {
    test('updateSettings handles API error gracefully', async () => {
      const apiError = new Error('Failed to update settings');
      (updateAlertSoundSettings as jest.Mock).mockRejectedValueOnce(apiError);

      const { result } = renderHook(() => useAlertSound());

      await expect(
        act(async () => {
          await result.current.updateSettings({ volume: 80 });
        })
      ).rejects.toThrow('Failed to update settings');
    });

    test('updateSettings preserves previous state on API error', async () => {
      const initialSettings: AlertSoundSettings = {
        enabled: true,
        sound_type: 'chime',
        volume: 70,
        mute_when_active: false,
      };

      (getAlertSoundSettings as jest.Mock).mockResolvedValueOnce(initialSettings);
      (updateAlertSoundSettings as jest.Mock).mockRejectedValueOnce(
        new Error('Update failed')
      );

      const { result } = renderHook(() => useAlertSound());

      await act(async () => {
        await Promise.resolve(); // Wait for initial fetch
      });

      try {
        await act(async () => {
          await result.current.updateSettings({ volume: 30 });
        });
      } catch {
        // Expected error
      }

      // State should remain unchanged
      expect(result.current.settings.volume).toBe(70);
    });

    test('updateSettings handles network timeout', async () => {
      (updateAlertSoundSettings as jest.Mock).mockRejectedValueOnce(
        new Error('Network timeout')
      );

      const { result } = renderHook(() => useAlertSound());

      await expect(
        act(async () => {
          await result.current.updateSettings({ volume: 50 });
        })
      ).rejects.toThrow('Network timeout');
    });
  });

  describe('AC4: Settings changes reflected in subsequent playback', () => {
    test('playback respects updated volume setting', async () => {
      const updatedSettings: AlertSoundSettings = {
        enabled: true,
        sound_type: 'chime',
        volume: 30,
        mute_when_active: false,
      };

      (updateAlertSoundSettings as jest.Mock).mockResolvedValueOnce(updatedSettings);

      const { result } = renderHook(() => useAlertSound());

      // First playback with default volume 70
      await act(async () => {
        result.current.playAlertSound('chime');
      });

      expect(mockGain.gain.value).toBe(0.7); // 70 / 100

      // Update volume to 30
      jest.clearAllMocks();
      mockGain.gain.value = 0;

      await act(async () => {
        await result.current.updateSettings({ volume: 30 });
      });

      // Next playback should use new volume
      await act(async () => {
        result.current.playAlertSound('chime');
      });

      await waitFor(() => {
        expect(mockGain.gain.value).toBe(0.3); // 30 / 100
      });
    });

    test('disabled setting prevents playback after update', async () => {
      const disabledSettings: AlertSoundSettings = {
        enabled: false,
        sound_type: 'chime',
        volume: 70,
        mute_when_active: false,
      };

      (updateAlertSoundSettings as jest.Mock).mockResolvedValueOnce(disabledSettings);

      const { result } = renderHook(() => useAlertSound());

      // Playback works initially
      await act(async () => {
        result.current.playAlertSound('chime');
      });

      expect(mockAudioContext.createOscillator).toHaveBeenCalled();

      // Disable sound
      jest.clearAllMocks();
      mockAudioContext.createOscillator.mockReturnValue(mockOscillator);

      await act(async () => {
        await result.current.updateSettings({ enabled: false });
      });

      // Playback should be blocked
      await act(async () => {
        result.current.playAlertSound('chime');
      });

      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });

    test('sound type change reflected in next playback', async () => {
      const alarmSettings: AlertSoundSettings = {
        enabled: true,
        sound_type: 'alarm',
        volume: 70,
        mute_when_active: false,
      };

      (updateAlertSoundSettings as jest.Mock).mockResolvedValueOnce(alarmSettings);

      const { result } = renderHook(() => useAlertSound());

      // Update sound type to alarm
      await act(async () => {
        await result.current.updateSettings({ sound_type: 'alarm' });
      });

      // Playback with the updated sound type
      jest.clearAllMocks();
      mockAudioContext.createOscillator.mockReturnValue(mockOscillator);

      await act(async () => {
        result.current.playAlertSound('alarm');
      });

      // Alarm uses higher frequency (880 Hz) with sawtooth wave
      expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(
        880,
        expect.any(Number)
      );
      expect(mockOscillator.type).toBe('sawtooth');
    });
  });
});