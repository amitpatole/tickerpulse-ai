"""
TickerPulse AI v3.0 - Scanner Agent
Fast, cheap scanning of all monitored stocks using Haiku 4.5.
Computes technical signals, ranks by opportunity, returns scored list.
Works standalone (direct API calls) even without CrewAI.
"""

import json
import logging
import sqlite3
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from backend.agents.base import AgentConfig, AgentResult, BaseAgent
from backend.agents.tools.stock_data import StockDataFetcher
from backend.agents.tools.technical import TechnicalAnalyzer
from backend.agents.tools.news_fetcher import NewsFetcher

logger = logging.getLogger(__name__)

# Model pricing (per 1M tokens)
HAIKU_INPUT_RATE = 1.0
HAIKU_OUTPUT_RATE = 5.0

# Default config
SCANNER_CONFIG = AgentConfig(
    name="scanner",
    role="Stock Scanner",
    goal=(
        "Scan all monitored stocks, compute technical signals (RSI, MACD, MA, "
        "Bollinger Bands), and rank them by opportunity score. Identify the "
        "strongest buy/sell signals across the portfolio."
    ),
    backstory=(
        "You are a high-frequency stock scanner that rapidly evaluates hundreds "
        "of tickers using technical indicators. You are efficient, fast, and "
        "cost-effective. You focus on quantitative signals and avoid speculation."
    ),
    model="claude-haiku-4-5-20251001",
    provider="anthropic",
    max_tokens=4096,
    temperature=0.3,
    tags=["scanner", "technical", "fast"],
)


