"""Restore the twscrape X session from browser-exported cookies.

Recovery path for when the automated relogin flow is blocked upstream
(Cloudflare blocks the unauthenticated login API from VPN/datacenter IPs).
Log in to x.com in a normal browser, copy the `auth_token` and `ct0` cookies
(or the whole Cookie header), then run:

    python -m backend.scripts.refresh_x_session --cookies "auth_token=...; ct0=..."

twscrape supports cookie-only accounts: API calls use the public bearer token
plus the cookie pair, so no password login is needed. Cookie values are never
printed or logged.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from collections.abc import Sequence
from pathlib import Path

from backend.services.x_session_guard import default_twscrape_repo

REQUIRED_COOKIES = ("auth_token", "ct0")


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    db_path = Path(args.db) if args.db else default_twscrape_repo() / "accounts.db"
    if not db_path.exists():
        print(f"twscrape accounts DB not found: {db_path}", file=sys.stderr)
        return 2

    cookies = parse_cookie_string(args.cookies)
    missing = [name for name in REQUIRED_COOKIES if not cookies.get(name)]
    if missing:
        print(
            f"Cookie string is missing required cookie(s): {', '.join(missing)}. "
            'Export from a logged-in browser, e.g. --cookies "auth_token=...; ct0=..."',
            file=sys.stderr,
        )
        return 2

    username = _resolve_username(db_path, args.username)
    if username is None:
        return 2

    _apply_cookies(db_path, username, cookies)
    print(
        f"X session restored for {username} from {len(cookies)} cookies "
        f"({', '.join(sorted(cookies))}); account reactivated."
    )
    return 0


def parse_cookie_string(raw: str) -> dict[str, str]:
    """Parse a browser cookie paste into a name->value dict.

    Accepts a plain "k=v; k2=v2" string or a full "Cookie: ..." header line;
    values may be quoted.
    """
    text = raw.strip()
    if text.lower().startswith("cookie:"):
        text = text[len("cookie:"):]

    cookies: dict[str, str] = {}
    for part in text.split(";"):
        name, _, value = part.partition("=")
        name = name.strip()
        value = value.strip().strip('"').strip("'")
        if name and value:
            cookies[name] = value
    return cookies


def _resolve_username(db_path: Path, requested: str) -> str | None:
    usernames = _all_usernames(db_path)
    if requested:
        if requested in usernames:
            return requested
        print(
            f"Account {requested} not found in {db_path}. "
            f"Known accounts: {', '.join(usernames) or 'none'}",
            file=sys.stderr,
        )
        return None
    if len(usernames) == 1:
        return usernames[0]
    print(
        f"Pool has {len(usernames)} accounts ({', '.join(usernames) or 'none'}); "
        "pass --username to pick one.",
        file=sys.stderr,
    )
    return None


def _all_usernames(db_path: Path) -> list[str]:
    con = sqlite3.connect(db_path)
    try:
        rows = con.execute("SELECT username FROM accounts ORDER BY username").fetchall()
    finally:
        con.close()
    return [str(row[0]) for row in rows]


def _apply_cookies(db_path: Path, username: str, cookies: dict[str, str]) -> None:
    """Write the new session: cookies replace the old set, account reactivated.

    headers/locks reset so twscrape rebuilds client state from the cookie pair
    (make_client injects the public bearer and derives x-csrf-token from ct0).
    """
    con = sqlite3.connect(db_path)
    try:
        con.execute(
            "UPDATE accounts SET"
            " cookies = :cookies, headers = '{}', locks = '{}',"
            " active = 1, error_msg = NULL"
            " WHERE username = :username",
            {"cookies": json.dumps(cookies), "username": username},
        )
        con.commit()
    finally:
        con.close()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Restore the twscrape X session from browser-exported cookies."
    )
    parser.add_argument(
        "--cookies",
        required=True,
        help='Cookie string from a logged-in browser, e.g. "auth_token=...; ct0=..."',
    )
    parser.add_argument(
        "--username",
        default="",
        help="Account username to update (required only when the pool has several).",
    )
    parser.add_argument(
        "--db",
        default="",
        help="Path to twscrape accounts.db (default: TWSCRAPE_REPO/accounts.db).",
    )
    return parser


if __name__ == "__main__":
    raise SystemExit(main())
