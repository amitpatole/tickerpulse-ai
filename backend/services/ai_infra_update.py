"""AI infrastructure update source for market sweeps."""

from __future__ import annotations

import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_AI_INFRA_REPORT_DIR = Path(
    r"D:\Crypto Data\Analysis\20260605 - GPU rental daily report"
)

RELATED_AI_INFRA_TICKERS = [
    "NVDA",
    "AMD",
    "AVGO",
    "MU",
    "SMCI",
    "VRT",
    "ARM",
    "TSM",
    "ORCL",
    "MSFT",
    "AMZN",
    "GOOGL",
    "META",
    "NBIS",
    "CRWV",
]


def build_ai_infra_update(report_dir: Path | str | None = None) -> dict[str, object]:
    root = Path(report_dir) if report_dir is not None else DEFAULT_AI_INFRA_REPORT_DIR
    report_path = root / "daily-report.md"
    if not report_path.exists():
        return _degraded(root, report_path, f"daily-report.md not found at {report_path}")

    try:
        report_text = report_path.read_text(encoding="utf-8")
    except OSError as exc:
        logger.warning("AI infra update report could not be read: %s", exc)
        return _degraded(root, report_path, str(exc))

    history_rows = _extract_ascii_table(report_text, "Historical Market Snapshot")
    if not history_rows:
        return _degraded(root, report_path, "No Historical Market Snapshot rows found")

    read_rows = {
        str(row.get("GPU") or ""): row
        for row in _extract_ascii_table(report_text, "Price + Offer Count Read")
    }
    items = [_history_row_to_item(row, read_rows, report_path) for row in history_rows]
    items.sort(key=lambda item: float(item.get("score") or 0), reverse=True)

    return {
        "source_status": "ok",
        "report_dir": str(root),
        "report_path": str(report_path),
        "report_timestamp_utc": _extract_report_timestamp(report_text),
        "summary": _extract_summary_lines(report_text),
        "items": items,
        "errors": [],
    }


def _degraded(root: Path, report_path: Path, message: str) -> dict[str, object]:
    return {
        "source_status": "degraded",
        "report_dir": str(root),
        "report_path": str(report_path),
        "report_timestamp_utc": None,
        "summary": [],
        "items": [],
        "errors": [{"message": message}],
    }


def _history_row_to_item(
    row: dict[str, str],
    read_rows: dict[str, dict[str, str]],
    report_path: Path,
) -> dict[str, object]:
    gpu = str(row.get("GPU") or "").strip()
    change_7d = _parse_number(row.get("7D Chg", ""))
    change_30d = _parse_number(row.get("30D Chg", ""))
    median_text = str(row.get("Median") or "").strip()
    offers_text = str(row.get("Offers") or "").strip()
    score = 50.0 + min(45.0, max(abs(change_7d or 0.0), abs(change_30d or 0.0)))
    read_row = read_rows.get(gpu, {})

    return {
        "source": "ai_infra_update",
        "score": round(score, 1),
        "title": (
            f"AI infra update: {gpu} rental median {median_text}, "
            f"7D {row.get('7D Chg')}, 30D {row.get('30D Chg')}, offers {offers_text}"
        ),
        "url": _path_uri(report_path),
        "metadata": {
            "gpu": gpu,
            "date": str(row.get("Date") or "").strip(),
            "median_usd_per_gpu_hr": _parse_number(median_text),
            "offers": _parse_int(offers_text),
            "price_change_7d_pct": change_7d,
            "price_change_30d_pct": change_30d,
            "offer_change_7d": _parse_int(read_row.get("7D Offer Chg", "")),
            "offer_change_30d": _parse_int(read_row.get("30D Offer Chg", "")),
            "price_read_7d": str(read_row.get("7D Read") or "").strip(),
            "price_read_30d": str(read_row.get("30D Read") or "").strip(),
            "related_tickers": RELATED_AI_INFRA_TICKERS,
        },
    }


def _extract_ascii_table(report_text: str, heading: str) -> list[dict[str, str]]:
    section = _extract_section(report_text, heading)
    table_lines = [line for line in section.splitlines() if line.strip().startswith("|")]
    if len(table_lines) < 2:
        return []

    headers = _split_table_row(table_lines[0])
    rows: list[dict[str, str]] = []
    for line in table_lines[1:]:
        cells = _split_table_row(line)
        if len(cells) != len(headers):
            continue
        rows.append(dict(zip(headers, cells, strict=False)))
    return rows


def _extract_section(report_text: str, heading: str) -> str:
    match = re.search(rf"^##\s+{re.escape(heading)}\s*$", report_text, flags=re.MULTILINE)
    if match is None:
        return ""
    rest = report_text[match.end() :]
    next_heading = re.search(r"^##\s+", rest, flags=re.MULTILINE)
    return rest[: next_heading.start()] if next_heading else rest


def _split_table_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _extract_report_timestamp(report_text: str) -> str | None:
    match = re.search(r"^Run timestamp UTC:\s*(.+)$", report_text, flags=re.MULTILINE)
    return match.group(1).strip() if match else None


def _extract_summary_lines(report_text: str) -> list[str]:
    lines: list[str] = []
    for heading in ("Source Status", "First-Run Read"):
        section = _extract_section(report_text, heading)
        for line in section.splitlines():
            cleaned = line.strip()
            if cleaned.startswith("- "):
                lines.append(cleaned[2:])
    return lines[:8]


def _parse_number(value: str) -> float | None:
    cleaned = value.replace("$", "").replace("%", "").replace(",", "").strip()
    if not cleaned or cleaned.lower() == "n/a":
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_int(value: str) -> int | None:
    number = _parse_number(value)
    return int(number) if number is not None else None


def _path_uri(path: Path) -> str:
    try:
        return path.resolve().as_uri()
    except ValueError:
        return str(path)
