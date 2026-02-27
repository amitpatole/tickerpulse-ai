// ---- AI Ratings ---------------------------------------------------------------

export interface AIRating {
  ticker: string;
  rating: string;
  score: number;
  confidence: number;
  current_price?: number | null;
  price_change?: number | null;
  price_change_pct?: number | null;
  rsi: number;
  sentiment_score?: number | null;
  sentiment_label?: string | null;
  technical_score?: number | null;
  fundamental_score?: number | null;
  sector?: string | null;
  updated_at?: string | null;
}

// ---- Stocks ------------------------------------------------------------------

export interface Stock {
  id?: number;
  ticker: string;
  name: string;
  active?: boolean;
  market?: string;
}

export interface StockSearchResult {
  ticker: string;
  name: string;
  exchange?: string;
  market?: string;
  type?: string;
}

export interface StockDetailQuote {
  price: number;
  change_pct: number;
  volume: number;
  market_cap?: number | null;
  week_52_high?: number | null;
  week_52_low?: number | null;
  pe_ratio?: number | null;
  eps?: number | null;
  dividend_yield?: number | null;
  beta?: number | null;
  avg_volume?: number | null;
  book_value?: number | null;
  name: string;
  currency: string;
}

export interface StockDetailCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockDetailIndicators {
  rsi: number | null;
  macd_signal: 'bullish' | 'bearish' | 'neutral';
  bb_position: 'upper' | 'lower' | 'mid';
}

export interface StockDetailNewsItem {
  title: string;
  source?: string | null;
  published_date?: string | null;
  url?: string | null;
  sentiment_label?: string | null;
  sentiment_score?: number | null;
}

export interface StockDetail {
  ticker?: string;
  quote?: StockDetailQuote;
  candles?: StockDetailCandle[];
  indicators?: StockDetailIndicators;
  news?: StockDetailNewsItem[];
  // Legacy fields for backward compatibility
  name?: string;
  current_price?: number | null;
  price_change?: number | null;
  price_change_pct?: number | null;
  volume?: number | null;
  market_cap?: number | null;
  pe_ratio?: number | null;
  description?: string;
  chart_data?: Array<{ date: string; price: number; volume?: number }>;
}

export type Timeframe = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y';
export type TimezoneMode = 'local' | 'market';

// ---- Comparison --------------------------------------------------------------

export interface CompareEntry {
  points: { time: number; value: number }[];
  current_pct: number;
}

export interface CompareEntryError {
  error: string;
}

export type CompareResult = Record<string, CompareEntry | CompareEntryError>;

export interface CompareResponse {
  tickers: string[];
  data: Record<string, Array<{ date: string; price: number; normalized?: number }>>;
}

export interface ComparisonSeries {
  ticker: string;
  candles: Array<{ time: number; value: number }>;
  delta_pct: number;
  error?: string | null;
}

export interface ComparisonTicker {
  ticker: string;
  name: string;
  error: string | null;
}

// ---- Alerts ------------------------------------------------------------------

export interface Alert {
  id: number;
  ticker: string;
  condition_type: 'price_above' | 'price_below' | 'pct_change';
  threshold: number;
  enabled: boolean;
  sound_type: string;
  triggered_at: string | null;
  created_at: string;
  /** Computed by API: 'critical' | 'warning' | 'info' */
  severity: 'critical' | 'warning' | 'info';
  /** Alias for condition_type; frontend prettifies via .replace(/_/g, ' ') */
  type: string;
  /** Human-readable condition description, computed by API */
  message?: string;
}

// ---- News --------------------------------------------------------------------

export interface NewsArticle {
  id: number;
  ticker: string;
  title: string;
  description?: string;
  url?: string;
  source?: string;
  published_date?: string;
  sentiment_score?: number | null;
  sentiment_label?: string | null;
  engagement_score?: number;
  created_at: string;
}

// ---- Agents ------------------------------------------------------------------

export interface Agent {
  id?: number;
  name: string;
  role?: string;
  status: 'idle' | 'running' | 'success' | 'error';
  framework?: string;
  model?: string;
  last_run?: string | null;
  run_count?: number;
  enabled?: boolean;
  tags?: string[];
}

export interface AgentRun {
  id?: number;
  agent_name: string;
  framework?: string;
  status: string;
  output?: string;
  error?: string | null;
  duration_ms?: number;
  tokens_input?: number;
  tokens_output?: number;
  estimated_cost?: number;
  started_at?: string;
  completed_at?: string;
}

export interface CostSummary {
  total_cost: number;
  total_tokens_input: number;
  total_tokens_output: number;
  total_runs: number;
  period_days?: number;
}

// ---- Portfolio ---------------------------------------------------------------

export interface PortfolioPoint {
  date: string;
  value: number;
  change?: number;
  change_pct?: number;
}

// ---- Sector ------------------------------------------------------------------

export interface SectorSummary {
  sector: string;
  count: number;
  avg_score: number;
  avg_change_pct: number;
}

// ---- Earnings ----------------------------------------------------------------

export interface EarningsEvent {
  ticker: string;
  company?: string;
  date: string;
  estimate?: number | null;
  actual?: number | null;
  surprise?: number | null;
  time?: string;
  id?: number;
  earnings_date?: string;
  time_of_day?: string;
  eps_estimate?: number | null;
  fiscal_quarter?: string;
  fetched_at?: string;
  on_watchlist?: boolean;
}

