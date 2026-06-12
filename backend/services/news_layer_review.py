"""Standalone daily news-layer review for TickerPulse."""

from __future__ import annotations

import json
import os
from collections import Counter
from collections.abc import Callable, Mapping, Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol

from backend.services import watchlist_notes
from backend.services.dashboard_watchlist import load_dashboard_watchlist
from backend.services.news_story_cards import (
    STORY_THEMES,
    action_for_post,
    bernstein_echo_relevant,
    bernstein_source_label,
    build_story_cards,
    contains_any,
    expectation_delta_for_post,
    fresh_posts,
    freshness_bucket,
    grade_source,
    impact_for_post,
    is_bernstein_post,
    parse_datetime,
    post_text,
    post_timestamp,
    signal_score,
    source_reliability_score,
    tickers_for_post,
    truncate,
    what_happened_for_post,
)
from backend.services.gamma_exposure_monitor import build_gamma_exposure_monitor
from backend.services.vol_structure_monitor import build_vol_structure_monitor
from backend.services.x_session_guard import ensure_x_session
from backend.services.x_watchlist import XWatchlistCollector, XWatchlistConfig


class NewsLayerCollectorProtocol(Protocol):
    config: XWatchlistConfig

    def collect_accounts(self, max_accounts: int, posts_per_account: int) -> dict[str, object]:
        raise NotImplementedError

    def collect_searches(self, max_queries: int, posts_per_query: int) -> dict[str, object]:
        raise NotImplementedError


def default_news_layer_output_dir(now: datetime | None = None) -> Path:
    timestamp = now or datetime.now(timezone.utc)
    root = Path(os.getenv("TICKERPULSE_NEWS_LAYER_OUTPUT_ROOT", r"D:\Crypto Data\Analysis"))
    return root / f"{timestamp:%Y%m%d} - TickerPulse news layer daily"


def run_news_layer_review(
    *,
    x_collector: NewsLayerCollectorProtocol | None = None,
    output_dir: Path | str | None = None,
    posts_per_account: int = 5,
    posts_per_query: int = 10,
    generated_at: datetime | None = None,
    vol_monitor: Callable[[], Mapping[str, object]] | None = None,
    gamma_monitor: Callable[[], Mapping[str, object]] | None = None,
    news_collector: Callable[[], Mapping[str, object]] | None = None,
    tape_snapshot: Callable[[], Mapping[str, object]] | None = None,
    ai_infra: Callable[[], Mapping[str, object]] | None = None,
    news_max_tickers: int = 12,
) -> dict[str, object]:
    now = generated_at or datetime.now(timezone.utc)
    if x_collector is None:
        session_guard = ensure_x_session(now=now)
    else:
        session_guard = {
            "status": "skipped_injected_collector",
            "logged_in_accounts": [],
            "attempted": [],
            "detail": "Injected collector; twscrape pool guard not run.",
        }
    collector = x_collector or XWatchlistCollector()
    target_dir = Path(output_dir) if output_dir is not None else default_news_layer_output_dir(now)
    target_dir.mkdir(parents=True, exist_ok=True)

    accounts = collector.collect_accounts(
        max_accounts=len(collector.config.accounts),
        posts_per_account=posts_per_account,
    )
    searches = collector.collect_searches(
        max_queries=len(collector.config.search_queries),
        posts_per_query=posts_per_query,
    )
    bernstein_monitor = _build_bernstein_monitor(searches, generated_at=now.isoformat())
    vol_structure = _build_vol_structure(vol_monitor, x_collector, now=now)
    gamma_exposure = _build_gamma_exposure(gamma_monitor, x_collector, now=now)
    news_wire = _build_news_wire(news_collector, x_collector, news_max_tickers=news_max_tickers)
    market_tape = _build_market_tape(tape_snapshot, x_collector, now=now)
    ai_infra_update = _build_ai_infra(ai_infra, x_collector, now=now)
    watchlist_events = watchlist_notes.build_watchlist_event_insights(lookahead_days=180)
    executive_summary = _build_executive_summary(accounts, searches, news_wire, generated_at=now.isoformat())
    ranked_following = _ranked_post_briefs(_posts(accounts), limit=10, generated_at=now.isoformat())
    top_news_and_tickers = _top_news_and_tickers_payload(accounts, searches, news_wire, generated_at=now.isoformat())

    result: dict[str, object] = {
        "schema_version": 2,
        "generated_at": now.isoformat(),
        "source_status": _combined_status(accounts, searches, news_wire),
        "session_guard": session_guard,
        "accounts": accounts,
        "searches": searches,
        "news_wire": news_wire,
        "market_tape": market_tape,
        "ai_infra_update": ai_infra_update,
        "bernstein_monitor": bernstein_monitor,
        "vol_structure_monitor": vol_structure,
        "gamma_exposure_monitor": gamma_exposure,
        "watchlist_events": watchlist_events,
        "executive_summary": executive_summary,
        "ranked_twitter_following": ranked_following,
        "top_news_and_tickers": top_news_and_tickers,
    }
    report_markdown = format_news_layer_report(result)
    paths = _write_artifacts(result, report_markdown, target_dir)
    result["paths"] = {key: str(value) for key, value in paths.items()}
    result["report_markdown"] = report_markdown
    return result


