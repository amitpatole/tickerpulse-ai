/**
 * TickerPulse AI - Alert Sound Injection Prevention Tests
 *
 * Validates that playAlertSound() safely handles malicious or untrusted
 * sound_type values without exposing the Web Audio API to injection attacks.
 *
 * Bug: Frontend — unvalidated SSE `sound_type` passed to playAlertSound
 * Area: price alert notifications
 */

import { playAlertSound } from '../alertSound';

describe('playAlertSound injection prevention', () => {
  let mockAudioContext: any;
  let mockOscillator: any;
  let mockGain: any;

  beforeEach(() => {
    // Mock Web Audio API
    mockOscillator = {
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      type: '',
      frequency: { value: 0 },
      onended: null,
    };

    mockGain = {
      connect: jest.fn(),
      gain: { value: 0 },
    };

    mockAudioContext = {
      createOscillator: jest.fn(() => mockOscillator),
      createGain: jest.fn(() => mockGain),
      destination: {},
      currentTime: 0,
      close: jest.fn(),
    };

    // Setup window.AudioContext
    (window as any).AudioContext = jest.fn(() => mockAudioContext);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('happy path — known sound types', () => {
    it('should play chime (sine wave 523Hz)', () => {
      playAlertSound('chime', 0.7);

      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
      expect(mockOscillator.frequency.value).toBe(523);
      expect(mockOscillator.type).toBe('sine');
      expect(mockOscillator.start).toHaveBeenCalled();
    });

    it('should play alarm (sawtooth wave 880Hz)', () => {
      playAlertSound('alarm', 0.7);

      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
      expect(mockOscillator.frequency.value).toBe(880);
      expect(mockOscillator.type).toBe('sawtooth');
      expect(mockOscillator.start).toHaveBeenCalled();
    });

    it('should play default (sine wave 523Hz)', () => {
      playAlertSound('default', 0.7);

      expect(mockOscillator.frequency.value).toBe(523);
      expect(mockOscillator.type).toBe('sine');
    });

    it('should skip audio for silent sound type', () => {
      playAlertSound('silent', 0.7);

      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });

    it('should clamp volume to [0, 1]', () => {
      playAlertSound('chime', 1.5);
      expect(mockGain.gain.value).toBe(1);

      playAlertSound('chime', -0.5);
      expect(mockGain.gain.value).toBe(0);
    });
  });

  describe('error cases — invalid audio context', () => {
    it('should fail silently when AudioContext is unavailable', () => {
      delete (window as any).AudioContext;
      delete (window as any).webkitAudioContext;

      // Should not throw; fails silently
      expect(() => playAlertSound('chime', 0.7)).not.toThrow();
      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });

    it('should fail silently when createOscillator throws', () => {
      mockAudioContext.createOscillator = jest.fn(() => {
        throw new Error('Audio API unavailable');
      });

      expect(() => playAlertSound('chime', 0.7)).not.toThrow();
    });

    it('should fail silently when createGain throws', () => {
      mockAudioContext.createGain = jest.fn(() => {
        throw new Error('Gain node unavailable');
      });

      expect(() => playAlertSound('chime', 0.7)).not.toThrow();
    });
  });

  describe('edge cases — unknown sound types', () => {
    it('should default to sine wave (chime behavior) for unknown sound_type', () => {
      playAlertSound('invalid_sound_type', 0.7);

      // Unknown types should NOT create oscillator with malicious frequency/type
      // Instead, they fall into the default else branch (sine 523Hz)
      expect(mockOscillator.frequency.value).toBe(523);
      expect(mockOscillator.type).toBe('sine');
    });

    it('should default to sine wave for HTML injection attempts', () => {
      playAlertSound('<script>alert(1)</script>', 0.7);

      // Script tag should NOT affect oscillator; should default to sine
      expect(mockOscillator.frequency.value).toBe(523);
      expect(mockOscillator.type).toBe('sine');
    });

    it('should default to sine wave for path traversal attempts', () => {
      playAlertSound('../../../etc/passwd', 0.7);

      // Path traversal should NOT affect oscillator
      expect(mockOscillator.frequency.value).toBe(523);
      expect(mockOscillator.type).toBe('sine');
    });

    it('should default to sine wave for empty string', () => {
      playAlertSound('', 0.7);

      expect(mockOscillator.frequency.value).toBe(523);
      expect(mockOscillator.type).toBe('sine');
    });

    it('should default to sine wave for null-like string values', () => {
      playAlertSound('null', 0.7);
      expect(mockOscillator.frequency.value).toBe(523);

      playAlertSound('undefined', 0.7);
      expect(mockOscillator.frequency.value).toBe(523);
    });
  });

  describe('acceptance criteria: input validation at point of use', () => {
    it('AC1: Unknown sound types default safely without exposing string to oscillator API', () => {
      const maliciousSoundType = 'DELETE FROM alerts';
      playAlertSound(maliciousSoundType, 0.7);

      // The malicious string should NOT be used to configure the oscillator
      // It should fall through to the default (sine 523Hz) branch
      expect(mockOscillator.frequency.value).toBe(523);
      expect(mockOscillator.type).toBe('sine');
      expect(mockOscillator.start).toHaveBeenCalled();
    });

    it('AC2: Valid condition types (chime, alarm, default) use correct frequency/type', () => {
      playAlertSound('chime', 0.7);
      expect(mockOscillator.frequency.value).toBe(523);
      expect(mockOscillator.type).toBe('sine');

      mockOscillator.frequency.value = 0;
      mockOscillator.type = '';

      playAlertSound('alarm', 0.7);
      expect(mockOscillator.frequency.value).toBe(880);
      expect(mockOscillator.type).toBe('sawtooth');
    });
  });
});
