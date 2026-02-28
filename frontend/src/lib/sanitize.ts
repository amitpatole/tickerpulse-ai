/**
 * TickerPulse AI v3.0 — Alert Text Sanitization Utilities
 *
 * Shared helpers for encoding and sanitizing alert text before it is
 * rendered in toasts, desktop notifications, or any other display surface.
 */

/**
 * HTML-encode the five characters that have special meaning in HTML contexts.
 * Use this before rendering untrusted text in any innerHTML context.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Sanitize alert text for safe display in toasts and native notifications.
 *
 * Steps applied in order:
 *  1. Guard against non-string input — return '' for null/undefined/non-string.
 *  2. Strip ASCII control characters (U+0000–U+001F) and DEL (U+007F).
 *     This removes newlines, carriage returns, and other chars that could
 *     corrupt SSE framing or Electron notification display.
 *  3. Truncate to 200 characters to prevent notification overflow.
 *  4. HTML-encode the result with {@link escapeHtml}.
 */
export function sanitizeAlertText(s: string): string {
  if (!s || typeof s !== 'string') return '';
  // Strip C0 control characters (0x00–0x1F) and DEL (0x7F)
  const stripped = s.replace(/[\x00-\x1F\x7F]/g, '');
  // Enforce length cap before HTML encoding to count actual characters
  const capped = stripped.slice(0, 200);
  return escapeHtml(capped);
}
