"""Curated X/Twitter watchlist collection via local Twikit and twscrape clones."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sqlite3
import subprocess
import sys
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Protocol
from typing import TypeVar

import yaml

from backend.config import Config

logger = logging.getLogger(__name__)


PRIORITY_SCORE = {
    "highest": 10,
    "high": 7,
    "medium": 4,
    "low": 1,
}

_T = TypeVar("_T")


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
    reliability_score: float = 0.0
    reliability_started_at: str = ""
    reliability_basis: str = ""


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
                        reliability_score=_float_value(account.get("reliability_score")),
                        reliability_started_at=str(account.get("reliability_started_at") or ""),
                        reliability_basis=str(account.get("reliability_basis") or ""),
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
            stripped = line.strip()
            if not stripped or not stripped.startswith("{"):
                continue
            rows.append(json.loads(stripped))
        return rows


class FallbackXRunner:
    """Runner chain that uses Twikit for accounts and twscrape for backup/search."""

    def __init__(
        self,
        primary: TwscrapeRunnerProtocol | None = None,
        backup: TwscrapeRunnerProtocol | None = None,
        search_runner: TwscrapeRunnerProtocol | None = None,
    ) -> None:
        self.primary = primary or TwikitAccountRunner()
        self.backup = backup or TwscrapeRunner()
        self.search_runner = search_runner or self.backup
        self._primary_disabled = False

    def user_by_login(self, handle: str) -> dict[str, object]:
        if self._primary_disabled:
            return self.backup.user_by_login(handle)
        try:
            return self.primary.user_by_login(handle)
        except Exception as exc:
            if _is_rate_limit_error(exc):
                raise
            self._disable_primary(exc)
            return self.backup.user_by_login(handle)

    def user_tweets(self, user_id: str, limit: int) -> list[dict[str, object]]:
        if self._primary_disabled:
            return self.backup.user_tweets(user_id, limit)
        try:
            return self.primary.user_tweets(user_id, limit)
        except Exception as exc:
            if _is_rate_limit_error(exc):
                raise
            self._disable_primary(exc)
            return self.backup.user_tweets(user_id, limit)

    def search(self, query: str, limit: int) -> list[dict[str, object]]:
        return self.search_runner.search(query, limit)

    def _disable_primary(self, exc: Exception) -> None:
        self._primary_disabled = True
        logger.warning("Disabling Twikit primary for this run; using twscrape account backup: %s", _error_log_summary(exc))


class TwikitAccountRunner:
    """Read-only authenticated Twikit runner using the active twscrape cookie session."""

    def __init__(
        self,
        repo_path: Path | None = None,
        accounts_db_path: Path | None = None,
        username: str = "",
        client_factory: Callable[[], object] | None = None,
    ) -> None:
        self.repo_path = repo_path or Path(os.getenv("TWIKIT_REPO", r"C:\Repos\twikit"))
        twscrape_repo = Path(os.getenv("TWSCRAPE_REPO", r"C:\Repos\twscrape"))
        self.accounts_db_path = accounts_db_path or Path(
            os.getenv("TWIKIT_ACCOUNTS_DB", str(twscrape_repo / "accounts.db"))
        )
        self.username = username or os.getenv("TWIKIT_X_USERNAME", "")
        self.client_factory = client_factory or self._default_client_factory
        self._loop: asyncio.AbstractEventLoop | None = None
        self._client: object | None = None
        self._cookies_loaded = False

    def user_by_login(self, handle: str) -> dict[str, object]:
        async def fetch(client: object) -> dict[str, object]:
            get_user = getattr(client, "get_user_by_screen_name")
            user = await get_user(handle)
            return _twikit_user_to_dict(user)

        return self._run_with_client(fetch)

    def user_tweets(self, user_id: str, limit: int) -> list[dict[str, object]]:
        async def fetch(client: object) -> list[dict[str, object]]:
            get_tweets = getattr(client, "get_user_tweets")
            tweets = await get_tweets(user_id, "Tweets", count=limit)
            return [_twikit_tweet_to_dict(tweet) for tweet in list(tweets)[:limit]]

        return self._run_with_client(fetch)

    def search(self, query: str, limit: int) -> list[dict[str, object]]:
        raise RuntimeError("Twikit account runner does not serve configured X search queries")

    def _default_client_factory(self) -> object:
        repo = str(self.repo_path)
        if repo not in sys.path:
            sys.path.insert(0, repo)
        from twikit import Client

        return Client()

    def close(self) -> None:
        if self._loop is None:
            return

        async def close_client() -> None:
            client = self._client
            if client is None:
                return
            http = getattr(client, "http", None)
            close = getattr(http, "aclose", None)
            if callable(close):
                await close()

        self._loop.run_until_complete(close_client())
        self._loop.close()
        self._loop = None
        self._client = None
        self._cookies_loaded = False

    def _run_with_client(self, fetch: Callable[[object], Awaitable[_T]]) -> _T:
        async def run() -> _T:
            client = await self._get_client()
            return await fetch(client)

        return self._ensure_loop().run_until_complete(run())

    async def _get_client(self) -> object:
        if self._client is None:
            self._client = self.client_factory()
        if not self._cookies_loaded:
            cookies = _load_twscrape_account_cookies(self.accounts_db_path, self.username)
            set_cookies = getattr(self._client, "set_cookies")
            set_cookies(cookies, clear_cookies=True)
            setattr(self._client, "client_transaction", _NoopClientTransaction())
            self._cookies_loaded = True
        return self._client

    def _ensure_loop(self) -> asyncio.AbstractEventLoop:
        if self._loop is None or self._loop.is_closed():
            self._loop = asyncio.new_event_loop()
        return self._loop


class XWatchlistCollector:
    def __init__(
        self,
        config: XWatchlistConfig | None = None,
        runner: TwscrapeRunnerProtocol | None = None,
    ) -> None:
        self.config = config or XWatchlistConfig.load()
        self.runner = runner or FallbackXRunner()

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
                logger.warning("X collection failed for @%s: %s", account.handle, _error_log_summary(exc))
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
        elif selected_accounts and not posts:
            errors.append(
                {
                    "handle": "*",
                    "message": (
                        f"All {len(selected_accounts)} accounts succeeded but returned "
                        "0 posts; X session likely dead or expired - check session health."
                    ),
                }
            )
            source_status = "degraded"
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
                logger.warning("X search failed for %s: %s", query.name, _error_log_summary(exc))
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
        elif selected_queries and not posts:
            errors.append(
                {
                    "query": "*",
                    "message": (
                        f"All {len(selected_queries)} queries succeeded but returned "
                        "0 posts; X session likely dead or expired - check session health."
                    ),
                }
            )
            source_status = "degraded"
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
            "source_reliability_score": account.reliability_score,
            "source_reliability_started_at": account.reliability_started_at,
            "source_reliability_basis": account.reliability_basis,
            "source_backend": str(tweet.get("source_backend") or "twscrape"),
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
            "source_backend": str(tweet.get("source_backend") or "twscrape"),
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


def _error_log_summary(exc: Exception) -> str:
    message = str(exc)
    for line in reversed(message.splitlines()):
        if line.strip():
            return line.strip()
    return message.strip()


def _is_rate_limit_error(exc: Exception) -> bool:
    message = str(exc)
    return (
        exc.__class__.__name__ == "TooManyRequests"
        or "status: 429" in message
        or "Rate limit exceeded" in message
    )


class _NoopClientTransaction:
    home_page_response = True

    def generate_transaction_id(self, method: str, path: str) -> str:
        return ""


def _load_twscrape_account_cookies(accounts_db_path: Path, username: str = "") -> dict[str, str]:
    if not accounts_db_path.exists():
        raise RuntimeError(f"twscrape accounts DB not found at {accounts_db_path}")

    requested = _normalize_x_username(username)
    con = sqlite3.connect(accounts_db_path)
    try:
        rows = con.execute(
            "SELECT username, cookies FROM accounts WHERE active = 1 ORDER BY username"
        ).fetchall()
    except sqlite3.Error as exc:
        raise RuntimeError(f"Could not read twscrape accounts DB at {accounts_db_path}: {exc}") from exc
    finally:
        con.close()

    for account_username, raw_cookies in rows:
        if requested and _normalize_x_username(str(account_username)) != requested:
            continue
        cookies = _parse_cookie_json(str(raw_cookies or "{}"))
        if cookies.get("auth_token") and cookies.get("ct0"):
            return cookies

    account_note = f" for @{requested}" if requested else ""
    raise RuntimeError(
        f"No active twscrape cookie session{account_note} with auth_token+ct0 in {accounts_db_path}"
    )


def _parse_cookie_json(raw_cookies: str) -> dict[str, str]:
    try:
        payload = json.loads(raw_cookies)
    except json.JSONDecodeError:
        return {}
    if not isinstance(payload, dict):
        return {}
    return {str(key): str(value) for key, value in payload.items() if value is not None}


def _normalize_x_username(username: str) -> str:
    return username.strip().lstrip("@").lower()


def _twikit_user_to_dict(user: object) -> dict[str, object]:
    user_id = str(getattr(user, "id", "") or "")
    screen_name = str(getattr(user, "screen_name", "") or "")
    return {
        "id": user_id,
        "id_str": user_id,
        "username": screen_name,
        "displayname": str(getattr(user, "name", "") or ""),
        "source_backend": "twikit_account",
    }


def _twikit_tweet_to_dict(tweet: object) -> dict[str, object]:
    tweet_id = str(getattr(tweet, "id", "") or "")
    user = getattr(tweet, "user", None)
    screen_name = str(getattr(user, "screen_name", "") or "")
    text = str(getattr(tweet, "full_text", "") or getattr(tweet, "text", "") or "")
    date = _twikit_tweet_date(tweet)
    return {
        "id": tweet_id,
        "id_str": tweet_id,
        "rawContent": text,
        "url": f"https://x.com/{screen_name}/status/{tweet_id}" if screen_name and tweet_id else "",
        "date": date,
        "likeCount": _int_attr(tweet, "favorite_count"),
        "retweetCount": _int_attr(tweet, "retweet_count"),
        "replyCount": _int_attr(tweet, "reply_count"),
        "quoteCount": _int_attr(tweet, "quote_count"),
        "bookmarkedCount": _int_attr(tweet, "bookmark_count"),
        "source_backend": "twikit_account",
    }


def _twikit_tweet_date(tweet: object) -> str:
    created_at_dt = getattr(tweet, "created_at_datetime", None)
    if isinstance(created_at_dt, datetime):
        return created_at_dt.isoformat()
    created_at = str(getattr(tweet, "created_at", "") or "")
    if not created_at:
        return ""
    try:
        return datetime.strptime(created_at, "%a %b %d %H:%M:%S %z %Y").isoformat()
    except ValueError:
        return created_at


def _int_attr(value: object, attr: str) -> int:
    try:
        return int(getattr(value, attr, 0) or 0)
    except (TypeError, ValueError):
        return 0


def _float_value(value: object) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0
