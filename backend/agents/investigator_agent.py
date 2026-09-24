"""
TickerPulse AI v3.0 - Investigator Agent
Social Media Investigator using Haiku 4.5.
Scans Reddit for trending stock mentions, verifies claims, flags unusual activity.
"""

import json
import logging
import sqlite3
import time
from collections import Counter
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from backend.agents.base import AgentConfig, AgentResult, BaseAgent
from backend.agents.tools.reddit_scanner import RedditScanner

logger = logging.getLogger(__name__)

# Model pricing (per 1M tokens)
HAIKU_INPUT_RATE = 1.0
HAIKU_OUTPUT_RATE = 5.0

# Thresholds for anomaly detection
SPIKE_MENTION_THRESHOLD = 10  # Mentions above this in a single scan = unusual
SPIKE_ENGAGEMENT_THRESHOLD = 500  # Combined score+comments above this = high engagement

# Default config
INVESTIGATOR_CONFIG = AgentConfig(
    name="investigator",
    role="Social Media Investigator",
    goal=(
        "Scan Reddit for trending stock mentions across wallstreetbets, stocks, "
        "investing, and other financial subreddits. Aggregate mention counts, "
        "sentiment, and engagement. Flag unusual activity such as sudden mention "
        "spikes or coordinated posting patterns."
    ),
    backstory=(
        "You are a social media intelligence analyst specializing in financial "
        "markets. You track retail investor sentiment across Reddit and social "
        "platforms. You can spot emerging trends before they hit mainstream news "
        "and distinguish genuine momentum from pump-and-dump schemes."
    ),
    model="claude-haiku-4-5-20251001",
    provider="anthropic",
    max_tokens=4096,
    temperature=0.3,
    tags=["investigator", "social", "reddit", "sentiment"],
)


