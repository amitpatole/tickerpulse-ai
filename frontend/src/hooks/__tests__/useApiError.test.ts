/**
 * Tests for useApiError hook and getErrorCopy utility.
 *
 * Covers:
 *   - All 14 canonical error codes map to non-empty user copy
 *   - Unknown error codes return a non-empty fallback string
 *   - isRetryable is true for 429, 503, 5xx
 *   - isUserError is true for 400, 404; false for 401, 403, 5xx
 *   - getErrorCopy returns same string as hook
 *   - null/undefined error returns null
 */

import { useApiError, getErrorCopy } from '../useApiError';
import { ApiError } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeError(error_code: string, status: number): ApiError {
  return new ApiError('Test error', status, error_code);
}

// ---------------------------------------------------------------------------
// All 14 canonical error codes
// ---------------------------------------------------------------------------

const CANONICAL_CODES: [string, number][] = [
  ['TICKER_NOT_FOUND',           404],
  ['ALERT_NOT_FOUND',            404],
  ['NOT_FOUND',                  404],
  ['INVALID_INPUT',              400],
  ['BAD_REQUEST',                400],
  ['MISSING_FIELD',              400],
  ['INVALID_TYPE',               400],
  ['VALIDATION_ERROR',           400],
  ['PAYLOAD_TOO_LARGE',          413],
  ['CONFLICT',                   409],
  ['UNAUTHORIZED',               401],
  ['FORBIDDEN',                  403],
  ['RATE_LIMIT_EXCEEDED',        429],
  ['DATABASE_ERROR',             500],
  ['INTERNAL_ERROR',             500],
  ['DATA_PROVIDER_UNAVAILABLE',  503],
  ['SERVICE_UNAVAILABLE',        503],
];

describe('useApiError - canonical error codes', () => {
  it.each(CANONICAL_CODES)(
    '%s maps to a non-empty user-facing string',
    (error_code, status) => {
      const error = makeError(error_code, status);
      const info = useApiError(error);
      expect(info).not.toBeNull();
      expect(info!.message).toBeTruthy();
      expect(info!.message.length).toBeGreaterThan(10);
    },
  );
});

// ---------------------------------------------------------------------------
// Unknown error code fallback
// ---------------------------------------------------------------------------

describe('useApiError - unknown error code', () => {
  it('returns non-empty fallback for unknown error_code', () => {
    const error = makeError('TOTALLY_UNKNOWN_CODE', 500);
    const info = useApiError(error);
    expect(info).not.toBeNull();
    expect(info!.message).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// isRetryable
// ---------------------------------------------------------------------------

describe('useApiError - isRetryable', () => {
  it('is true for 429 RATE_LIMIT_EXCEEDED', () => {
    const info = useApiError(makeError('RATE_LIMIT_EXCEEDED', 429));
    expect(info!.isRetryable).toBe(true);
  });

  it('is true for 503 SERVICE_UNAVAILABLE', () => {
    const info = useApiError(makeError('SERVICE_UNAVAILABLE', 503));
    expect(info!.isRetryable).toBe(true);
  });

  it('is true for 500 INTERNAL_ERROR', () => {
    const info = useApiError(makeError('INTERNAL_ERROR', 500));
    expect(info!.isRetryable).toBe(true);
  });

  it('is false for 400 INVALID_INPUT', () => {
    const info = useApiError(makeError('INVALID_INPUT', 400));
    expect(info!.isRetryable).toBe(false);
  });

  it('is false for 404 NOT_FOUND', () => {
    const info = useApiError(makeError('NOT_FOUND', 404));
    expect(info!.isRetryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isUserError
// ---------------------------------------------------------------------------

describe('useApiError - isUserError', () => {
  it('is true for 400 BAD_REQUEST', () => {
    const info = useApiError(makeError('BAD_REQUEST', 400));
    expect(info!.isUserError).toBe(true);
  });

  it('is true for 404 NOT_FOUND', () => {
    const info = useApiError(makeError('NOT_FOUND', 404));
    expect(info!.isUserError).toBe(true);
  });

  it('is false for 401 UNAUTHORIZED (not a user mistake)', () => {
    const info = useApiError(makeError('UNAUTHORIZED', 401));
    expect(info!.isUserError).toBe(false);
  });

  it('is false for 403 FORBIDDEN', () => {
    const info = useApiError(makeError('FORBIDDEN', 403));
    expect(info!.isUserError).toBe(false);
  });

  it('is false for 500 INTERNAL_ERROR', () => {
    const info = useApiError(makeError('INTERNAL_ERROR', 500));
    expect(info!.isUserError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// null / undefined input
// ---------------------------------------------------------------------------

describe('useApiError - null/undefined', () => {
  it('returns null for null input', () => {
    expect(useApiError(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(useApiError(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getErrorCopy
// ---------------------------------------------------------------------------

describe('getErrorCopy', () => {
  it('returns the same message as useApiError for a known code', () => {
    const code = 'TICKER_NOT_FOUND';
    const hookResult = useApiError(makeError(code, 404));
    expect(getErrorCopy(code)).toBe(hookResult!.message);
  });

  it('returns non-empty fallback for unknown code', () => {
    expect(getErrorCopy('BOGUS_CODE')).toBeTruthy();
  });
});