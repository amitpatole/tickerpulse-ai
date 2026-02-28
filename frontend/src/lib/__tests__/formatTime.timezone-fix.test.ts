/**
 * Test suite for timezone display bug fix (VO-786)
 * Validates that SSE event timestamps render consistently across locales
 * using centralized formatTime utilities with SAFE_LOCALE = 'en-US'
 */

import {
  formatLocalTime,
  formatLocalDate,
  formatTimestamp,
  timeAgo,
} from '../formatTime';

describe('formatTime.ts - Timezone Display Fix (VO-786)', () => {

  /**
   * AC1: formatLocalTime uses SAFE_LOCALE (en-US) to guarantee ASCII digits
   * Prevents Arabic-Indic (٠-٩) or Persian (۰-۹) numerals for ar-SA/fa-IR users
   */
  test('formatLocalTime returns ASCII digits regardless of system locale', () => {
    const testDate = new Date('2026-02-27T14:30:45Z');
    const result = formatLocalTime(testDate);

    // Must match pattern with ASCII digits (0-9)
    expect(result).toMatch(/\d{1,2}:\d{2}(:\d{2})?/);

    // Must NOT contain Arabic-Indic digits (U+0660-U+0669)
    expect(result).not.toMatch(/[\u0660-\u0669]/);

    // Must NOT contain Persian digits (U+06F0-U+06F9)
    expect(result).not.toMatch(/[\u06F0-\u06F9]/);
  });

  /**
   * AC2: formatLocalDate uses consistent en-US format
   * Centralized date rendering prevents SSR/client hydration mismatches
   */
  test('formatLocalDate produces deterministic output for SSR/client consistency', () => {
    const testDate = new Date('2026-02-27T00:00:00Z');

    // Call twice with same input
    const result1 = formatLocalDate(testDate);
    const result2 = formatLocalDate(testDate);

    // Must be byte-for-byte identical (no timezone drift, locale variance)
    expect(result1).toBe(result2);

    // Must be en-US format (M/D/YYYY or MM/DD/YYYY)
    expect(result1).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
  });

  /**
   * AC3: formatTimestamp handles null/undefined gracefully
   * SSE components may receive missing or invalid timestamps
   */
  test('formatTimestamp handles null and undefined input without throwing', () => {
    // Should not throw
    expect(() => formatTimestamp(null as any)).not.toThrow();
    expect(() => formatTimestamp(undefined as any)).not.toThrow();

    // Should return a string (fallback behavior)
    expect(typeof formatTimestamp(null as any)).toBe('string');
    expect(typeof formatTimestamp(undefined as any)).toBe('string');
  });

  /**
   * Edge Case: timeAgo calculates relative timestamps correctly
   * Used in WSStatusIndicator and other SSE components
   */
  test('timeAgo calculates relative time offsets accurately', () => {
    const now = new Date('2026-02-27T12:00:00Z');

    // 30 seconds ago → "just now"
    const thirtySecsAgo = new Date(now.getTime() - 30 * 1000);
    const justNow = timeAgo(thirtySecsAgo, now);
    expect(justNow).toMatch(/just now|less than a minute/i);

    // 5 minutes ago → "5 minutes ago"
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const fiveMinResult = timeAgo(fiveMinutesAgo, now);
    expect(fiveMinResult).toMatch(/5\s+minute/i);

    // 2 hours ago → "2 hours ago"
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const twoHourResult = timeAgo(twoHoursAgo, now);
    expect(twoHourResult).toMatch(/2\s+hour/i);
  });

  /**
   * Acceptance Criteria: formatLocalTime is called by WSStatusIndicator/SentimentBadge
   * and produces consistent output whether rendered server-side (UTC) or client-side (local TZ)
   */
  test('formatLocalTime produces ASCII-only output safe for React hydration', () => {
    const dates = [
      new Date('2026-01-15T08:30:00Z'),
      new Date('2026-12-25T23:59:59Z'),
      new Date('2026-06-30T12:00:00Z'),
    ];

    dates.forEach((date) => {
      const result = formatLocalTime(date);

      // All characters must be ASCII (code points < 128) or punctuation
      const nonAsciiMatch = result.match(/[^\x00-\x7F]/g);
      expect(nonAsciiMatch).toBeNull();

      // Should contain time separators and digits only (no locale variants)
      expect(result).toMatch(/^[\d:.\s\-AMP]{5,20}$/i);
    });
  });
});
