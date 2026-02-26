```typescript
// ============================================================
// TickerPulse AI v3.0 - TypeScript Type Definitions
// ============================================================

export interface Stock {
  ticker: string;
  name?: string;
  active: boolean;
  added_at?: string;
}

export interface StockSearchResult {
  ticker: string;
  name: string;
  exchange: string;
  type: string;
}

export interface AIRating {
  ticker: string;
  rating: string;
  score: number;
  confidence: number;
  current_price: number;
  price_change?: number;
  price_change_pct?: number;
  rsi: number;
  sentiment_score?: number;
  sentiment_label?: string;
  technical_score?: number;
  fundamental_score?: number;
  updated_at?: string;
}

export interface Agent {
  name: string;
  display_name?: string;
  description?: string;
  role?: string;
  model?: string;
  status: string;
  enabled: boolean;
  run_count?: number;
  total_runs?: number;
  total_cost?: number;
  category?: string;
  schedule?: string;
  avg_duration_seconds?: number | null;
  last_run?: AgentRun | null;
}

export interface AgentRun {
  id?: number;
  agent_name: string;
  status: string;
  output?: string;
  duration_ms: number;
  tokens_used?: number;
  estimated_cost: number;
  started_at: string;
  completed_at?: string;
  error?: string;
}

export interface ScheduledJob {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  next_run: string | null;
  last_run?: string | null;
  trigger: string;
  trigger_args: Record<string, unknown>;
  timezone: string;
  status?: string;
}

export interface NewsArticle {
  id: number;
  ticker: string;
  title: string;
  source: string;
  sentiment_label: string;
  sentiment_score: number;
  created_at: string;
  url: string;
  summary?: string;
}

export interface Alert {
  id: number;
  ticker: string;
  type: string;
  message: string;
  severity: string;
  created_at: string;
  read?: boolean;
}

export interface CostSummary {
  total_cost?: number;
  total_cost_usd?: number;
  daily_costs?: DailyCost[];
  by_agent?: Record<string, number | { cost_usd: number; display_name: string; runs: number; tokens_used: number }>;
  period_days?: number;
  range_label?: string;
  total_runs?: number;
  total_tokens?: number;
}

export interface DailyCost {
  date: string;
  cost: number;
  runs: number;
}

export interface AIProvider {
  name: string;
  display_name: string;
  configured: boolean;
  models: string[];
  default_model?: string;
  status?: string;
  is_active?: boolean;
  id?: number;
}

export interface HealthCheck {
  status: string;
  version?: string;
  uptime?: number;
  database?: string;
  agents?: Record<string, string>;
}

export interface ResearchBrief {
  id: number;
  ticker: string;
  title: string;
  content: string;
  agent_name: string;
  created_at: string;
  model_used?: string;
}

export interface ResearchBriefsResponse {
  data: ResearchBrief[];
  page: number;
  page_size: number;
  total: number;
  has_next: boolean;
}

export interface ExportCapabilities {
  formats: {
    zip: { available: boolean };
    csv: { available: boolean };
    pdf: { available: boolean };
  };
}

export type Timeframe = '1D' | '1W' | '1M' | '3M' | '1Y' | 'All';

export type ExportFormat = 'zip' | 'csv' | 'pdf';

// Stock Detail Page Types

export interface CandleDataPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalIndicators {
  rsi: number | null;
  macd_signal: 'bullish' | 'bearish' | 'neutral';
  bb_position: 'upper' | 'mid' | 'lower';
}

export interface StockQuote {
  price: number;
  change_pct: number;
  volume: number;
  market_cap: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
  pe_ratio: number | null;
  eps: number | null;
  name: string;
  currency: string;
}

export interface StockNewsItem {
  title: string;
  source: string;
  published_date: string | null;
  url: string;
  sentiment_label: string;
  sentiment_score: number;
}

export interface StockDetail {
  quote: StockQuote;
  candles: CandleDataPoint[];
  indicators: TechnicalIndicators;
  news: StockNewsItem[];
}

export interface SentimentData {
  ticker: string;
  label: 'bullish' | 'bearish' | 'neutral';
  score: number | null;
  signal_count: number;
  sources: { news: number; reddit: number };
  updated_at: string;
  stale: boolean;
}

export interface EarningsEvent {
  id: number;
  ticker: string;
  company: string;
  earnings_date: string;
  time_of_day: 'before_open' | 'after_close' | 'during_trading' | null;
  eps_estimate: number | null;
  fiscal_quarter: string | null;
  fetched_at: string;
  on_watchlist: boolean;
}

export interface EarningsResponse {
  events: EarningsEvent[];
  stale: boolean;
  as_of: string;
}

export interface ProviderStatus {
  id: string;
  display_name: string;
  is_active: boolean;
  rate_limit_used: number;
  rate_limit_max: number;
  reset_at: string | null;
}

export interface ProviderStatusResponse {
  providers: ProviderStatus[];
}

export interface ProviderRateLimit {
  name: string;
  display_name: string;
  requests_used: number;
  requests_limit: number | null;
  window_seconds: number;
  reset_at: string | null;
  pct_used: number;
  status: 'ok' | 'warning' | 'critical' | 'unknown';
}

export interface ProviderRateLimitsResponse {
  providers: ProviderRateLimit[];
  polled_at: string;
}

// Portfolio History Types

export interface PortfolioPoint {
  date: string;  // 'YYYY-MM-DD'
  value: number; // aggregate close price sum across watchlist
}

// Sector (Rating) Breakdown Types

export interface SectorSummary {
  label: string;  // Display label, e.g. 'STRONG BUY'
  key: string;    // Raw rating key, e.g. 'STRONG_BUY'
  count: number;
  pct: number;
  color: string;
}

// Performance Comparison Types

export interface ComparisonCandle {
  time: number;
  value: number;
}

export interface ComparisonSeries {
  ticker: string;
  name: string;
  candles: ComparisonCandle[];
  delta_pct: number;
  error: string | null;
}

export interface ComparisonResult {
  timeframe: string;
  series: ComparisonSeries[];
}

// SSE Event Types
export type SSEEventType =
  | 'agent_status'
  | 'alert'
  | 'job_complete'
  | 'heartbeat'
  | 'news'
  | 'rating_update'
  | 'snapshot'
  | 'price_update';

export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
  timestamp?: string;
}

export interface AgentStatusEvent {
  agent_name: string;
  status: string;
  message?: string;
}

export interface AlertEvent {
  ticker: string;
  type: string;
  message: string;
  severity: string;
}

export interface JobCompleteEvent {
  job_id: string;
  job_name: string;
  status: string;
  duration_ms?: number;
}

export interface PriceUpdateEvent {
  ticker: string;
  price: number;
  change: number;
  change_pct: number;
  volume?: number;
  timestamp: string;
}

export interface AlertSoundSettings {
  enabled: boolean;
  sound_type: 'chime' | 'bell' | 'beep';
  volume: number;
  mute_when_active: boolean;
}

// Watchlist Group Types

export interface Watchlist {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
  stock_count: number;
}

export interface WatchlistDetail {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
  tickers: string[];
}

// Rating color mapping
export const RATING_COLORS: Record<string, string> = {
  STRONG_BUY: '#10b981',
  BUY: '#22c55e',
  HOLD: '#f59e0b',
  SELL: '#ef4444',
  STRONG_SELL: '#dc2626',
};

export const RATING_BG_CLASSES: Record<string, string> = {
  STRONG_BUY: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  BUY: 'bg-green-500/20 text-green-400 border-green-500/30',
  HOLD: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  SELL: 'bg-red-500/20 text-red-400 border-red-500/30',
  STRONG_SELL: 'bg-red-700/20 text-red-500 border-red-700/30',
};

export const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'bg-emerald-500/20 text-emerald-400',
  neutral: 'bg-slate-500/20 text-slate-400',
  negative: 'bg-red-500/20 text-red-400',
  mixed: 'bg-amber-500/20 text-amber-400',
};

export const AGENT_STATUS_COLORS: Record<string, string> = {
  idle: 'bg-emerald-500',
  running: 'bg-blue-500',
  error: 'bg-red-500',
  disabled: 'bg-slate-500',
};
```