class ScannerAgent(BaseAgent):
    """Stock Scanner Agent -- scans all monitored stocks, computes
    technical signals, and ranks them by opportunity."""

    def __init__(self, config: Optional[AgentConfig] = None):
        super().__init__(config or SCANNER_CONFIG)
        self.stock_data_tool = StockDataFetcher()
        self.technical_tool = TechnicalAnalyzer()
        self.news_tool = NewsFetcher()

    def execute(self, inputs: Dict[str, Any] = None) -> AgentResult:
        """Scan all active stocks and produce a ranked opportunity list.

        inputs (optional):
            tickers: list[str] -- override the list of tickers to scan
            period: str -- technical analysis period (default '3mo')
            top_n: int -- number of top results to return (default 10)
            ai_summary: bool -- whether to call the configured AI provider (default True)
        """
        inputs = inputs or {}
        period = inputs.get("period", "3mo")
        top_n = inputs.get("top_n", 10)
        ai_summary_enabled = inputs.get("ai_summary", True)

        # 1. Get list of tickers to scan
        tickers = inputs.get("tickers")
        if not tickers:
            tickers = self._get_active_stocks()

        if not tickers:
            return AgentResult(
                agent_name=self.name,
                framework="native",
                status="success",
                output="No active stocks to scan. Add stocks via the dashboard.",
                metadata={"scanned": 0},
            )

        logger.info(f"Scanner agent: scanning {len(tickers)} stocks with period={period}")

        # 2. For each stock, fetch technical data and score
        scan_results: List[Dict[str, Any]] = []
        errors: List[str] = []
        total_tokens_in = 0
        total_tokens_out = 0

        for ticker in tickers:
            try:
                result = self._scan_single(ticker, period)
                if result:
                    scan_results.append(result)
            except Exception as e:
                errors.append(f"{ticker}: {str(e)}")
                logger.warning(f"Scanner: error scanning {ticker}: {e}")

        # 3. Score and rank
        for sr in scan_results:
            sr["opportunity_score"] = self._compute_opportunity_score(sr)

        scan_results.sort(key=lambda x: x["opportunity_score"], reverse=True)

        top_results = scan_results[:top_n]

        # 4. Use AI to summarize the scan (optional -- only if API key present)
        ai_summary = ""
        try:
            if ai_summary_enabled:
                ai_summary, tokens_in, tokens_out = self._generate_ai_summary(top_results, len(tickers))
                total_tokens_in += tokens_in
                total_tokens_out += tokens_out
            else:
                ai_summary = self._generate_fallback_summary(top_results, len(tickers))
        except Exception as e:
            logger.warning(f"Scanner AI summary failed (non-critical): {e}")
            ai_summary = self._generate_fallback_summary(top_results, len(tickers))

        estimated_cost = (
            (total_tokens_in / 1_000_000 * HAIKU_INPUT_RATE)
            + (total_tokens_out / 1_000_000 * HAIKU_OUTPUT_RATE)
        )

        # 5. Build output
        output_text = ai_summary + "\n\n## Ranked Opportunities\n\n"
        for i, sr in enumerate(top_results, 1):
            output_text += (
                f"{i}. **{sr['ticker']}** -- Score: {sr['opportunity_score']:.1f} | "
                f"Price: ${sr.get('current_price', 'N/A')} | "
                f"RSI: {sr.get('rsi', 'N/A')} | "
                f"Signal: {sr.get('overall_signal', 'N/A')}\n"
            )

        return AgentResult(
            agent_name=self.name,
            framework="native",
            status="success",
            output=output_text,
            raw_output={"top_results": top_results, "all_results": scan_results},
            tokens_input=total_tokens_in,
            tokens_output=total_tokens_out,
            estimated_cost=round(estimated_cost, 6),
            metadata={
                "scanned": len(scan_results),
                "errors": len(errors),
                "top_n": top_n,
                "period": period,
                "error_details": errors[:10],
            },
        )

    # ------------------------------------------------------------------
    # Internal methods
    # ------------------------------------------------------------------

    def _get_active_stocks(self) -> List[str]:
        """Fetch active tickers from the database."""
        try:
            from backend.config import Config
            db_path = Config.DB_PATH
        except ImportError:
            db_path = "stock_news.db"

        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT ticker FROM stocks WHERE active = 1 ORDER BY ticker")
            tickers = [row["ticker"] for row in cursor.fetchall()]
            conn.close()
            return tickers
        except Exception as e:
            logger.warning(f"Scanner: could not read active stocks: {e}")
            return []

    def _scan_single(self, ticker: str, period: str) -> Optional[Dict[str, Any]]:
        """Scan a single ticker and return raw indicator data."""
        # Get technical analysis
        tech_data = self.technical_tool.analyze_ticker(ticker, period, "rsi,macd,ma,bollinger,stochastic")

        if "error" in tech_data:
            logger.debug(f"Scanner: tech analysis error for {ticker}: {tech_data['error']}")
            return None

        indicators = tech_data.get("indicators", {})

        result = {
            "ticker": ticker,
            "current_price": tech_data.get("current_price", 0),
            "data_points": tech_data.get("data_points", 0),
            "overall_signal": tech_data.get("overall_signal", "neutral"),
            "bullish_count": tech_data.get("bullish_indicators", 0),
            "bearish_count": tech_data.get("bearish_indicators", 0),
        }

        # Extract individual indicator values
        rsi_data = indicators.get("rsi", {})
        result["rsi"] = rsi_data.get("value", 50)
        result["rsi_signal"] = rsi_data.get("signal", "neutral")

        macd_data = indicators.get("macd", {})
        result["macd_trend"] = macd_data.get("trend", "neutral")
        result["macd_histogram"] = macd_data.get("histogram", 0)

        bollinger = indicators.get("bollinger_bands", {})
        result["bollinger_signal"] = bollinger.get("signal", "neutral")
        result["bollinger_percent_b"] = bollinger.get("percent_b", 0.5)

        stochastic = indicators.get("stochastic", {})
        result["stochastic_k"] = stochastic.get("percent_k", 50)
        result["stochastic_signal"] = stochastic.get("signal", "neutral")

        # Moving averages
        ma_data = indicators.get("moving_averages", {})
        ma_bullish = sum(1 for v in ma_data.values() if isinstance(v, dict) and v.get("signal") == "bullish")
        ma_bearish = sum(1 for v in ma_data.values() if isinstance(v, dict) and v.get("signal") == "bearish")
        result["ma_bullish"] = ma_bullish
        result["ma_bearish"] = ma_bearish

        return result

    def _compute_opportunity_score(self, scan_data: Dict[str, Any]) -> float:
        """Compute a 0-100 opportunity score from scan data."""
        score = 50.0  # Neutral baseline

        # RSI scoring
        rsi = scan_data.get("rsi", 50)
        if rsi < 30:
            score += 15  # Oversold = opportunity
        elif rsi < 40:
            score += 8
        elif rsi > 70:
            score -= 10  # Overbought = risk
        elif rsi > 60:
            score -= 3

        # MACD trend
        if scan_data.get("macd_trend") == "bullish":
            score += 10
        elif scan_data.get("macd_trend") == "bearish":
            score -= 8

        # MACD histogram momentum
        hist = scan_data.get("macd_histogram", 0)
        if hist > 0:
            score += min(5, hist * 100)
        elif hist < 0:
            score -= min(5, abs(hist) * 100)

        # Moving averages
        ma_bull = scan_data.get("ma_bullish", 0)
        ma_bear = scan_data.get("ma_bearish", 0)
        score += (ma_bull - ma_bear) * 5

        # Bollinger Bands
        bb_signal = scan_data.get("bollinger_signal", "neutral")
        if bb_signal == "oversold":
            score += 10
        elif bb_signal == "lower_zone":
            score += 5
        elif bb_signal == "overbought":
            score -= 8
        elif bb_signal == "upper_zone":
            score -= 3

        # Stochastic
        stoch_signal = scan_data.get("stochastic_signal", "neutral")
        if stoch_signal == "oversold":
            score += 8
        elif stoch_signal == "bullish_crossover":
            score += 5
        elif stoch_signal == "overbought":
            score -= 6
        elif stoch_signal == "bearish_crossover":
            score -= 4

        return max(0, min(100, score))

    def _generate_ai_summary(self, top_results: List[Dict], total_scanned: int) -> tuple:
        """Generate an AI-powered summary using the configured AI provider.
        Returns (summary_text, tokens_in, tokens_out)."""
        from backend.agents.ai_provider_resolver import resolve_agent_ai_provider

        resolved = resolve_agent_ai_provider(self.config)
        if not resolved:
            return self._generate_fallback_summary(top_results, total_scanned), 0, 0

        provider, _model = resolved

        # Build prompt
        top_lines = []
        for sr in top_results[:10]:
            top_lines.append(
                f"- {sr['ticker']}: Score={sr['opportunity_score']:.1f}, "
                f"RSI={sr.get('rsi', 'N/A')}, MACD={sr.get('macd_trend', 'N/A')}, "
                f"Overall={sr.get('overall_signal', 'N/A')}"
            )

        prompt = f"""You are a stock scanner summarizer. Analyze these scan results and provide a brief market overview.

Scanned {total_scanned} stocks. Top opportunities:
{chr(10).join(top_lines)}

Provide a 3-4 sentence summary covering:
1. Overall market tone based on these signals
2. Which stocks show strongest buy signals and why
3. Any stocks showing warning signs
Keep it factual and concise."""

        response = provider.generate_analysis(prompt, max_tokens=300)

        if response and not response.startswith("Error:"):
            # Estimate tokens
            tokens_in = len(prompt) // 4
            tokens_out = len(response) // 4
            return f"## AI Scanner Summary\n\n{response}", tokens_in, tokens_out

        return self._generate_fallback_summary(top_results, total_scanned), 0, 0

    def _generate_fallback_summary(self, top_results: List[Dict], total_scanned: int) -> str:
        """Generate a simple text summary without AI."""
        if not top_results:
            return f"## Scanner Summary\n\nScanned {total_scanned} stocks. No actionable signals found."

        bullish = [r for r in top_results if r.get("overall_signal") == "bullish"]
        bearish = [r for r in top_results if r.get("overall_signal") == "bearish"]

        summary = f"## Scanner Summary\n\nScanned {total_scanned} stocks. "
        summary += f"Top {len(top_results)} ranked by opportunity score.\n"

        if bullish:
            summary += f"\nBullish signals: {', '.join(r['ticker'] for r in bullish[:5])}"
        if bearish:
            summary += f"\nBearish signals: {', '.join(r['ticker'] for r in bearish[:5])}"

        best = top_results[0]
        summary += (
            f"\n\nTop pick: **{best['ticker']}** with opportunity score "
            f"{best['opportunity_score']:.1f}/100 (RSI: {best.get('rsi', 'N/A')})"
        )

        return summary
