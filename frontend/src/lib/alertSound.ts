// ============================================================
// TickerPulse AI v3.0 — alertSound
// Standalone Web Audio API module for alert tone playback.
// Extracted from useAlerts so it can be reused by useSSEAlerts
// and any other consumer without importing the full hook.
// ============================================================

type WebKitWindow = Window & { webkitAudioContext?: typeof AudioContext };

/**
 * Play a short alert tone using the Web Audio API.
 *
 * @param soundType - 'chime' | 'alarm' | 'default' | 'silent'
 * @param volume    - gain 0–1 (clamped to [0, 1] internally)
 *
 * Fails silently if audio is unavailable or blocked by the browser.
 */
export function playAlertSound(soundType: string, volume = 0.7): void {
  if (soundType === 'silent') return;

  try {
    const AudioCtx =
      window.AudioContext || (window as WebKitWindow).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = Math.max(0, Math.min(1, volume));

    if (soundType === 'alarm') {
      osc.frequency.value = 880;
      osc.type = 'sawtooth';
    } else {
      // 'chime' or 'default'
      osc.frequency.value = 523;
      osc.type = 'sine';
    }

    const duration = soundType === 'alarm' ? 0.6 : 0.35;
    osc.start();
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => {
      ctx.close();
    };
  } catch {
    // Audio not available; fail silently.
  }
}
