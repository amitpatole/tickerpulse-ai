/**
 * TickerPulse AI v3.0 - Alert Sound Synthesis
 * Web Audio API synthesis for price alert notifications.
 * No audio files required — all sounds are generated programmatically.
 */

import type { AlertSoundType } from './types';

/**
 * Play an alert sound using the Web Audio API.
 *
 * @param type   - Sound type: 'chime' | 'alarm' | 'silent'. 'default' is treated as 'chime'.
 * @param volume - Volume from 0 to 100. Values outside [0, 100] are clamped.
 */
export function playAlertSound(type: Exclude<AlertSoundType, 'default'> | 'default', volume: number): void {
  if (type === 'silent') return;

  // Clamp volume to [0, 100]
  const clampedVolume = Math.max(0, Math.min(100, volume));
  const gain = clampedVolume / 100;

  const AudioContextClass =
    typeof window !== 'undefined'
      ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;

  if (!AudioContextClass) return; // Graceful no-op in environments without Web Audio

  let ctx: AudioContext;
  try {
    ctx = new AudioContextClass();
  } catch {
    return; // Graceful no-op if construction fails
  }

  const resolvedType = type === 'default' ? 'chime' : type;

  try {
    if (resolvedType === 'chime') {
      _playChime(ctx, gain);
    } else if (resolvedType === 'alarm') {
      _playAlarm(ctx, gain);
    }
  } catch {
    // Ignore synthesis errors
  }

  // Close context after sounds finish to free resources
  setTimeout(() => ctx.close().catch(() => {}), 1500);
}

/**
 * Bell-like chime: sine oscillator with exponential frequency and gain decay.
 */
function _playChime(ctx: AudioContext, gain: number): void {
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(gain, ctx.currentTime);
  masterGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
  masterGain.connect(ctx.destination);

  // Primary tone at 880 Hz
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(880, ctx.currentTime);
  osc1.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.4);
  osc1.connect(masterGain);
  osc1.start(ctx.currentTime);
  osc1.stop(ctx.currentTime + 1.0);

  // Harmonic at 1320 Hz (lower volume for richness)
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(1320, ctx.currentTime);
  const harmGain = ctx.createGain();
  harmGain.gain.setValueAtTime(gain * 0.3, ctx.currentTime);
  harmGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  osc2.connect(harmGain);
  harmGain.connect(ctx.destination);
  osc2.start(ctx.currentTime);
  osc2.stop(ctx.currentTime + 0.6);
}

/**
 * Urgent alarm: two alternating square-wave tones.
 */
function _playAlarm(ctx: AudioContext, gain: number): void {
  const beep = (startTime: number, frequency: number, duration: number) => {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = frequency;

    const beepGain = ctx.createGain();
    beepGain.gain.setValueAtTime(0, startTime);
    beepGain.gain.linearRampToValueAtTime(gain * 0.5, startTime + 0.01);
    beepGain.gain.setValueAtTime(gain * 0.5, startTime + duration - 0.01);
    beepGain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.connect(beepGain);
    beepGain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  };

  // Pattern: low–high–low–high
  beep(ctx.currentTime,        440, 0.12);
  beep(ctx.currentTime + 0.15, 880, 0.12);
  beep(ctx.currentTime + 0.30, 440, 0.12);
  beep(ctx.currentTime + 0.45, 880, 0.12);
}
