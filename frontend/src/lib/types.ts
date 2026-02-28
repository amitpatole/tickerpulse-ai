// TickerPulse AI v3.0 - Shared TypeScript Types

export type TimezoneMode = 'ET' | 'local';

// ---------------------------------------------------------------------------
// Chart / stock data types
// ---------------------------------------------------------------------------

export type Timeframe = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y' | 'All';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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

export interface NewsItem {
  title: string;
  source: string;
  published_date: string;
  url: string;
  sentiment_label: string;
  sentiment_score: number;
}

export interface StockDetail {
  quote: StockQuote;
  candles: Candle[];
  indicators: Record<string, unknown>;
  news: NewsItem[];
}

export type CompareSeriesEntry =
  | { points: { time: number; value: number }[]; current_pct: number }
  | { error: string };

export type CompareResponse = Record<string, CompareSeriesEntry>;

// ---------------------------------------------------------------------------
// Alert sound types
// ---------------------------------------------------------------------------

export type AlertSoundType = 'default' | 'chime' | 'alarm' | 'silent';

export interface AlertSoundSettings {
  enabled: boolean;
  /** Global default sound — never 'default' (that is a per-alert sentinel) */
  sound_type: Exclude<AlertSoundType, 'default'>;
  volume: number; // 0–100
  mute_when_active: boolean;
}

// ---------------------------------------------------------------------------
// SSE event types
// ---------------------------------------------------------------------------

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
  type: SSEEventType | string;
  data: Record<string, unknown>;
  timestamp?: string;
}

export interface AlertEvent {
  ticker: string;
  type: 'price_alert';
  message: string;
  severity: 'high' | 'medium' | 'low';
  alert_id: number;
  condition_type: string;
  threshold: number;
  current_price: number;
  /** Per-alert override; 'default' means use the global setting */
  sound_type: AlertSoundType;
}

export interface AgentStatusEvent {
  agent_name: string;
  status: string;
  started_at?: string;
  completed_at?: string;
}

export interface JobCompleteEvent {
  job_name: string;
  status: string;
  duration_ms?: number;
}

export interface PriceUpdateEvent {
  ticker: string;
  price: number;
  change_pct?: number;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Agent types
// ---------------------------------------------------------------------------

export interface AgentLastRun {
  id: number;
  agent_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number;
  tokens_used: number;
  estimated_cost: number;
}

export interface Agent {
  name: string;
  display_name: string;
  description: string;
  category: string;
  schedule: string | null;
  status: 'idle' | 'running' | 'success' | 'error';
  enabled: boolean;
  model: string;
  tags: string[];
  total_runs: number;
  last_run: AgentLastRun | null;
  total_cost: number;
}

export interface AgentRun {
  id: number;
  agent_name: string;
  status: string;
  output: string | null;
  duration_ms: number;
  tokens_used: number;
  estimated_cost: number;
  started_at: string;
  completed_at: string | null;
  framework: string;
}

// ---------------------------------------------------------------------------
// Cost types
// ---------------------------------------------------------------------------

export interface CostByAgent {
  display_name: string;
  runs: number;
  cost_usd: number;
  tokens_used: number;
}

export interface CostSummary {
  period: string;
  range_label: string;
  range_start: string;
  range_end: string;
  total_cost_usd: number;
  /** Normalised alias added by the API client */
  total_cost?: number;
  period_days?: number;
  /** Normalised alias for by_day */
  daily_costs?: Array<{ date: string; cost: number }>;
  total_runs: number;
  total_tokens: number;
  by_agent: Record<string, CostByAgent | number>;
  by_day: Array<{ date: string; cost: number }>;
}

// ---------------------------------------------------------------------------
// Metrics types
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

export interface AgentMetrics {
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

export interface JobMetrics {
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

export interface TimeseriesDataPoint {
  day: string;
  agent_name: string;
  value: number;
  p95_duration_ms?: number;
}

export interface SystemMetricsSnapshot {
  recorded_at: string;
  cpu_pct: number;
  mem_pct: number;
  db_pool_active: number;
  db_pool_idle: number;
}

export interface ApiEndpointMetrics {
  endpoint: string;
  method: string;
  status_class: string;
  call_count: number;
  p95_ms: number;
  avg_ms: number;
  last_seen: string;
}

export interface SystemMetricsResponse {
  period_days: number;
  snapshots: SystemMetricsSnapshot[];
  endpoints: ApiEndpointMetrics[];
}

// ---------------------------------------------------------------------------
// Settings types
// ---------------------------------------------------------------------------

export interface RefreshIntervalConfig {
  interval: number;
  source: 'db' | 'default';
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Activity types
// ---------------------------------------------------------------------------

export interface ActivityEvent {
  id: string;
  type: 'agent' | 'job' | 'error';
  name: string;
  status: string;
  cost: number;
  duration_ms: number | null;
  timestamp: string;
  summary: string | null;
}

export interface DailyCost {
  date: string;
  total_cost: number;
  run_count: number;
}

export interface ActivityTotals {
  cost: number;
  runs: number;
  errors: number;
  success_rate: number;
}

export interface ActivityFeedResponse {
  events: ActivityEvent[];
  daily_costs: DailyCost[];
  totals: ActivityTotals;
}

export type ActivityFilterType = 'all' | 'agent' | 'job' | 'error';
export type ActivityDayOption = 1 | 7 | 30;

// ---------------------------------------------------------------------------
// Dashboard layout types
// ---------------------------------------------------------------------------

export interface WidgetConfig {
  id: string;
  col: number;
  row: number;
  col_span: number;
  row_span: number;
  visible: boolean;
}

export type DashboardLayout = WidgetConfig[];

// ---------------------------------------------------------------------------
// Earnings types
// ---------------------------------------------------------------------------

export interface EarningsEvent {
  id: number;
  ticker: string;
  company: string;
  earnings_date: string; // ISO date format YYYY-MM-DD
  time_of_day?: string; // before_open, after_close, during_trading, unknown
  eps_estimate?: number;
  fiscal_quarter?: string;
  fetched_at?: string; // ISO datetime
  on_watchlist: boolean;
}

export interface EarningsWidgetResponse {
  events: EarningsEvent[];
  stale: boolean;
  as_of: string; // ISO datetime
}

// ---------------------------------------------------------------------------
// Price alert types
// ---------------------------------------------------------------------------

export type AlertConditionType = 'price_above' | 'price_below' | 'pct_change';

export interface PriceAlert {
  id: number;
  ticker: string;
  condition_type: AlertConditionType;
  threshold: number;
  enabled: boolean;
  sound_type: AlertSoundType;
  triggered_at: string | null;
  fire_count: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// API error class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  error_code: string;
  status: number;
  request_id?: string;
  retry_after?: number;

