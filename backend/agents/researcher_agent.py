"""
TickerPulse AI v3.0 - Researcher Agent
Deep-reasoning research analyst using Sonnet 4.5.
Generates comprehensive markdown research briefs for individual stocks.
Works standalone (direct API calls) even without CrewAI.
"""

import json
import logging
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from backend.agents.base import AgentConfig, AgentResult, BaseAgent
from backend.agents.tools.stock_data import StockDataFetcher
from backend.agents.tools.technical import TechnicalAnalyzer
from backend.agents.tools.news_fetcher import NewsFetcher
from backend.agents.tools.reddit_scanner import RedditScanner

logger = logging.getLogger(__name__)

# Model pricing (per 1M tokens)
SONNET_INPUT_RATE = 3.0
SONNET_OUTPUT_RATE = 15.0

# Default config
RESEARCHER_CONFIG = AgentConfig(
    name="researcher",
    role="Research Analyst",
    goal=(
        "Generate comprehensive, markdown-formatted research briefs for "
        "individual stocks. Synthesize technical analysis, news, social media "
        "sentiment, and fundamental signals into actionable intelligence."
    ),
    backstory=(
        "You are a senior equity research analyst with 15 years of experience "
        "at a top-tier investment bank. You combine quantitative analysis with "
        "qualitative judgment. Your research notes are valued for their clarity, "
        "depth, and unbiased perspective. You always disclose risk factors and "
        "never make guarantees about future performance."
    ),
    model="claude-sonnet-4-5-20250929",
    provider="anthropic",
    max_tokens=8192,
    temperature=0.5,
    tags=["researcher", "deep-analysis", "markdown"],
)


