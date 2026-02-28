import { formatTimestamp, formatDate } from '../formatTime';
import type { TimezoneMode } from '../types';

describe('formatTime utility - Timezone Display Bug (VO-786)', () => {
  // ============= Test 1: Happy Path - Local Timezone =============
  it('should format UTC timestamp with local timezone and timezone abbreviation (SSR hydration safe)', () => {
    const utcIso = '2025-02-27T14:30:00Z';
    const result = formatTimestamp(utcIso, 'local');

    // Verify output contains time (HH:MM format) and timezone abbreviation
    // Format can be "14:30 CET" (24-hour) or "02:30 PM UTC" (12-hour) depending on locale
    expect(result).toMatch(/\d{1,2}:\d{2}\s(AM|PM|[A-Z]{3,4})/);
    // Ensure no undefined or NaN in output
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('NaN');
  });

  // ============= Test 2: Happy Path - Market (Local) Timezone =============
  it('should format UTC timestamp with market/local timezone mode and timezone abbreviation', () => {
    const utcIso = '2025-02-27T14:30:00Z';
    const result = formatTimestamp(utcIso, 'market');

    // Should contain valid time format and timezone abbreviation
    expect(result).toMatch(/\d{1,2}:\d{2}\s(AM|PM|[A-Z]{3,4})/);
    // Result should be valid (not empty, no undefined/NaN)
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('NaN');
  });

  // ============= Test 3: Error Case - Invalid Date String =============
  it('should return fallback "—" for invalid date strings without throwing', () => {
    const invalidIso = 'not-a-valid-date';
    expect(() => formatTimestamp(invalidIso, 'local')).not.toThrow();
    expect(formatTimestamp(invalidIso, 'local')).toBe('—');
  });

  // ============= Test 4: Error Case - Null and Undefined =============
  it('should return fallback "—" for null input without throwing', () => {
    expect(() => formatTimestamp(null, 'local')).not.toThrow();
    expect(formatTimestamp(null, 'local')).toBe('—');
  });

  it('should return fallback "—" for undefined input without throwing', () => {
    expect(() => formatTimestamp(undefined, 'local')).not.toThrow();
    expect(formatTimestamp(undefined, 'local')).toBe('—');
  });

  // ============= Test 5: Edge Case - Empty String =============
  it('should return fallback "—" for empty string', () => {
    expect(formatTimestamp('', 'local')).toBe('—');
  });

  // ============= Test 6: Edge Case - Locale Safety (No Arabic-Indic Numerals) =============
  it('should use ASCII numerals (0-9), not Arabic-Indic (٠-٩) or other script variants', () => {
    const utcIso = '2025-02-27T14:30:00Z';
    const result = formatTimestamp(utcIso, 'local');

    // Verify all digit characters are ASCII 0-9, not Arabic-Indic [\u0660-\u0669] or Persian [\u06F0-\u06F9]
    const digitMatches = result.match(/\d/g) || [];
    digitMatches.forEach((digit) => {
      expect(digit.charCodeAt(0)).toBeGreaterThanOrEqual(48); // ASCII '0'
      expect(digit.charCodeAt(0)).toBeLessThanOrEqual(57);   // ASCII '9'
    });
    // Verify no unexpected Unicode script numerals
    expect(result).not.toMatch(/[\u0660-\u0669]/); // Arabic-Indic
    expect(result).not.toMatch(/[\u06F0-\u06F9]/); // Persian
  });

  // ============= Test 7: formatDate Happy Path - Full Date+Time =============
  it('should format full date with time and timezone abbreviation using formatDate', () => {
    const utcIso = '2025-02-27T14:30:00Z';
    const result = formatDate(utcIso, 'local');

    // Should contain month abbreviation, day, year, time with timezone
    // Format examples: "Feb 27, 2025, 02:30 PM UTC" or "27 Feb 2025, 14:30 CET"
    expect(result).toMatch(/[A-Z][a-z]{2}\s\d{1,2},?\s\d{4}/); // Month, day, year
    expect(result).toMatch(/\d{1,2}:\d{2}/); // Time
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('NaN');
  });

  // ============= Test 8: formatDate Error Case - Invalid Input =============
  it('should return fallback "—" for invalid input in formatDate', () => {
    expect(formatDate('invalid', 'local')).toBe('—');
    expect(formatDate(null, 'local')).toBe('—');
    expect(formatDate(undefined, 'market')).toBe('—');
  });

  // ============= Test 9: Edge Case - Timezone Consistency Across Multiple Calls =============
  it('should return consistent results across multiple calls (no hydration mismatch)', () => {
    const utcIso = '2025-02-27T14:30:00Z';
    const result1 = formatTimestamp(utcIso, 'local');
    const result2 = formatTimestamp(utcIso, 'local');

    // Results should be identical (deterministic, no randomness or time-dependent behavior)
    expect(result1).toBe(result2);
  });

  // ============= Test 10: Edge Case - Midnight and Boundary Times =============
  it('should correctly format midnight (00:00) and edge hour values', () => {
    const midnightUtc = '2025-02-27T00:00:00Z';
    const result = formatTimestamp(midnightUtc, 'local');

    // Should handle hour 0 correctly (not skip it, not show 24)
    expect(result).toMatch(/\d{1,2}:\d{2}/);
    expect(result).not.toBe('—');
  });

  // ============= Test 11: Non-US locale — Europe/Berlin (VO-786 regression) =============
  it('shows CET timezone label for Europe/Berlin system locale environment', () => {
    const RealDTF = global.Intl.DateTimeFormat;

    // Override Intl.DateTimeFormat() (no-args call used by resolvedTimeZone())
    // to simulate a browser running in the Europe/Berlin timezone.
    const spy = jest.spyOn(global.Intl, 'DateTimeFormat').mockImplementation(
      function (...args: [string?, Intl.DateTimeFormatOptions?]) {
        if (args.length === 0) {
          // Resolver call — pretend the user's system TZ is Berlin
          return {
            resolvedOptions: () => ({ timeZone: 'Europe/Berlin' }),
          } as unknown as Intl.DateTimeFormat;
        }
        // Actual formatting call — use the real formatter with the injected timeZone
        return new RealDTF(...args);
      }
    );

    // January 15 = CET (UTC+1 winter time, not summer CEST)
    const result = formatTimestamp('2026-01-15T12:00:00Z', 'local');

    // The output must include the Central European Time abbreviation
    expect(result).toMatch(/CET/);
    // Must not be mistaken for US Eastern time
    expect(result).not.toMatch(/\bEST\b|\bEDT\b|\bET\b/);

    spy.mockRestore();
  });

  // ============= Test 12: Non-US locale — Europe/Berlin formatDate (VO-786 regression) =============
  it('formatDate includes CET timezone label for Europe/Berlin system locale', () => {
    const RealDTF = global.Intl.DateTimeFormat;

    const spy = jest.spyOn(global.Intl, 'DateTimeFormat').mockImplementation(
      function (...args: [string?, Intl.DateTimeFormatOptions?]) {
        if (args.length === 0) {
          return {
            resolvedOptions: () => ({ timeZone: 'Europe/Berlin' }),
          } as unknown as Intl.DateTimeFormat;
        }
        return new RealDTF(...args);
      }
    );

    const result = formatDate('2026-01-15T12:00:00Z', 'local');

    expect(result).toMatch(/CET/);
    expect(result).not.toMatch(/\bEST\b|\bEDT\b/);

    spy.mockRestore();
  });

  // ============= Test 13: formatDate uses ASCII numerals for non-US locales =============
  it('formatDate should use ASCII numerals regardless of system locale', () => {
    const result = formatDate('2025-02-27T14:30:00Z', 'local');

    expect(result).not.toMatch(/[\u0660-\u0669]/); // Arabic-Indic
    expect(result).not.toMatch(/[\u06F0-\u06F9]/); // Persian
    expect(result).not.toContain('undefined');
  });
});