def format_news_layer_report(result: Mapping[str, object]) -> str:
    summary = _mapping(result.get("executive_summary"))
    bernstein = _mapping(result.get("bernstein_monitor"))
    accounts = _mapping(result.get("accounts"))
    searches = _mapping(result.get("searches"))
    generated_at = str(result.get("generated_at") or "")

    lines = [
        "# TickerPulse News Layer Review",
        "",
        f"Generated: {result.get('generated_at', '')}",
        f"Source status: {result.get('source_status', 'unknown')}",
    ]
    lines.extend(_ranked_twitter_following_lines(accounts, generated_at=generated_at))
    lines.extend(_top_news_and_ticker_lines(accounts, searches, generated_at=generated_at))
    lines.extend(_vol_structure_lines(_mapping(result.get("vol_structure_monitor"))))
    lines.extend(_gamma_exposure_lines(_mapping(result.get("gamma_exposure_monitor"))))
    lines.extend(_market_tape_lines(_mapping(result.get("market_tape"))))
    lines.extend(_ai_infra_lines(_mapping(result.get("ai_infra_update"))))
    lines.extend(_executive_summary_lines(summary))
    lines.extend(_topic_lines(summary.get("top_topics")))
    lines.extend(_bernstein_lines(bernstein))
    lines.extend(_watchlist_event_lines(result.get("watchlist_events")))
    lines.extend(_post_section("Fast X Tape", _posts(accounts)[:10]))
    lines.extend(_post_section("X Search Tape", _posts(searches)[:10]))
    lines.extend(_post_section("News Wire Tape", _posts(_mapping(result.get("news_wire")))[:15]))
    lines.extend(
        _source_health_lines(
            accounts,
            searches,
            _mapping(result.get("session_guard")),
            news_wire=_mapping(result.get("news_wire")),
            market_tape=_mapping(result.get("market_tape")),
            ai_infra=_mapping(result.get("ai_infra_update")),
        )
    )
    return "\n".join(lines).rstrip() + "\n"