class InvestigatorAgent(BaseAgent):
    """Social Media Investigator Agent -- scans Reddit for stock mentions
    and flags unusual social activity."""

    def __init__(self, config: Optional[AgentConfig] = None):
        super().__init__(config or INVESTIGATOR_CONFIG)
        self.reddit_tool = RedditScanner()

    def execute(self, inputs: Dict[str, Any] = None) -> AgentResult:
        """Scan Reddit for monitored tickers and produce a social sentiment report.

        inputs (optional):
            tickers: list[str] -- override the list of tickers to investigate
            subreddits: list[str] -- override subreddits to scan
            limit: int -- max posts per subreddit per ticker (default 15)
        """
        inputs = inputs or {}
        limit = inputs.get("limit", 15)
        subreddits = inputs.get("subreddits")

        # 1. Get tickers to investigate
        tickers = inputs.get("tickers")
        if not tickers:
            tickers = self._get_active_stocks()

        if not tickers:
            return AgentResult(
                agent_name=self.name,
                framework="native",
                status="success",
                output="No active stocks to investigate. Add stocks via the dashboard.",
                metadata={"investigated": 0},
            )

        logger.info(f"Investigator agent: scanning Reddit for {len(tickers)} tickers")

        # 2. Scan each ticker
        ticker_reports: List[Dict[str, Any]] = []
        anomalies: List[Dict[str, Any]] = []
        total_tokens_in = 0
        total_tokens_out = 0

        for ticker in tickers:
            try:
                report = self._investigate_ticker(ticker, subreddits, limit)
                ticker_reports.append(report)

                # Check for anomalies
                anomaly = self._check_anomalies(report)
                if anomaly:
                    anomalies.append(anomaly)
            except Exception as e:
                logger.warning(f"Investigator: error for {ticker}: {e}")
                ticker_reports.append({
                    "ticker": ticker,
                    "error": str(e),
                    "total_mentions": 0,
                })

        # 3. Build overall sentiment report
        overall_report = self._build_overall_report(ticker_reports, anomalies)

        # 4. Generate AI summary
        ai_summary = ""
        try:
            ai_summary, tokens_in, tokens_out = self._generate_ai_summary(
                ticker_reports, anomalies
            )
            total_tokens_in += tokens_in
            total_tokens_out += tokens_out
        except Exception as e:
            logger.warning(f"Investigator AI summary failed: {e}")
            ai_summary = overall_report

        estimated_cost = (
            (total_tokens_in / 1_000_000 * HAIKU_INPUT_RATE)
            + (total_tokens_out / 1_000_000 * HAIKU_OUTPUT_RATE)
        )

        # 5. Compose output
        output = f"# Social Media Investigation Report\n\n"
        output += f"*{datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}*\n\n"
        output += ai_summary
        output += "\n\n" + overall_report

        return AgentResult(
            agent_name=self.name,
            framework="native",
            status="success",
            output=output,
            raw_output={
                "ticker_reports": ticker_reports,
                "anomalies": anomalies,
            },
            tokens_input=total_tokens_in,
            tokens_output=total_tokens_out,
            estimated_cost=round(estimated_cost, 6),
            metadata={
                "investigated": len(ticker_reports),
                "anomalies_found": len(anomalies),
                "tickers": tickers,
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
            logger.warning(f"Investigator: could not read active stocks: {e}")
            return []

    def _investigate_ticker(self, ticker: str,
                            subreddits: Optional[List[str]],
                            limit: int) -> Dict[str, Any]:
        """Scan Reddit for a single ticker and build a report."""
        scan_result = self.reddit_tool.scan_ticker(ticker, subreddits, limit)

        if scan_result.get("error"):
            return {"ticker": ticker, "error": scan_result["error"], "total_mentions": 0}

        # Aggregate by subreddit
        subreddit_breakdown = scan_result.get("subreddit_breakdown", {})

        # Top posts by engagement
        posts = scan_result.get("posts", [])
        top_posts = sorted(
            posts,
            key=lambda p: p.get("score", 0) + p.get("num_comments", 0),
            reverse=True
        )[:5]

        # Sentiment distribution
        sentiments = [p.get("sentiment_score", 0) for p in posts]
        avg_sent = sum(sentiments) / len(sentiments) if sentiments else 0

        # Engagement metrics
        total_score = sum(p.get("score", 0) for p in posts)
        total_comments = sum(p.get("num_comments", 0) for p in posts)

        # Author diversity (are the same accounts posting repeatedly?)
        authors = [p.get("author", "") for p in posts if p.get("author") != "[deleted]"]
        unique_authors = len(set(authors))
        author_concentration = (
            len(authors) / unique_authors if unique_authors > 0 else 0
        )

        return {
            "ticker": ticker,
            "total_mentions": scan_result.get("total_mentions", 0),
            "subreddit_breakdown": subreddit_breakdown,
            "avg_sentiment": round(avg_sent, 3),
            "positive_count": scan_result.get("positive_count", 0),
            "negative_count": scan_result.get("negative_count", 0),
            "neutral_count": scan_result.get("neutral_count", 0),
            "total_score": total_score,
            "total_comments": total_comments,
            "unique_authors": unique_authors,
            "author_concentration": round(author_concentration, 2),
            "top_posts": [
                {
                    "title": p.get("title", "")[:120],
                    "subreddit": p.get("subreddit", ""),
                    "score": p.get("score", 0),
                    "comments": p.get("num_comments", 0),
                    "sentiment": p.get("sentiment_label", "neutral"),
                }
                for p in top_posts
            ],
        }

    def _check_anomalies(self, report: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Check for unusual activity patterns in a ticker's Reddit data."""
        ticker = report.get("ticker", "")
        mentions = report.get("total_mentions", 0)
        total_engagement = report.get("total_score", 0) + report.get("total_comments", 0)
        author_conc = report.get("author_concentration", 0)

        flags = []

        # Mention spike
        if mentions >= SPIKE_MENTION_THRESHOLD:
            flags.append(f"High mention count: {mentions} posts found in a single scan")

        # Engagement spike
        if total_engagement >= SPIKE_ENGAGEMENT_THRESHOLD:
            flags.append(
                f"High engagement: {total_engagement} combined score+comments"
            )

        # Author concentration (could indicate coordinated posting)
        if author_conc > 2.5 and mentions > 5:
            flags.append(
                f"Author concentration: {author_conc:.1f}x (same users posting repeatedly)"
            )

        # Strong sentiment skew
        pos = report.get("positive_count", 0)
        neg = report.get("negative_count", 0)
        total = pos + neg + report.get("neutral_count", 0)
        if total >= 5:
            if pos / total > 0.8:
                flags.append(f"Unusually positive sentiment: {pos}/{total} posts positive")
            elif neg / total > 0.8:
                flags.append(f"Unusually negative sentiment: {neg}/{total} posts negative")

        if flags:
            return {
                "ticker": ticker,
                "severity": "high" if len(flags) >= 2 else "medium",
                "flags": flags,
                "mentions": mentions,
                "engagement": total_engagement,
            }

        return None

    def _build_overall_report(self, ticker_reports: List[Dict[str, Any]],
                              anomalies: List[Dict[str, Any]]) -> str:
        """Build a structured text report."""
        report = "## Ticker Breakdown\n\n"
        report += "| Ticker | Mentions | Sentiment | Engagement | Status |\n"
        report += "|--------|----------|-----------|------------|--------|\n"

        # Sort by mentions descending
        sorted_reports = sorted(
            ticker_reports,
            key=lambda r: r.get("total_mentions", 0),
            reverse=True,
        )

        anomaly_tickers = {a["ticker"] for a in anomalies}

        for tr in sorted_reports:
            ticker = tr.get("ticker", "?")
            mentions = tr.get("total_mentions", 0)
            sentiment = tr.get("avg_sentiment", 0)
            engagement = tr.get("total_score", 0) + tr.get("total_comments", 0)
            status = "ALERT" if ticker in anomaly_tickers else "Normal"

            sent_str = f"{sentiment:+.2f}"
            report += f"| {ticker} | {mentions} | {sent_str} | {engagement} | {status} |\n"

        # Anomaly section
        if anomalies:
            report += "\n## Anomalies Detected\n\n"
            for anomaly in anomalies:
                report += f"### {anomaly['ticker']} (Severity: {anomaly['severity']})\n\n"
                for flag in anomaly["flags"]:
                    report += f"- {flag}\n"
                report += "\n"

        return report

    def _generate_ai_summary(self, ticker_reports: List[Dict[str, Any]],
                             anomalies: List[Dict[str, Any]]) -> tuple:
        """Generate AI summary. Returns (summary_text, tokens_in, tokens_out)."""
        from backend.agents.ai_provider_resolver import resolve_agent_ai_provider

        resolved = resolve_agent_ai_provider(self.config)
        if not resolved:
            return "", 0, 0

        provider, _model = resolved

        # Build compact context
        lines = []
        for tr in sorted(ticker_reports, key=lambda r: r.get("total_mentions", 0), reverse=True)[:15]:
            lines.append(
                f"{tr.get('ticker', '?')}: {tr.get('total_mentions', 0)} mentions, "
                f"sentiment={tr.get('avg_sentiment', 0):.2f}, "
                f"engagement={tr.get('total_score', 0) + tr.get('total_comments', 0)}"
            )

        anomaly_lines = []
        for a in anomalies:
            anomaly_lines.append(f"{a['ticker']} ({a['severity']}): {'; '.join(a['flags'])}")

        prompt = f"""You are a social media intelligence analyst. Summarize these Reddit scan results.

TICKER DATA:
{chr(10).join(lines)}

ANOMALIES:
{chr(10).join(anomaly_lines) if anomaly_lines else 'None detected'}

Provide a 3-5 sentence summary covering:
1. Which tickers have the most Reddit buzz right now
2. Overall retail sentiment (bullish/bearish/mixed)
3. Any anomalies that need attention
4. Actionable takeaways

Be direct and specific."""

        response = provider.generate_analysis(prompt, max_tokens=400)

        if response and not response.startswith("Error:"):
            tokens_in = len(prompt) // 4
            tokens_out = len(response) // 4
            return f"## AI Summary\n\n{response}", tokens_in, tokens_out

        return "", 0, 0
