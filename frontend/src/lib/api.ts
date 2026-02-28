/**
 * TickerPulse AI v3.0 - API Client
 * Typed fetch wrappers for all backend REST endpoints.
 * apiFetch throws ApiError on failure; 429/503 are retried up to 2 times.
 */

import { ApiError } from './types';
import type {
  AlertSoundSettings,
  AlertSoundType,
  PriceAlert,
  AlertConditionType,
  RefreshIntervalConfig,
  MetricsSummary,
  AgentMetrics,
  JobMetrics,
  TimeseriesDataPoint,
  SystemMetricsResponse,
  ScheduledJob,
  AgentSchedule,
  KnownAgent,
  AgentRun,
  Candle,
  StockDetail,
  CompareResponse,
  EarningsWidgetResponse,
  ActivityFeedResponse,
  ActivityFilterType,
  ScheduleTrigger,
  NextRunsResponse,
  ComparisonProviderRequest,
  ComparisonTemplate,
  ModelComparisonResponse,
  ModelComparisonHistoryResponse,
  ModelComparisonRun,
  BulkPricesResponse,
  HealthResponse,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

const _RETRYABLE_STATUSES = new Set([429, 503]);
const _MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// Global error reporter — wired by ApiErrorProvider on mount so apiFetch can
// surface non-retryable (4xx) errors to the persistent error banner without
// requiring React context access in this module.
// ---------------------------------------------------------------------------

type ErrorReporter = (err: ApiError) => void;
let _errorReporter: ErrorReporter | null = null;

export function setGlobalErrorReporter(fn: ErrorReporter | null): void {
  _errorReporter = fn;
}

async function apiFetch<T>(path: string, init?: RequestInit, _attempt = 0): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message: string = body?.error ?? `HTTP ${res.status}`;
    const error_code: string = body?.error_code ?? (res.status >= 500 ? 'INTERNAL_ERROR' : 'API_ERROR');
    const request_id: string | undefined = body?.request_id;

    if (_RETRYABLE_STATUSES.has(res.status) && _attempt < _MAX_RETRIES) {
      const retryAfterHeader = res.headers.get('Retry-After');
      const retryAfterBody: number | undefined = body?.retry_after;
      const delaySec = retryAfterHeader
        ? parseInt(retryAfterHeader, 10)
        : (retryAfterBody ?? 1);
      const delayMs = Math.min(delaySec * 1000, 30_000);
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      return apiFetch<T>(path, init, _attempt + 1);
    }

    const retryAfterHeader = res.headers.get('Retry-After');
    const retry_after = retryAfterHeader ? parseInt(retryAfterHeader, 10) : body?.retry_after;

    const err = new ApiError(message, res.status, error_code, { request_id, retry_after });

    // Surface non-retryable client errors (4xx, excluding 429/503) to the
    // persistent error banner so users see actionable feedback.
    const isClientError = res.status >= 400 && res.status < 500 && !_RETRYABLE_STATUSES.has(res.status);
    if (isClientError && _errorReporter) {
      _errorReporter(err);
    }

    throw err;
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Alert sound settings
// ---------------------------------------------------------------------------

export async function getAlertSoundSettings(): Promise<AlertSoundSettings> {
  return apiFetch<AlertSoundSettings>('/api/alerts/sound-settings');
}

export async function patchAlertSoundSettings(
  patch: Partial<AlertSoundSettings>,
): Promise<AlertSoundSettings> {
  return apiFetch<AlertSoundSettings>('/api/alerts/sound-settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export async function patchAlertSound(
  alertId: number,
  soundType: AlertSoundType,
): Promise<{ id: number; sound_type: AlertSoundType }> {
  return apiFetch<{ id: number; sound_type: AlertSoundType }>(
    `/api/alerts/${alertId}/sound`,
    {
      method: 'PUT',
      body: JSON.stringify({ sound_type: soundType }),
    },
  );
}

// ---------------------------------------------------------------------------
// Price alerts CRUD
// ---------------------------------------------------------------------------

export async function getAlerts(): Promise<PriceAlert[]> {
  return apiFetch<PriceAlert[]>('/api/alerts');
}

export async function createAlert(params: {
  ticker: string;
  condition_type: AlertConditionType;
  threshold: number;
  sound_type?: AlertSoundType;
}): Promise<PriceAlert> {
  return apiFetch<PriceAlert>('/api/alerts', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function deleteAlert(alertId: number): Promise<{ success: boolean; id: number }> {
  return apiFetch<{ success: boolean; id: number }>(`/api/alerts/${alertId}`, {
    method: 'DELETE',
  });
}

export async function toggleAlert(alertId: number): Promise<PriceAlert> {
  return apiFetch<PriceAlert>(`/api/alerts/${alertId}/toggle`, {
    method: 'PUT',
  });
}

// ---------------------------------------------------------------------------
// Refresh interval settings
// ---------------------------------------------------------------------------

export async function getRefreshInterval(): Promise<RefreshIntervalConfig> {
  return apiFetch<RefreshIntervalConfig>('/api/settings/refresh-interval');
}

export async function setRefreshInterval(interval: number): Promise<{ success: boolean; interval: number }> {
  return apiFetch<{ success: boolean; interval: number }>('/api/settings/refresh-interval', {
    method: 'PUT',
    body: JSON.stringify({ interval }),
  });
}

// ---------------------------------------------------------------------------
// Performance metrics
// ---------------------------------------------------------------------------

export async function getMetricsSummary(days = 30): Promise<MetricsSummary> {
  return apiFetch<MetricsSummary>(`/api/metrics/summary?days=${days}`);
}

export async function getAgentMetrics(days = 30): Promise<{ period_days: number; agents: AgentMetrics[] }> {
  return apiFetch<{ period_days: number; agents: AgentMetrics[] }>(`/api/metrics/agents?days=${days}`);
}

export async function getMetricsTimeseries(
  days = 30,
  metric = 'cost',
): Promise<{ metric: string; period_days: number; data: TimeseriesDataPoint[] }> {
  return apiFetch<{ metric: string; period_days: number; data: TimeseriesDataPoint[] }>(
    `/api/metrics/timeseries?days=${days}&metric=${metric}`,
  );
}

export async function getJobMetrics(days = 30): Promise<{ period_days: number; jobs: JobMetrics[] }> {
  return apiFetch<{ period_days: number; jobs: JobMetrics[] }>(`/api/metrics/jobs?days=${days}`);
}

export async function getSystemMetrics(days = 7): Promise<SystemMetricsResponse> {
  return apiFetch<SystemMetricsResponse>(`/api/metrics/system?days=${days}`);
}

// ---------------------------------------------------------------------------
// App state persistence
// ---------------------------------------------------------------------------

export async function getState(): Promise<Record<string, Record<string, unknown>>> {
  return apiFetch<Record<string, Record<string, unknown>>>('/api/app-state');
}

export async function patchState(
  updates: Record<string, Record<string, unknown> | null>,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/api/app-state', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

// ---------------------------------------------------------------------------
// Stock detail & candles
// ---------------------------------------------------------------------------

export async function getStockDetail(ticker: string, timeframe = '1M'): Promise<StockDetail> {
  return apiFetch<StockDetail>(
    `/api/stocks/${encodeURIComponent(ticker)}/detail?timeframe=${timeframe}`,
  );
}

export async function getStockCandles(ticker: string, timeframe = '1M'): Promise<Candle[]> {
  return apiFetch<Candle[]>(
    `/api/stocks/${encodeURIComponent(ticker)}/candles?timeframe=${timeframe}`,
  );
}

export async function getCompareData(
  symbols: string[],
  timeframe: string,
): Promise<CompareResponse> {
  return apiFetch<CompareResponse>(
    `/api/stocks/compare?symbols=${symbols.map(encodeURIComponent).join(',')}&timeframe=${timeframe}`,
  );
}

// ---------------------------------------------------------------------------
// Earnings calendar widget
// ---------------------------------------------------------------------------

export async function getEarningsWidget(days = 14): Promise<EarningsWidgetResponse> {
  return apiFetch<EarningsWidgetResponse>(`/api/earnings/widget?days=${days}`);
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

export async function getActivityFeed(params: {
  days?: number;
  type?: ActivityFilterType;
  limit?: number;
  offset?: number;
} = {}): Promise<ActivityFeedResponse> {
  const qs = new URLSearchParams();
  if (params.days !== undefined) qs.set('days', String(params.days));
  if (params.type !== undefined) qs.set('type', params.type);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.offset !== undefined) qs.set('offset', String(params.offset));
  const query = qs.toString();
  return apiFetch<ActivityFeedResponse>(`/api/activity/feed${query ? `?${query}` : ''}`);
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export async function getSchedulerJobs(): Promise<ScheduledJob[]> {
  const data = await apiFetch<{ jobs: ScheduledJob[]; total: number }>('/api/scheduler/jobs');
  return data.jobs;
}

export async function triggerJob(jobId: string): Promise<{ success: boolean; job_id: string }> {
  return apiFetch<{ success: boolean; job_id: string }>(
    `/api/scheduler/jobs/${encodeURIComponent(jobId)}/trigger`,
    { method: 'POST' },
  );
}

export async function pauseJob(jobId: string): Promise<{ success: boolean; job_id: string }> {
  return apiFetch<{ success: boolean; job_id: string }>(
    `/api/scheduler/jobs/${encodeURIComponent(jobId)}/pause`,
    { method: 'POST' },
  );
}

export async function resumeJob(jobId: string): Promise<{ success: boolean; job_id: string }> {
  return apiFetch<{ success: boolean; job_id: string }>(
    `/api/scheduler/jobs/${encodeURIComponent(jobId)}/resume`,
    { method: 'POST' },
  );
}

export async function updateJobSchedule(
  jobId: string,
  payload: ScheduleTrigger,
): Promise<{ success: boolean; job_id: string; message: string }> {
  return apiFetch<{ success: boolean; job_id: string; message: string }>(
    `/api/scheduler/jobs/${encodeURIComponent(jobId)}/schedule`,
    { method: 'PUT', body: JSON.stringify(payload) },
  );
}

export async function getNextRuns(jobId: string, n = 5): Promise<NextRunsResponse> {
  return apiFetch<NextRunsResponse>(
    `/api/scheduler/jobs/${encodeURIComponent(jobId)}/next-runs?n=${n}`,
  );
}

export async function getKnownAgents(): Promise<{ agents: KnownAgent[]; total: number }> {
  return apiFetch<{ agents: KnownAgent[]; total: number }>('/api/scheduler/agents');
}

export async function getAgentSchedules(): Promise<{ schedules: AgentSchedule[]; total: number }> {
  return apiFetch<{ schedules: AgentSchedule[]; total: number }>('/api/scheduler/agent-schedules');
}

export async function createAgentSchedule(data: {
  job_id: string;
  label: string;
  description?: string;
  trigger: 'cron' | 'interval';
  trigger_args: Record<string, unknown>;
}): Promise<AgentSchedule> {
  return apiFetch<AgentSchedule>('/api/scheduler/agent-schedules', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAgentSchedule(
  scheduleId: number,
  data: Partial<{
    label: string;
    description: string;
    trigger: 'cron' | 'interval';
    trigger_args: Record<string, unknown>;
    enabled: boolean;
  }>,
): Promise<AgentSchedule> {
  return apiFetch<AgentSchedule>(`/api/scheduler/agent-schedules/${scheduleId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteAgentSchedule(scheduleId: number): Promise<{ success: boolean; id: number }> {
  return apiFetch<{ success: boolean; id: number }>(
    `/api/scheduler/agent-schedules/${scheduleId}`,
    { method: 'DELETE' },
  );
}

export async function triggerAgentSchedule(scheduleId: number): Promise<{ success: boolean; job_id: string }> {
  return apiFetch<{ success: boolean; job_id: string }>(
    `/api/scheduler/agent-schedules/${scheduleId}/trigger`,
    { method: 'POST' },
  );
}

export async function getAgentRuns(limit = 20): Promise<{ runs: AgentRun[]; total: number }> {
  return apiFetch<{ runs: AgentRun[]; total: number }>(`/api/agents/runs?limit=${limit}`);
}

// ---------------------------------------------------------------------------
// Multi-model comparison
// ---------------------------------------------------------------------------

export async function runModelComparison(params: {
  ticker: string;
  providers: ComparisonProviderRequest[];
  template?: ComparisonTemplate;
}): Promise<ModelComparisonResponse> {
  return apiFetch<ModelComparisonResponse>('/api/ai/compare', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function getModelComparisonHistory(
  ticker: string,
  limit = 10,
): Promise<ModelComparisonHistoryResponse> {
  return apiFetch<ModelComparisonHistoryResponse>(
    `/api/ai/compare/history?ticker=${encodeURIComponent(ticker)}&limit=${limit}`,
  );
}

export async function fetchComparisonHistory(
  limit = 20,
): Promise<{ runs: ModelComparisonRun[] }> {
  return apiFetch<{ runs: ModelComparisonRun[] }>(
    `/api/ai/compare/history?limit=${limit}`,
  );
}

// ---------------------------------------------------------------------------
// Bulk prices
// ---------------------------------------------------------------------------

export async function fetchBulkPrices(tickers: string[]): Promise<BulkPricesResponse> {
  if (tickers.length === 0) return {};
  return apiFetch<BulkPricesResponse>(
    `/api/stocks/prices?tickers=${tickers.map(encodeURIComponent).join(',')}`,
  );
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function fetchHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/api/health');
}
