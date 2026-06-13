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
  total_tokens_input?: number;
  total_tokens_output?: number;
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
}

export interface HealthCheck {
  status: string;
  version?: string;
  uptime?: number;
  database?: string;
  agents?: Record<string, string>;
}

export interface AIInfraItem {
  source: string;
  score: number;
  title: string;
  url?: string;
  metadata: {
    gpu?: string;
    date?: string;
    median_usd_per_gpu_hr?: number;
    offers?: number;
    price_change_7d_pct?: number;
    price_change_30d_pct?: number;
    offer_change_7d?: number;
    offer_change_30d?: number;
    price_read_7d?: string;
    price_read_30d?: string;
    related_tickers?: string[];
  };
}

export interface AIInfraUpdate {
  source_status: string;
  report_timestamp_utc?: string;
  report_path?: string;
  summary?: string[];
  items: AIInfraItem[];
  errors?: { message: string }[];
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

// SSE Event Types
export type SSEEventType = 'agent_status' | 'alert' | 'job_complete' | 'heartbeat' | 'news' | 'rating_update';

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
