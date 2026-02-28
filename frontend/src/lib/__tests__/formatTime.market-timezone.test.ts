/**
 * formatTime — Market Timezone Bug (VO-792)
 *
 * Tests for the critical timezone bug where resolvedTimeZone('market')
 * was incorrectly mapping to browser local timezone instead of ET.
 *
 * Defect B from VO-792:
 * resolvedTimeZone() maps 'market' to browser local TZ, not ET.
 * A user in Tokyo with tz='market' was seeing JST instead of ET.
 */

import { formatTimestamp, formatDate } from '../formatTime';
import type { TimezoneMode } from '../types';

describe('formatTime — Market Timezone Resolution (VO-792)', () => {
  // =========================================================================
  // Test 1: 'market' timezone resolves to ET (America/New_York), not browser
  // =========================================================================

  test('Happy path: formatTimestamp with market TZ includes ET abbreviation (EST or EDT)', () => {
    const winterDate = '2026-01-15T12:00:00Z'; // Winter (EST)
    const summerDate = '2026-07-15T12:00:00Z'; // Summer (EDT)

    const winterResult = formatTimestamp(winterDate, 'market');
    const summerResult = formatTimestamp(summerDate, 'market');

    // Should contain either EST (winter) or EDT (summer), not local TZ abbreviations
    const isWinterET = winterResult.includes('EST');
    const isSummerET = summerResult.includes('EDT');

    expect(isWinterET || winterResult.includes('ET')).toBe(true);
    expect(isSummerET || summerResult.includes('EDT')).toBe(true);

    // Verify output format: HH:MM TZ-LABEL (e.g., "09:30 EST")
    expect(winterResult).toMatch(/\d{2}:\d{2}\s(?:ES|ED)T/);
    expect(summerResult).toMatch(/\d{2}:\d{2}\s(?:ES|ED)T/);
  });

  // =========================================================================
  // Test 2: 'local' timezone resolves to browser timezone, not ET
  // =========================================================================

  test('Happy path: formatTimestamp with local TZ respects browser system timezone', () => {
    const isoDate = '2026-02-27T14:30:00Z';

    // Get the browser's actual timezone from Intl API
    const browserTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Format with 'local' — should include system timezone, not ET/EST/EDT
    const result = formatTimestamp(isoDate, 'local');

    // Should be valid time format with timezone label
    expect(result).toMatch(/\d{2}:\d{2}\s[A-Z]/);

    // Should NOT be ET variants (unless browser happens to be in ET)
    // This test is locale-aware: if running in a non-ET timezone,
    // the result must not be EST/EDT
    if (browserTZ !== 'America/New_York') {
      expect(result).not.toMatch(/\b(?:ES|ED)T\b/);
    }
  });

  // =========================================================================
  // Test 3: 'market' and 'local' produce different results for non-ET users
  // =========================================================================

  test('Edge case: market and local timezones differ for non-ET system locale', () => {
    // Simulate a non-ET system by mocking Intl.DateTimeFormat
    const RealDTF = global.Intl.DateTimeFormat;

    // Mock to return Asia/Tokyo as the system timezone
    const spy = jest.spyOn(global.Intl, 'DateTimeFormat').mockImplementation(
      function (...args: [string?, Intl.DateTimeFormatOptions?]) {
        if (args.length === 0) {
          // Resolver call — pretend the user's system TZ is Tokyo
          return {
            resolvedOptions: () => ({ timeZone: 'Asia/Tokyo' }),
          } as unknown as Intl.DateTimeFormat;
        }
        // Actual formatting call — use the real formatter with the injected timeZone
        return new RealDTF(...args);
      }
    );

    const isoDate = '2026-02-27T12:00:00Z'; // UTC noon

    const marketResult = formatTimestamp(isoDate, 'market'); // Should be ET: 07:00 EST
    const localResult = formatTimestamp(isoDate, 'local'); // Should be JST: 21:00

    // Market should show ET times (morning in NY, ~07:00 EST)
    // Local should show Tokyo times (evening in Tokyo, ~21:00 JST)
    // They MUST be different
    expect(marketResult).not.toEqual(localResult);

    // Market should contain ET-related timezone or be approximately 07:00
    // (exact format depends on DST, but should start with "07" or "08")
    expect(marketResult).toMatch(/^(07|08):/);

    // Local should contain Tokyo time (approximately 21:00)
    expect(localResult).toMatch(/^21:/);

    spy.mockRestore();
  });

  // =========================================================================
  // Test 4: formatDate respects market timezone (ET) vs local timezone
  // =========================================================================

  test('Happy path: formatDate with market TZ includes ET timezone abbreviation', () => {
    const winterDate = '2026-01-15T12:00:00Z';

    const result = formatDate(winterDate, 'market');

    // Should contain full date, time, AND EST timezone label
    expect(result).toMatch(/[A-Z][a-z]{2}\s\d{1,2},\s\d{4}/); // Month, day, year
    expect(result).toMatch(/\d{2}:\d{2}\s(EST|EDT|ET)/); // Time with ET abbreviation
  });

  // =========================================================================
  // Test 5: ASCII digits guaranteed even with market timezone in non-US locale
  // =========================================================================

  test('Edge case: market timezone output contains only ASCII digits (no Arabic-Indic)', () => {
    const isoDate = '2026-02-27T14:30:00Z';

    // Run the real function (no mocks) to ensure SAFE_LOCALE is used
    const result = formatTimestamp(isoDate, 'market');

    // Verify all digit characters are ASCII 0-9, not Arabic-Indic or Persian
    expect(result).not.toMatch(/[\u0660-\u0669]/); // Arabic-Indic digits
    expect(result).not.toMatch(/[\u06F0-\u06F9]/); // Persian digits

    // Should contain ASCII digits for the time
    expect(result).toMatch(/[0-9]{2}:[0-9]{2}/);
  });
});
