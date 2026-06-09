"""Curated X/Twitter watchlist collection via the local twscrape clone."""

from __future__ import annotations

import json
import logging
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import yaml

from backend.config import Config

logger = logging.getLogger(__name__)


PRIORITY_SCORE = {
    "highest": 10,
    "high": 7,
    "medium": 4,
    "low": 1,
}


def _is_required_account(account: XAccount) -> bool:
    return account.lane.startswith("user_requested")


def _priority_rank(account: XAccount) -> int:
    return PRIORITY_SCORE.get(account.priority, PRIORITY_SCORE["medium"])


@dataclass(frozen=True)
class XAccount:
    handle: str
    lane: str
    priority: str
    reason: str
    url: str = ""
    user_id: str = ""
    alert_keywords: tuple[str, ...] = ()


@dataclass(frozen=True)
class XSearchQuery:
    name: str
    query: str
    priority: str


@dataclass(frozen=True)
class XWatchlistConfig:
    accounts: tuple[XAccount, ...]
    search_queries: tuple[XSearchQuery, ...]
    promote_keywords: tuple[str, ...]
    warnings: tuple[str, ...] = ()

    @classmethod
    def default_path(cls) -> Path:
        return Config.BASE_DIR / "config" / "x_watchlists.yaml"

    @classmethod
    def load(cls, path: Path | None = None) -> "XWatchlistConfig":
        config_path = path or cls.default_path()
        raw = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}

        warnings: list[str] = []
        quality_filters = raw.get("quality_filters") or {}
        promote_keywords = tuple(
            str(keyword) for keyword in quality_filters.get("promote_when_contains", [])
        )

        accounts: list[XAccount] = []
        watchlists = raw.get("watchlists") or {}
        for group_name, group in watchlists.items():
            if not isinstance(group, dict):
                warnings.append(f"watchlist {group_name} is not an object")
                continue

            priority = str(group.get("priority") or "medium")
            for idx, account in enumerate(group.get("accounts") or []):
                if not isinstance(account, dict):
                    warnings.append(f"{group_name}[{idx}] is not an account object")
                    continue

                handle = str(account.get("handle") or "").strip().lstrip("@")
                if not handle:
                    warnings.append(f"{group_name}[{idx}] missing handle")
                    continue

                accounts.append(
                    XAccount(
                        handle=handle,
                        lane=str(account.get("lane") or group_name),
                        priority=priority,
                        reason=str(account.get("reason") or ""),
                        url=str(account.get("url") or f"https://x.com/{handle}"),
                        user_id=str(account.get("user_id") or ""),
                        alert_keywords=tuple(str(k) for k in account.get("alert_keywords") or ()),
                    )
                )

        search_queries: list[XSearchQuery] = []
        for idx, query in enumerate(raw.get("search_queries") or []):
            if not isinstance(query, dict):
                warnings.append(f"search_queries[{idx}] is not an object")
                continue
            name = str(query.get("name") or "").strip()
            value = str(query.get("query") or "").strip()
            if not name or not value:
                warnings.append(f"search_queries[{idx}] missing name or query")
                continue
            search_queries.append(
                XSearchQuery(
                    name=name,
                    query=value,
                    priority=str(query.get("priority") or "medium"),
                )
            )

        return cls(
            accounts=tuple(accounts),
            search_queries=tuple(search_queries),
            promote_keywords=promote_keywords,
            warnings=tuple(warnings),
        )


class TwscrapeRunnerProtocol(Protocol):
    def user_by_login(self, handle: str) -> dict[str, object]:
        raise NotImplementedError

    def user_tweets(self, user_id: str, limit: int) -> list[dict[str, object]]:
        raise NotImplementedError

    def search(self, query: str, limit: int) -> list[dict[str, object]]:
        raise NotImplementedError


