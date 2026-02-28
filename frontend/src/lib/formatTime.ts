import type { TimezoneMode } from './types';

// en-US guarantees ASCII (0-9) numerals regardless of the OS locale, avoiding
// Arabic-Indic (٠-٩) or Persian (۰-۹) digit variants produced by ar-SA / fa-IR.
const SAFE_LOCALE = 'en-US';

const ET_TIMEZONE = 'America/New_York';

function resolvedTimeZone(tz: TimezoneMode): string {
  // 'market' mode always renders in US Eastern Time (America/New_York)
  // so that non-US users see market hours in ET, not their local timezone.
  return tz === 'market'
    ? ET_TIMEZONE
    : Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Format an ISO timestamp as a short time string with explicit timezone label.
 * Returns "14:32 UTC", "09:32 EST", etc.  Returns "—" on null/invalid input.
 *
 * Uses en-US locale to guarantee ASCII digit output (VO-786).
 * Callers that render this inside JSX should add suppressHydrationWarning to
 * the enclosing element because SSR (UTC) and browser (local TZ) may differ.
 *
 * tz defaults to 'local' so callers that don't need market-timezone mode can
 * omit the second argument (VO-792).
 */
export function formatTimestamp(iso: string | null | undefined, tz: TimezoneMode = 'local'): string {
  if (iso == null || iso === '') return '—';
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(SAFE_LOCALE, {
      timeZone: resolvedTimeZone(tz),
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return '—';
  }
}

/**
 * Format an ISO timestamp as a long date+time string with explicit timezone label.
 * Returns "Feb 22, 2026, 14:32 UTC", etc.  Returns "—" on null/invalid input.
 *
 * Uses en-US locale to guarantee ASCII digit output (VO-786).
 */
export function formatDate(iso: string | null | undefined, tz: TimezoneMode): string {
  if (iso == null || iso === '') return '—';
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(SAFE_LOCALE, {
      timeZone: resolvedTimeZone(tz),
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return '—';
  }
}

// ---- Component helpers (no TimezoneMode param) -------------------------------

/**
 * Format an ISO-8601 string or Date object as a local HH:MM:SS time string.
 * Returns '—' for falsy or unparsable input.
 *
 * Add suppressHydrationWarning to the rendering element; SSR uses the server
 * timezone while the browser uses the user's local timezone.
 */
export function formatLocalTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const date = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(SAFE_LOCALE, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return '—';
  }
}

/**
 * Format an ISO-8601 string or Date object as a short date string (M/D/YYYY by default).
 * Pass custom opts to override the default format.
 * Returns '—' for falsy or unparsable input.
 */
export function formatLocalDate(
  iso: string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (!iso) return '—';
  const date = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(date.getTime())) return '—';
  const options: Intl.DateTimeFormatOptions = opts ?? {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  };
  try {
    return new Intl.DateTimeFormat(SAFE_LOCALE, options).format(date);
  } catch {
    return '—';
  }
}

/**
 * Convert a timestamp (ISO-8601 string or Date) to a human-readable relative
 * time string such as "Just now", "5 minutes ago", "2 hours ago", "3 days ago".
 *
 * The optional second argument sets the reference point for comparison;
 * defaults to Date.now(). Useful for deterministic testing.
 *
 * Returns '' for falsy or unparsable input.
 */
export function timeAgo(
  dateStr: Date | string | null | undefined,
  now?: Date | number,
): string {
  if (!dateStr) return '';
  const date = dateStr instanceof Date ? dateStr : new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const reference = now instanceof Date ? now.getTime() : (now ?? Date.now());
  const diffMins = Math.floor((reference - date.getTime()) / 60_000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}