"""AI token-usage update source (OpenRouter model-share dashboard).

Mirrors ``ai_infra_update`` (GPU rental) but for inference token usage: it reads
the completed-week model-family trend CSV produced by the OpenRouter usage
dashboard and exposes per-family token volume, market share, and 4W/12W trends.
"""

from __future__ import annotations

import csv
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_TOKEN_USAGE_REPORT_DIR = Path(
    r"D:\Crypto Data\Analysis\20260603 - OpenRouter model usage trend"
)
_TREND_CSV = "model_family_trend_summary_completed_weeks.csv"

RELATED_AI_TOKEN_TICKERS = ["GOOGL", "MSFT", "NVDA", "AMZN", "META"]


def build_token_usage_update(report_dir: Path | str | None = None) -> dict[str, object]:
    root = Path(report_dir) if report_dir is not None else DEFAULT_TOKEN_USAGE_REPORT_DIR
    csv_path = root / _TREND_CSV
    if not csv_path.exists():
        return _degraded(root, csv_path, f"{_TREND_CSV} not found at {csv_path}")

    try:
        rows = list(csv.DictReader(csv_path.read_text(encoding="utf-8").splitlines()))
    except OSError as exc:
        logger.warning("Token usage trend CSV could not be read: %s", exc)
        return _degraded(root, csv_path, str(exc))

    if not rows:
        return _degraded(root, csv_path, "Token usage trend CSV had no rows")

    items = [_row_to_item(row, csv_path) for row in rows]
    items.sort(
        key=lambda item: abs(float(_meta(item).get("token_change_4w_pct") or 0.0)),
        reverse=True,
    )

    return {
        "source_status": "ok",
        "report_dir": str(root),
        "report_path": str(csv_path),
        "report_timestamp_utc": _extract_generated_timestamp(root),
        "summary": _extract_summary_lines(root),
        "items": items,
        "errors": [],
    }


def _degraded(root: Path, csv_path: Path, message: str) -> dict[str, object]:
    return {
        "source_status": "degraded",
        "report_dir": str(root),
        "report_path": str(csv_path),
        "report_timestamp_utc": None,
        "summary": [],
        "items": [],
        "errors": [{"message": message}],
    }


def _row_to_item(row: dict[str, str], csv_path: Path) -> dict[str, object]:
    family = str(row.get("label") or row.get("key") or "").strip()
    tokens_t = _parse_number(row.get("latestTokensT", ""))
    share = _parse_number(row.get("latestSharePct", ""))
    change_4w = _parse_number(row.get("change4wPct", ""))
    change_12w = _parse_number(row.get("change12wPct", ""))
    share_4w = _parse_number(row.get("shareChange4wPct", ""))
    share_12w = _parse_number(row.get("shareChange12wPct", ""))
    score = 50.0 + min(45.0, abs(change_4w or 0.0))

    return {
        "source": "token_usage_update",
        "score": round(score, 1),
        "title": (
            f"Token usage: {family} {tokens_t}T tokens, {share}% share, "
            f"4W {_fmt_pct(change_4w)}, 12W {_fmt_pct(change_12w)}"
        ),
        "url": _path_uri(csv_path),
        "metadata": {
            "family": family,
            "key": str(row.get("key") or "").strip(),
            "latest_week": str(row.get("latestCompletedWeek") or "").strip(),
            "tokens_trillions": tokens_t,
            "share_pct": share,
            "token_change_4w_pct": change_4w,
            "token_change_12w_pct": change_12w,
            "share_change_4w_pp": share_4w,
            "share_change_12w_pp": share_12w,
            "related_tickers": RELATED_AI_TOKEN_TICKERS,
        },
    }


def _meta(item: dict[str, object]) -> dict[str, object]:
    meta = item.get("metadata")
    return meta if isinstance(meta, dict) else {}


def _extract_generated_timestamp(root: Path) -> str | None:
    summary_path = root / "summary.md"
    if not summary_path.exists():
        return None
    try:
        text = summary_path.read_text(encoding="utf-8")
    except OSError:
        return None
    match = re.search(r"^Generated:\s*(\d{4}-\d{2}-\d{2})", text, flags=re.MULTILINE)
    return f"{match.group(1)}T00:00:00+00:00" if match else None


def _extract_summary_lines(root: Path) -> list[str]:
    summary_path = root / "summary.md"
    if not summary_path.exists():
        return []
    try:
        text = summary_path.read_text(encoding="utf-8")
    except OSError:
        return []
    lines: list[str] = []
    in_headline = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("Headline:"):
            in_headline = True
            continue
        if in_headline:
            if stripped.startswith("- "):
                lines.append(stripped[2:])
            elif stripped and not stripped.startswith("-"):
                break
    return lines[:6]


def _fmt_pct(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value:+.1f}%"


def _parse_number(value: str) -> float | None:
    cleaned = value.replace("$", "").replace("%", "").replace(",", "").strip()
    if not cleaned or cleaned.lower() == "n/a":
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _path_uri(path: Path) -> str:
    try:
        return path.resolve().as_uri()
    except ValueError:
        return str(path)
