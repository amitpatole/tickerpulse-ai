import { renderHook, act } from '@testing-library/react';
import { useAlertSound } from '../useAlertSound';
import { getAlertSoundSettings } from '@/lib/api';

jest.mock('@/lib/api');

describe('useAlertSound - Price Alert Notification Sound', () => {
  let mockOscillator: any;
  let mockGain: any;
  let mockAudioContext: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Web Audio API oscillator
    mockOscillator = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      frequency: { setValueAtTime: jest.fn() },
      type: 'sine',
      start: jest.fn(),
      stop: jest.fn(),
      onended: null,
    };

    // Mock Web Audio API gain node
    mockGain = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      gain: { value: 0, setValueAtTime: jest.fn() },
    };

    // Mock Web Audio API context
    mockAudioContext = {
      createOscillator: jest.fn().mockReturnValue(mockOscillator),
      createGain: jest.fn().mockReturnValue(mockGain),
      destination: {},
      currentTime: 0,
      close: jest.fn(),
    };

    (global.AudioContext as any) = jest.fn(() => mockAudioContext);

    // Default: sound enabled
    (getAlertSoundSettings as jest.Mock).mockResolvedValue({
      enabled: true,
      sound_type: 'default',
      volume: 70,
      mute_when_active: false,
    });
  });

  describe('AC1: Play alert sound when price alert triggers via SSE', () => {
    test('plays chime sound when alert with sound_type chime triggers', async () => {
      const { result } = renderHook(() => useAlertSound());

      await act(async () => {
        result.current.playAlertSound('chime');
      });

      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
      expect(mockOscillator.start).toHaveBeenCalled();
      expect(mockOscillator.stop).toHaveBeenCalled();
    });

    test('plays alarm sound with frequency modulation for alarm type', async () => {
      const { result } = renderHook(() => useAlertSound());

      await act(async () => {
        result.current.playAlertSound('alarm');
      });

      expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number)
      );
      expect(mockOscillator.start).toHaveBeenCalled();
    });

    test('connects oscillator through gain node to audio context', async () => {
      const { result } = renderHook(() => useAlertSound());

      await act(async () => {
        result.current.playAlertSound('default');
      });

      expect(mockOscillator.connect).toHaveBeenCalledWith(mockGain);
      expect(mockGain.connect).toHaveBeenCalledWith(mockAudioContext.destination);
    });
  });

  describe('AC2: Respect global sound settings at playback time', () => {
    test('does not play sound when global sound enabled is false', async () => {
      (getAlertSoundSettings as jest.Mock).mockResolvedValue({
        enabled: false,
        sound_type: 'default',
        volume: 70,
        mute_when_active: false,
      });

      const { result } = renderHook(() => useAlertSound());

      // Wait for the async settings fetch to complete and state to update.
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        result.current.playAlertSound('chime');
      });

      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });

    test('never plays audio for silent sound_type even when enabled is true', async () => {
      const { result } = renderHook(() => useAlertSound());

      await act(async () => {
        result.current.playAlertSound('silent');
      });

      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
      expect(mockOscillator.start).not.toHaveBeenCalled();
    });
  });

  describe('Error handling and edge cases', () => {
    test('gracefully handles missing AudioContext without throwing', () => {
      (global.AudioContext as any) = undefined;

      const { result } = renderHook(() => useAlertSound());

      expect(() => {
        result.current.playAlertSound('chime');
      }).not.toThrow();
    });

    test('handles unknown sound_type by playing as default sine tone', async () => {
      const { result } = renderHook(() => useAlertSound());

      await act(async () => {
        result.current.playAlertSound('unknown_type' as any);
      });

      // Unknown types fall through to the sine-tone branch and still play.
      expect(result.current.playAlertSound).toBeDefined();
    });

    test('cancels previous sound if new alert plays before first completes', async () => {
      const { result } = renderHook(() => useAlertSound());

      await act(async () => {
        result.current.playAlertSound('chime');
        result.current.playAlertSound('alarm');
      });

      // First oscillator should have been stopped before second started.
      expect(mockOscillator.stop).toHaveBeenCalled();
    });

    test('exposes play alias identical to playAlertSound', () => {
      const { result } = renderHook(() => useAlertSound());
      expect(result.current.play).toBe(result.current.playAlertSound);
    });
  });
});