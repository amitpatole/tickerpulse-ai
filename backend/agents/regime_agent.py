"""
TickerPulse AI v3.0 - Market Regime Agent
Classifies overall market regime (risk-on / risk-off / transitioning)
using VIX, S&P 500, 10Y Treasury, and Dollar Index data.
Uses Sonnet 4.5 for deep reasoning.
"""

import json
import logging
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from backend.agents.base import AgentConfig, AgentResult, BaseAgent
from backend.agents.tools.stock_data import StockDataFetcher
from backend.agents.tools.technical import TechnicalAnalyzer

logger = logging.getLogger(__name__)

# Model pricing (per 1M tokens)
SONNET_INPUT_RATE = 3.0
SONNET_OUTPUT_RATE = 15.0

# Market regime benchmarks
REGIME_TICKERS = {
    "vix": "^VIX",        # CBOE Volatility Index
    "sp500": "^GSPC",     # S&P 500
    "treasury_10y": "^TNX",  # 10-Year Treasury Yield
    "dollar_index": "DX-Y.NYB",  # US Dollar Index
}

# Default config
REGIME_CONFIG = AgentConfig(
    name="regime",
    role="Market Regime Analyst",
    goal=(
        "Classify the overall market regime as risk-on, risk-off, or transitioning. "
        "Analyze cross-asset signals from VIX, S&P 500, Treasury yields, and the "
        "Dollar Index to determine the current market environment."
    ),
    backstory=(
        "You are a macro strategist specializing in regime detection. You've spent "
        "20 years at a global macro hedge fund analyzing cross-asset correlations "
        "to determine market regimes. You understand that the interplay between "
        "volatility (VIX), equities (S&P 500), rates (10Y Treasury), and the dollar "
        "tells a coherent story about risk appetite."
    ),
    model="claude-sonnet-4-5-20250929",
    provider="anthropic",
    max_tokens=4096,
    temperature=0.4,
    tags=["regime", "macro", "cross-asset"],
)


