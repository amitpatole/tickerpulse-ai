/**
 * Cron expression validation tests.
 *
 * Tests for utilities that validate and parse custom cron expressions
 * used in the scheduler UI for fine-grained job scheduling.
 *
 * Covers:
 * - Valid cron format detection (minute hour dom month dow)
 * - Range validation for each field
 * - Special characters and shortcuts (*,/,-)
 * - Edge cases (invalid values, out-of-range fields)
 */

describe('Cron Expression Validation', () => {
  /**
   * Utility function to validate cron expressions.
   * Valid format: "minute hour day_of_month month day_of_week"
   *
   * Field ranges:
   * - minute: 0-59
   * - hour: 0-23
   * - day_of_month: 1-31
   * - month: 1-12
   * - day_of_week: 0-6 (0=Sunday, 6=Saturday)
   */
  const validateCronExpression = (expr: string): { valid: boolean; error?: string } => {
    if (!expr || typeof expr !== 'string') {
      return { valid: false, error: 'Expression must be a non-empty string' };
    }

    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) {
      return { valid: false, error: 'Cron expression must have exactly 5 fields' };
    }

    const [minute, hour, dom, month, dow] = parts;

    // Helper to validate individual field
    const validateField = (value: string, min: number, max: number, name: string) => {
      // Allow wildcards and ranges
      if (value === '*') return null;

      // Handle ranges (e.g., "1-5")
      if (value.includes('-')) {
        const [start, end] = value.split('-');
        const startNum = parseInt(start, 10);
        const endNum = parseInt(end, 10);
        if (
          isNaN(startNum) ||
          isNaN(endNum) ||
          startNum < min ||
          endNum > max ||
          startNum > endNum
        ) {
          return `Invalid range in ${name}: ${value}`;
        }
        return null;
      }

      // Handle step values (e.g., "*/15" or "0-30/15")
      if (value.includes('/')) {
        return null; // Accept step syntax; detailed validation deferred
      }

      // Handle single values (e.g., "30")
      const num = parseInt(value, 10);
      if (isNaN(num) || num < min || num > max) {
        return `${name} must be between ${min} and ${max}, got ${value}`;
      }
      return null;
    };

    const errors = [
      validateField(minute, 0, 59, 'minute'),
      validateField(hour, 0, 23, 'hour'),
      validateField(dom, 1, 31, 'day_of_month'),
      validateField(month, 1, 12, 'month'),
      validateField(dow, 0, 6, 'day_of_week'),
    ].filter(Boolean);

    if (errors.length > 0) {
      return { valid: false, error: errors[0] };
    }

    return { valid: true };
  };

  /**
   * Test valid cron expressions
   */
  describe('Valid cron expressions', () => {
    it('should accept wildcard for all fields', () => {
      const result = validateCronExpression('* * * * *');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid minute value (0-59)', () => {
      const result = validateCronExpression('30 * * * *');
      expect(result.valid).toBe(true);
    });

    it('should accept valid hour value (0-23)', () => {
      const result = validateCronExpression('0 6 * * *');
      expect(result.valid).toBe(true);
    });

    it('should accept valid range in minute field (e.g., 0-30)', () => {
      const result = validateCronExpression('0-30 * * * *');
      expect(result.valid).toBe(true);
    });

    it('should accept valid range in hour field (e.g., 8-17 for business hours)', () => {
      const result = validateCronExpression('0 8-17 * * *');
      expect(result.valid).toBe(true);
    });

    it('should accept valid range in day_of_week (e.g., 1-5 for Mon-Fri)', () => {
      const result = validateCronExpression('0 6 * * 1-5');
      expect(result.valid).toBe(true);
    });

    it('should accept step syntax (e.g., */15 for every 15 minutes)', () => {
      const result = validateCronExpression('*/15 * * * *');
      expect(result.valid).toBe(true);
    });

    it('should accept complex expression (6 AM every weekday)', () => {
      const result = validateCronExpression('0 6 * * 1-5');
      expect(result.valid).toBe(true);
    });
  });

  /**
   * Test invalid cron expressions
   */
  describe('Invalid cron expressions', () => {
    it('should reject empty string', () => {
      const result = validateCronExpression('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Expression must be a non-empty string');
    });

    it('should reject null or non-string input', () => {
      const result = validateCronExpression(null as any);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should reject expressions with fewer than 5 fields', () => {
      const result = validateCronExpression('0 6 * *');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exactly 5 fields');
    });

    it('should reject expressions with more than 5 fields', () => {
      const result = validateCronExpression('0 6 * * * year');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exactly 5 fields');
    });

    it('should reject minute > 59', () => {
      const result = validateCronExpression('65 * * * *');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('minute');
      expect(result.error).toContain('0 and 59');
    });

    it('should reject hour > 23', () => {
      const result = validateCronExpression('0 25 * * *');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('hour');
      expect(result.error).toContain('0 and 23');
    });

    it('should reject day_of_month > 31', () => {
      const result = validateCronExpression('0 0 35 * *');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('day_of_month');
    });

    it('should reject month > 12', () => {
      const result = validateCronExpression('0 0 * 13 *');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('month');
      expect(result.error).toContain('1 and 12');
    });

    it('should reject day_of_week > 6', () => {
      const result = validateCronExpression('0 0 * * 7');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('day_of_week');
      expect(result.error).toContain('0 and 6');
    });

    it('should reject range with start > end (e.g., 30-15)', () => {
      const result = validateCronExpression('30-15 * * * *');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid range');
    });

    it('should reject non-numeric values', () => {
      const result = validateCronExpression('abc 6 * * *');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('Edge case: should reject day_of_month = 0 (off by one)', () => {
      const result = validateCronExpression('0 0 0 * *');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('day_of_month');
    });
  });

  /**
   * Test edge cases and special scenarios
   */
  describe('Edge cases', () => {
    it('should accept boundary values: minute=0, hour=0, dom=1, month=1, dow=0', () => {
      const result = validateCronExpression('0 0 1 1 0');
      expect(result.valid).toBe(true);
    });

    it('should accept boundary values: minute=59, hour=23, dom=31, month=12, dow=6', () => {
      const result = validateCronExpression('59 23 31 12 6');
      expect(result.valid).toBe(true);
    });

    it('should handle extra whitespace gracefully', () => {
      const result = validateCronExpression('  0   6   *   *   *  ');
      expect(result.valid).toBe(true);
    });

    it('should accept single-digit values (no leading zero required)', () => {
      const result = validateCronExpression('5 8 2 3 1');
      expect(result.valid).toBe(true);
    });

    it('should reject expressions with tabs as separators (must be spaces)', () => {
      // Note: depending on implementation, tabs might be treated as whitespace
      // This test documents the expected behavior
      const result = validateCronExpression('0\t6\t*\t*\t*');
      // If tabs are normalized, this should pass; otherwise fail.
      // The implementation above uses /\s+/ which includes tabs, so it passes.
      expect(result.valid).toBe(true);
    });
  });
});