class TwscrapeRunner:
    """Small subprocess wrapper around the existing local twscrape repo."""

    def __init__(self, repo_path: Path | None = None, timeout_seconds: int = 60) -> None:
        self.repo_path = repo_path or Path(os.getenv("TWSCRAPE_REPO", r"C:\Repos\twscrape"))
        self.timeout_seconds = timeout_seconds

    def user_by_login(self, handle: str) -> dict:
        rows = self._run_json_lines(["user_by_login", handle])
        return rows[0] if rows else {}

    def user_tweets(self, user_id: str, limit: int) -> list[dict]:
        return self._run_json_lines(["user_tweets", user_id, "--limit", str(limit)])[:limit]

    def search(self, query: str, limit: int) -> list[dict[str, object]]:
        return self._run_json_lines(["search", query, "--limit", str(limit)])[:limit]

    def _run_json_lines(self, args: list[str]) -> list[dict]:
        env = dict(os.environ)
        env["PYTHONUTF8"] = "1"
        env["TWS_RAISE_WHEN_NO_ACCOUNT"] = "true"

        completed = subprocess.run(
            ["uv", "run", "twscrape", *args],
            cwd=str(self.repo_path),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=self.timeout_seconds,
            env=env,
            check=False,
        )
        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout or "").strip()
            raise RuntimeError(detail or f"twscrape exited {completed.returncode}")

        rows: list[dict] = []
        for line in completed.stdout.splitlines():
            if not line.strip():
                continue
            rows.append(json.loads(line))
        return rows


