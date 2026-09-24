#!/usr/bin/env python
"""One-shot bootstrap: tag dashboard_watchlist.yaml with kova `bucket` membership.

Direction is reversed exactly once here (CSV -> yaml) to seed the master; from then
on /daily-chart rebuilds the CSVs FROM the yaml. Invariant (safest migration):
preserve today's /news universe exactly.
  - a ticker already in the yaml: keep it news-tracked, just add its `bucket` if it
    currently lives in a kova watchlist CSV.
  - a ticker living ONLY in a kova CSV today: append it with `news: false`
    (chart-only; stays out of /news).
Idempotent. Asserts every current CSV ticker ends up mapped to exactly one bucket
(no name lost, no double-bucket) before writing.

Run (from the tickerpulse-ai worktree, venv has pyyaml):
  venv\\Scripts\\python.exe -m backend.scripts.migrate_watchlist_buckets \\
      --yaml config\\dashboard_watchlist.yaml \\
      --csv-dir C:\\Repos\\kova-screener\\.worktrees\\watchlist-centralize\\watchlists
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

BUCKET_STEMS = (
    "mlcc",
    "semicap",
    "power800v",
    "passive",
    "memory",
    "core_ai",
    "core_infra",
    "core_power",
    "core_crypto",
    "core_space",
    "core_other",
    "ipos",
)

_HEADER = (
    "# User-curated dashboard watchlist seed.\n"
    "# Load these into the stocks table for the active dashboard/sweep watchlist.\n"
)


def _read_csv_tickers(path: Path) -> list[str]:
    if not path.is_file():
        return []
    out: list[str] = []
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
        cell = line.split(",")[0].strip()
        if not cell:
            continue
        if i == 0 and cell.lower() == "ticker":
            continue
        out.append(cell)
    return out


def build_ticker_bucket_map(csv_dir: Path) -> dict[str, str]:
    """ticker -> bucket from the current CSVs. Errors on a ticker in two buckets."""
    mapping: dict[str, str] = {}
    for stem in BUCKET_STEMS:
        for ticker in _read_csv_tickers(csv_dir / f"{stem}.csv"):
            prior = mapping.get(ticker)
            if prior is not None and prior != stem:
                raise SystemExit(
                    f"ERROR: ticker {ticker!r} is in two CSV buckets "
                    f"({prior!r} and {stem!r}); dedup it to one before migrating."
                )
            mapping[ticker] = stem
    return mapping


def migrate(yaml_path: Path, csv_dir: Path) -> dict:
    raw = yaml.safe_load(yaml_path.read_text(encoding="utf-8")) or {}
    items = raw.get("items")
    if not isinstance(items, list):
        items = []
        raw["items"] = items

    ticker_bucket = build_ticker_bucket_map(csv_dir)
    yaml_tickers = {
        str(it.get("ticker") or "").strip()
        for it in items
        if isinstance(it, dict) and it.get("ticker")
    }

    tagged = 0
    for it in items:
        if not isinstance(it, dict):
            continue
        ticker = str(it.get("ticker") or "").strip()
        bucket = ticker_bucket.get(ticker)
        if bucket and it.get("bucket") != bucket:
            it["bucket"] = bucket
            tagged += 1
        # news flag intentionally left untouched: every existing yaml name stays
        # in /news (preserve the current universe exactly).

    appended = 0
    for ticker, bucket in ticker_bucket.items():
        if ticker in yaml_tickers:
            continue
        items.append({"ticker": ticker, "bucket": bucket, "news": False})
        appended += 1

    # Parity guard BEFORE writing: every CSV ticker is now in the yaml mapped to its
    # one bucket. No name lost, no bucket drift.
    by_ticker = {
        str(it.get("ticker") or "").strip(): it
        for it in items
        if isinstance(it, dict)
    }
    lost = [t for t in ticker_bucket if t not in by_ticker]
    drift = [
        t
        for t, b in ticker_bucket.items()
        if t in by_ticker and by_ticker[t].get("bucket") != b
    ]
    if lost:
        raise SystemExit(f"ERROR: migration dropped tickers: {lost}")
    if drift:
        raise SystemExit(f"ERROR: bucket drift for: {drift}")

    payload = yaml.safe_dump(raw, sort_keys=False, allow_unicode=False)
    yaml_path.write_text(_HEADER + payload, encoding="utf-8")
    return {
        "csv_tickers": len(ticker_bucket),
        "tagged_existing": tagged,
        "appended_chart_only": appended,
        "total_items": len(items),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Seed dashboard_watchlist.yaml with kova bucket tags.")
    ap.add_argument("--yaml", type=Path, required=True)
    ap.add_argument("--csv-dir", type=Path, required=True)
    args = ap.parse_args()
    summary = migrate(args.yaml, args.csv_dir)
    print("migrate_watchlist_buckets:")
    for key, value in summary.items():
        print(f"  {key}: {value}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
