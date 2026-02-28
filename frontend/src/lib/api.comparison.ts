/**
 * TickerPulse AI v3.0 - Multi-Model Comparison API Client
 *
 * Standalone fetch-based client for /api/comparison/* endpoints.
 * Separate from api.ts so it can be imported independently and tree-shaken.
 */

import type { ComparisonRun, ComparisonRunSummary } from './types';

const API_BASE =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : '';

async function compFetch<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch';
    throw new Error(`Network error: ${msg}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error('Failed to parse response JSON');
  }

  if (!res.ok) {
    const errMsg = (body as { error?: string })?.error ?? res.statusText;
    throw new Error(`${res.status}: ${errMsg}`);
  }

  return body as T;
}

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export interface CreateComparisonRunPayload {
  prompt: string;
  provider_ids?: string[];
  ticker?: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function createComparisonRun(
  payload: CreateComparisonRunPayload,
): Promise<{ run_id: string; status: string }> {
  return compFetch<{ run_id: string; status: string }>(
    `${API_BASE}/api/comparison/run`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
}

export async function getComparisonRun(runId: string): Promise<ComparisonRun> {
  return compFetch<ComparisonRun>(
    `${API_BASE}/api/comparison/run/${runId}`,
    { method: 'GET' },
  );
}

export async function pollComparisonRun(
  runId: string,
  options?: { pollInterval?: number; maxAttempts?: number },
): Promise<ComparisonRun> {
  const pollInterval = options?.pollInterval ?? 2000;
  const maxAttempts = options?.maxAttempts ?? 30;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const run = await getComparisonRun(runId);
    if (run.status === 'complete' || run.status === 'failed') {
      return run;
    }
    if (attempt < maxAttempts - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error(
    `Polling timeout: max attempts (${maxAttempts}) exceeded for run ${runId}`,
  );
}

export async function listComparisonRuns(
  payload?: { limit?: number },
): Promise<{ runs: ComparisonRunSummary[] }> {
  const params = new URLSearchParams();
  if (payload?.limit != null) params.set('limit', String(payload.limit));
  const qs = params.toString();
  const url = qs
    ? `${API_BASE}/api/comparison/runs?${qs}`
    : `${API_BASE}/api/comparison/runs`;
  return compFetch<{ runs: ComparisonRunSummary[] }>(url, { method: 'GET' });
}
