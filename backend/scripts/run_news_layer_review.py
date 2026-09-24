"""CLI entry point for the standalone TickerPulse news-layer review."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path

from backend.services.news_layer_review import run_news_layer_review


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    output_dir = Path(args.output_dir) if args.output_dir else None

    result = run_news_layer_review(
        output_dir=output_dir,
        posts_per_account=max(1, int(args.posts_per_account)),
        posts_per_query=max(1, int(args.posts_per_query)),
        news_max_tickers=max(1, int(args.news_max_tickers)),
    )
    if args.json:
        _write_stdout(json.dumps(_without_report_body(result), ensure_ascii=False, indent=2) + "\n")
        return 0

    _write_stdout(str(result.get("report_markdown") or ""))
    paths = result.get("paths")
    if isinstance(paths, dict):
        _write_stdout(f"\nReport saved: {paths.get('report_markdown', '')}\n")
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the standalone TickerPulse news-layer review.")
    parser.add_argument("--output-dir", default="", help="Directory for JSON and Markdown report artifacts.")
    parser.add_argument("--posts-per-account", type=int, default=5, help="Recent posts per configured X account.")
    parser.add_argument("--posts-per-query", type=int, default=10, help="Recent posts per configured X search query.")
    parser.add_argument(
        "--news-max-tickers",
        type=int,
        default=12,
        help="Max dashboard-watchlist tickers for the news wire lane.",
    )
    parser.add_argument("--json", action="store_true", help="Print machine-readable result metadata instead of Markdown.")
    return parser


def _without_report_body(result: dict[str, object]) -> dict[str, object]:
    return {key: value for key, value in result.items() if key != "report_markdown"}


def _write_stdout(text: str) -> None:
    try:
        sys.stdout.write(text)
        return
    except UnicodeEncodeError:
        stdout_buffer = getattr(sys.stdout, "buffer", None)
        buffer_write = getattr(stdout_buffer, "write", None)
        if callable(buffer_write):
            buffer_write(text.encode("utf-8", errors="replace"))
            return

    encoding = sys.stdout.encoding or "utf-8"
    safe_text = text.encode(encoding, errors="replace").decode(encoding, errors="replace")
    sys.stdout.write(safe_text)


if __name__ == "__main__":
    raise SystemExit(main())
