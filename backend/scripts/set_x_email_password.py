"""Store a Gmail IMAP app password in the twscrape account pool.

Full auto-relogin needs twscrape to fetch X's email confirmation code over
IMAP, which requires a 16-character Google App Password (not the regular
Gmail password). Create one at https://myaccount.google.com/apppasswords
(2-Step Verification must be enabled), then run:

    python -m backend.scripts.set_x_email_password

The value is read from a hidden prompt - never from argv - so it does not
land in shell history, and it is never printed or logged.
"""

from __future__ import annotations

import argparse
import getpass
import sqlite3
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

from backend.scripts.refresh_x_session import _resolve_username
from backend.services.x_session_guard import default_twscrape_repo

APP_PASSWORD_LENGTH = 16


def main(
    argv: Sequence[str] | None = None,
    *,
    password_reader: Callable[[str], str] = getpass.getpass,
) -> int:
    args = _build_parser().parse_args(argv)
    db_path = Path(args.db) if args.db else default_twscrape_repo() / "accounts.db"
    if not db_path.exists():
        print(f"twscrape accounts DB not found: {db_path}", file=sys.stderr)
        return 2

    username = _resolve_username(db_path, args.username)
    if username is None:
        print("Pass --username to pick the account to update.", file=sys.stderr)
        return 2

    password = password_reader("Gmail app password (hidden): ").replace(" ", "").strip()
    if len(password) != APP_PASSWORD_LENGTH:
        print(
            f"Expected a {APP_PASSWORD_LENGTH}-char Google App Password, got "
            f"{len(password)} chars after removing spaces. Nothing written. "
            "Create one at https://myaccount.google.com/apppasswords",
            file=sys.stderr,
        )
        return 2

    updated = _write_email_password(db_path, username, password)
    if updated != 1:
        print(f"Update matched {updated} rows for {username}; expected 1.", file=sys.stderr)
        return 2

    print(f"email_password updated for {username} ({APP_PASSWORD_LENGTH} chars stored).")
    return 0


def _write_email_password(db_path: Path, username: str, password: str) -> int:
    con = sqlite3.connect(db_path)
    try:
        cursor = con.execute(
            "UPDATE accounts SET email_password = :password WHERE username = :username",
            {"password": password, "username": username},
        )
        con.commit()
        return cursor.rowcount
    finally:
        con.close()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Store a Gmail IMAP app password for twscrape auto-relogin."
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
