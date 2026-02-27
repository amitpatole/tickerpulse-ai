// ============================================================
// TickerPulse AI v3.0 - API Client
// ============================================================

import type {
  Stock,
  StockSearchResult,
  StockDetail,
  Timeframe,
  AIRating,
  Agent,
  AgentRun,
  ScheduledJob,
  NewsArticle,
  Alert,
  CostSummary,
  AIProvider,
  HealthCheck,
  ResearchBrief,
  ResearchBriefsResponse,
  ExportCapabilities,
  AlertSoundSettings,
  EarningsResponse,
  SentimentData,
  ProviderStatusResponse,
  ProviderRateLimitsResponse,
  ExportFormat,
  CompareResult,
  PriceUpdateEvent,
  PortfolioPoint,
  Watchlist,
  WatchlistDetail,
  RefreshIntervalConfig,
  DashboardSummary,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      let message = `API error: ${res.status}`;
      let code: string | undefined;
      try {
        const json = JSON.parse(body);
        message = json.error || json.message || message;
        code = json.code;
      } catch {
        if (body) message = body;
      }
      throw new ApiError(message, res.status, code);
    }

    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      `Failed to connect to API: ${err instanceof Error ? err.message : 'Unknown error'}`,
      0
    );
  }
}

// ---- Stocks ----

export async function getStocks(market?: string): Promise<Stock[]> {
  const params = market && market !== 'All' ? `?market=${encodeURIComponent(market)}` : '';
  const data = await request<{ stocks: Stock[] } | Stock[]>(`/api/stocks${params}`);
  if (Array.isArray(data)) return data;
  return (data as { stocks: Stock[] }).stocks || [];
}

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  if (!query.trim()) return [];
  return request<StockSearchResult[]>(`/api/stocks/search?q=${encodeURIComponent(query.trim())}`);
}