export interface EarningsResponse {
  events: EarningsEvent[];
  stale: boolean;
  as_of: string;
}

// ---- Provider Rate Limits ----------------------------------------------------

export interface ProviderRateLimit {
  provider: string;
  used: number;
  limit: number;
  reset_at?: string;
  pct_used: number;
}

export interface ProviderRateLimitsResponse {
  providers: ProviderRateLimit[];
  updated_at: string;
}

export interface ProviderStatusResponse {
  providers: Record<string, {
    name: string;
    status: 'active' | 'degraded' | 'down';
    last_check?: string;
    error?: string;
  }>;
  updated_at: string;
}

// ---- AI Provider Settings ----------------------------------------------------

export interface AIProvider {
  name: string;
  enabled: boolean;
  api_key_set?: boolean;
  models?: string[];
  default_model?: string;
}

// ---- Watchlists --------------------------------------------------------------

export interface Watchlist {
  id: number;
  name: string;
  sort_order?: number;
  position?: number;
  stock_count?: number;
  created_at?: string;
}

export interface WatchlistStock {
  watchlist_id: number;
  ticker: string;
  sort_order: number;
}

export interface WatchlistDetail {
  id: number;
  name: string;
  tickers: string[];
  stocks: Stock[];
  sort_order?: number;
  created_at?: string;
}

// ---- Sentiment ---------------------------------------------------------------

export interface SentimentData {
  ticker: string;
  score: number | null;
  label: 'bullish' | 'bearish' | 'neutral';
  signal_count: number;
  sources: {
    news: number;
    reddit: number;
  };
  stale?: boolean;
  updated_at: string;
}

// ---- Scheduler ---------------------------------------------------------------

export interface ScheduledJob {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  next_run?: string | null;
  trigger: string;
  trigger_args: Record<string, unknown>;
}

// ---- Research ----------------------------------------------------------------

export interface ResearchBrief {
  id: number;
  ticker?: string;
  title: string;
  content: string;
  summary?: string;
  created_at: string;
  updated_at?: string;
  agent_name?: string;
  model?: string;
  tokens_used?: number;
  format?: string;
}

export interface ResearchBriefsResponse {
  briefs: ResearchBrief[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export type ExportFormat = 'pdf' | 'docx' | 'html' | 'markdown';

export interface ExportCapabilities {
  formats: Array<{
    format: ExportFormat;
    label: string;
    available: boolean;
    requires?: string;
  }>;
}

// ---- Dashboard Summary -------------------------------------------------------

export interface DashboardSummary {
  stock_count: number;
  active_stock_count: number;
  active_alert_count: number;
  market_regime: string;
  agent_status: {
    total: number;
    running: number;
    idle: number;
    error: number;
  };
  timestamp: string;
}

// ---- Settings ----------------------------------------------------------------

export interface RefreshIntervalConfig {
  interval: number;
  source: 'db' | 'default';
  updated_at?: string;
}

// ---- Health ------------------------------------------------------------------

export interface HealthCheck {
  status: 'ok' | 'healthy' | 'degraded' | 'down';
  timestamp: string;
  version?: string;
  /** Per-subsystem statuses added in v3.0 */
  db?: 'ok' | 'error';
  scheduler?: 'ok' | 'error';
  services?: Record<string, string>;
}

// ---- SSE event types ---------------------------------------------------------

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
  data: unknown;
  timestamp: string;
}

export interface AgentStatusEvent {
  agent_name: string;
  status: 'idle' | 'running' | 'success' | 'error';
  message?: string;
  progress?: number;
}

export interface AlertEvent {
  id?: number;
  ticker: string;
  message: string;
  alert_id?: number;
  condition_type?: string;
  threshold?: number;
  current_price?: number;
  severity?: string;
  sound_type?: string;
  created_at?: string;
}

export interface JobCompleteEvent {
  job_id: string;
  job_name: string;
  status: 'success' | 'error';
  message?: string;
  duration_ms?: number;
}

export interface PriceUpdateEvent {
  ticker: string;
  price: number;
  change: number;
  change_pct: number;
  timestamp?: string;
}

export interface PriceUpdate {
  type: 'price_update';
  ticker: string;
  price: number;
  change: number;
  change_pct: number;
  volume: number;
  timestamp: string;
}

export interface AlertSoundSettings {
  enabled: boolean;
  sound_type: string;
  volume: number;
  mute_when_active: boolean;
}

// ---- Color maps (runtime constants) ------------------------------------------

export const RATING_BG_CLASSES: Record<string, string> = {
  strong_buy: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  buy: 'bg-green-500/20 text-green-400 border-green-500/30',
  hold: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  sell: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  strong_sell: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export const RATING_COLORS: Record<string, string> = {
  strong_buy: 'text-emerald-400',
  buy: 'text-green-400',
  hold: 'text-amber-400',
  sell: 'text-orange-400',
  strong_sell: 'text-red-400',
};

export const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'text-emerald-400',
  negative: 'text-red-400',
  neutral: 'text-slate-400',
};

export const AGENT_STATUS_COLORS: Record<string, string> = {
  idle: 'text-slate-400 bg-slate-500/20',
  running: 'text-blue-400 bg-blue-500/20',
  success: 'text-emerald-400 bg-emerald-500/20',
  error: 'text-red-400 bg-red-500/20',
};