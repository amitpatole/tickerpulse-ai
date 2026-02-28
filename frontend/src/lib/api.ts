```typescript
// ─────────────────────────────────────────────────────────────────────────────
// TickerPulse AI — API client
// All functions return typed Promises; errors surface as ApiError instances.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Alert,
  AlertSoundSettings,
  AlertSoundType,
  AIRating,
  AgentMetricsResponse,
  AgentRun,
  AgentSchedule,
  Agent,
  CostSummary,
  ChatMessage,
  CompareResponse,
  DashboardSummary,
  EarningsEvent,
  EarningsResponse,
  ExportCapabilities,
  ExportFormat,
  JobMetricsResponse,
  MetricsSummary,
  MetricsTimeseriesResponse,
  NewsArticle,
  PortfolioPosition,
  PortfolioResponse,
  PortfolioSummary,
  ProviderRateLimitsResponse,
  ResearchBrief,
  ResearchBriefsResponse,
  ScheduledJob,
  SentimentData,
  Stock,
  StockDetail,
  StockDetailCandle,
  SystemMetricsResponse,
  Timeframe,
  Watchlist,
} from './types';

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  fieldErrors: FieldError[];

  constructor(
    message: string,
    status: number,
    code?: string,
    fieldErrors?: FieldError[],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors ?? [];
  }
}

async function _fetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  if (!res.ok) {
    throw new ApiError(
      json?.error ?? `API error ${res.status}`,
      res.status,
      json?.code ?? json?.error_code,
      json?.field_errors,
    );
  }
  return json as T;
}

function _qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

// ---------------------------------------------------------------------------
// Candlestick / chart data (exported type)
// ---------------------------------------------------------------------------

export interface StockCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function getStockCandles(
  ticker: string,
  timeframe: Timeframe,
): Promise<StockCandle[]> {
  const data = await _fetch<{ candles: StockCandle[] }>(
    `/api/stocks/${encodeURIComponent(ticker)}/candles${_qs({ timeframe })}`,
  );
  return data.candles ?? [];
}

// ---------------------------------------------------------------------------
// Known agents (scheduler, exported type)
// ---------------------------------------------------------------------------

export interface KnownAgent {
  job_id: string;
  name: string;
  description?: string;
}

export async function listKnownAgents(): Promise<KnownAgent[]> {
  const data = await _fetch<{ agents: KnownAgent[] }>('/api/scheduler/agents');
  return data.agents ?? [];
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return _fetch<DashboardSummary>('/api/dashboard/summary');
}

export async function getRefreshInterval(): Promise<number> {
  const data = await _fetch<{ refresh_interval: number }>('/api/dashboard/refresh-interval');
  return data.refresh_interval;
}

// ---------------------------------------------------------------------------
// Stocks & watchlists
// ---------------------------------------------------------------------------

export async function getStocks(watchlistId?: number): Promise<Stock[]> {
  const path = `/api/stocks${_qs({ watchlist_id: watchlistId })}`;
  const data = await _fetch<{ stocks: Stock[] }>(path);
  return data.stocks ?? [];
}

export async function addStock(ticker: string, watchlistId?: number): Promise<Stock> {
  return _fetch<Stock>('/api/stocks', {
    method: 'POST',
    body: JSON.stringify({ ticker, watchlist_id: watchlistId }),
  });
}

export async function searchStocks(query: string): Promise<Stock[]> {
  const data = await _fetch<{ results: Stock[] }>(
    `/api/stocks/search${_qs({ q: query })}`,
  );
  return data.results ?? [];
}

export async function getStockDetail(ticker: string): Promise<StockDetail> {
  return _fetch<StockDetail>(`/api/stocks/${encodeURIComponent(ticker)}`);
}

// ---------------------------------------------------------------------------
// Watchlists
// ---------------------------------------------------------------------------

export async function listWatchlists(): Promise<Watchlist[]> {
  const data = await _fetch<{ watchlists: Watchlist[] }>('/api/watchlists');
  return data.watchlists ?? [];
}

export async function createWatchlist(name: string): Promise<Watchlist> {
  return _fetch<Watchlist>('/api/watchlists', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function renameWatchlistGroup(id: number, name: string): Promise<Watchlist> {
  return _fetch<Watchlist>(`/api/watchlists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function deleteWatchlistGroup(id: number): Promise<void> {
  await _fetch<void>(`/api/watchlists/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// AI ratings
// ---------------------------------------------------------------------------

export async function getRatings(watchlistId?: number): Promise<AIRating[]> {
  const path = `/api/ratings${_qs({ watchlist_id: watchlistId })}`;
  const data = await _fetch<{ ratings: AIRating[] }>(path);
  return data.ratings ?? [];
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export async function getAlerts(): Promise<Alert[]> {
  const data = await _fetch<{ alerts: Alert[] }>('/api/alerts');
  return data.alerts ?? [];
}

export async function createAlert(
  payload: Omit<Alert, 'id' | 'active' | 'created_at' | 'triggered_at'>,
): Promise<Alert> {
  return _fetch<Alert>('/api/alerts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAlert(id: number, payload: Partial<Alert>): Promise<Alert> {
  return _fetch<Alert>(`/api/alerts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteAlert(id: number): Promise<void> {
  await _fetch<void>(`/api/alerts/${id}`, { method: 'DELETE' });
}

export async function getAlertSoundSettings(): Promise<AlertSoundSettings> {
  return _fetch<AlertSoundSettings>('/api/settings/alert-sound');
}

export async function updateAlertSoundSettings(
  settings: Partial<AlertSoundSettings>,
): Promise<AlertSoundSettings> {
  return _fetch<AlertSoundSettings>('/api/settings/alert-sound', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

/**
 * Override the sound type for a single price alert.
 * Calls PUT /api/alerts/<id>/sound and returns the updated alert row.
 */
export async function updateAlertSoundType(
  id: number,
  soundType: AlertSoundType,
): Promise<Alert> {
  return _fetch<Alert>(`/api/alerts/${id}/sound`, {
    method: 'PUT',
    body: JSON.stringify({ sound_type: soundType }),
  });
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

export async function getNews(params?: {
  page?: number;
  page_size?: number;
  ticker?: string;
}): Promise<{ articles: NewsArticle[]; total: number; page: number; page_size: number }> {
  return _fetch(`/api/news${_qs(params ?? {})}`);
}

// ---------------------------------------------------------------------------
// Earnings
// ---------------------------------------------------------------------------

export async function getEarnings(params?: {
  days_ahead?: number;
  watchlist_id?: number;
}): Promise<EarningsResponse> {
  return _fetch<EarningsResponse>(`/api/earnings${_qs(params ?? {})}`);
}

export async function getTickerEarnings(ticker: string): Promise<EarningsEvent[]> {
  const data = await _fetch<{ events: EarningsEvent[] }>(
    `/api/earnings/${encodeURIComponent(ticker)}`,
  );
  return data.events ?? [];
}

export async function triggerEarningsSync(): Promise<{ message: string }> {
  return _fetch<{ message: string }>('/api/earnings/sync', { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Sentiment
// ---------------------------------------------------------------------------

export async function getStockSentiment(ticker: string): Promise<SentimentData> {
  return _fetch<SentimentData>(`/api/stocks/${encodeURIComponent(ticker)}/sentiment`);
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

export async function getCompareData(
  tickers: string[],
  timeframe: Timeframe,
  days?: number,
): Promise<CompareResponse> {
  const qs = _qs({ tickers: tickers.join(','), timeframe, days });
  return _fetch<CompareResponse>(`/api/compare${qs}`);
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export async function getPortfolio(): Promise<PortfolioResponse> {
  return _fetch<PortfolioResponse>('/api/portfolio');
}

export async function addPortfolioPosition(data: {
  ticker: string;
  quantity: number;
  avg_cost: number;
  currency?: string;
  notes?: string;
}): Promise<PortfolioPosition> {
  return _fetch<PortfolioPosition>('/api/portfolio/positions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePortfolioPosition(
  id: number,
  data: { quantity?: number; avg_cost?: number; currency?: string; notes?: string },
): Promise<PortfolioPosition> {
  return _fetch<PortfolioPosition>(`/api/portfolio/positions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deletePortfolioPosition(id: number): Promise<void> {
  await _fetch<void>(`/api/portfolio/positions/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function createChatSession(ticker?: string): Promise<{ session_id: string }> {
  return _fetch<{ session_id: string }>('/api/chat/sessions', {
    method: 'POST',
    body: JSON.stringify({ ticker }),
  });
}

export async function listChatSessions(): Promise<
  Array<{ session_id: string; ticker?: string; created_at: string; message_count: number }>
> {
  const data = await _fetch<{
    sessions: Array<{
      session_id: string;
      ticker?: string;
      created_at: string;
      message_count: number;
    }>;
  }>('/api/chat/sessions');
  return data.sessions ?? [];
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  await _fetch<void>(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}

export async function sendSessionMessage(
  sessionId: string,
  message: string,
  ticker?: string,
): Promise<ChatMessage> {
  return _fetch<ChatMessage>(
    `/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ message, ticker }),
    },
  );
}

export async function getChatStarters(ticker?: string): Promise<string[]> {
  const data = await _fetch<{ starters: string[] }>(
    `/api/chat/starters${_qs({ ticker })}`,
  );
  return data.starters ?? [];
}

// ---------------------------------------------------------------------------
// Research briefs
// ---------------------------------------------------------------------------

export async function getResearchBriefs(params?: {
  page?: number;
  page_size?: number;
  ticker?: string;
}): Promise<ResearchBriefsResponse> {
  return _fetch<ResearchBriefsResponse>(`/api/research/briefs${_qs(params ?? {})}`);
}

export async function getResearchBrief(id: number): Promise<ResearchBrief> {
  return _fetch<ResearchBrief>(`/api/research/briefs/${id}`);
}

export async function generateResearchBrief(ticker: string): Promise<ResearchBrief> {
  return _fetch<ResearchBrief>('/api/research/briefs', {
    method: 'POST',
    body: JSON.stringify({ ticker }),
  });
}

export async function getAllBriefIds(): Promise<number[]> {
  const data = await _fetch<{ ids: number[] }>('/api/research/briefs/ids');
  return data.ids ?? [];
}

export async function exportBriefs(
  ids: number[],
  format: ExportFormat,
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/research/briefs/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, format }),
  });
  if (!res.ok) {
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text); } catch { /* empty */ }
    throw new ApiError(
      (json?.error as string) ?? `Export failed ${res.status}`,
      res.status,
      json?.error_code as string | undefined,
    );
  }
  return res.blob();
}

export async function getExportCapabilities(): Promise<ExportCapabilities> {
  return _fetch<ExportCapabilities>('/api/research/briefs/export/capabilities');
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export async function getAgents(): Promise<Agent[]> {
  const data = await _fetch<{ agents: Agent[] }>('/api/agents');
  return data.agents ?? [];
}

export async function getAgentRuns(params?: {
  agent_name?: string;
  status?: string;
  limit?: number;
  date_from?: string;
  date_to?: string;
}): Promise<AgentRun[]> {
  const data = await _fetch<{ runs: AgentRun[] }>(
    `/api/agents/runs${_qs(params ?? {})}`,
  );
  return data.runs ?? [];
}

export async function getCostSummary(days?: number): Promise<CostSummary> {
  return _fetch<CostSummary>(`/api/agents/costs${_qs({ days })}`);
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export async function getSchedulerJobs(): Promise<ScheduledJob[]> {
  const data = await _fetch<{ jobs: ScheduledJob[] }>('/api/scheduler/jobs');
  return data.jobs ?? [];
}

export async function triggerJob(jobId: string): Promise<{ message: string }> {
  return _fetch<{ message: string }>(
    `/api/scheduler/jobs/${encodeURIComponent(jobId)}/trigger`,
    { method: 'POST' },
  );
}

export async function pauseJob(jobId: string): Promise<{ message: string }> {
  return _fetch<{ message: string }>(
    `/api/scheduler/jobs/${encodeURIComponent(jobId)}/pause`,
    { method: 'POST' },
  );
}

export async function resumeJob(jobId: string): Promise<{ message: string }> {
  return _fetch<{ message: string }>(
    `/api/scheduler/jobs/${encodeURIComponent(jobId)}/resume`,
    { method: 'POST' },
  );
}

export async function updateJobSchedule(
  jobId: string,
  trigger: string,
  args: Record<string, unknown>,
): Promise<ScheduledJob> {
  return _fetch<ScheduledJob>(
    `/api/scheduler/jobs/${encodeURIComponent(jobId)}/schedule`,
    { method: 'PUT', body: JSON.stringify({ trigger, ...args }) },
  );
}

export async function listAgentSchedules(): Promise<AgentSchedule[]> {
  const data = await _fetch<{ schedules: AgentSchedule[] }>('/api/scheduler/agent-schedules');
  return data.schedules ?? [];
}

export async function createAgentSchedule(
  data: Omit<AgentSchedule, 'id' | 'created_at' | 'updated_at' | 'last_run' | 'next_run'>,
): Promise<AgentSchedule> {
  return _fetch<AgentSchedule>('/api/scheduler/agent-schedules', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAgentSchedule(
  id: number,
  data: Partial<Pick<AgentSchedule, 'label' | 'description' | 'trigger' | 'trigger_args' | 'enabled'>>,
): Promise<AgentSchedule> {
  return _fetch<AgentSchedule>(`/api/scheduler/agent-schedules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteAgentSchedule(id: number): Promise<void> {
  await _fetch<void>(`/api/scheduler/agent-schedules/${id}`, { method: 'DELETE' });
}

export async function triggerAgentSchedule(id: number): Promise<{ message: string }> {
  return _fetch<{ message: string }>(
    `/api/scheduler/agent-schedules/${id}/trigger`,
    { method: 'POST' },
  );
}

// ---------------------------------------------------------------------------
// Provider rate limits
// ---------------------------------------------------------------------------

export async function getProviderRateLimits(): Promise<ProviderRateLimitsResponse> {
  return _fetch<ProviderRateLimitsResponse>('/api/providers/rate-limits');
}

// ---------------------------------------------------------------------------
// Persisted UI state
// ---------------------------------------------------------------------------

/** Shape returned by GET /api/state */
export interface GetStateResponse {
  success: boolean;
  state: Record<string, Record<string, unknown>>;
}

/** Shape returned by PATCH /api/state */
export interface PatchStateResponse {
  success: boolean;
  updated_keys?: string[];
}

export async function getState(): Promise<GetStateResponse> {
  return _fetch<GetStateResponse>('/api/state');
}

export async function patchState(
  updates: Record<string, Record<string, unknown>>,
): Promise<PatchStateResponse> {
  return _fetch<PatchStateResponse>('/api/state', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

// ---------------------------------------------------------------------------
// Performance metrics
// ---------------------------------------------------------------------------

export async function getMetricsSummary(days?: number): Promise<MetricsSummary> {
  return _fetch<MetricsSummary>(`/api/metrics/summary${_qs({ days })}`);
}

export async function getAgentMetrics(days?: number): Promise<AgentMetricsResponse> {
  return _fetch<AgentMetricsResponse>(`/api/metrics/agents${_qs({ days })}`);
}

export async function getJobMetrics(days?: number): Promise<JobMetricsResponse> {
  return _fetch<JobMetricsResponse>(`/api/metrics/jobs${_qs({ days })}`);
}

export async function getMetricsTimeseries(
  days?: number,
  metric?: string,
): Promise<MetricsTimeseriesResponse> {
  return _fetch<MetricsTimeseriesResponse>(
    `/api/metrics/timeseries${_qs({ days, metric })}`,
  );
}

export async function getSystemMetrics(days: number = 7): Promise<SystemMetricsResponse> {
  return _fetch<SystemMetricsResponse>(`/api/metrics/system${_qs({ days })}`);
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function getHealth(): Promise<HealthResponse> {
  return _fetch<HealthResponse>('/api/health');
}

export async function getHealthReady(): Promise<HealthReadyResponse> {
  return _fetch<HealthReadyResponse>('/api/health/ready');
}

// Re-export HealthResponse / HealthReadyResponse from types so consumers can
// import from a single location.
export type { HealthResponse, HealthReadyResponse } from './types';
```