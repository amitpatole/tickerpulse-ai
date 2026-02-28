/**
 * TickerPulse AI v3.0 - useApiError hook
 *
 * Maps an ApiError's error_code to a user-facing message string.
 * Keeps raw API messages out of the UI.
 */

import type { ApiError } from '@/lib/types';

/** Human-readable copy for each machine error code. */
const ERROR_COPY: Record<string, string> = {
  TICKER_NOT_FOUND:
    "We couldn't find that ticker. Check the symbol and try again.",
  ALERT_NOT_FOUND:
    'That alert no longer exists. It may have been deleted.',
  NOT_FOUND:
    "The resource you requested couldn't be found.",
  INVALID_INPUT:
    'Some of the information you entered is invalid. Please review and try again.',
  BAD_REQUEST:
    'Your request was malformed. Please try again.',
  MISSING_FIELD:
    'A required field is missing. Please fill in all required fields.',
  INVALID_TYPE:
    'One or more values are the wrong type. Please check your input.',
  VALIDATION_ERROR:
    'Validation failed. Please review your input and try again.',
  PAYLOAD_TOO_LARGE:
    'The data you sent is too large. Please reduce the size and try again.',
  CONFLICT:
    'A conflict occurred — this item may already exist.',
  DUPLICATE_ENTRY:
    'A duplicate entry was detected. This item already exists.',
  UNAUTHORIZED:
    'You need to be logged in to do that.',
  FORBIDDEN:
    "You don't have permission to perform this action.",
  RATE_LIMIT_EXCEEDED:
    "You've made too many requests. Please wait a moment and try again.",
  DATABASE_ERROR:
    'A database error occurred. Please try again in a few moments.',
  INTERNAL_ERROR:
    'Something went wrong on our end. Please try again shortly.',
  DATA_PROVIDER_UNAVAILABLE:
    'The data provider is currently unavailable. Prices and analysis may be delayed.',
  SERVICE_UNAVAILABLE:
    'The service is temporarily unavailable. Please try again later.',
  PROVIDER_ERROR:
    'An external data provider returned an error. Please try again.',
};

const FALLBACK_COPY = 'An unexpected error occurred. Please try again.';

export interface ApiErrorInfo {
  /** User-facing message derived from error_code. */
  message: string;
  /** Raw error_code from the server. */
  error_code: string;
  /** HTTP status code. */
  status: number;
  /** Whether this is a transient error that the user can retry. */
  isRetryable: boolean;
  /** Whether this is a client-side mistake (4xx, not 401/403). */
  isUserError: boolean;
}

/**
 * Given an ApiError, return structured user-facing information.
 *
 * @example
 * const info = useApiError(error);
 * if (info) toast.error(info.message);
 */
export function useApiError(error: ApiError | null | undefined): ApiErrorInfo | null {
  if (!error) return null;

  const message = ERROR_COPY[error.error_code] ?? FALLBACK_COPY;
  const isRetryable =
    error.status === 429 || error.status === 503 || error.status >= 500;
  const isUserError =
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 401 &&
    error.status !== 403;

  return {
    message,
    error_code: error.error_code,
    status: error.status,
    isRetryable,
    isUserError,
  };
}

/**
 * Return the user-facing copy string for a given error_code.
 * Useful when you only have the code string, not a full ApiError.
 */
export function getErrorCopy(error_code: string): string {
  return ERROR_COPY[error_code] ?? FALLBACK_COPY;
}