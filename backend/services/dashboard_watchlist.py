"""Central dashboard watchlist config helpers."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

import yaml

from backend.config import Config

logger = logging.getLogger(__name__)

_HEADER = (
    "# User-curated dashboard watchlist seed.\n"
    "# Load these into the stocks table for the active dashboard/sweep watchlist.\n"
)


def default_watchlist_path() -> Path:
    return Path(Config.BASE_DIR) / "config" / "dashboard_watchlist.yaml"


def load_dashboard_watchlist(path: Path | None = None) -> list[dict[str, object]]:
    raw = _load_raw(path or default_watchlist_path())
    items = raw.get("items")
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict)]


def upsert_dashboard_watchlist_item(
    ticker: str,
    name: str,
    market: str = "US",
    source_symbol: str | None = None,
    path: Path | None = None,
) -> None:
    target = path or default_watchlist_path()
    raw = _load_raw(target)
    items = raw.get("items")
    if not isinstance(items, list):
        items = []
        raw["items"] = items

    normalized = ticker.strip().upper()
    for item in items:
        if not isinstance(item, dict):
            continue
        if str(item.get("ticker") or "").strip().upper() == normalized:
            item["ticker"] = normalized
            item["name"] = name
            item["market"] = market
            if source_symbol:
                item["source_symbol"] = source_symbol
            _write_raw(target, raw)
            return

    new_item: dict[str, object] = {
        "ticker": normalized,
        "name": name,
        "market": market,
    }
    if source_symbol:
        new_item["source_symbol"] = source_symbol
    items.append(new_item)
    _write_raw(target, raw)


def remove_dashboard_watchlist_item(ticker: str, path: Path | None = None) -> bool:
    target = path or default_watchlist_path()
    raw = _load_raw(target)
    items = raw.get("items")
    if not isinstance(items, list):
        return False

    normalized = ticker.strip().upper()
    kept = [
        item for item in items
        if not (
            isinstance(item, dict)
            and str(item.get("ticker") or "").strip().upper() == normalized
        )
    ]
    if len(kept) == len(items):
        return False

    raw["items"] = kept
    _write_raw(target, raw)
    return True


def sync_dashboard_watchlist_to_db(path: Path | None = None) -> dict[str, int]:
    from backend.core.stock_manager import add_stock

    upserted = 0
    for item in load_dashboard_watchlist(path):
        ticker = str(item.get("ticker") or "").strip().upper()
        name = str(item.get("name") or ticker).strip()
        market = str(item.get("market") or "US").strip()
        if not ticker:
            continue
        if add_stock(ticker, name, market):
            upserted += 1
    return {"upserted": upserted}


def _load_raw(path: Path) -> dict[str, object]:
    if not path.exists():
        return {"updated_at": _today(), "items": []}
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except Exception as exc:
        logger.warning("Could not load dashboard watchlist config %s: %s", path, exc)
        return {"updated_at": _today(), "items": []}
    if not isinstance(raw, dict):
        return {"updated_at": _today(), "items": []}
    return raw


def _write_raw(path: Path, raw: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw["updated_at"] = _today()
    payload = yaml.safe_dump(raw, sort_keys=False, allow_unicode=False)
    path.write_text(_HEADER + payload, encoding="utf-8")


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()