export async function addStock(ticker: string, name?: string, market?: string): Promise<Stock> {
  const body: Record<string, string> = { ticker: ticker.toUpperCase() };
  if (name) body.name = name;
  if (market) body.market = market;
  return request<Stock>('/api/stocks', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteStock(ticker: string, watchlistId?: number): Promise<void> {
  const params = watchlistId != null ? `?watchlist_id=${watchlistId}` : '';
  await request<void>(`/api/stocks/${ticker.toUpperCase()}${params}`, {
    method: 'DELETE',
  });
}

export async function getStockDetail(ticker: string, timeframe: Timeframe): Promise<StockDetail> {
  return request<StockDetail>(
    `/api/stocks/${ticker.toUpperCase()}/detail?timeframe=${timeframe}`
  );
}

export async function getBulkPrices(): Promise<Record<string, PriceUpdateEvent>> {
  return request<Record<string, PriceUpdateEvent>>('/api/stocks/prices');
}

export async function getPortfolioHistory(days = 30): Promise<PortfolioPoint[]> {
  const data = await request<{ points: PortfolioPoint[] } | PortfolioPoint[]>(
    `/api/stocks/portfolio-history?days=${days}`
  );
  if (Array.isArray(data)) return data;
  return (data as { points: PortfolioPoint[] }).points || [];
}

// ---- Comparison ----

export async function getCompareData(
  symbols: string[],
  timeframe: Timeframe
): Promise<CompareResult> {
  const params = new URLSearchParams({
    symbols: symbols.map((s) => s.toUpperCase()).join(','),
    timeframe,
  });
  return request<CompareResult>(`/api/stocks/compare?${params.toString()}`);
}

// ---- News ----

export async function getNews(
  ticker?: string,
  page?: number,
  pageSize?: number
): Promise<NewsArticle[]> {
  const params = new URLSearchParams();
  if (ticker) params.set('ticker', ticker);
  if (page !== undefined) params.set('page', String(page));
  if (pageSize !== undefined) params.set('page_size', String(pageSize));
  const qs = params.toString();
  const data = await request<{ data: NewsArticle[] } | NewsArticle[]>(
    `/api/news${qs ? `?${qs}` : ''}`
  );
  if (Array.isArray(data)) return data;
  return (data as { data: NewsArticle[] }).data || [];
}

// ---- Alerts ----

export async function getAlerts(): Promise<Alert[]> {
  const data = await request<{ alerts: Alert[] } | Alert[]>('/api/alerts');
  if (Array.isArray(data)) return data;
  return (data as { alerts: Alert[] }).alerts || [];
}

export async function getAlertSoundSettings(): Promise<AlertSoundSettings> {
  return request<AlertSoundSettings>('/api/alerts/sound-settings');
}

export async function updateAlertSoundSettings(
  patch: Partial<AlertSoundSettings>
): Promise<AlertSoundSettings> {
  return request<AlertSoundSettings>('/api/alerts/sound-settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export async function createAlert(data: {
  ticker: string;
  condition_type: string;
  threshold: number;
  sound_type?: string;
}): Promise<Alert> {
  return request<Alert>('/api/alerts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteAlert(id: number): Promise<void> {
  await request<{ success: boolean; id: number }>(`/api/alerts/${id}`, {
    method: 'DELETE',
  });
}

export async function toggleAlert(id: number): Promise<Alert> {
  return request<Alert>(`/api/alerts/${id}/toggle`, { method: 'PUT' });
}

// ---- AI Ratings ----

export async function getRatings(): Promise<AIRating[]> {
  const data = await request<{ ratings: AIRating[] } | AIRating[]>('/api/ai/ratings');
  if (Array.isArray(data)) return data;
  return (data as { ratings: AIRating[] }).ratings || [];
}

export async function getRating(ticker: string): Promise<AIRating> {
  return request<AIRating>(`/api/ai/rating/${ticker.toUpperCase()}`);
}

// ---- Sentiment ----

export async function getStockSentiment(ticker: string): Promise<SentimentData> {
  return request<SentimentData>(`/api/stocks/${encodeURIComponent(ticker)}/sentiment`);
}

// ---- Agents ----

export async function getAgents(): Promise<Agent[]> {
  const data = await request<{ agents: Agent[] } | Agent[]>('/api/agents');
  if (Array.isArray(data)) return data;
  return (data as { agents: Agent[] }).agents || [];
}

export async function getAgent(name: string): Promise<Agent> {
  return request<Agent>(`/api/agents/${encodeURIComponent(name)}`);
}

export async function runAgent(name: string): Promise<{ message: string; run_id?: number }> {
  return request<{ message: string; run_id?: number }>(
    `/api/agents/${encodeURIComponent(name)}/run`,
    { method: 'POST' }
  );
}

export async function getAgentRuns(limit = 50): Promise<AgentRun[]> {
  const data = await request<{ runs: AgentRun[] } | AgentRun[]>(
    `/api/agents/runs?limit=${limit}`
  );
  if (Array.isArray(data)) return data;
  return (data as { runs: AgentRun[] }).runs || [];
}

export async function getCostSummary(days = 30): Promise<CostSummary> {
  return request<CostSummary>(`/api/agents/costs?days=${days}`);
}

// ---- Scheduler ----

export async function getSchedulerJobs(): Promise<ScheduledJob[]> {
  const data = await request<{ jobs: ScheduledJob[] } | ScheduledJob[]>('/api/scheduler/jobs');
  if (Array.isArray(data)) return data;
  return (data as { jobs: ScheduledJob[] }).jobs || [];
}

export async function triggerJob(id: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/scheduler/jobs/${encodeURIComponent(id)}/trigger`, {
    method: 'POST',
  });
}

export async function pauseJob(id: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/scheduler/jobs/${encodeURIComponent(id)}/pause`, {
    method: 'POST',
  });
}

export async function resumeJob(id: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/scheduler/jobs/${encodeURIComponent(id)}/resume`, {
    method: 'POST',
  });
}

// ---- Settings ----

export async function getAIProviders(): Promise<AIProvider[]> {
  const data = await request<{ data: AIProvider[] } | AIProvider[]>(
    '/api/settings/ai-providers'
  );
  if (Array.isArray(data)) return data;
  return (data as { data: AIProvider[] }).data || [];
}

export async function getRefreshInterval(): Promise<RefreshIntervalConfig> {
  return request<RefreshIntervalConfig>('/api/settings/refresh-interval');
}

export async function setRefreshInterval(
  interval: number
): Promise<{ success: boolean; interval: number }> {
  return request<{ success: boolean; interval: number }>('/api/settings/refresh-interval', {
    method: 'PUT',
    body: JSON.stringify({ interval }),
  });
}

// ---- Dashboard ----

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return request<DashboardSummary>('/api/dashboard/summary');
}

// ---- Health ----

export async function getHealth(): Promise<HealthCheck> {
  return request<HealthCheck>('/api/health');
}

// ---- Research ----

export async function getResearchBriefs(
  ticker?: string,
  page?: number,
  pageSize?: number
): Promise<ResearchBriefsResponse> {
  const params = new URLSearchParams();
  if (ticker) params.set('ticker', ticker);
  if (page !== undefined) params.set('page', String(page));
  if (pageSize !== undefined) params.set('page_size', String(pageSize));
  const qs = params.toString();
  return request<ResearchBriefsResponse>(`/api/research/briefs${qs ? `?${qs}` : ''}`);
}

export async function getExportCapabilities(): Promise<ExportCapabilities> {
  return request<ExportCapabilities>('/api/research/briefs/export/capabilities');
}

export async function generateResearchBrief(ticker?: string): Promise<ResearchBrief> {
  return request<ResearchBrief>('/api/research/briefs', {
    method: 'POST',
    body: JSON.stringify(ticker ? { ticker } : {}),
  });
}

export async function exportBriefs(ids: number[], format: ExportFormat): Promise<Blob> {
  const url = `${API_BASE}/api/research/briefs/export`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, format }),
  });

  if (!res.ok) {
    const body = await res.text();
    let message = `Export failed: ${res.status}`;
    let code: string | undefined;
    try {
      const json = JSON.parse(body);
      message = json.error || json.message || message;
      code = json.code;
    } catch {
      if (body) message = body;
    }
    throw new ApiError(message, res.status, code);
  }

  return res.blob();
}

// ---- Chat ----

export interface ChatResponse {
  success: boolean;
  answer: string;
  ai_powered: boolean;
  ticker: string;
}

export async function askChat(
  ticker: string,
  question: string,
  thinking_level?: string
): Promise<ChatResponse | null> {
  if (!ticker.trim() || !question.trim()) return null;
  return request<ChatResponse>('/api/chat/ask', {
    method: 'POST',
    body: JSON.stringify({ ticker: ticker.trim(), question: question.trim(), thinking_level }),
  });
}

// ---- Earnings Calendar ----

export async function getEarnings(days = 14): Promise<EarningsResponse> {
  return request<EarningsResponse>(`/api/earnings?days=${days}`);
}

// ---- Data Provider Status ----

export async function getProviderStatus(): Promise<ProviderStatusResponse> {
  return request<ProviderStatusResponse>('/api/providers/status');
}

export async function getProviderRateLimits(): Promise<ProviderRateLimitsResponse> {
  return request<ProviderRateLimitsResponse>('/api/providers/rate-limits');
}

// ---- Watchlist Groups ----

export async function listWatchlists(): Promise<Watchlist[]> {
  return request<Watchlist[]>('/api/watchlist/');
}

export async function createWatchlist(name: string): Promise<Watchlist> {
  return request<Watchlist>('/api/watchlist/', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function renameWatchlistGroup(id: number, name: string): Promise<Watchlist> {
  return request<Watchlist>(`/api/watchlist/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

export async function deleteWatchlistGroup(id: number): Promise<void> {
  await request<{ ok: boolean }>(`/api/watchlist/${id}`, { method: 'DELETE' });
}

export async function getWatchlistDetail(watchlistId: number): Promise<WatchlistDetail> {
  return request<WatchlistDetail>(`/api/watchlist/${watchlistId}`);
}

export async function getWatchlistOrder(watchlistId = 1): Promise<string[]> {
  const data = await request<WatchlistDetail>(`/api/watchlist/${watchlistId}`);
  return data.tickers ?? [];
}

export async function reorderWatchlist(watchlistId = 1, tickers: string[]): Promise<void> {
  await request<{ ok: boolean }>(`/api/watchlist/${watchlistId}/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ tickers }),
  });
}

export async function reorderWatchlistGroups(ids: number[]): Promise<void> {
  await request<{ ok: boolean }>('/api/watchlist/reorder', {
    method: 'PUT',
    body: JSON.stringify({ ids }),
  });
}

export async function addStockToWatchlist(
  watchlistId: number,
  ticker: string,
  name?: string
): Promise<void> {
  const body: Record<string, string> = { ticker: ticker.toUpperCase() };
  if (name) body.name = name;
  await request<{ ok: boolean }>(`/api/watchlist/${watchlistId}/stocks`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function removeStockFromWatchlist(
  watchlistId: number,
  ticker: string
): Promise<void> {
  await request<{ ok: boolean }>(
    `/api/watchlist/${watchlistId}/stocks/${ticker.toUpperCase()}`,
    { method: 'DELETE' }
  );
}
