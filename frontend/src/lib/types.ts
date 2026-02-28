```typescript
// ─────────────────────────────────────────────────────────────────────────────
// Shared TypeScript types for TickerPulse AI frontend
// ─────────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// General / utility
// ---------------------------------------------------------------------------

export type Timeframe = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y' | 'All';

export type ChartViewMode = 'single' | 'multi';

export type MultiViewConfig = { timeframes: Timeframe[] };

export type TimezoneMode = 'market' | 'local';

// ---------------------------------------------------------------------------
// Alert / sound types
// ---------------------------------------------------------------------------

export type AlertSoundType = 'chime' | 'alarm' | 'silent' | 'default';

export interface AlertSoundSettings {
  enabled: boolean;
  sound_type: 'chime' | 'alarm' | 'silent';
  volume: number;
  mute_when_active: boolean;
}

export interface Alert {
  id: number;
  ticker: string;
  /** Condition stored in DB — e.g. 'price_above', 'price_below' */
  condition_type: string;
  /** Legacy alias kept for backwards-compat with older API responses */
  condition?: 'above' | 'below';
  threshold: number;
  current_price?: number;
  /** Whether the alert is currently active (DB column: enabled) */
  enabled: boolean;
  /** Legacy alias kept for backwards-compat */
  active?: boolean;
  triggered_at?: string | null;
  created_at?: string;
  sound_type?: AlertSoundType;
  notes?: string;
}

// ---------------------------------------------------------------------------
// SSE event types
// ---------------------------------------------------------------------------

export type SSEEventType =
  | 'agent_status'
  | 'alert'
  | 'job_complete'
  | 'price_update'
  | 'heartbeat'
  | 'connected';

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  id?: string;
  timestamp?: string;
}

/** Alias used in hook tests */
export type SSEMessage = SSEEvent;

export interface AgentStatusEvent {
  agent_name: string;
  status: 'running' | 'completed' | 'failed' | 'idle';
  run_id?: string;
  message?: string;
  timestamp?: string;
}

export interface AlertEvent {
  alert_id: number;
  ticker: string;
  condition: string;
  current_price: number;
  threshold: number;
  sound_type?: AlertSoundType;
  timestamp?: string;
}

export interface JobCompleteEvent {
  job_id: string;
  job_name: string;
  status: 'success' | 'failed';
  duration_ms?: number;
  timestamp?: string;
}

export interface PriceUpdateEvent {
  ticker: string;
  price: number;
  change: number;
  change_pct: number;
  timestamp?: string;
}

export interface PriceUpdate {
  ticker: string;
  price: number;
  change: number;
  change_pct: number;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Stock / market data
// ---------------------------------------------------------------------------

export interface Stock {
  ticker: string;
  name?: string;
  sector?: string;
  industry?: string;
  price?: number;
  change?: number;
  change_pct?: number;
  watchlist_id?: number;
  added_at?: string;
}

export interface StockSearchResult {
  ticker: string;
  name: string;
  exchange?: string;
  type?: string;
}

export interface StockDetailQuote {
  ticker: string;
  name?: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  prev_close?: number;
  change: number;
  change_pct: number;
  volume?: number;
  avg_volume?: number;
  market_cap?: number;
  pe_ratio?: number;
  eps?: number;
  dividend_yield?: number;
  week_52_high?: number;
  week_52_low?: number;
  beta?: number;
  sector?: string;
  industry?: string;
  description?: string;
  updated_at?: string;
}

export interface StockDetailCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockDetailNewsItem {
  title: string;
  url: string;
  source?: string;
  published_at?: string;
  summary?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface StockDetailIndicators {
  rsi?: number | null;
  macd?: { value: number; signal: number; histogram: number; signal_label: string } | null;
  bollinger?: { upper: number; lower: number; mid: number; signal_label: string } | null;
  sma_20?: number | null;
  sma_50?: number | null;
  sma_200?: number | null;
  atr?: number | null;
  adx?: number | null;
}

export interface StockDetail {
  ticker: string;
  quote: StockDetailQuote;
  candles: StockDetailCandle[];
  news: StockDetailNewsItem[];
  indicators: StockDetailIndicators;
  ai_rating?: AIRatingBlock | null;
  sentiment?: SentimentData | null;
}

// ---------------------------------------------------------------------------
// AI ratings
// ---------------------------------------------------------------------------

export type RatingLabel = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';

export const RATING_BG_CLASSES: Record<RatingLabel, string> = {
  STRONG_BUY:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  BUY:         'bg-green-500/15  text-green-400  border-green-500/30',
  HOLD:        'bg-amber-500/15  text-amber-400  border-amber-500/30',
  SELL:        'bg-orange-500/15 text-orange-400 border-orange-500/30',
  STRONG_SELL: 'bg-red-500/15   text-red-400   border-red-500/30',
};

export interface AIRating {
  ticker: string;
  agent_name?: string;
  rating: RatingLabel;
  confidence?: number;
  price?: number;
  change?: number;
  change_pct?: number;
  target_price?: number;
  summary?: string;
  updated_at?: string;
  sector?: string;
  industry?: string;
}

export interface AIRatingBlock {
  ticker: string;
  rating: RatingLabel;
  confidence: number;
  target_price?: number;
  summary: string;
  strengths?: string[];
  risks?: string[];
  catalysts?: string[];
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Sentiment
// ---------------------------------------------------------------------------

export interface SentimentData {
  ticker: string;
  overall_sentiment: 'positive' | 'negative' | 'neutral' | 'bullish' | 'bearish';
  score?: number;
  sources?: {
    stocktwits?: { sentiment: string; score?: number; message_volume?: number };
    news?: { sentiment: string; score?: number };
  };
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

export const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'text-emerald-400',
  bullish:  'text-emerald-400',
  negative: 'text-red-400',
  bearish:  'text-red-400',
  neutral:  'text-slate-400',
};

export interface NewsArticle {
  id?: number;
  title: string;
  url: string;
  source?: string;
  published_at?: string;
  summary?: string;
  sentiment?: string;
  ticker?: string;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardSummary {
  stocks: Stock[];
  ratings: AIRating[];
  alerts: Alert[];
  news: NewsArticle[];
  refresh_interval?: number;
}

export type WidgetId =
  | 'ai_ratings'
  | 'news_feed'
  | 'earnings_calendar'
  | 'portfolio_chart'
  | 'price_alerts'
  | 'market_mood'
  | 'sector_breakdown'
  | 'top_movers'
  | 'sentiment_chart';

export interface DashboardLayout {
  widgets: WidgetId[];
  columns?: number;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export interface ComparisonTicker {
  ticker: string;
  color?: string;
}

export interface ComparisonSeries {
  ticker: string;
  color: string;
  candles: Array<{ time: number; close: number; pct_change: number }>;
}

export interface CompareResponse {
  tickers: string[];
  timeframe: string;
  series: ComparisonSeries[];
}

export interface ComparisonRun {
  id: string;
  tickers: string[];
  timeframe: string;
  metric: string;
  created_at: string;
}

export interface ComparisonResult {
  id: string;
  tickers: string[];
  timeframe: string;
  metric: string;
  series: ComparisonSeries[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Earnings
// ---------------------------------------------------------------------------

export interface EarningsEvent {
  ticker: string;
  name?: string;
  date: string;
  time?: 'before_open' | 'after_close' | 'during_trading' | null;
  eps_estimate?: number | null;
  eps_actual?: number | null;
  revenue_estimate?: number | null;
  revenue_actual?: number | null;
  surprise_pct?: number | null;
}

export interface EarningsResponse {
  events: EarningsEvent[];
  total?: number;
  page?: number;
  page_size?: number;
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export interface PortfolioPosition {
  id: number;
  ticker: string;
  quantity: number;
  avg_cost: number;
  currency?: string;
  notes?: string;
  current_price?: number;
  market_value?: number;
  gain_loss?: number;
  gain_loss_pct?: number;
  updated_at?: string;
}

export interface PortfolioSummary {
  total_value: number;
  total_cost: number;
  total_gain_loss: number;
  total_gain_loss_pct: number;
  positions_count: number;
  currency?: string;
}

export interface PortfolioPoint {
  date: string;
  value: number;
}

export interface PortfolioResponse {
  positions: PortfolioPosition[];
  summary: PortfolioSummary;
  history?: PortfolioPoint[];
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  ticker?: string;
}

// ---------------------------------------------------------------------------
// Research briefs
// ---------------------------------------------------------------------------

export interface KeyMetrics {
  price?: number | null;
  change_pct?: number | null;
  rsi?: number | null;
  rating?: string | null;
  score?: number | null;
  sentiment_score?: number | null;
  sentiment_label?: string | null;
  technical_score?: number | null;
  fundamental_score?: number | null;
}

export interface ResearchBrief {
  id: number;
  ticker: string;
  title: string;
  content: string;
  summary?: string | null;
  agent_name: string;
  model_used?: string;
  created_at: string;
  key_metrics?: KeyMetrics | null;
}

export interface ResearchBriefsResponse {
  data: ResearchBrief[];
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
}

export type ExportFormat = 'json' | 'csv' | 'markdown' | 'pdf' | 'zip';

export interface ExportCapabilities {
  formats: Record<string, { available: boolean }>;
}

// ---------------------------------------------------------------------------
// Watchlists
// ---------------------------------------------------------------------------

export interface Watchlist {
  id: number;
  name: string;
  created_at?: string;
  stock_count?: number;
}

// ---------------------------------------------------------------------------
// Scheduler / jobs
// ---------------------------------------------------------------------------

export interface ScheduledJob {
  id: string;
  name: string;
  trigger: string;
  trigger_args: Record<string, unknown>;
  next_run?: string | null;
  last_run?: string | null;
  last_status?: 'success' | 'failed' | null;
  paused: boolean;
}

export interface AgentRun {
  id: number;
  agent_name: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  tokens_input?: number;
  tokens_output?: number;
  estimated_cost?: number;
  error_message?: string | null;
  job_id?: string | null;
}

export interface AgentSchedule {
  id: number;
  job_id: string;
  label: string;
  description?: string;
  trigger: 'cron' | 'interval';
  trigger_args: Record<string, unknown>;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
  last_run?: string | null;
  next_run?: string | null;
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export const AGENT_STATUS_COLORS: Record<string, string> = {
  running:   'text-blue-400    bg-blue-500/10',
  completed: 'text-emerald-400 bg-emerald-500/10',
  failed:    'text-red-400     bg-red-500/10',
  idle:      'text-slate-400   bg-slate-500/10',
};

export interface Agent {
  name: string;
  label?: string;
  description?: string;
  status?: 'running' | 'idle' | 'error';
  last_run?: string | null;
}

export interface CostSummary {
  total_cost: number;
  cost_by_agent: Array<{ agent_name: string; total_cost: number; run_count: number }>;
  period_days: number;
}

// ---------------------------------------------------------------------------
// Provider rate limits
// ---------------------------------------------------------------------------

export interface ProviderRateLimit {
  provider: string;
  requests_used: number;
  requests_limit: number;
  tokens_used?: number;
  tokens_limit?: number;
  reset_at?: string;
}

export interface ProviderRateLimitsResponse {
  limits: ProviderRateLimit[];
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// UI preferences / persisted state
// ---------------------------------------------------------------------------

export interface UiPrefs {
  theme?: 'dark' | 'light' | 'system';
  sidebar_collapsed?: boolean;
  default_watchlist_id?: number;
  timezone_mode?: TimezoneMode;
  dashboard_layout?: DashboardLayout;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Performance metrics
// ---------------------------------------------------------------------------

export interface MetricsSummary {
  period_days: number;
  agents: {
    total_runs: number;
    success_runs: number;
    error_runs: number;
    success_rate: number;
    avg_duration_ms: number;
    total_cost: number;
    total_tokens: number;
  };
  jobs: {
    total_executions: number;
    success_executions: number;
    success_rate: number;
    avg_duration_ms: number;
    total_cost: number;
  };
  top_cost_agents: Array<{ agent_name: string; total_cost: number; run_count: number }>;
  error_trend: Array<{ day: string; total: number; errors: number; error_rate: number }>;
}

export interface AgentMetric {
  agent_name: string;
  total_runs: number;
  success_runs: number;
  error_runs: number;
  success_rate: number;
  avg_duration_ms: number;
  max_duration_ms: number;
  min_duration_ms: number;
  total_cost: number;
  avg_cost_per_run: number;
  total_tokens_input: number;
  total_tokens_output: number;
  last_run_at: string | null;
}

export interface AgentMetricsResponse {
  period_days: number;
  agents: AgentMetric[];
}

export interface JobMetric {
  job_id: string;
  job_name: string;
  total_executions: number;
  success_executions: number;
  success_rate: number;
  avg_duration_ms: number;
  max_duration_ms: number;
  total_cost: number;
  last_executed_at: string | null;
}

export interface JobMetricsResponse {
  period_days: number;
  jobs: JobMetric[];
}

export interface MetricsTimeseriesPoint {
  day: string;
  agent_name: string;
  value: number;
  p95_duration_ms?: number | null;
}

export interface MetricsTimeseriesResponse {
  metric: string;
  period_days: number;
  data: MetricsTimeseriesPoint[];
}

export interface SystemMetricsSnapshot {
  recorded_at: string;
  cpu_pct: number;
  mem_pct: number;
  db_pool_active: number;
  db_pool_idle: number;
}

export interface ApiEndpointMetric {
  endpoint: string;
  method: string;
  status_class: '2xx' | '4xx' | '5xx';
  call_count: number;
  p95_ms: number;
  avg_ms: number;
  last_seen: string;
}

export interface SystemMetricsResponse {
  period_days: number;
  snapshots: SystemMetricsSnapshot[];
  endpoints: ApiEndpointMetric[];
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export interface HealthProviderStatus {
  name: string;
  active: boolean;
  has_api_key: boolean;
  rate_limit_remaining: number;
  last_used: string | null;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  timestamp: string;
  services: {
    db: {
      status: string;
      latency_ms: number | null;
      wal_mode: string | null;
      file_size_mb: number | null;
      table_counts: Record<string, number> | null;
      pool: { size: number; available: number; in_use: number; timeout_s: number } | null;
      error?: string;
    };
    scheduler: { status: string; running: boolean | null; job_count: number | null };
    agent_registry: { status: string; agent_count: number | null };
    data_providers: {
      status: string;
      configured: boolean;
      providers: HealthProviderStatus[];
    };
    data_freshness: {
      prices_updated_at: string | null;
      prices_age_min: number | null;
      earnings_updated_at: string | null;
      stale: boolean;
    };
  };
  metrics: { error_log_count_1h: number; sse_client_count: number };
}

export interface HealthReadyResponse {
  ready: boolean;
  db: string;
  ts: string;
}
```