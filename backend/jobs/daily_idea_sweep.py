"""Daily market idea generator.

Schedule: 7:00 AM in Config.MARKET_TIMEZONE, Mon-Fri
Output: JSON idea feed at ``Config.IDEA_SWEEP_OUTPUT_DIR/latest.json``.
"""

import logging
from pathlib import Path

from backend.config import Config
from backend.jobs._helpers import _send_sse, job_timer
from backend.services.idea_feed import build_idea_feed, write_idea_feed
from backend.services.market_sweep import MarketSweepService

logger = logging.getLogger(__name__)

JOB_ID = "daily_idea_sweep"
JOB_NAME = "Daily Idea Sweep"


def run_daily_idea_sweep() -> None:
    """Run the lightweight market sweep and write an idea feed artifact."""
    with job_timer(JOB_ID, JOB_NAME) as ctx:
        ctx["agent_name"] = "market_sweep"

        sweep = MarketSweepService().run(
            include_x=True,
            include_reddit=False,
            top_n=10,
            x_max_accounts=16,
            x_posts_per_account=3,
            news_max_articles=3,
        )
        feed = build_idea_feed(sweep)
        paths = write_idea_feed(feed, Path(Config.IDEA_SWEEP_OUTPUT_DIR))

        idea_count = len(feed.get("ideas", []))
        ctx["result_summary"] = (
            f"Daily idea sweep generated {idea_count} ideas. "
            f"Latest feed: {paths['latest']}"
        )

        _send_sse("daily_idea_sweep", {
            "idea_count": idea_count,
            "latest_path": str(paths["latest"]),
            "snapshot_path": str(paths["snapshot"]),
            "source_status": feed.get("source_status"),
            "generated_at": feed.get("generated_at"),
        })