  constructor(
    message: string,
    status: number,
    error_code: string,
    options?: { request_id?: string; retry_after?: number },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.error_code = error_code;
    this.request_id = options?.request_id;
    this.retry_after = options?.retry_after;
  }
}

// ---------------------------------------------------------------------------
// API error response type (raw JSON shape from the backend)
// ---------------------------------------------------------------------------

export interface ErrorResponse {
  success: false;
  error: string;
  error_code: string;
  request_id?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AGENT_STATUS_COLORS: Record<string, string> = {
  idle: 'text-slate-400',
  running: 'text-blue-400',
  success: 'text-emerald-400',
  error: 'text-red-400',
  completed: 'text-emerald-400',
  failed: 'text-red-400',
};

// ---------------------------------------------------------------------------
// Scheduler types
// ---------------------------------------------------------------------------

export interface ScheduledJob {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  next_run: string | null;
  last_run?: string | null;
  trigger: string;
  trigger_args: Record<string, unknown>;
  timezone?: string;
}

export interface CronTrigger {
  trigger: 'cron';
  hour?: number;
  minute?: number;
  day_of_week?: string;
  second?: number;
  month?: number;
  day?: number;
}

export interface IntervalTrigger {
  trigger: 'interval';
  seconds?: number;
  minutes?: number;
  hours?: number;
  days?: number;
  weeks?: number;
}

export type ScheduleTrigger = CronTrigger | IntervalTrigger;

export interface NextRunsResponse {
  job_id: string;
  next_runs: string[];
}

export interface AgentSchedule {
  id: number;
  job_id: string;
  label: string;
  description: string | null;
  trigger: 'cron' | 'interval';
  trigger_args: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface KnownAgent {
  job_id: string;
  name: string;
  description: string;
  trigger?: string;
  enabled?: boolean;
}

export interface ScheduleFormValues {
  job_id: string;
  label: string;
  description: string;
  trigger: 'cron' | 'interval';
  trigger_args: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Stock types
// ---------------------------------------------------------------------------

export interface Stock {
  ticker: string;
  name: string;
  market: string;
  /** SQLite stores booleans as 0/1; filter with truthiness check */
  active: number | boolean;
  added_at?: string;
  current_price?: number | null;
  price_change_pct?: number | null;
}

// ---------------------------------------------------------------------------
// Alert alias (for components that import Alert instead of PriceAlert)
// ---------------------------------------------------------------------------

export type Alert = PriceAlert;

// ---------------------------------------------------------------------------
// Research brief types
// ---------------------------------------------------------------------------

export interface ResearchBrief {
  id: number;
  ticker: string;
  title: string;
  content: string;
  agent_name: string;
  model_used: string;
  created_at: string;
}

export type ExportFormat = 'zip' | 'csv' | 'markdown' | 'json' | 'pdf';

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
    markdown?: { available: boolean };
    json?: { available: boolean };
    pdf: { available: boolean };
  };
}

// ---------------------------------------------------------------------------
// Multi-model comparison types
// ---------------------------------------------------------------------------

export type ComparisonTemplate = 'custom' | 'bull_bear_thesis' | 'risk_summary' | 'price_target';

export interface ComparisonProviderRequest {
  provider: string;
  model: string;
}

export interface ComparisonResult {
  provider: string;
  model: string | null;
  rating?: 'BUY' | 'HOLD' | 'SELL' | null;
  score?: number | null;
  confidence?: number | null;
  summary?: string | null;
  tokens_used?: number | null;
  duration_ms?: number | null;
  error?: string | null;
}

/** Response from POST /api/comparison/run (202) */
export interface ComparisonRunStartResponse {
  id: string;
  status: string;
  created_at: string;
}

/** Response from GET /api/comparison/run/<id> */
export interface ComparisonRunResponse {
  id: string;
  ticker: string | null;
  status: 'pending' | 'complete' | 'error';
  template: ComparisonTemplate;
  created_at: string;
  results: ComparisonResult[];
}

/** Response from GET /api/comparison/runs */
export interface ComparisonRunsResponse {
  runs: ComparisonRunResponse[];
}

// Legacy types kept for ai_compare_bp (/api/ai/compare) compatibility
export interface ModelComparisonMarketContext {
  price: number;
  rsi: number;
  sentiment_score: number;
}

export interface ModelComparisonResponse {
  run_id: string;
  ticker: string;
  market_context: ModelComparisonMarketContext;
  results: ComparisonResult[];
}

export interface ModelComparisonRun {
  run_id: string;
  ticker: string;
  created_at: string;
  results: ComparisonResult[];
}

export interface ModelComparisonHistoryResponse {
  ticker: string;
  runs: ModelComparisonRun[];
}