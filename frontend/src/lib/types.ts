```typescript
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

/** AI rating block inlined into the stock detail response. */
export interface AIRatingBlock {
  rating: string;
  /** Overall AI score 0–100. */
  score: number;
  /** Confidence in the rating, 0–1 scale. */
  confidence: number;
  technical_score?: number | null;
  fundamental_score?: number | null;
  summary?: string | null;
  sentiment_label?: string | null;
  sector?: string | null;
  updated_at?: string | null;
}

export interface StockDetail {
  ticker?: string;
  quote?: StockDetailQuote;
  candles?: StockDetailCandle[];
  indicators?: StockDetailIndicators;
  news?: StockDetailNewsItem[];
  ai_rating?: AIRatingBlock | null;
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

export type Timeframe = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y' | 'All';
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

/** Discriminated union of the three supported alert condition types. */
export type AlertCondition = 'price_above' | 'price_below' | 'pct_change';

/** Per-alert sound override values; 'default' defers to global setting. */
export type AlertSoundType = 'default' | 'chime' | 'alarm' | 'silent';

export interface Alert {
  id: number;
  ticker: string;
  condition_type: AlertCondition;
  threshold: number;
  enabled: boolean;
  sound_type: string;
  triggered_at: string | null;
  /** ISO-8601 timestamp of the most recent firing; null before first fire. */
  fired_at: string | null;
  /** Total number of times this alert has fired. */
  fire_count: number;
  created_at: string;
  /** Computed by API: 'critical' | 'warning' | 'info' */
  severity: 'critical' | 'warning' | 'info';
  /** Alias for condition_type; frontend prettifies via .replace(/_/g, ' ') */
  type: string;
  /** Human-readable condition description, computed by API */
  message?: string;
}

/**
 * Canonical price alert type used in forms and direct API interactions.
 * Mirrors the Alert interface but makes sound_type a strict union.
 */
export interface PriceAlert extends Omit<Alert, 'sound_type'> {
  sound_type: 'default' | 'chime' | 'alarm' | 'silent';
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

export interface PortfolioPosition {
  id: number;
  ticker: string;
  quantity: number;
  avg_cost: number;
  currency: string;
  notes?: string | null;
  opened_at: string;
  /** Live price from ai_ratings; null if not yet refreshed. */
  current_price?: number | null;
  price_change?: number | null;
  price_change_pct?: number | null;
  /** quantity × avg_cost */
  cost_basis: number;
  /** quantity × current_price; null when current_price unavailable. */
  market_value?: number | null;
  /** market_value − cost_basis */
  pnl?: number | null;
  /** pnl / cost_basis × 100 */
  pnl_pct?: number | null;
  /** position's share of total portfolio value (%) */
  allocation_pct?: number | null;
}

export interface PortfolioSummary {
  total_value: number;
  total_cost: number;
  total_pnl?: number | null;
  total_pnl_pct?: number | null;
  position_count: number;
}

export interface PortfolioResponse {
  positions: PortfolioPosition[];
  summary: PortfolioSummary;
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
  id: number;
  ticker: string;
  company: string | null;
  earnings_date: string;
  time_of_day: 'BMO' | 'AMC' | 'TNS' | null;
  eps_estimate: number | null;
  eps_actual: number | null;
  revenue_estimate: number | null;
  revenue_actual: number | null;
  fiscal_quarter: string | null;
  fetched_at?: string | null;
  updated_at?: string | null;
  on_watchlist?: boolean;
  /** Computed surprise percentage: ((actual - estimate) / |estimate|) * 100 */
  surprise_pct?: number | null;
}

export interface EarningsResponse {
  upcoming: EarningsEvent[];
  past: EarningsEvent[];
  stale: boolean;
  as_of: string;
}

export interface TickerEarningsResponse {
  ticker: string;
  events: EarningsEvent[];
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

export interface AgentSchedule {
  id: number;
  job_id: string;
  label: string;
  description?: string | null;
  trigger: 'cron' | 'interval';
  trigger_args: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduledJob {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  next_run?: string | null;
  last_run?: string | null;
  last_run_status?: 'completed' | 'failed' | 'running' | null;
  trigger: string;
  trigger_args: Record<string, unknown>;
  timezone?: string;
}

// ---- Research ----------------------------------------------------------------

export interface KeyMetrics {
  price?: number | null;
  change_pct?: number | null;
  rsi?: number | null;
  sentiment_score?: number | null;
  sentiment_label?: string | null;
  rating?: string | null;
  score?: number | null;
  technical_score?: number | null;
  fundamental_score?: number | null;
}

export interface ResearchBrief {
  id: number;
  ticker?: string;
  title: string;
  content: string;
  /** Extracted executive summary paragraph; stripped of markdown formatting. */
  summary?: string | null;
  /** Live key metrics from ai_ratings; only present on single-brief responses. */
  key_metrics?: KeyMetrics | null;
  created_at: string;
  agent_name?: string;
  model_used?: string;
  tokens_used?: number;
}

export interface ResearchBriefsResponse {
  /** Matches the 'data' key returned by GET /api/research/briefs */
  data: ResearchBrief[];
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
}

/** Formats supported by the export endpoint. */
export type ExportFormat = 'zip' | 'csv' | 'pdf';

export interface ExportCapabilities {
  formats: {
    zip: { available: boolean };
    csv: { available: boolean };
    pdf: { available: boolean };
  };
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

// ---- App State ---------------------------------------------------------------

/**
 * Free-form key/value store for persisting UI state across restarts.
 * Each top-level key is a namespace (e.g. 'dashboard', 'sidebar'); its value
 * is a plain object whose shape is defined by the consuming component.
 */
export type AppState = Record<string, Record<string, unknown>>;

// ---- Settings ----------------------------------------------------------------

export interface RefreshIntervalConfig {
  interval: number;
  source: 'db' | 'default';
  updated_at?: string;
}

/** Persisted UI preference values returned by GET /api/settings/ui-prefs. */
export interface UiPrefs {
  sidebar_collapsed: boolean;
  selected_market: string;
  selected_watchlist_id: number | null;
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
  /** Discriminates the event kind, e.g. 'price_alert'. */
  type?: string;
  alert_id?: number;
  condition_type?: string;
  threshold?: number;
  current_price?: number;
  severity?: string;
  /** Allowlisted at the SSE consumer layer; any other value is treated as 'default'. */
  sound_type?: 'default' | 'chime' | 'alarm' | 'silent';
  /** Total number of times this alert has fired (including this event). */
  fire_count?: number;
  /** Whether this was triggered by the manual test-alert button. */
  is_test?: boolean;
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
  /** Global default sound; 'default' is not valid here — use 'chime' | 'alarm' | 'silent'. */
  sound_type: 'chime' | 'alarm' | 'silent';
  volume: number;
  mute_when_active: boolean;
}

// ---- AI Analysis (stock detail endpoint) -------------------------------------

export interface AIAnalysis {
  rating: string;
  /** Overall AI score 0–100. */
  score: number;
  /** Confidence in the rating, 0–1 scale. */
  confidence: number;
  technical_score?: number | null;
  fundamental_score?: number | null;
  summary?: string | null;
  /** Key positive factors extracted from the latest research brief. */
  key_factors: string[];
  /** Risk factors extracted from the latest research brief. */
  risks: string[];
  /** ISO-8601 timestamp of the most recent AI analysis run. */
  last_run_at?: string | null;
  sentiment_label?: string | null;
  sector?: string | null;
}

// ---- Chat --------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tickers_referenced?: string[];
  isLoading?: boolean;
}

export interface ChatMessageResponse {
  success: boolean;
  message: string;
  role: 'assistant';
  tickers_referenced?: string[];
  error?: string;
}

export interface ChatSession {
  session_id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionsResponse {
  sessions: ChatSession[];
}

// ---- Model Comparison --------------------------------------------------------

export interface ModelCompareProvider {
  provider_name: string;
  model: string;
}

export interface ModelCompareProviderListResponse {
  providers: ModelCompareProvider[];
}

export interface ModelCompareResultItem {
  provider: string;
  model: string;
  status: 'success' | 'error';
  content: string | null;
  error?: string;
  duration_ms: number;
}

export interface ModelCompareResponse {
  prompt: string;
  results: ModelCompareResultItem[];
}

// ---- Comparison Runs (DB-backed async comparison) ----------------------------

export interface ComparisonResult {
  provider_name: string;
  model: string;
  response: string | null;
  tokens_used: number;
  latency_ms: number;
  error: string | null;
}

export interface ComparisonRun {
  run_id: string;
  prompt: string;
  ticker: string | null;
  status: 'pending' | 'running' | 'complete' | 'failed';
  created_at: string;
  results: ComparisonResult[];
}

export interface ComparisonRunSummary {
  run_id: string;
  prompt: string;
  ticker: string | null;
  status: 'pending' | 'running' | 'complete' | 'failed';
  created_at: string;
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

// ---- Performance Metrics -----------------------------------------------------

export interface MetricsSummaryAgents {
  total_runs: number;
  success_runs: number;
  error_runs: number;
  success_rate: number;
  avg_duration_ms: number;
  total_cost: number;
  total_tokens: number;
}

export interface MetricsSummaryJobs {
  total_executions: number;
  success_executions: number;
  success_rate: number;
  avg_duration_ms: number;
  total_cost: number;
}

export interface MetricsTopCostAgent {
  agent_name: string;
  total_cost: number;
  run_count: number;
}

export interface MetricsErrorTrendPoint {
  day: string;
  total: number;
  errors: number;
  error_rate: number;
}

export interface MetricsSummary {
  period_days: number;
  agents: MetricsSummaryAgents;
  jobs: MetricsSummaryJobs;
  top_cost_agents: MetricsTopCostAgent[];
  error_trend: MetricsErrorTrendPoint[];
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

export interface MetricsTimeseriesPoint {
  day: string;
  agent_name: string;
  value: number;
}

export interface MetricsTimeseriesResponse {
  metric: string;
  period_days: number;
  data: MetricsTimeseriesPoint[];
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
```