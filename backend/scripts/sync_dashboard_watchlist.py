"""Sync the central dashboard watchlist YAML into the runtime database."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from backend.services.dashboard_watchlist import (
    default_watchlist_path,
    sync_dashboard_watchlist_to_db,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync dashboard_watchlist.yaml into stock_news.db.")
    parser.add_argument(
        "--config",
        type=Path,
        default=default_watchlist_path(),
        help="Path to dashboard_watchlist.yaml.",
    )
    args = parser.parse_args()

    summary = sync_dashboard_watchlist_to_db(args.config)
    payload = {
        "config": str(args.config),
        **summary,
    }
    sys.stdout.write(json.dumps(payload, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
