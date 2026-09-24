"""One-time bootstrap: create/sync a private X List from the configured watchlist.

Reuses the authenticated twscrape cookie session (same path as
TwikitAccountRunner). Resolves each configured handle to a user id, creates a
private list (or reuses ``--list-id`` to reconcile members: add missing +
remove cut), syncs members, and prints the list id to paste into
``config/x_watchlists.yaml`` as ``list_id``.

LIVE ACTION: this WRITES to the chosen X account (creates a list, adds members,
and on an existing list REMOVES members no longer in config). It is reversible
(delete the list / re-add), and the list is private. The
target account must be explicit (--username or TWIKIT_X_USERNAME) and writes
only happen with --yes; otherwise the script dry-runs.

Usage:
    # dry-run (connects read-only, previews the add/remove diff, no writes):
    venv\\Scripts\\python.exe -m backend.scripts.sync_x_list --username MingFan0
    # live create + add members:
    venv\\Scripts\\python.exe -m backend.scripts.sync_x_list --username MingFan0 --yes
    # reconcile an existing list (add missing + remove cut):
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


def reconcile_members(
    configured_ids: set[str], current_ids: set[str]
) -> tuple[list[str], list[str]]:
    """Pure membership diff between configured watchlist and the live X List.

    Returns ``(to_add, to_remove)`` where ``to_add`` are configured ids not yet
    members and ``to_remove`` are current members no longer configured (the cut
    handles). Nothing still configured is ever removed.
    """
    to_add = sorted(configured_ids - current_ids)
    to_remove = sorted(current_ids - configured_ids)
    return to_add, to_remove


async def _fetch_current_member_ids(client: object, list_id: str) -> dict[str, str]:
    """Return ``{user_id: screen_name}`` for all current members of the list."""
    members: dict[str, str] = {}
    get_members = getattr(client, "get_list_members")
    result = await get_members(list_id, count=100)
    while result:
        for user in result:
            uid = str(getattr(user, "id", "") or "")
            if uid:
                members[uid] = str(getattr(user, "screen_name", "") or "")
        nxt = getattr(result, "next", None)
        if not callable(nxt):
            break
        result = await nxt()
    return members


async def _aclose(client: object) -> None:
    http = getattr(client, "http", None)
    aclose = getattr(http, "aclose", None)
    if not callable(aclose):
        return
    result = aclose()
    if hasattr(result, "__await__"):
        await result


async def _resolve_configured_ids(
    client: object, accounts: object
) -> tuple[dict[str, str], list[str]]:
    """Map each configured account to a user id, preferring the stored
    ``user_id`` and only live-resolving handles that lack one. Returns
    ``(handle -> id, unresolved)``."""
    resolved: dict[str, str] = {}
    unresolved: list[str] = []
    for account in accounts:
        stored = str(getattr(account, "user_id", "") or "")
        if stored:
            resolved[account.handle] = stored
            continue
        try:
            user = await client.get_user_by_screen_name(account.handle)
            uid = str(getattr(user, "id", "") or "")
        except Exception as exc:  # rate limit / suspended / typo
            unresolved.append(f"{account.handle} ({exc})")
            continue
        if uid:
            resolved[account.handle] = uid
        else:
            unresolved.append(account.handle)
    return resolved, unresolved


async def reconcile_list(
    client: object, accounts: object, list_id: str, *, write: bool
) -> dict:
    """Reconcile an existing X List to the configured accounts.

    Resolves ids (stored ``user_id`` first), diffs against current members, and
    when ``write`` adds missing + removes cut. REFUSES all removals if any
    configured account is unresolved, so a transient lookup failure can never
    delete a still-configured keeper. Re-fetches after writing to verify
    removals actually took. Returns a result dict; it never raises on a single
    failed mutation, but records it so the caller can exit nonzero.
    """
    resolved, unresolved = await _resolve_configured_ids(client, accounts)
    configured_ids = set(resolved.values())
    id_to_handle = {uid: handle for handle, uid in resolved.items()}
    current = await _fetch_current_member_ids(client, list_id)
    to_add, to_remove = reconcile_members(configured_ids, set(current))

    # Safety gate: never remove while configured accounts are unmapped, because a
    # still-configured keeper could be misclassified as stale and deleted.
    skipped_removals: list[str] = []
    if unresolved and to_remove:
        skipped_removals = [current.get(uid, uid) for uid in to_remove]
        to_remove = []

    result: dict = {
        "resolved": len(resolved),
        "unresolved": unresolved,
        "current": len(current),
        "to_add": to_add,
        "to_remove": to_remove,
        "remove_handles": [current.get(uid, uid) for uid in to_remove],
        "skipped_removals": skipped_removals,
        "added": 0,
        "removed": 0,
        "add_failures": [],
        "remove_failures": [],
        "verify_stale": [],
    }
    if not write:
        return result

    for uid in to_add:
        try:
            await client.add_list_member(list_id, uid)
            result["added"] += 1
        except Exception as exc:
            result["add_failures"].append(f"{id_to_handle.get(uid, uid)}: {exc}")
    for uid in to_remove:
        try:
            await client.remove_list_member(list_id, uid)
            result["removed"] += 1
        except Exception as exc:
            result["remove_failures"].append(f"{current.get(uid, uid)}: {exc}")
    if to_remove:
        after = await _fetch_current_member_ids(client, list_id)
        result["verify_stale"] = [
            current.get(uid, uid) for uid in to_remove if uid in after
        ]
    return result


def reconcile_ok(result: dict) -> bool:
    """True only if the list now matches config: every requested mutation
    succeeded, nothing was safety-skipped, and no configured account is
    unresolved (an unresolved account can't be added, so the list would be
    silently incomplete). Used as the process exit gate."""
    return not (
        result["unresolved"]
        or result["add_failures"]
        or result["remove_failures"]
        or result["verify_stale"]
        or result["skipped_removals"]
    )


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
    action = (
        "reconcile members on existing list (add missing + remove cut)"
        if args.list_id
        else "create a private list + add members"
    )
    print(
        f"Target X account: @{target} | configured members: {len(handles)} | "
        f"mode: {mode} | action: {action}"
    )

    if not args.list_id and not args.yes:
        print(
            f"Dry run: would create private list '{args.name}' and add "
            f"{len(handles)} configured members."
        )
        return 0

    client = _build_client(
        Path(os.getenv("TWIKIT_REPO", r"C:\Repos\twikit")),
        Path(os.getenv("TWIKIT_ACCOUNTS_DB", r"C:\Repos\twscrape\accounts.db")),
        target,
    )

    try:
        if args.list_id:
            result = await reconcile_list(
                client, config.accounts, args.list_id, write=args.yes
            )
            print(
                f"Resolved {result['resolved']}/{len(handles)} | "
                f"unresolved: {result['unresolved']}"
            )
            print(
                f"Current members: {result['current']} | to add: "
                f"{len(result['to_add'])} | to remove (cut): {len(result['to_remove'])}"
            )
            if result["remove_handles"]:
                print(f"  remove: {result['remove_handles']}")
            if result["skipped_removals"]:
                print(
                    f"  SAFETY: skipped {len(result['skipped_removals'])} removal(s) "
                    f"because configured accounts are unresolved; a keeper could be "
                    f"misclassified as stale. Add user_id to config or retry. "
                    f"(skipped: {result['skipped_removals']})"
                )
            if not args.yes:
                print("Dry run only. Re-run with --yes to perform the add/remove above.")
                return 0
            print(
                f"\nlist_id={args.list_id} | added={result['added']}/"
                f"{len(result['to_add'])} | removed={result['removed']}/"
                f"{len(result['to_remove'])}"
            )
            for fail in result["add_failures"] + result["remove_failures"]:
                print(f"  mutation failed: {fail}")
            if result["verify_stale"]:
                print(
                    f"  VERIFY FAILED: still present after removal: "
                    f"{result['verify_stale']}"
                )
            return 0 if reconcile_ok(result) else 1

        # Fresh list (no --list-id): resolve (stored user_id first), create, add.
        resolved, unresolved = await _resolve_configured_ids(client, config.accounts)
        print(f"Resolved {len(resolved)}/{len(handles)} | unresolved: {unresolved}")
        if not resolved:
            print("Aborting: no handles resolved (X session dead or rate-limited).")
            return 1
        created = await client.create_list(args.name, args.description, is_private=True)
        list_id = str(getattr(created, "id", "") or "")
        if not list_id:
            print("Aborting: create_list returned no id.")
            return 1
        print(f"Created private list '{args.name}' id={list_id}")
        id_to_handle = {uid: handle for handle, uid in resolved.items()}
        added = 0
        add_failures: list[str] = []
        for uid in resolved.values():
            try:
                await client.add_list_member(list_id, uid)
                added += 1
            except Exception as exc:
                add_failures.append(f"{id_to_handle.get(uid, uid)}: {exc}")
        for fail in add_failures:
            print(f"  add_member failed @{fail}")
        print(f"\nlist_id={list_id} | members added={added}/{len(resolved)}")
        print(f"Paste into config/x_watchlists.yaml top level:\n  list_id: \"{list_id}\"")
        return 0 if not add_failures else 1
    finally:
        await _aclose(client)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bootstrap a private X List from the watchlist.")
    parser.add_argument(
        "--username",
        default="",
        help="Target X account handle. Falls back to TWIKIT_X_USERNAME. REQUIRED for the live write path.",
    )
    parser.add_argument("--name", default="TickerPulse Watchlist")
    parser.add_argument("--description", default="TickerPulse market-moving monitor list")
    parser.add_argument("--list-id", default="", help="Reuse an existing list id (reconcile: add missing + remove cut).")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Confirm and perform the LIVE writes (create_list / add_list_member). Without it, the script dry-runs.",
    )
    return asyncio.run(_run(parser.parse_args(argv)))


if __name__ == "__main__":
    raise SystemExit(main())
