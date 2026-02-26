```typescript
// ============================================================
// TickerPulse AI v3.0 - API Client
// ============================================================

import type {
  Stock,
  StockSearchResult,
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
  StockDetail,
  Timeframe,
  ProviderStatusResponse,
  ProviderRateLimitsResponse,
  ExportFormat,
  ComparisonResult,
  PriceUpdateEvent,
  PortfolioPoint,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
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
      try {
        const json = JSON.parse(body);
        message = json.error || json.message || message;
      } catch {
        if (body) message = body;
      }
      throw new ApiError(message, res.status);
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

export async function getStocks(): Promise<Stock[]> {
  const data = await request<{ stocks: Stock[] } | Stock[]>('/api/stocks');
  if (Array.isArray(data)) return data;
  return data.stocks || [];
}

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  if (!query.trim()) return [];
  return request<StockSearchResult[]>(`/api/stocks/search?q=${encodeURIComponent(query.trim())}`);
}

export async function addStock(ticker: string, name?: string): Promise<Stock> {
  const body: Record<string, string> = { ticker: ticker.toUpperCase() };
  if (name) body.name = name;
  return request<Stock>('/api/stocks', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteStock(ticker: string): Promise<void> {
  await request<void>(`/api/stocks/${ticker.toUpperCase()}`, {
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

// ---- News ----

export async function getNews(ticker?: string, page?: number, pageSize?: number): Promise<NewsArticle[]> {
  const params = new URLSearchParams();
  if (ticker) params.set('ticker', ticker);
  if (page !== undefined) params.set('page', String(page));
  if (pageSize !== undefined) params.set('page_size', String(pageSize));
  const data = await request<{ data: NewsArticle[] } | NewsArticle[]>(
    `/api/news?${params.toString()}`
  );
  if (Array.isArray(data)) return data;
  return (data as { data: NewsArticle[] }).data || [];
}

// ---- Alerts ----

export async function getAlerts(): Promise<Alert[]> {
  const data = await request<{ alerts: Alert[] } | Alert[]>('/api/alerts');
  if (Array.isArray(data)) return data;
  return data.alerts || [];
}

// ---- AI Ratings ----

export async function getRatings(): Promise<AIRating[]> {
  const data = await request<{ ratings: AIRating[] } | AIRating[]>('/api/ai/ratings');
  if (Array.isArray(data)) return data;
  return data.ratings || [];
}

export async function getRating(ticker: string): Promise<AIRating> {
  return request<AIRating>(`/api/ai/rating/${ticker.toUpperCase()}`);
}

// ---- Agents ----

export async function getAgents(): Promise<Agent[]> {
  const data = await request<{ agents: Agent[] } | Agent[]>('/api/agents');
  if (Array.isArray(data)) return data;
  return data.agents || [];
}

export async function getAgent(name: string): Promise<Agent> {
  return request<Agent>(`/api/agents/${name}`);
}

export async function runAgent(name: string): Promise<{ message: string; run_id?: number }> {
  return request<{ message: string; run_id?: number }>(`/api/agents/${name}/run`, {
    method: 'POST',
  });
}

export async function getAgentRuns(limit = 50): Promise<AgentRun[]> {
  const data = await request<{ runs: AgentRun[] } | AgentRun[]>(
    `/api/agents/runs?limit=${limit}`
  );
  if (Array.isArray(data)) return data;
  return data.runs || [];
}

export async function getCostSummary(days = 30): Promise<CostSummary> {
  return request<CostSummary>(`/api/agents/costs?days=${days}`);
}

// ---- Scheduler ----

export async function getSchedulerJobs(): Promise<ScheduledJob[]> {
  const data = await request<{ jobs: ScheduledJob[] } | ScheduledJob[]>('/api/scheduler/jobs');
  if (Array.isArray(data)) return data;
  return data.jobs || [];
}

export async function triggerJob(id: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/scheduler/jobs/${id}/trigger`, {
    method: 'POST',
  });
}

export async function pauseJob(id: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/scheduler/jobs/${id}/pause`, {
    method: 'POST',
  });
}

export async function resumeJob(id: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/scheduler/jobs/${id}/resume`, {
    method: 'POST',
  });
}

// ---- Alert Sound Settings ----

export async function getAlertSoundSettings(): Promise<AlertSoundSettings> {
  return request<AlertSoundSettings>('/api/alerts/sound-settings');
}

export async function updateAlertSoundSettings(patch: Partial<AlertSoundSettings>): Promise<AlertSoundSettings> {
  return request<AlertSoundSettings>('/api/alerts/sound-settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
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

export async function getRefreshInterval(): Promise<{ interval: number; source: string }> {
  return request<{ interval: number; source: string }>('/api/settings/refresh-interval');
}

export async function setRefreshInterval(
  interval: number
): Promise<{ success: boolean; interval: number }> {
  return request<{ success: boolean; interval: number }>('/api/settings/refresh-interval', {
    method: 'PUT',
    body: JSON.stringify({ interval }),
  });
}

// ---- Health ----

export async function getHealth(): Promise<HealthCheck> {
  return request<HealthCheck>('/api/health');
}

// ---- Research ----

export async function getResearchBriefs(ticker?: string, page?: number, pageSize?: number): Promise<ResearchBriefsResponse> {
  const params = new URLSearchParams();
  if (ticker) params.set('ticker', ticker);
  if (page !== undefined) params.set('page', String(page));
  if (pageSize !== undefined) params.set('page_size', String(pageSize));
  return request<ResearchBriefsResponse>(`/api/research/briefs?${params.toString()}`);
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
    try {
      const json = JSON.parse(body);
      message = json.error || json.message || message;
    } catch {
      if (body) message = body;
    }
    throw new ApiError(message, res.status);
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

export async function getEarnings(days: number = 14): Promise<EarningsResponse> {
  return request<EarningsResponse>(`/api/earnings?days=${days}`);
}

// ---- Sentiment ----

export async function getStockSentiment(ticker: string): Promise<SentimentData> {
  return request<SentimentData>(`/api/stocks/${encodeURIComponent(ticker)}/sentiment`);
}

// ---- Performance Comparison ----

export async function getComparisonData(
  tickers: string[],
  timeframe: Timeframe
): Promise<ComparisonResult> {
  const params = new URLSearchParams({
    tickers: tickers.map((t) => t.toUpperCase()).join(','),
    timeframe,
  });
  return request<ComparisonResult>(`/api/stocks/compare?${params.toString()}`);
}

// ---- Portfolio History ----

export async function getPortfolioHistory(days = 30): Promise<PortfolioPoint[]> {
  const data = await request<{ points: PortfolioPoint[] } | PortfolioPoint[]>(
    `/api/stocks/portfolio-history?days=${days}`
  );
  if (Array.isArray(data)) return data;
  return (data as { points: PortfolioPoint[] }).points || [];
}

// ---- Watchlist ----

export async function getWatchlistOrder(watchlistId: number = 1): Promise<string[]> {
  const data = await request<{ tickers: string[] }>(`/api/watchlist/${watchlistId}`);
  return data.tickers ?? [];
}

export async function reorderWatchlist(watchlistId: number = 1, tickers: string[]): Promise<void> {
  await request<{ ok: boolean }>(`/api/watchlist/${watchlistId}/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ tickers }),
  });
}

// ---- Data Provider Status ----

export async function getProviderStatus(): Promise<ProviderStatusResponse> {
  return request<ProviderStatusResponse>('/api/providers/status');
}

export async function getProviderRateLimits(): Promise<ProviderRateLimitsResponse> {
  return request<ProviderRateLimitsResponse>('/api/providers/rate-limits');
}

export { ApiError };
```