```python
"""
StockPulse AI v3.0 - Download Tracker Agent
Monitors GitHub repository traffic (clones/downloads) via GitHub API.
Tracks unique and total downloads over time.
"""

import json
import logging
import os
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
import requests

from backend.agents.base import AgentConfig, AgentResult, BaseAgent
from backend.config import Config
from backend.database import batch_insert, pooled_session

logger = logging.getLogger(__name__)

# Default config
DOWNLOAD_TRACKER_CONFIG = AgentConfig(
    name="download_tracker",
    role="Repository Download Tracker",
    goal=(
        "Track GitHub repository clone/download statistics via the GitHub API. "
        "Monitor unique and total downloads over time to understand repository adoption."
    ),
    backstory=(
        "You are a repository analytics agent that monitors download statistics "
        "from GitHub. You track both unique clones and total clone counts to "
        "provide insights into repository growth and adoption."
    ),
    model="claude-haiku-4-5-20251001",
    provider="anthropic",
    max_tokens=2048,
    temperature=0.1,
    tags=["analytics", "monitoring", "github"],
)


class DownloadTrackerAgent(BaseAgent):
    """Agent that tracks GitHub repository downloads (clones) via the GitHub API."""

    def __init__(
        self,
        config: Optional[AgentConfig] = None,
        github_token: Optional[str] = None,
        repo_owner: str = "amitpatole",
        repo_name: str = "stockpulse-ai"
    ):
        super().__init__(config or DOWNLOAD_TRACKER_CONFIG)
        self.github_token = github_token or Config.GITHUB_TOKEN
        self.repo_owner = repo_owner
        self.repo_name = repo_name
        self.api_base = "https://api.github.com"
        
        if not self.github_token:
            logger.warning(
                "GitHub token not configured. Download tracking may be rate-limited "
                "or unavailable. Set GITHUB_TOKEN in .env or Config."
            )

    def execute(self, inputs: Dict[str, Any] = None) -> AgentResult:
        """Fetch repository clone statistics from GitHub API and store in database.
        
        inputs (optional):
            repo_owner: str -- GitHub repository owner (default from config)
            repo_name: str -- GitHub repository name (default from config)
        """
        inputs = inputs or {}
        repo_owner = inputs.get("repo_owner", self.repo_owner)
        repo_name = inputs.get("repo_name", self.repo_name)

        try:
            # Fetch clone statistics from GitHub API
            clone_data = self._fetch_clone_traffic(repo_owner, repo_name)
            
            if not clone_data:
                return AgentResult(
                    agent_name=self.name,
                    framework="native",
                    status="error",
                    output="Failed to fetch clone data from GitHub API.",
                    error="GitHub API request failed or returned empty data",
                )

            # Store in database
            stored_count = self._store_download_stats(clone_data, repo_owner, repo_name)
            
            # Generate summary
            total_uniques = clone_data.get("uniques", 0)
            total_count = clone_data.get("count", 0)
            clones_list = clone_data.get("clones", [])
            
            summary = (
                f"Successfully tracked download statistics for {repo_owner}/{repo_name}.\n"
                f"Total unique clones: {total_uniques}\n"
                f"Total clones: {total_count}\n"
                f"Data points stored: {stored_count}\n"
                f"Period: Last 14 days"
            )
            
            return AgentResult(
                agent_name=self.name,
                framework="native",
                status="success",
                output=summary,
                metadata={
                    "repo": f"{repo_owner}/{repo_name}",
                    "unique_clones": total_uniques,
                    "total_clones": total_count,
                    "data_points": stored_count,
                }
            )

        except Exception as e:
            logger.exception(f"Download tracker agent failed: {e}")
            return AgentResult(
                agent_name=self.name,
                framework="native",
                status="error",
                output=f"Failed to track downloads: {str(e)}",
                error=str(e),
            )

    def _fetch_clone_traffic(self, repo_owner: str, repo_name: str) -> Optional[Dict]:
        """Fetch clone traffic data from GitHub API.
        
        Returns:
            Dictionary with keys: count, uniques, clones (list of daily data)
        """
        url = f"{self.api_base}/repos/{repo_owner}/{repo_name}/traffic/clones"
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        
        if self.github_token:
            headers["Authorization"] = f"Bearer {self.github_token}"
        
        try:
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 401:
                logger.error("GitHub API authentication failed. Check GITHUB_TOKEN.")
                return None
            elif response.status_code == 403:
                logger.error("GitHub API rate limit exceeded or access denied.")
                return None
            elif response.status_code == 404:
                logger.error(f"Repository {repo_owner}/{repo_name} not found.")
                return None
            elif response.status_code != 200:
                logger.error(f"GitHub API returned status {response.status_code}")
                return None
            
            return response.json()
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch clone traffic: {e}")
            return None

    def _store_download_stats(
        self,
        clone_data: Dict[str, Any],
        repo_owner: str,
        repo_name: str,
    ) -> int:
        """Store download statistics in the database using pooled connection.

        Aggregate totals are written as a single INSERT; daily breakdowns are
        batched with a single ``executemany`` call instead of N individual
        INSERT OR REPLACE statements.

        Returns:
            Number of daily data points stored.
        """
        now = datetime.utcnow()
        total_uniques: int = clone_data.get("uniques", 0)
        total_count: int = clone_data.get("count", 0)

        daily_rows: List[Dict[str, Any]] = [
            {
                "repo_owner": repo_owner,
                "repo_name": repo_name,
                "date": day.get("timestamp", "")[:10],  # YYYY-MM-DD
                "clones": day.get("count", 0),
                "unique_clones": day.get("uniques", 0),
            }
            for day in clone_data.get("clones", [])
            if day.get("timestamp")
        ]

        with pooled_session() as conn:
            conn.execute(
                """
                INSERT INTO download_stats (
                    repo_owner, repo_name, total_clones, unique_clones,
                    period_start, period_end, recorded_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    repo_owner,
                    repo_name,
                    total_count,
                    total_uniques,
                    (now - timedelta(days=14)).isoformat(),
                    now.isoformat(),
                    now.isoformat(),
                ),
            )
            batch_insert(conn, "download_daily", daily_rows, on_conflict="REPLACE")

        stored_count = len(daily_rows)
        logger.info(
            "Stored %d download data points for %s/%s",
            stored_count, repo_owner, repo_name,
        )
        return stored_count
```