class XWatchlistCollector:
    def __init__(
        self,
        config: XWatchlistConfig | None = None,
        runner: TwscrapeRunnerProtocol | None = None,
    ) -> None:
        self.config = config or XWatchlistConfig.load()
        self.runner = runner or TwscrapeRunner()

    def _selected_accounts(self, max_accounts: int) -> tuple[XAccount, ...]:
        if max_accounts <= 0:
            return ()

        required: list[XAccount] = []
        seen: set[str] = set()
        for account in self.config.accounts:
            if not _is_required_account(account) or account.handle in seen:
                continue
            required.append(account)
            seen.add(account.handle)

        required_handles = {account.handle for account in required}
        fill_limit = max(0, max_accounts - len(required))

        selected: list[XAccount] = list(required)
        ranked_optional = sorted(
            (
                (index, account)
                for index, account in enumerate(self.config.accounts)
                if account.handle not in required_handles
            ),
            key=lambda item: (-_priority_rank(item[1]), item[0]),
        )

        for _, account in ranked_optional:
            if len(selected) >= len(required) + fill_limit:
                break
            if account.handle in seen:
                continue
            selected.append(account)
            seen.add(account.handle)

        return tuple(selected)

    def collect_accounts(self, max_accounts: int = 12, posts_per_account: int = 5) -> dict:
        posts: list[dict] = []
        errors: list[dict] = []

        selected_accounts = self._selected_accounts(max_accounts)
        for account in selected_accounts:
            try:
                user_id = account.user_id or str(self.runner.user_by_login(account.handle).get("id_str") or "")
                if not user_id:
                    errors.append({"handle": account.handle, "message": "Could not resolve user id"})
                    continue

                for tweet in self.runner.user_tweets(user_id, posts_per_account)[:posts_per_account]:
                    posts.append(self._normalize_post(account, tweet))
            except Exception as exc:
                logger.warning("X collection failed for @%s: %s", account.handle, exc)
                errors.append({"handle": account.handle, "message": str(exc)})

        posts.sort(
            key=lambda post: (
                int(post.get("signal_score", 0)),
                int(post.get("engagement", 0)),
            ),
            reverse=True,
        )

        if errors and posts:
            source_status = "degraded"
        elif errors:
            source_status = "error"
        else:
            source_status = "ok"

        return {
            "source": "x_watchlist",
            "source_status": source_status,
            "accounts_checked": len(selected_accounts),
            "posts": posts,
            "errors": errors,
            "config_warnings": list(self.config.warnings),
        }

    def collect_searches(self, max_queries: int = 3, posts_per_query: int = 10) -> dict[str, object]:
        posts: list[dict[str, object]] = []
        errors: list[dict[str, str]] = []
        successful_queries = 0
        selected_queries = self.config.search_queries[: max(0, max_queries)]

        for query in selected_queries:
            try:
                tweets = self.runner.search(query.query, posts_per_query)[:posts_per_query]
                successful_queries += 1
                for tweet in tweets:
                    post = self._normalize_search_post(query, tweet)
                    posts.append(post)
            except Exception as exc:
                logger.warning("X search failed for %s: %s", query.name, exc)
                errors.append({"query": query.name, "message": str(exc)})

        posts.sort(
            key=lambda post: (
                int(post.get("signal_score", 0)),
                int(post.get("engagement", 0)),
            ),
            reverse=True,
        )

        if errors and successful_queries:
            source_status = "degraded"
        elif errors:
            source_status = "error"
        else:
            source_status = "ok"

        return {
            "source": "x_search",
            "source_status": source_status,
            "queries_checked": len(selected_queries),
            "posts": posts,
            "errors": errors,
        }

    def _normalize_post(self, account: XAccount, tweet: dict) -> dict:
        text = str(tweet.get("rawContent") or "")
        matched_keywords = self._matched_keywords(account, text)
        engagement = self._engagement(tweet)
        signal_score = (
            PRIORITY_SCORE.get(account.priority, PRIORITY_SCORE["medium"])
            + len(matched_keywords) * 8
            + min(5, engagement // 100)
        )

        return {
            "id": str(tweet.get("id_str") or tweet.get("id") or ""),
            "handle": account.handle,
            "lane": account.lane,
            "priority": account.priority,
            "url": str(tweet.get("url") or ""),
            "date": str(tweet.get("date") or ""),
            "text": text,
            "engagement": engagement,
            "matched_keywords": matched_keywords,
            "signal_score": signal_score,
            "reason": account.reason,
        }

    def _normalize_search_post(self, query: XSearchQuery, tweet: dict[str, object]) -> dict[str, object]:
        text = str(tweet.get("rawContent") or "")
        matched_keywords = self._matched_keywords_for_text(text)
        engagement = self._engagement(tweet)
        signal_score = (
            PRIORITY_SCORE.get(query.priority, PRIORITY_SCORE["medium"])
            + len(matched_keywords) * 8
            + min(5, engagement // 100)
        )
        return {
            "id": str(tweet.get("id_str") or tweet.get("id") or ""),
            "source_query": query.name,
            "query": query.query,
            "lane": f"x_search:{query.name}",
            "reason": f"Configured X search query: {query.name}",
            "source_trust": "curated_search",
            "priority": query.priority,
            "url": str(tweet.get("url") or ""),
            "date": str(tweet.get("date") or ""),
            "text": text,
            "engagement": engagement,
            "matched_keywords": matched_keywords,
            "signal_score": signal_score,
        }

    def _matched_keywords(self, account: XAccount, text: str) -> list[str]:
        keywords = list(account.alert_keywords) + list(self.config.promote_keywords)
        return self._matched_keywords_for_text(text, keywords)

    def _matched_keywords_for_text(
        self,
        text: str,
        account_keywords: list[str] | None = None,
    ) -> list[str]:
        lowered = text.lower()
        keywords = account_keywords or list(self.config.promote_keywords)
        matched: list[str] = []
        seen: set[str] = set()
        for keyword in keywords:
            key = keyword.strip()
            if not key or key.lower() in seen:
                continue
            if key.lower() in lowered:
                matched.append(key)
                seen.add(key.lower())
        return matched

    @staticmethod
    def _engagement(tweet: dict) -> int:
        total = 0
        for key in ("likeCount", "retweetCount", "replyCount", "quoteCount", "bookmarkedCount"):
            try:
                total += int(tweet.get(key) or 0)
            except (TypeError, ValueError):
                continue
        return total