def _write_artifacts(
    result: Mapping[str, object],
    report_markdown: str,
    target_dir: Path,
) -> dict[str, Path]:
    raw_path = target_dir / "tickerpulse_news_layer_raw.json"
    summary_path = target_dir / "tickerpulse_news_layer_summary.json"
    report_path = target_dir / "daily_news_layer_report.md"

    raw_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    summary_payload = {
        "generated_at": result.get("generated_at"),
        "source_status": result.get("source_status"),
        "schema_version": result.get("schema_version"),
        "news_wire": result.get("news_wire"),
        "market_tape": result.get("market_tape"),
        "ai_infra_update": result.get("ai_infra_update"),
        "session_guard": result.get("session_guard"),
        "executive_summary": result.get("executive_summary"),
        "ranked_twitter_following": result.get("ranked_twitter_following"),
        "top_news_and_tickers": result.get("top_news_and_tickers"),
        "bernstein_monitor": result.get("bernstein_monitor"),
        "vol_structure_monitor": result.get("vol_structure_monitor"),
        "gamma_exposure_monitor": result.get("gamma_exposure_monitor"),
        "watchlist_events": result.get("watchlist_events"),
    }
    summary_path.write_text(json.dumps(summary_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    report_path.write_text(report_markdown, encoding="utf-8")
    return {
        "raw_json": raw_path,
        "summary_json": summary_path,
        "report_markdown": report_path,
    }


def _build_executive_summary(
    accounts: Mapping[str, object],
    searches: Mapping[str, object],
    news_wire: Mapping[str, object] | None = None,
    *,
    generated_at: str,
) -> dict[str, object]:
    account_posts = _posts(accounts)
    search_posts = _posts(searches)
    news_posts = _posts(news_wire or {})
    x_posts = [*account_posts, *search_posts]
    all_posts = [*x_posts, *news_posts]
    top_stories = build_story_cards(all_posts, generated_at=generated_at, limit=5)
    bullets: list[str] = []
    if not x_posts and news_posts:
        bullets.append(
            "X lanes returned 0 posts (session outage or collection failure) - "
            "wire-only briefing; see Source Health for the classified cause."
        )
    if top_stories:
        bullets.extend(f"{story['theme']}: {story['headline']}" for story in top_stories)
    elif not all_posts:
        bullets.append(
            "0 posts collected across all lanes (collection outage, not quality gating) - "
            "see Source Health for the classified cause."
        )
    else:
        bullets.append(
            "No fresh high-signal stories survived quality gating; review raw tape "
            "and source health below."
        )
    return {
        "bullets": bullets,
        "top_stories": top_stories,
        "top_topics": _top_topics(all_posts),
    }


def _build_vol_structure(
    vol_monitor: Callable[[], Mapping[str, object]] | None,
    x_collector: NewsLayerCollectorProtocol | None,
    *,
    now: datetime,
) -> dict[str, object]:
    if vol_monitor is not None:
        try:
            return dict(vol_monitor())
        except Exception as exc:  # monitor failure must not kill the news run
            return _vol_structure_error(f"injected vol monitor failed: {exc}", now=now)
    if x_collector is not None:
        return {
            "status": "skipped_injected_collector",
            "generated_at": now.isoformat(),
            "signals": [],
            "overall_level": "unknown",
            "headline": "Injected collector; CBOE VIXEQ/COR1M fetch not run.",
            "errors": [],
        }
    try:
        return build_vol_structure_monitor(now=now)
    except Exception as exc:  # monitor failure must not kill the news run
        return _vol_structure_error(f"vol structure monitor failed: {exc}", now=now)


def _vol_structure_error(message: str, *, now: datetime) -> dict[str, object]:
    return {
        "status": "error",
        "generated_at": now.isoformat(),
        "signals": [],
        "overall_level": "unknown",
        "headline": "Leverage monitor failed - check connectivity, do not assume calm.",
        "errors": [message],
    }


def _build_gamma_exposure(
    gamma_monitor: Callable[[], Mapping[str, object]] | None,
    x_collector: NewsLayerCollectorProtocol | None,
    *,
    now: datetime,
) -> dict[str, object]:
    if gamma_monitor is not None:
        try:
            return dict(gamma_monitor())
        except Exception as exc:  # monitor failure must not kill the news run
            return _gamma_exposure_error(f"injected gamma monitor failed: {exc}", now=now)
    if x_collector is not None:
        return {
            "status": "skipped_injected_collector",
            "generated_at": now.isoformat(),
            "signals": [],
            "overall_level": "unknown",
            "headline": "Injected collector; CBOE option-chain GEX fetch not run.",
            "errors": [],
        }
    try:
        return build_gamma_exposure_monitor(now=now)
    except Exception as exc:  # monitor failure must not kill the news run
        return _gamma_exposure_error(f"gamma exposure monitor failed: {exc}", now=now)


def _gamma_exposure_error(message: str, *, now: datetime) -> dict[str, object]:
    return {
        "status": "error",
        "generated_at": now.isoformat(),
        "signals": [],
        "overall_level": "unknown",
        "headline": "Dealer gamma monitor failed - check connectivity, do not assume positive gamma.",
        "errors": [message],
    }


def _build_news_wire(
    news_collector: Callable[[], Mapping[str, object]] | None,
    x_collector: NewsLayerCollectorProtocol | None,
    *,
    news_max_tickers: int,
) -> dict[str, object]:
    if news_collector is not None:
        try:
            return dict(news_collector())
        except Exception as exc:  # lane failure must not kill the news run
            return _lane_error_payload("news_wire", f"injected news collector failed: {exc}")
    if x_collector is not None:
        return {"source_status": "skipped_injected_collector", "tickers_checked": 0, "articles_collected": 0, "posts": [], "errors": []}
    try:
        from backend.services.news_wire_collector import collect_news_wire

        return dict(collect_news_wire(max_tickers=news_max_tickers))
    except Exception as exc:
        return _lane_error_payload("news_wire", f"news wire collection failed: {exc}")


def _build_market_tape(
    tape_snapshot: Callable[[], Mapping[str, object]] | None,
    x_collector: NewsLayerCollectorProtocol | None,
    *,
    now: datetime,
) -> dict[str, object]:
    if tape_snapshot is not None:
        try:
            return dict(tape_snapshot())
        except Exception as exc:
            return {"source_status": "error", "generated_at": now.isoformat(), "as_of": "", "rows": [], "errors": [{"source": "tape", "message": f"injected tape snapshot failed: {exc}"}]}
    if x_collector is not None:
        return {"source_status": "skipped_injected_collector", "generated_at": now.isoformat(), "as_of": "", "rows": [], "errors": []}
    try:
        from backend.services.market_tape_snapshot import build_market_tape_snapshot

        return dict(build_market_tape_snapshot(now=now))
    except Exception as exc:
        return {"source_status": "error", "generated_at": now.isoformat(), "as_of": "", "rows": [], "errors": [{"source": "tape", "message": str(exc)}]}


def _build_ai_infra(
    ai_infra: Callable[[], Mapping[str, object]] | None,
    x_collector: NewsLayerCollectorProtocol | None,
    *,
    now: datetime,
) -> dict[str, object]:
    if ai_infra is not None:
        try:
            return _ai_infra_with_staleness(dict(ai_infra()), now=now)
        except Exception as exc:
            return _lane_error_payload("ai_infra", f"injected ai infra source failed: {exc}")
    if x_collector is not None:
        return {"source_status": "skipped_injected_collector", "items": [], "errors": [], "report_timestamp_utc": None}
    try:
        from backend.services.ai_infra_update import build_ai_infra_update

        return _ai_infra_with_staleness(dict(build_ai_infra_update()), now=now)
    except Exception as exc:
        return _lane_error_payload("ai_infra", f"ai infra update failed: {exc}")


def _ai_infra_with_staleness(payload: dict[str, object], *, now: datetime) -> dict[str, object]:
    stamp = parse_datetime(str(payload.get("report_timestamp_utc") or ""))
    if stamp is None:
        payload["staleness"] = {"age_hours": None, "stale": True, "note": "report timestamp missing or unparseable - run /ai-infra-update first"}
        return payload
    age_hours = round((now - stamp).total_seconds() / 3600, 1)
    stale = age_hours > 36.0
    payload["staleness"] = {"age_hours": age_hours, "stale": stale, "note": "run /ai-infra-update first" if stale else ""}
    return payload


def _lane_error_payload(lane: str, message: str) -> dict[str, object]:
    payload: dict[str, object] = {"source_status": "error", "posts": [], "items": [], "errors": [{"source": lane, "message": message}]}
    if lane == "news_wire":
        payload.update({"tickers_checked": 0, "articles_collected": 0})
    return payload


def _build_bernstein_monitor(
    searches: Mapping[str, object],
    *,
    generated_at: str,
) -> dict[str, object]:
    reference = parse_datetime(generated_at)
    echoes = [post for post in _posts(searches) if is_bernstein_post(post)]
    lead_eligible = [
        post
        for post in echoes
        if bernstein_echo_relevant(post) and freshness_bucket(post, reference) >= 2
    ]
    lead_eligible.sort(
        key=lambda post: (
            int(grade_source(post)["score"]),
            freshness_bucket(post, reference),
            signal_score(post),
            post_timestamp(post),
        ),
        reverse=True,
    )
    top_echoes = [
        {**_post_brief(post), "source_label": bernstein_source_label(post)}
        for post in lead_eligible[:5]
    ]
    return {
        "public_echo_posts": len(echoes),
        "top_public_echoes": top_echoes,
        "suppressed_from_lead": len(echoes) - len(lead_eligible),
        "source_quality_policy": (
            "Primary Bernstein reports require entitled access outside the default "
            "news scrape; public summaries and X echoes are alert sources only."
        ),
    }


def _combined_status(
    accounts: Mapping[str, object],
    searches: Mapping[str, object],
    news_wire: Mapping[str, object] | None = None,
) -> str:
    skip_markers = {"skipped", "skipped_injected_collector"}
    lane_statuses = [
        str(accounts.get("source_status") or "unknown"),
        str(searches.get("source_status") or "unknown"),
    ]
    news_status = str((news_wire or {}).get("source_status") or "skipped")
    if news_status not in skip_markers:
        lane_statuses.append(news_status)
    if all(status == "error" for status in lane_statuses):
        return "error"
    if any(status in {"error", "degraded"} for status in lane_statuses):
        return "degraded"
    return "ok"


def _top_topics(posts: Sequence[Mapping[str, object]]) -> list[dict[str, object]]:
    topics: list[dict[str, object]] = []
    for name, keywords in STORY_THEMES:
        matched_posts = [post for post in posts if contains_any(post_text(post), keywords)]
        if matched_posts:
            topics.append({"topic": name, "mentions": len(matched_posts)})
    topics.sort(key=lambda item: int(item["mentions"]), reverse=True)
    return topics[:6]


def _posts(payload: Mapping[str, object]) -> list[dict[str, object]]:
    raw_posts = payload.get("posts")
    if not isinstance(raw_posts, list):
        return []
    posts: list[dict[str, object]] = []
    for item in raw_posts:
        if isinstance(item, dict):
            posts.append({str(key): value for key, value in item.items()})
    return posts


def _post_brief(post: Mapping[str, object]) -> dict[str, object]:
    return {
        "source": str(post.get("handle") or post.get("source_query") or "x"),
        "lane": str(post.get("lane") or ""),
        "date": str(post.get("date") or ""),
        "text": truncate(post_text(post), 220),
        "url": str(post.get("url") or ""),
        "matched_keywords": _strings(post.get("matched_keywords")),
        "signal_score": post.get("signal_score", 0),
        "source_reliability_score": source_reliability_score(post),
        "source_reliability_started_at": str(post.get("source_reliability_started_at") or ""),
        "source_reliability_basis": str(post.get("source_reliability_basis") or ""),
    }


def _ranked_post_briefs(
    posts: Sequence[Mapping[str, object]],
    *,
    limit: int,
    generated_at: str = "",
) -> list[dict[str, object]]:
    ranked = _rank_posts(fresh_posts(posts, generated_at=generated_at), generated_at=generated_at)
    return [_post_brief(post) for post in ranked[:limit]]


def _top_news_and_tickers_payload(
    accounts: Mapping[str, object],
    searches: Mapping[str, object],
    news_wire: Mapping[str, object] | None = None,
    *,
    generated_at: str = "",
) -> dict[str, object]:
    account_posts = _posts(accounts)
    search_posts = _posts(searches)
    news_posts = _posts(news_wire or {})
    ticker_posts = fresh_posts([*account_posts, *search_posts, *news_posts], generated_at=generated_at)
    return {
        "top_news": _ranked_post_briefs([*search_posts, *news_posts], limit=5, generated_at=generated_at),
        "top_tickers": _top_tickers(ticker_posts, limit=10),
    }


def _rank_posts(
    posts: Sequence[Mapping[str, object]],
    *,
    generated_at: str = "",
) -> list[Mapping[str, object]]:
    reference = parse_datetime(generated_at)
    return sorted(
        posts,
        key=lambda post: (
            freshness_bucket(post, reference),
            source_reliability_score(post),
            signal_score(post),
            post_timestamp(post),
        ),
        reverse=True,
    )


def _source_reliability_line(post: Mapping[str, object]) -> str:
    score = source_reliability_score(post)
    if score <= 0:
        return ""
    started_at = str(post.get("source_reliability_started_at") or "unknown start")
    basis = truncate(str(post.get("source_reliability_basis") or ""), 180)
    if basis:
        return f"Reliability: {score:.1f} since {started_at} - {basis}"
    return f"Reliability: {score:.1f} since {started_at}"


def _top_tickers(posts: Sequence[Mapping[str, object]], *, limit: int) -> list[str]:
    counts: Counter[str] = Counter()
    for post in posts:
        counts.update(tickers_for_post(post))
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    known = _known_cashtags()
    known_ranked = [ticker for ticker, _count in ranked if ticker in known]
    if known_ranked:
        return known_ranked[:limit]
    return [ticker for ticker, _count in ranked[:limit]]


def _known_cashtags() -> set[str]:
    tags: set[str] = set()
    for item in load_dashboard_watchlist():
        for key in ("ticker", "source_symbol"):
            tag = _cashtag_from_symbol(str(item.get(key) or ""))
            if tag:
                tags.add(tag)
    return tags


def _cashtag_from_symbol(symbol: str) -> str:
    root = symbol.strip().upper().split("-")[0].split(".")[0].replace("/", "")
    letters = "".join(char for char in root if char.isalpha())
    if not 1 <= len(letters) <= 6:
        return ""
    return f"${letters}"


def _mapping(value: object) -> Mapping[str, object]:
    return value if isinstance(value, Mapping) else {}


def _strings(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def _executive_summary_lines(summary: Mapping[str, object]) -> list[str]:
    lines = ["", "## Executive Summary"]
    stories = _briefs(summary.get("top_stories"))
    if not stories:
        lines.extend(f"- {item}" for item in _strings(summary.get("bullets")))
        return lines

    for index, story in enumerate(stories, start=1):
        lines.append(f"{index}. {story.get('theme')} - {story.get('headline')}")
        lines.append(f"   What happened: {story.get('claim')}")
        lines.append(f"   Expectation delta: {story.get('expectation_delta')}")
        lines.append(f"   Impact: {story.get('impact')}")
        lines.append(f"   Affected tickers: {_affected_tickers_text(story)}")
        lines.append(f"   Confidence: {story.get('confidence')}")
        lines.append(f"   Sources: {_story_sources_text(story)}")
        lines.append(f"   Next check: {story.get('next_check')}")
    return lines


def _affected_tickers_text(story: Mapping[str, object]) -> str:
    tickers = _strings(story.get("affected_tickers"))
    if not tickers:
        return "none detected yet"
    text = ", ".join(tickers)
    if str(story.get("ticker_basis") or "") == "theme basket":
        return f"{text} (theme basket)"
    return text


def _story_sources_text(story: Mapping[str, object]) -> str:
    parts = []
    for source in _briefs(story.get("sources")):
        parts.append(f"{source.get('source')} ({source.get('grade')})")
    return "; ".join(parts) if parts else "none"


def _topic_lines(value: object) -> list[str]:
    topics = value if isinstance(value, list) else []
    if not topics:
        return ["", "### Top Topics", "- No high-signal configured topics matched."]
    lines = ["", "### Top Topics"]
    for item in topics:
        if isinstance(item, Mapping):
            lines.append(f"- {item.get('topic')}: {item.get('mentions')} mentions")
    return lines


def _fmt_pct(value: object) -> str:
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return "n/a"
    return f"{number:+.2f}%"


def _market_tape_lines(tape: Mapping[str, object]) -> list[str]:
    lines = [
        "",
        "## Market Tape",
        f"- Status: {tape.get('source_status', 'unknown')}; as of {tape.get('as_of') or 'n/a'}",
    ]
    rows = tape.get("rows")
    if isinstance(rows, list):
        for row in rows:
            if not isinstance(row, Mapping):
                continue
            lines.append(
                f"- {row.get('label')}: {row.get('last')} | 1d {_fmt_pct(row.get('chg_1d_pct'))} | 5d {_fmt_pct(row.get('chg_5d_pct'))}"
            )
    for error in _errors(tape):
        lines.append(f"- Tape error: {error}")
    return lines


def _ai_infra_lines(payload: Mapping[str, object]) -> list[str]:
    staleness = _mapping(payload.get("staleness"))
    title = "## AI Infra (GPU rental)"
    if staleness.get("stale"):
        age = staleness.get("age_hours")
        age_text = f"{age}h" if age is not None else "age unknown"
        title = f"## AI Infra (GPU rental) - STALE ({age_text}) - run /ai-infra-update first"
    lines = [
        "",
        title,
        f"- Status: {payload.get('source_status', 'unknown')}; report {payload.get('report_timestamp_utc') or 'n/a'}",
    ]
    items = payload.get("items")
    if isinstance(items, list):
        for item in items:
            if not isinstance(item, Mapping):
                continue
            meta = _mapping(item.get("metadata"))
            chg7 = meta.get("price_change_7d_pct")
            try:
                expanded = abs(float(chg7)) > 5.0  # type: ignore[arg-type]
            except (TypeError, ValueError):
                expanded = False
            if expanded:
                lines.append(f"- {item.get('title')}")
                read_7d = str(meta.get("price_read_7d") or "").strip()
                if read_7d:
                    lines.append(f"  - Read: 7D {read_7d}; 30D {meta.get('price_read_30d')}")
            else:
                lines.append(
                    f"- {meta.get('gpu')}: median ${meta.get('median_usd_per_gpu_hr')}, "
                    f"7D {_fmt_pct(chg7)}, 30D {_fmt_pct(meta.get('price_change_30d_pct'))}"
                )
    for error in _errors(payload):
        lines.append(f"- AI infra error: {error}")
    return lines


def _vol_structure_lines(monitor: Mapping[str, object]) -> list[str]:
    lines = ["", "## Leverage & Correlation Monitor"]
    status = str(monitor.get("status") or "not run")
    overall = str(monitor.get("overall_level") or "unknown")
    lines.append(f"- Status: {status}; level: {overall}")
    headline = str(monitor.get("headline") or "")
    if headline:
        lines.append(f"- {headline}")

    indices = _mapping(monitor.get("indices"))
    for name, descriptor in (
        ("COR1M", "1M implied correlation"),
        ("VIXEQ", "single-stock implied vol"),
        ("VIX", "index implied vol"),
    ):
        info = _mapping(indices.get(name))
        if not info:
            continue
        live = info.get("live")
        live_text = f", live {live}" if live is not None else ""
        lines.append(
            f"- {name} {info.get('close')} ({descriptor}; close {info.get('close_date')}"
            f"{live_text}; 1d {info.get('change_1d')}; 1y pctile {info.get('pctile_1y')}; "
            f"full pctile {info.get('pctile_full')})"
        )

    derived = _mapping(monitor.get("derived"))
    if derived.get("vixeq_vix_ratio") is not None:
        lines.append(
            f"- VIXEQ-VIX spread {derived.get('vixeq_vix_spread')}; ratio "
            f"{derived.get('vixeq_vix_ratio')} (1y pctile {derived.get('ratio_pctile_1y')}); "
            f"COR1M 1d {derived.get('cor1m_change_1d_pts')} pts / "
            f"{derived.get('cor1m_change_1d_pct')}%, 5d {derived.get('cor1m_change_5d_pts')} pts"
        )

    signals = monitor.get("signals")
    for signal in signals if isinstance(signals, list) else []:
        if isinstance(signal, Mapping):
            lines.append(f"- Signal [{signal.get('level')}] {signal.get('name')}: {signal.get('detail')}")
    if isinstance(signals, list) and not signals and status == "ok":
        lines.append("- No critical leverage/correlation signals today.")

    for error in _strings(monitor.get("errors")):
        lines.append(f"- Monitor error: {error}")
    return lines


def _gamma_exposure_lines(monitor: Mapping[str, object]) -> list[str]:
    lines = ["", "## Dealer Gamma Monitor"]
    status = str(monitor.get("status") or "not run")
    overall = str(monitor.get("overall_level") or "unknown")
    lines.append(f"- Status: {status}; level: {overall}")
    headline = str(monitor.get("headline") or "")
    if headline:
        lines.append(f"- {headline}")

    underlyings = _mapping(monitor.get("underlyings"))
    for name, info_obj in underlyings.items():
        info = _mapping(info_obj)
        if not info:
            continue
        flip = info.get("flip_level")
        flip_text = flip if flip is not None else "n/a (no zero-gamma crossing within +/-15%)"
        distance = info.get("distance_to_flip_pct")
        distance_text = f"{distance}%" if distance is not None else "n/a"
        lines.append(
            f"- {name}: spot {info.get('spot')}; zero-gamma flip {flip_text}; "
            f"distance {distance_text}; regime {info.get('regime')} gamma; "
            f"net GEX {info.get('net_gex_bn_per_pct')}bn per 1% move "
            f"(contracts used {info.get('contracts_used')}, skipped {info.get('contracts_skipped')})"
        )

    signals = monitor.get("signals")
    for signal in signals if isinstance(signals, list) else []:
        if isinstance(signal, Mapping):
            lines.append(f"- Signal [{signal.get('level')}] {signal.get('name')}: {signal.get('detail')}")
    if isinstance(signals, list) and not signals and status == "ok":
        lines.append(
            "- No gamma-flip signals today: dealers net +gamma with comfortable distance to the flip."
        )

    for error in _strings(monitor.get("errors")):
        lines.append(f"- Monitor error: {error}")
    return lines


def _bernstein_lines(bernstein: Mapping[str, object]) -> list[str]:
    lines = [
        "",
        "## Bernstein Monitor",
        f"- Public echo posts: {bernstein.get('public_echo_posts', 0)}",
        f"- Suppressed from AI/semi lead (stale or off-topic): {bernstein.get('suppressed_from_lead', 0)}",
        f"- Source policy: {bernstein.get('source_quality_policy', '')}",
    ]
    for post in _briefs(bernstein.get("top_public_echoes")):
        label = str(post.get("source_label") or "unconfirmed echo")
        lines.append(
            f"- Echo [{label}]: {post.get('date')} {post.get('source')} - {post.get('text')} {post.get('url')}"
        )
    return lines


def _ranked_twitter_following_lines(
    accounts: Mapping[str, object],
    *,
    generated_at: str,
) -> list[str]:
    account_posts = fresh_posts(_posts(accounts), generated_at=generated_at)
    posts = _rank_posts(account_posts, generated_at=generated_at)
    lines = ["", "## Ranked Twitter Following"]
    if not posts:
        return [*lines, "- No followed-account posts collected."]

    for index, post in enumerate(posts[:10], start=1):
        brief = _post_brief(post)
        tickers = tickers_for_post(post)
        score = signal_score(post)
        lines.append(
            f"{index}. {brief['source']} [{brief['lane']}] score {score}: "
            f"{brief['text']} {brief['url']}"
        )
        reliability_line = _source_reliability_line(post)
        if reliability_line:
            lines.append(f"   {reliability_line}")
        lines.append(f"   What happened: {what_happened_for_post(post)}")
        lines.append(f"   Expectation delta: {expectation_delta_for_post(post)}")
        lines.append(f"   Impact: {impact_for_post(post, tickers, source_type='followed account')}")
        lines.append(f"   What to do: {action_for_post(post, tickers, source_type='followed account')}")
    return lines


def _top_news_and_ticker_lines(
    accounts: Mapping[str, object],
    searches: Mapping[str, object],
    *,
    generated_at: str,
) -> list[str]:
    account_posts = _posts(accounts)
    search_posts = _rank_posts(_posts(searches), generated_at=generated_at)
    ticker_posts = fresh_posts([*account_posts, *search_posts], generated_at=generated_at)
    top_tickers = _top_tickers(ticker_posts, limit=10)
    lines = ["", "## Top News And Tickers"]
    if top_tickers:
        lines.append(f"- Top tickers: {', '.join(top_tickers)}")
    else:
        lines.append("- Top tickers: none detected in collected posts.")

    if not search_posts:
        return [*lines, "- Top news: no search/news posts collected."]

    lines.append("- Top news:")
    for index, post in enumerate(search_posts[:5], start=1):
        brief = _post_brief(post)
        tickers = tickers_for_post(post)
        lines.append(
            f"  {index}. {brief['source']} [{brief['lane']}] score {signal_score(post)}: "
            f"{brief['text']} {brief['url']}"
        )
        lines.append(f"     What happened: {what_happened_for_post(post)}")
        lines.append(f"     Expectation delta: {expectation_delta_for_post(post)}")
        lines.append(f"     Impact: {impact_for_post(post, tickers, source_type='search/news')}")
        lines.append(f"     What to do: {action_for_post(post, tickers, source_type='search/news')}")
    return lines


def _watchlist_event_lines(value: object) -> list[str]:
    events = _briefs(value)
    lines = ["", "## Watchlist Catalyst Events"]
    if not events:
        return [*lines, "- No dated watchlist catalyst events in the current window."]

    for event in events[:10]:
        metadata = _mapping(event.get("metadata"))
        ticker = metadata.get("ticker") or "watchlist"
        event_date = metadata.get("event_date") or "undated"
        title = event.get("title") or "Watchlist event"
        lines.append(f"- {event_date} {ticker}: {title}")
    return lines


def _post_section(title: str, posts: Sequence[Mapping[str, object]]) -> list[str]:
    lines = ["", f"## {title}"]
    if not posts:
        return [*lines, "- No posts collected."]
    for post in posts:
        brief = _post_brief(post)
        lines.append(f"- {brief['date']} {brief['source']} [{brief['lane']}]: {brief['text']} {brief['url']}")
    return lines


def _source_health_lines(
    accounts: Mapping[str, object],
    searches: Mapping[str, object],
    session_guard: Mapping[str, object] | None = None,
    *,
    news_wire: Mapping[str, object] | None = None,
    market_tape: Mapping[str, object] | None = None,
    ai_infra: Mapping[str, object] | None = None,
) -> list[str]:
    account_posts = _posts(accounts)
    search_posts = _posts(searches)
    news = news_wire or {}
    tape = market_tape or {}
    infra = ai_infra or {}
    guard = session_guard or {}
    guard_status = str(guard.get("status") or "not run")
    guard_detail = str(guard.get("detail") or "")
    guard_line = f"- X session guard: {guard_status}"
    if guard_detail:
        guard_line = f"{guard_line}; {guard_detail}"
    tape_rows = tape.get("rows")
    lines = [
        "",
        "## Source Health",
        f"- X accounts: {accounts.get('source_status', 'unknown')}; checked {accounts.get('accounts_checked', 0)}",
        f"- X searches: {searches.get('source_status', 'unknown')}; checked {searches.get('queries_checked', 0)}",
        f"- News wire: {news.get('source_status', 'skipped')}; tickers {news.get('tickers_checked', 0)}, articles {news.get('articles_collected', 0)}",
        f"- Market tape: {tape.get('source_status', 'skipped')}; rows {len(tape_rows) if isinstance(tape_rows, list) else 0}",
        f"- AI infra: {infra.get('source_status', 'skipped')}",
        f"- Posts reviewed: {len(account_posts)} followed-account posts, {len(search_posts)} search posts, {len(_posts(news))} wire articles.",
        guard_line,
    ]
    for error in _errors(accounts):
        lines.append(f"- Account error: {error}")
    for error in _errors(searches):
        lines.append(f"- Search error: {error}")
    for error in _errors(news):
        lines.append(f"- News wire error: {error}")
    for error in _errors(tape):
        lines.append(f"- Tape error: {error}")
    for error in _errors(infra):
        lines.append(f"- AI infra error: {error}")
    return lines


def _errors(payload: Mapping[str, object]) -> list[str]:
    raw_errors = payload.get("errors")
    if not isinstance(raw_errors, list):
        return []
    return [_error_summary(error) for error in raw_errors]


def _error_summary(error: object) -> str:
    if not isinstance(error, Mapping):
        return truncate(str(error), 240)
    label = str(error.get("handle") or error.get("query") or error.get("source") or "source")
    message = str(error.get("message") or error.get("error") or error)
    last_line = _last_nonempty_line(message)
    return f"{label}: {truncate(last_line, 220)}"


def _last_nonempty_line(value: str) -> str:
    for line in reversed(value.splitlines()):
        if line.strip():
            return line.strip()
    return value.strip()


def _briefs(value: object) -> list[Mapping[str, object]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, Mapping)]
