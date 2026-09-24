"""Idea feed artifacts for downstream research workflows."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def build_idea_feed(sweep_result: dict[str, Any]) -> dict[str, Any]:
    generated_at = str(sweep_result.get("generated_at") or datetime.now(timezone.utc).isoformat())
    insights = list(sweep_result.get("insights") or [])
    insights.extend(_news_intelligence_card_insights(sweep_result.get("news_intelligence"), insights))
    insights.extend(sweep_result.get("watchlist_events") or [])
    ideas = []

    for index, insight in enumerate(insights, 1):
        if not isinstance(insight, dict):
            continue

        metadata = insight.get("metadata") if isinstance(insight.get("metadata"), dict) else {}
        title = str(insight.get("title") or "Untitled idea").strip()
        source = str(insight.get("source") or "unknown")
        tickers = _extract_tickers(title, metadata)

        ideas.append({
            "id": f"{_timestamp_id(generated_at)}-{index:02d}",
            "status": "needs_review",
            "source": source,
            "score": insight.get("score", 0),
            "title": title,
            "thesis": title,
            "tickers": tickers,
            "url": insight.get("url"),
            "matched_keywords": metadata.get("matched_keywords", []),
            "lane": metadata.get("lane"),
            "next_actions": _next_actions(source, tickers),
            "raw_metadata": metadata,
        })

    return {
        "schema_version": 1,
        "generated_at": generated_at,
        "source_status": sweep_result.get("source_status", "unknown"),
        "inputs": sweep_result.get("inputs", {}),
        "ideas": ideas,
    }


def _news_intelligence_card_insights(
    cards: Any,
    existing_insights: list[Any],
) -> list[dict[str, Any]]:
    if not isinstance(cards, list):
        return []

    seen_ids: set[str] = set()
    for insight in existing_insights:
        if not isinstance(insight, dict):
            continue
        metadata = insight.get("metadata") if isinstance(insight.get("metadata"), dict) else {}
        insight_id = metadata.get("insight_id")
        if insight_id:
            seen_ids.add(str(insight_id))

    insights: list[dict[str, Any]] = []
    for card in cards:
        if not isinstance(card, dict):
            continue
        insight_id = card.get("insight_id")
        if insight_id and str(insight_id) in seen_ids:
            continue
        insights.append(
            {
                "source": "news_intelligence",
                "score": card.get("score", 0),
                "title": str(card.get("source_claim") or "News intelligence card"),
                "url": card.get("source_url"),
                "metadata": {
                    "insight_id": insight_id,
                    "related_tickers": card.get("related_tickers", []),
                    "themes": card.get("themes", []),
                    "source_claim": card.get("source_claim"),
                    "cross_reference_status": card.get("cross_reference_status"),
                    "evidence": card.get("evidence", []),
                    "human_review": card.get("human_review", {}),
                },
            }
        )
        if insight_id:
            seen_ids.add(str(insight_id))
    return insights


def write_idea_feed(feed: dict[str, Any], output_dir: Path | str) -> dict[str, Path]:
    target_dir = Path(output_dir)
    target_dir.mkdir(parents=True, exist_ok=True)

    stamp = _timestamp_id(str(feed.get("generated_at") or datetime.now(timezone.utc).isoformat()))
    snapshot_path = target_dir / f"idea-feed-{stamp}.json"
    latest_path = target_dir / "latest.json"
    payload = json.dumps(feed, ensure_ascii=False, indent=2)

    snapshot_path.write_text(payload, encoding="utf-8")
    latest_path.write_text(payload, encoding="utf-8")

    return {
        "snapshot": snapshot_path,
        "latest": latest_path,
    }


def _extract_tickers(title: str, metadata: dict[str, Any]) -> list[str]:
    tickers: list[str] = []
    _append_ticker_values(tickers, metadata.get("ticker"))
    _append_ticker_values(tickers, metadata.get("tickers"))
    _append_ticker_values(tickers, metadata.get("related_tickers"))

    for match in re.findall(r"\$([A-Z][A-Z0-9]{1,5})\b", title):
        tickers.append(match.upper())

    seen: set[str] = set()
    unique: list[str] = []
    for ticker in tickers:
        if ticker not in seen:
            seen.add(ticker)
            unique.append(ticker)
    return unique


def _next_actions(source: str, tickers: list[str]) -> list[str]:
    actions = ["Review source quality and decide whether this belongs in the research queue."]
    if tickers:
        actions.append("Run focused news/filing check for: " + ", ".join(tickers))
    if source == "x":
        actions.append("Verify the claim with primary news, filings, transcript, or company data before sizing.")
    elif source == "scanner":
        actions.append("Check whether the technical signal aligns with a real catalyst.")
    elif source == "news":
        actions.append("Read the linked article and identify the investable catalyst.")
    elif source == "reddit":
        actions.append("Treat Reddit as discovery only; verify the claim with primary news, filings, transcripts, or company data.")
    elif source == "ai_infra_update":
        actions.append("Map the AI infrastructure signal to exposed watchlist names, then verify with pricing, capex, supply-chain, or customer-demand data.")
    elif source == "watchlist_event":
        actions.append("Put the event date on the research calendar and re-check supply, filings, and price action before acting.")
    elif source == "news_intelligence":
        actions.append("Review the source claim and X expert reaction before promoting this idea into technical filtering.")
    return actions


def _append_ticker_values(tickers: list[str], value: Any) -> None:
    if isinstance(value, list):
        for item in value:
            _append_ticker_values(tickers, item)
        return
    if value:
        tickers.append(str(value).upper())


def _timestamp_id(value: str) -> str:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        parsed = datetime.now(timezone.utc)
    return parsed.strftime("%Y%m%d-%H%M%S")
