"""One-time bootstrap: create/sync a private X List from the configured watchlist.

Reuses the authenticated twscrape cookie session (same path as
TwikitAccountRunner). Resolves each configured handle to a user id, creates a
private list (or reuses ``--list-id`` to only add members), adds all members,
and prints the list id to paste into ``config/x_watchlists.yaml`` as ``list_id``.

LIVE ACTION: this WRITES to the chosen X account (creates a list and adds
members). It is reversible (delete the list), and the list is private. The
target account must be explicit (--username or TWIKIT_X_USERNAME) and writes
only happen with --yes; otherwise the script dry-runs.

Usage:
    # dry-run (prints target + intended action, no writes):
    venv\\Scripts\\python.exe -m backend.scripts.sync_x_list --username MingFan0
    # live create + add members:
    venv\\Scripts\\python.exe -m backend.scripts.sync_x_list --username MingFan0 --yes
    # add-only to an existing list:
    venv\\Scripts\\python.exe -m backend.scripts.sync_x_list --username MingFan0 --list-id 123 --yes
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

from backend.services.x_watchlist import (
    XWatchlistConfig,
    _load_twscrape_account_cookies,
    _NoopClientTransaction,
)


def _build_client(repo_path: Path, accounts_db_path: Path, username: str) -> object:
    repo = str(repo_path)
    if repo not in sys.path:
        sys.path.insert(0, repo)
    from twikit import Client

    client = Client()
    cookies = _load_twscrape_account_cookies(accounts_db_path, username)
    client.set_cookies(cookies, clear_cookies=True)
    client.client_transaction = _NoopClientTransaction()
    return client


def _resolve_target(username_arg: str) -> str:
    """Explicit --username wins, else TWIKIT_X_USERNAME; normalized, no leading @."""
    return (username_arg or os.getenv("TWIKIT_X_USERNAME", "")).strip().lstrip("@")


async def _run(args: argparse.Namespace) -> int:
    target = _resolve_target(args.username)
    if not target:
        print(
            "Refusing: no target X account. This script performs LIVE writes "
            "(create_list / add_list_member). Pass --username <handle> or set "
            "TWIKIT_X_USERNAME so the write target is explicit."
        )
        return 2

    config = XWatchlistConfig.load()
    handles = [account.handle for account in config.accounts]
    if not handles:
        print("No configured accounts in x_watchlists.yaml; nothing to sync.")
        return 1

    mode = "WRITE" if args.yes else "DRY-RUN"
    action = "add members to existing list" if args.list_id else "create a private list + add members"
    print(
        f"Target X account: @{target} | configured members: {len(handles)} | "
        f"mode: {mode} | action: {action}"
    )
    if not args.yes:
        print("Dry run only. Re-run with --yes to perform the live writes above.")
        return 0

    client = _build_client(
        Path(os.getenv("TWIKIT_REPO", r"C:\Repos\twikit")),
        Path(os.getenv("TWIKIT_ACCOUNTS_DB", r"C:\Repos\twscrape\accounts.db")),
        target,
    )

    resolved: dict[str, str] = {}
    unresolved: list[str] = []
    for handle in handles:
        try:
            user = await client.get_user_by_screen_name(handle)
            user_id = str(getattr(user, "id", "") or "")
        except Exception as exc:  # rate limit / suspended / typo
            unresolved.append(f"{handle} ({exc})")
            continue
        if user_id:
            resolved[handle] = user_id
        else:
            unresolved.append(handle)

    print(f"Resolved {len(resolved)}/{len(handles)} handles; unresolved: {unresolved}")
    if not resolved:
        print("Aborting: no handles resolved (X session dead or rate-limited).")
        return 1

    list_id = args.list_id
    if not list_id:
        created = await client.create_list(args.name, args.description, is_private=True)
        list_id = str(getattr(created, "id", "") or "")
        if not list_id:
            print("Aborting: create_list returned no id.")
            return 1
        print(f"Created private list '{args.name}' id={list_id}")

    added = 0
    for handle, user_id in resolved.items():
        try:
            await client.add_list_member(list_id, user_id)
            added += 1
        except Exception as exc:
            print(f"  add_member failed @{handle}: {exc}")

    print(f"\nlist_id={list_id} | members added={added}/{len(resolved)}")
    print(f"Paste into config/x_watchlists.yaml top level:\n  list_id: \"{list_id}\"")

    http = getattr(client, "http", None)
    aclose = getattr(http, "aclose", None)
    if callable(aclose):
        await aclose()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bootstrap a private X List from the watchlist.")
    parser.add_argument(
        "--username",
        default="",
        help="Target X account handle. Falls back to TWIKIT_X_USERNAME. REQUIRED for the live write path.",
    )
    parser.add_argument("--name", default="TickerPulse Watchlist")
    parser.add_argument("--description", default="TickerPulse market-moving monitor list")
    parser.add_argument("--list-id", default="", help="Reuse an existing list id (add members only).")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Confirm and perform the LIVE writes (create_list / add_list_member). Without it, the script dry-runs.",
    )
    return asyncio.run(_run(parser.parse_args(argv)))


if __name__ == "__main__":
    raise SystemExit(main())