class ResearcherAgent(BaseAgent):
    """Research Analyst Agent -- generates comprehensive research briefs."""

    def __init__(self, config: Optional[AgentConfig] = None):
        super().__init__(config or RESEARCHER_CONFIG)
        self.stock_data_tool = StockDataFetcher()
        self.technical_tool = TechnicalAnalyzer()
        self.news_tool = NewsFetcher()
        self.reddit_tool = RedditScanner()

    def execute(self, inputs: Dict[str, Any] = None) -> AgentResult:
        """Generate a comprehensive research brief for a stock.

        inputs:
            ticker: str -- REQUIRED. The stock ticker to research.
            period: str -- Technical analysis period (default '3mo')
        """
        inputs = inputs or {}
        ticker = inputs.get("ticker", "").strip().upper()
        period = inputs.get("period", "3mo")

        if not ticker:
            return AgentResult(
                agent_name=self.name,
                framework="native",
                status="error",
                output="",
                error="No ticker provided. Pass {'ticker': 'AAPL'} in inputs.",
            )

        logger.info(f"Researcher agent: generating research brief for {ticker}")

        # 1. Gather all data
        data_bundle = self._gather_data(ticker, period)

        # 2. Generate research brief via AI
        total_tokens_in = 0
        total_tokens_out = 0

        brief, tokens_in, tokens_out = self._generate_research_brief(ticker, data_bundle)
        total_tokens_in += tokens_in
        total_tokens_out += tokens_out

        estimated_cost = (
            (total_tokens_in / 1_000_000 * SONNET_INPUT_RATE)
            + (total_tokens_out / 1_000_000 * SONNET_OUTPUT_RATE)
        )

        return AgentResult(
            agent_name=self.name,
            framework="native",
            status="success",
            output=brief,
            raw_output=data_bundle,
            tokens_input=total_tokens_in,
            tokens_output=total_tokens_out,
            estimated_cost=round(estimated_cost, 6),
            metadata={
                "ticker": ticker,
                "period": period,
                "data_sources": list(data_bundle.keys()),
            },
        )

    # ------------------------------------------------------------------
    # Data gathering
    # ------------------------------------------------------------------

    def _gather_data(self, ticker: str, period: str) -> Dict[str, Any]:
        """Gather all data needed for the research brief."""
        bundle: Dict[str, Any] = {}

        # Price data
        try:
            quote_data = self.stock_data_tool.get_current_quote(ticker)
            bundle["quote"] = quote_data
        except Exception as e:
            logger.warning(f"Researcher: quote fetch failed for {ticker}: {e}")
            bundle["quote"] = {"error": str(e)}

        # Historical data
        try:
            history_data = self.stock_data_tool.get_historical_prices(ticker, period)
            bundle["history"] = {
                k: v for k, v in history_data.items() if k != "bars"
            }
        except Exception as e:
            logger.warning(f"Researcher: history fetch failed for {ticker}: {e}")
            bundle["history"] = {"error": str(e)}

        # Technical analysis
        try:
            tech_data = self.technical_tool.analyze_ticker(ticker, period, "all")
            bundle["technical"] = tech_data
        except Exception as e:
            logger.warning(f"Researcher: technical analysis failed for {ticker}: {e}")
            bundle["technical"] = {"error": str(e)}

        # News
        try:
            news_data = self.news_tool.fetch_news_for_ticker(ticker, max_articles=15)
            bundle["news"] = news_data
        except Exception as e:
            logger.warning(f"Researcher: news fetch failed for {ticker}: {e}")
            bundle["news"] = {"error": str(e)}

        # Reddit
        try:
            reddit_data = self.reddit_tool.scan_ticker(ticker, limit=15)
            bundle["reddit"] = reddit_data
        except Exception as e:
            logger.warning(f"Researcher: Reddit scan failed for {ticker}: {e}")
            bundle["reddit"] = {"error": str(e)}

        return bundle

    # ------------------------------------------------------------------
    # Brief generation
    # ------------------------------------------------------------------

    def _generate_research_brief(self, ticker: str,
                                 data_bundle: Dict[str, Any]) -> tuple:
        """Generate the markdown research brief using AI.
        Returns (brief_text, tokens_in, tokens_out)."""

        # Build the context prompt from gathered data
        context = self._build_context(ticker, data_bundle)

        # Try AI generation first
        from backend.agents.ai_provider_resolver import resolve_agent_ai_provider
        resolved = resolve_agent_ai_provider(self.config)

        if resolved:
            try:
                provider, _model = resolved
                prompt = self._build_prompt(ticker, context)
                response = provider.generate_analysis(prompt, max_tokens=self.config.max_tokens)

                if response and not response.startswith("Error:"):
                    tokens_in = len(prompt) // 4
                    tokens_out = len(response) // 4
                    return response, tokens_in, tokens_out
            except Exception as e:
                logger.warning(f"Researcher: AI generation failed: {e}")

        # Fallback: build a structured brief without AI
        brief = self._build_fallback_brief(ticker, data_bundle)
        return brief, 0, 0

    def _build_context(self, ticker: str, data_bundle: Dict[str, Any]) -> str:
        """Build a structured context string from gathered data."""
        sections = []

        # Quote
        quote = data_bundle.get("quote", {})
        if not quote.get("error"):
            sections.append(
                f"CURRENT QUOTE:\n"
                f"  Price: {quote.get('price', 'N/A')}\n"
                f"  Change: {quote.get('change', 0)} ({quote.get('change_percent', 0)}%)\n"
                f"  Volume: {quote.get('volume', 'N/A')}\n"
                f"  Currency: {quote.get('currency', 'USD')}"
            )

        # History summary
        history = data_bundle.get("history", {})
        if not history.get("error"):
            sections.append(
                f"PRICE HISTORY ({history.get('period', 'N/A')}):\n"
                f"  Period change: {history.get('period_change', 0)} ({history.get('period_change_pct', 0)}%)\n"
                f"  High of period: {history.get('high_of_period', 'N/A')}\n"
                f"  Low of period: {history.get('low_of_period', 'N/A')}\n"
                f"  Avg volume: {history.get('avg_volume', 'N/A')}"
            )

        # Technical indicators
        tech = data_bundle.get("technical", {})
        if not tech.get("error"):
            indicators = tech.get("indicators", {})
            tech_lines = [f"TECHNICAL ANALYSIS (overall: {tech.get('overall_signal', 'N/A')}):"]
            for ind_name, ind_data in indicators.items():
                if isinstance(ind_data, dict):
                    tech_lines.append(f"  {ind_name}: {json.dumps(ind_data)}")
            sections.append("\n".join(tech_lines))

        # News
        news = data_bundle.get("news", {})
        if not news.get("error"):
            news_lines = [
                f"NEWS SENTIMENT (avg: {news.get('avg_sentiment', 0):.2f}, "
                f"{news.get('total_articles', 0)} articles):"
            ]
            for article in news.get("articles", [])[:8]:
                news_lines.append(
                    f"  [{article.get('sentiment_label', 'neutral')}] "
                    f"{article.get('title', 'No title')} ({article.get('source', 'Unknown')})"
                )
            sections.append("\n".join(news_lines))

        # Reddit
        reddit = data_bundle.get("reddit", {})
        if not reddit.get("error"):
            reddit_lines = [
                f"REDDIT SENTIMENT ({reddit.get('total_mentions', 0)} mentions, "
                f"avg: {reddit.get('avg_sentiment', 0):.2f}):"
            ]
            for post in reddit.get("posts", [])[:5]:
                reddit_lines.append(
                    f"  [r/{post.get('subreddit', '?')}] {post.get('title', '')[:100]} "
                    f"(score: {post.get('score', 0)}, comments: {post.get('num_comments', 0)})"
                )
            sections.append("\n".join(reddit_lines))

        return "\n\n".join(sections)

    def _build_prompt(self, ticker: str, context: str) -> str:
        """Build the full prompt for the AI model."""
        return f"""You are a senior equity research analyst. Generate a comprehensive research brief for {ticker}.

DATA:
{context}

Generate a detailed markdown research brief with these exact sections:

# {ticker} Research Brief

## Executive Summary
(2-3 sentence overview of the stock's current situation and outlook)

## Technical Analysis
(Analyze RSI, MACD, moving averages, Bollinger Bands, and any other indicators. Include specific numbers.)

## News Digest
(Summarize the key news themes. Note sentiment trends.)

## Social Sentiment
(Analyze Reddit and social media mentions. Note any unusual activity or trending topics.)

## Risk Factors
(List 3-5 specific risk factors based on the data)

## Recommendation
(Clear, actionable recommendation: Strong Buy / Buy / Hold / Sell / Strong Sell with reasoning)

Be specific with numbers. Reference actual indicator values. Do not use generic language."""

    def _build_fallback_brief(self, ticker: str, data_bundle: Dict[str, Any]) -> str:
        """Build a structured brief without AI assistance."""
        quote = data_bundle.get("quote", {})
        tech = data_bundle.get("technical", {})
        news = data_bundle.get("news", {})
        reddit = data_bundle.get("reddit", {})
        history = data_bundle.get("history", {})

        brief = f"# {ticker} Research Brief\n\n"
        brief += f"*Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}*\n\n"

        # Executive Summary
        brief += "## Executive Summary\n\n"
        price = quote.get("price", "N/A")
        change_pct = quote.get("change_percent", 0)
        overall = tech.get("overall_signal", "neutral")
        brief += (
            f"{ticker} is currently trading at {price} "
            f"({'up' if change_pct > 0 else 'down'} {abs(change_pct):.2f}% today). "
            f"Technical analysis shows an overall **{overall}** signal.\n\n"
        )

        # Technical Analysis
        brief += "## Technical Analysis\n\n"
        indicators = tech.get("indicators", {})

        rsi_data = indicators.get("rsi", {})
        if rsi_data and not rsi_data.get("error"):
            brief += f"- **RSI**: {rsi_data.get('value', 'N/A')} ({rsi_data.get('signal', 'N/A')})\n"

        macd_data = indicators.get("macd", {})
        if macd_data and not macd_data.get("error"):
            brief += (
                f"- **MACD**: {macd_data.get('macd', 'N/A')} | Signal: {macd_data.get('signal', 'N/A')} "
                f"| Trend: {macd_data.get('trend', 'N/A')}\n"
            )

        bb_data = indicators.get("bollinger_bands", {})
        if bb_data and not bb_data.get("error"):
            brief += (
                f"- **Bollinger Bands**: Upper={bb_data.get('upper', 'N/A')}, "
                f"Lower={bb_data.get('lower', 'N/A')}, "
                f"Signal: {bb_data.get('signal', 'N/A')}\n"
            )

        stoch = indicators.get("stochastic", {})
        if stoch and not stoch.get("error"):
            brief += (
                f"- **Stochastic**: %K={stoch.get('percent_k', 'N/A')}, "
                f"%D={stoch.get('percent_d', 'N/A')}, "
                f"Signal: {stoch.get('signal', 'N/A')}\n"
            )

        ma_data = indicators.get("moving_averages", {})
        if ma_data:
            for ma_name, ma_info in ma_data.items():
                if isinstance(ma_info, dict):
                    brief += f"- **{ma_name.upper()}**: {ma_info.get('value', 'N/A')} ({ma_info.get('signal', 'N/A')})\n"

        brief += "\n"

        # News Digest
        brief += "## News Digest\n\n"
        if not news.get("error") and news.get("total_articles", 0) > 0:
            brief += (
                f"Analyzed {news.get('total_articles', 0)} articles. "
                f"Average sentiment: {news.get('avg_sentiment', 0):.2f} "
                f"(Positive: {news.get('positive_count', 0)}, "
                f"Negative: {news.get('negative_count', 0)}, "
                f"Neutral: {news.get('neutral_count', 0)})\n\n"
            )
            for article in news.get("articles", [])[:5]:
                brief += f"- **{article.get('title', '')}** ({article.get('source', '')})\n"
        else:
            brief += "No recent news data available.\n"
        brief += "\n"

        # Social Sentiment
        brief += "## Social Sentiment\n\n"
        if not reddit.get("error") and reddit.get("total_mentions", 0) > 0:
            brief += (
                f"Reddit: {reddit.get('total_mentions', 0)} mentions across monitored subreddits. "
                f"Avg sentiment: {reddit.get('avg_sentiment', 0):.2f}. "
                f"Total engagement: {reddit.get('total_score', 0)} upvotes, "
                f"{reddit.get('total_comments', 0)} comments.\n"
            )
        else:
            brief += "No significant social media mentions detected.\n"
        brief += "\n"

        # Risk Factors
        brief += "## Risk Factors\n\n"
        risks = []
        if rsi_data.get("signal") == "overbought":
            risks.append("RSI indicates overbought conditions -- potential for near-term pullback")
        if rsi_data.get("signal") == "oversold":
            risks.append("RSI indicates oversold conditions -- may indicate ongoing selling pressure")
        if news.get("avg_sentiment", 0) < -0.2:
            risks.append("Negative news sentiment may weigh on price")
        if bb_data.get("signal") == "overbought":
            risks.append("Price above upper Bollinger Band -- mean reversion risk")
        if not risks:
            risks.append("General market risk applies")
            risks.append("Past performance does not guarantee future results")
            risks.append("Data may be delayed; verify with real-time feeds before acting")

        for risk in risks:
            brief += f"- {risk}\n"
        brief += "\n"

        # Recommendation
        brief += "## Recommendation\n\n"
        bull = tech.get("bullish_indicators", 0)
        bear = tech.get("bearish_indicators", 0)
        if bull > bear + 2:
            brief += f"**BUY** -- {bull} bullish vs {bear} bearish indicators suggest upside potential.\n"
        elif bear > bull + 2:
            brief += f"**SELL** -- {bear} bearish vs {bull} bullish indicators suggest downside risk.\n"
        else:
            brief += f"**HOLD** -- Mixed signals ({bull} bullish, {bear} bearish). Wait for clearer direction.\n"

        return brief
