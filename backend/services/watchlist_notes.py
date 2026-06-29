"""Watchlist notes and dated event reminders."""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from pathlib import Path

import yaml

from backend.config import Config

logger = logging.getLogger(__name__)


def build_watchlist_event_insights(
    now: datetime | None = None,
    lookahead_days: int = 90,
    path: Path | None = None,
) -> list[dict[str, object]]:
    """Build idea-feed compatible insights from dated watchlist notes."""
    today = (now or datetime.now(timezone.utc)).date()
    insights: list[dict[str, object]] = []

    for row in _load_event_rows(path or _default_path()):
        ticker = _clean_text(row.get("ticker")).upper()
        title = _clean_text(row.get("title")) or "Watchlist event"
        event_date = _parse_date(row.get("event_date"))
        days_until_event = (event_date - today).days if event_date else None

        if days_until_event is not None:
            if days_until_event < -30 or days_until_event > lookahead_days:
                continue

        display_title = f"{ticker}: {title}" if ticker else title
        if event_date:
            display_title = f"{display_title} ({event_date.isoformat()})"

        insights.append({
            "source": "watchlist_event",
            "score": _event_score(days_until_event),
            "title": display_title,
            "url": _first_source(row.get("sources")),
            "metadata": {
                "ticker": ticker,
                "event_date": event_date.isoformat() if event_date else None,
                "days_until_event": days_until_event,
                "note": _clean_text(row.get("user_note_basis")),
                "process": _string_list(row.get("process")),
                "avoid": _string_list(row.get("avoid")),
                "sources": _string_list(row.get("sources")),
            },
        })

    return insights


def _default_path() -> Path:
    return Path(Config.BASE_DIR) / "config" / "watchlist_notes.yaml"


def _load_event_rows(path: Path) -> list[dict[object, object]]:
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except FileNotFoundError:
        return []
    except Exception as exc:
        logger.warning("Could not load watchlist notes from %s: %s", path, exc)
        return []

    if not isinstance(raw, dict):
        return []

    events = raw.get("events")
    if not isinstance(events, list):
        return []

    rows: list[dict[object, object]] = []
    for event in events:
        if isinstance(event, dict):
            rows.append(event)
    return rows


def _clean_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _parse_date(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    text = _clean_text(value)
    if not text:
        return None

    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    except ValueError:
        logger.warning("Ignoring invalid watchlist event date: %s", text)
        return None


def _event_score(days_until_event: int | None) -> int:
    if days_until_event is None:
        return 55
    if days_until_event < 0:
        return 70
    if days_until_event <= 7:
        return 85
    if days_until_event <= 30:
        return 78
    return 65


def _string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []

    cleaned: list[str] = []
    for item in value:
        text = _clean_text(item)
        if text:
            cleaned.append(text)
    return cleaned


def _first_source(value: object) -> str | None:
    sources = _string_list(value)
    return sources[0] if sources else None