class RegimeAgent(BaseAgent):
    """Market Regime Agent -- classifies the current market environment."""

    def __init__(self, config: Optional[AgentConfig] = None):
        super().__init__(config or REGIME_CONFIG)
        self.stock_data_tool = StockDataFetcher()
        self.technical_tool = TechnicalAnalyzer()

    def execute(self, inputs: Dict[str, Any] = None) -> AgentResult:
        """Classify the current market regime.

        inputs (optional):
            period: str -- analysis period (default '3mo')
        """
        inputs = inputs or {}
        period = inputs.get("period", "3mo")

        logger.info("Regime agent: analyzing market regime")

        # 1. Fetch data for all benchmark instruments
        regime_data = self._gather_regime_data(period)

        # 2. Compute regime classification
        classification = self._classify_regime(regime_data)

        # 3. Generate AI analysis
        total_tokens_in = 0
        total_tokens_out = 0

        analysis, tokens_in, tokens_out = self._generate_regime_analysis(
            regime_data, classification
        )
        total_tokens_in += tokens_in
        total_tokens_out += tokens_out

        estimated_cost = (
            (total_tokens_in / 1_000_000 * SONNET_INPUT_RATE)
            + (total_tokens_out / 1_000_000 * SONNET_OUTPUT_RATE)
        )

        output_text = f"# Market Regime Analysis\n\n"
        output_text += f"**Regime: {classification['regime'].upper()}**\n"
        output_text += f"**Confidence: {classification['confidence']:.0f}%**\n\n"
        output_text += analysis

        return AgentResult(
            agent_name=self.name,
            framework="native",
            status="success",
            output=output_text,
            raw_output={
                "classification": classification,
                "regime_data": regime_data,
            },
            tokens_input=total_tokens_in,
            tokens_output=total_tokens_out,
            estimated_cost=round(estimated_cost, 6),
            metadata={
                "regime": classification["regime"],
                "confidence": classification["confidence"],
                "period": period,
                "instruments_analyzed": list(REGIME_TICKERS.keys()),
            },
        )

    # ------------------------------------------------------------------
    # Data gathering
    # ------------------------------------------------------------------

    def _gather_regime_data(self, period: str) -> Dict[str, Any]:
        """Fetch price and technical data for all regime benchmark instruments."""
        data = {}

        for label, ticker in REGIME_TICKERS.items():
            entry: Dict[str, Any] = {"ticker": ticker, "label": label}

            # Get quote
            try:
                quote = self.stock_data_tool.get_current_quote(ticker)
                if not quote.get("error"):
                    entry["price"] = quote.get("price")
                    entry["change"] = quote.get("change")
                    entry["change_percent"] = quote.get("change_percent")
                else:
                    entry["price"] = None
                    entry["quote_error"] = quote.get("error")
            except Exception as e:
                entry["price"] = None
                entry["quote_error"] = str(e)

            # Get technical analysis
            try:
                tech = self.technical_tool.analyze_ticker(ticker, period, "rsi,macd,ma,bollinger")
                if not tech.get("error"):
                    entry["technical"] = tech
                else:
                    entry["tech_error"] = tech.get("error")
            except Exception as e:
                entry["tech_error"] = str(e)

            # Get historical data for trend
            try:
                hist = self.stock_data_tool.get_historical_prices(ticker, period)
                if not hist.get("error"):
                    entry["period_change_pct"] = hist.get("period_change_pct", 0)
                    entry["high_of_period"] = hist.get("high_of_period")
                    entry["low_of_period"] = hist.get("low_of_period")
            except Exception as e:
                logger.debug(f"Regime: history error for {ticker}: {e}")

            data[label] = entry

        return data

    # ------------------------------------------------------------------
    # Regime classification (rule-based)
    # ------------------------------------------------------------------

    def _classify_regime(self, regime_data: Dict[str, Any]) -> Dict[str, Any]:
        """Classify market regime using rule-based logic on cross-asset signals."""
        signals: Dict[str, str] = {}
        score = 0  # Positive = risk-on, Negative = risk-off

        # --- VIX analysis ---
        vix = regime_data.get("vix", {})
        vix_price = vix.get("price")
        if vix_price is not None:
            if vix_price < 15:
                signals["vix"] = "low_volatility (risk-on)"
                score += 2
            elif vix_price < 20:
                signals["vix"] = "normal_volatility (neutral)"
                score += 1
            elif vix_price < 25:
                signals["vix"] = "elevated_volatility (caution)"
                score -= 1
            elif vix_price < 30:
                signals["vix"] = "high_volatility (risk-off)"
                score -= 2
            else:
                signals["vix"] = "extreme_volatility (risk-off)"
                score -= 3

            # VIX trend
            vix_change = vix.get("period_change_pct", 0)
            if vix_change > 20:
                signals["vix_trend"] = "rising sharply (risk-off)"
                score -= 1
            elif vix_change < -20:
                signals["vix_trend"] = "falling sharply (risk-on)"
                score += 1

        # --- S&P 500 analysis ---
        sp = regime_data.get("sp500", {})
        sp_tech = sp.get("technical", {})
        sp_indicators = sp_tech.get("indicators", {})

        sp_overall = sp_tech.get("overall_signal", "neutral")
        if sp_overall == "bullish":
            signals["sp500_technical"] = "bullish (risk-on)"
            score += 2
        elif sp_overall == "bearish":
            signals["sp500_technical"] = "bearish (risk-off)"
            score -= 2
        else:
            signals["sp500_technical"] = "neutral"

        sp_rsi = sp_indicators.get("rsi", {}).get("value", 50)
        if sp_rsi > 70:
            signals["sp500_rsi"] = f"overbought ({sp_rsi:.0f})"
            score -= 1  # Overbought can signal reversal
        elif sp_rsi < 30:
            signals["sp500_rsi"] = f"oversold ({sp_rsi:.0f})"
            score -= 1  # Oversold = fear

        sp_change = sp.get("period_change_pct", 0)
        if sp_change > 5:
            signals["sp500_momentum"] = f"strong uptrend ({sp_change:.1f}%)"
            score += 1
        elif sp_change < -5:
            signals["sp500_momentum"] = f"strong downtrend ({sp_change:.1f}%)"
            score -= 1

        # --- 10Y Treasury analysis ---
        tnx = regime_data.get("treasury_10y", {})
        tnx_price = tnx.get("price")
        if tnx_price is not None:
            if tnx_price > 4.5:
                signals["treasury_10y"] = f"high yield ({tnx_price:.2f}%) -- tightening"
                score -= 1
            elif tnx_price < 3.0:
                signals["treasury_10y"] = f"low yield ({tnx_price:.2f}%) -- flight to safety"
                score -= 1
            else:
                signals["treasury_10y"] = f"normal yield ({tnx_price:.2f}%)"

            tnx_change = tnx.get("period_change_pct", 0)
            if tnx_change > 10:
                signals["treasury_trend"] = "yields rising sharply (risk-off)"
                score -= 1
            elif tnx_change < -10:
                signals["treasury_trend"] = "yields falling sharply (flight to safety)"
                score -= 1

        # --- Dollar Index analysis ---
        dxy = regime_data.get("dollar_index", {})
        dxy_tech = dxy.get("technical", {})
        dxy_overall = dxy_tech.get("overall_signal", "neutral")

        if dxy_overall == "bullish":
            signals["dollar"] = "strong dollar (risk-off)"
            score -= 1
        elif dxy_overall == "bearish":
            signals["dollar"] = "weak dollar (risk-on)"
            score += 1
        else:
            signals["dollar"] = "neutral dollar"

        # --- Final classification ---
        if score >= 3:
            regime = "risk-on"
            confidence = min(95, 60 + score * 5)
        elif score <= -3:
            regime = "risk-off"
            confidence = min(95, 60 + abs(score) * 5)
        elif score >= 1:
            regime = "transitioning (leaning risk-on)"
            confidence = 40 + score * 5
        elif score <= -1:
            regime = "transitioning (leaning risk-off)"
            confidence = 40 + abs(score) * 5
        else:
            regime = "transitioning"
            confidence = 35

        return {
            "regime": regime,
            "score": score,
            "confidence": confidence,
            "signals": signals,
        }

    # ------------------------------------------------------------------
    # AI analysis generation
    # ------------------------------------------------------------------

    def _generate_regime_analysis(self, regime_data: Dict[str, Any],
                                  classification: Dict[str, Any]) -> tuple:
        """Generate AI-powered regime analysis.
        Returns (analysis_text, tokens_in, tokens_out)."""

        context = self._build_context(regime_data, classification)

        # Try AI generation
        from backend.agents.ai_provider_resolver import resolve_agent_ai_provider
        resolved = resolve_agent_ai_provider(self.config)

        if resolved:
            try:
                provider, _model = resolved
                prompt = self._build_prompt(context, classification)
                response = provider.generate_analysis(prompt, max_tokens=self.config.max_tokens)

                if response and not response.startswith("Error:"):
                    tokens_in = len(prompt) // 4
                    tokens_out = len(response) // 4
                    return response, tokens_in, tokens_out
            except Exception as e:
                logger.warning(f"Regime: AI analysis failed: {e}")

        # Fallback
        return self._build_fallback_analysis(regime_data, classification), 0, 0

    def _build_context(self, regime_data: Dict[str, Any],
                       classification: Dict[str, Any]) -> str:
        """Build context string for the AI prompt."""
        lines = []

        for label, data in regime_data.items():
            price = data.get("price", "N/A")
            change_pct = data.get("period_change_pct", "N/A")
            tech = data.get("technical", {})
            overall = tech.get("overall_signal", "N/A")
            rsi = tech.get("indicators", {}).get("rsi", {}).get("value", "N/A")
            macd_trend = tech.get("indicators", {}).get("macd", {}).get("trend", "N/A")

            lines.append(
                f"{label.upper()} ({data.get('ticker', '')}):\n"
                f"  Price: {price} | Period change: {change_pct}%\n"
                f"  Technical: {overall} | RSI: {rsi} | MACD: {macd_trend}"
            )

        lines.append(f"\nREGIME CLASSIFICATION: {classification['regime']} (score={classification['score']}, confidence={classification['confidence']}%)")
        lines.append(f"SIGNALS: {json.dumps(classification['signals'], indent=2)}")

        return "\n".join(lines)

    def _build_prompt(self, context: str, classification: Dict[str, Any]) -> str:
        """Build the AI prompt."""
        return f"""You are a macro strategist analyzing cross-asset signals to determine the current market regime.

DATA:
{context}

Based on this data, provide a concise analysis covering:

## Cross-Asset Analysis
Explain the interplay between VIX, S&P 500, Treasury yields, and the Dollar Index.
What story are they telling together?

## Regime Assessment
Confirm or challenge the "{classification['regime']}" classification.
Is it consistent with the data? What's the probability of regime shift?

## Implications for Portfolio
What does this regime mean for equity positioning?
Should investors be adding risk, reducing risk, or staying neutral?

## Key Levels to Watch
What price levels in each instrument would signal a regime change?

Be specific with numbers. Keep it under 400 words."""

    def _build_fallback_analysis(self, regime_data: Dict[str, Any],
                                 classification: Dict[str, Any]) -> str:
        """Generate analysis without AI."""
        signals = classification.get("signals", {})
        regime = classification["regime"]
        score = classification["score"]

        analysis = "## Cross-Asset Analysis\n\n"

        # VIX
        vix = regime_data.get("vix", {})
        if vix.get("price") is not None:
            analysis += f"- **VIX**: {vix['price']:.2f} -- {signals.get('vix', 'N/A')}\n"

        # S&P 500
        sp = regime_data.get("sp500", {})
        if sp.get("price") is not None:
            analysis += f"- **S&P 500**: {sp['price']:.2f} -- {signals.get('sp500_technical', 'N/A')}\n"

        # Treasury
        tnx = regime_data.get("treasury_10y", {})
        if tnx.get("price") is not None:
            analysis += f"- **10Y Treasury**: {tnx['price']:.2f}% -- {signals.get('treasury_10y', 'N/A')}\n"

        # Dollar
        dxy = regime_data.get("dollar_index", {})
        if dxy.get("price") is not None:
            analysis += f"- **Dollar Index**: {dxy['price']:.2f} -- {signals.get('dollar', 'N/A')}\n"

        analysis += f"\n## Regime Assessment\n\n"
        analysis += f"Current regime: **{regime}** (composite score: {score})\n\n"

        if score >= 3:
            analysis += (
                "Risk appetite is elevated. Equities are trending higher with low volatility. "
                "This environment favors growth stocks and risk assets.\n"
            )
        elif score <= -3:
            analysis += (
                "Risk aversion is dominant. Elevated volatility and defensive positioning "
                "suggest caution. Consider reducing equity exposure and increasing hedges.\n"
            )
        else:
            analysis += (
                "Market signals are mixed, indicating a transitional period. "
                "Cross-asset correlations may be shifting. Monitor for clearer directional signals.\n"
            )

        analysis += "\n## Implications\n\n"
        if "risk-on" in regime:
            analysis += "- Favor equities, especially cyclicals and growth\n"
            analysis += "- Reduce defensive positions\n"
            analysis += "- Watch for complacency in low VIX readings\n"
        elif "risk-off" in regime:
            analysis += "- Reduce equity exposure\n"
            analysis += "- Favor defensive sectors (utilities, staples, healthcare)\n"
            analysis += "- Consider volatility hedges\n"
        else:
            analysis += "- Maintain balanced positioning\n"
            analysis += "- Be prepared for directional breakout\n"
            analysis += "- Use options for defined-risk exposure\n"

        return analysis
