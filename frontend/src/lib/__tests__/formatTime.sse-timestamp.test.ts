/**
 * formatTime — SSE Timestamp Rendering (VO-792)
 *
 * Validates that server-supplied SSE event timestamps are rendered correctly
 * through formatTimestamp / formatLocalTime with the ASCII-digit guarantee
 * introduced in VO-786 (SAFE_LOCALE = 'en-US').
 *
 * The companion fix in useSSE.ts (VO-792) stops injecting a client-generated
 * `new Date().toISOString()` as the named-event timestamp.  These tests cover
 * the rendering layer that consumes whatever timestamp the hook now surfaces.
 */

import { formatTimestamp, formatLocalTime } from '../formatTime';
import type { TimezoneMode } from '../types';

describe('formatTime — SSE Timestamp Rendering (VO-792)', () => {

  // =========================================================================
  // Test 1: Server-supplied ISO timestamp produces ASCII digits only
  // =========================================================================

  test('Server-supplied ISO timestamp renders with ASCII digits only', () => {
    const serverTs = '2026-02-27T14:32:00.000Z';
    const result = formatTimestamp(serverTs);

    // Not a fallback sentinel
    expect(result).not.toBe('—');

    // ASCII digits present
    expect(result).toMatch(/[0-9]{2}:[0-9]{2}/);

    // No Arabic-Indic digits (U+0660–U+0669)
    expect(result).not.toMatch(/[\u0660-\u0669]/);

    // No Persian digits (U+06F0–U+06F9)
    expect(result).not.toMatch(/[\u06F0-\u06F9]/);
  });

  // =========================================================================
  // Test 2: ms-precision server timestamp (common in SSE payloads) renders OK
  // =========================================================================

  test('Server timestamp with millisecond precision renders correctly', () => {
    const serverTs = '2026-02-27T14:32:00.123Z';
    const result = formatTimestamp(serverTs);

    expect(result).not.toBe('—');
    expect(result).toMatch(/\d{2}:\d{2}/);
    expect(result).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/);
  });

  // =========================================================================
  // Test 3: Fallback client-generated ISO (when server omits timestamp field)
  //         must also render without non-ASCII digits
  // =========================================================================

  test('Fallback client-generated ISO timestamp renders with ASCII digits', () => {
    // Simulate the hook's fallback: new Date().toISOString()
    const clientTs = new Date('2026-02-27T09:30:00.000Z').toISOString();
    const result = formatTimestamp(clientTs);

    expect(result).not.toBe('—');
    expect(result).toMatch(/\d{2}:\d{2}/);
    expect(result).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/);
  });

  // =========================================================================
  // Test 4: Empty / null / undefined server timestamp falls back to em-dash
  // =========================================================================

  test('Empty or absent server timestamp returns em-dash sentinel', () => {
    expect(formatTimestamp('')).toBe('—');
    expect(formatTimestamp(null)).toBe('—');
    expect(formatTimestamp(undefined)).toBe('—');
  });

  // =========================================================================
  // Test 5: Malformed timestamp string returns em-dash, does not throw
  // =========================================================================

  test('Malformed timestamp string returns em-dash without throwing', () => {
    expect(() => formatTimestamp('not-a-date')).not.toThrow();
    expect(formatTimestamp('not-a-date')).toBe('—');
  });

  // =========================================================================
  // Test 6: formatLocalTime renders server timestamp as HH:MM:SS (no TZ label)
  //         Used for compact event-log display in SSE components
  // =========================================================================

  test('formatLocalTime renders server timestamp as short time string', () => {
    const serverTs = '2026-02-27T09:30:45Z';
    const result = formatLocalTime(serverTs);

    expect(result).not.toBe('—');
    // HH:MM:SS or HH:MM format
    expect(result).toMatch(/\d{2}:\d{2}/);
    // ASCII digits only
    expect(result).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/);
  });

  // =========================================================================
  // Test 7: market timezone applied to server timestamp shows ET abbreviation
  //         Non-US users viewing SSE events in 'market' mode must see ET
  // =========================================================================

  test('Server timestamp with market timezone shows ET abbreviation', () => {
    // 2026-01-15 15:00 UTC = 10:00 EST (winter, UTC-5)
    const serverTs = '2026-01-15T15:00:00Z';
    const tz: TimezoneMode = 'market';
    const result = formatTimestamp(serverTs, tz);

    // Should contain ET abbreviation (EST in winter, EDT in summer)
    expect(result).toMatch(/(?:ES|ED)T/);

    // Should start with 10: (10 AM Eastern for 3 PM UTC in January)
    expect(result).toMatch(/^10:/);
  });

  // =========================================================================
  // Test 8: Two sequential server timestamps from the same second are stable
  //         (no drift introduced by client-side new Date() calls — VO-792)
  // =========================================================================

  test('Identical server timestamps render to identical strings (no clock drift)', () => {
    const serverTs = '2026-02-27T14:32:00.000Z';

    const result1 = formatTimestamp(serverTs);
    const result2 = formatTimestamp(serverTs);

    expect(result1).toBe(result2);
  });
});
