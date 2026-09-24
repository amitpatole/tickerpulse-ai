import json
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path

_ACCOUNTS_SCHEMA = """
CREATE TABLE accounts (
    username TEXT PRIMARY KEY,
    password TEXT,
    email TEXT,
    email_password TEXT,
    user_agent TEXT,
    active BOOLEAN,
    locks TEXT,
    headers TEXT,
    cookies TEXT,
    proxy TEXT,
    error_msg TEXT,
    stats TEXT,
    last_used TEXT,
    _tx TEXT,
    mfa_code TEXT
)
"""


def _make_db(path: Path, usernames: list[str]) -> None:
    con = sqlite3.connect(path)
    con.execute(_ACCOUNTS_SCHEMA)
    for username in usernames:
        con.execute(
            "INSERT INTO accounts"
            " (username, password, email, email_password, active, locks, headers, cookies, stats, error_msg)"
            " VALUES (?, 'pw', 'a@b.c', 'epw', 0, ?, '{}', '{}', '{}', 'NoAccountError: stale')",
            (username, json.dumps({"SearchTimeline": "2026-06-11T05:00:00+00:00"})),
        )
    con.commit()
    con.close()


def _read_row(path: Path, username: str) -> dict[str, object]:
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    row = con.execute("SELECT * FROM accounts WHERE username = ?", (username,)).fetchone()
    con.close()
    return dict(row)


class RefreshXSessionTest(unittest.TestCase):
    def _run(self, argv: list[str]) -> tuple[int, str, str]:
        from backend.scripts.refresh_x_session import main

        out, err = StringIO(), StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            exit_code = main(argv)
        return exit_code, out.getvalue(), err.getvalue()

    def test_refresh_updates_single_account_row(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, ["@Mingfan0"])

            exit_code, out, _err = self._run(
                ["--db", str(db), "--cookies", "auth_token=tok123; ct0=csrf456; lang=en"]
            )
            row = _read_row(db, "@Mingfan0")

        self.assertEqual(exit_code, 0)
        cookies = json.loads(str(row["cookies"]))
        self.assertEqual(cookies["auth_token"], "tok123")
        self.assertEqual(cookies["ct0"], "csrf456")
        self.assertEqual(cookies["lang"], "en")
        self.assertEqual(row["active"], 1)
        self.assertIsNone(row["error_msg"])
        self.assertEqual(json.loads(str(row["locks"])), {})
        self.assertIn("@Mingfan0", out)
        self.assertIn("session restored", out.lower())
        self.assertNotIn("tok123", out, "cookie values must never be printed")
        self.assertNotIn("csrf456", out)

    def test_refresh_requires_auth_token_and_ct0(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, ["@Mingfan0"])

            exit_code, _out, err = self._run(["--db", str(db), "--cookies", "ct0=csrf456"])
            row = _read_row(db, "@Mingfan0")

        self.assertEqual(exit_code, 2)
        self.assertIn("auth_token", err)
        self.assertEqual(row["active"], 0, "row must stay untouched on validation failure")
        self.assertEqual(json.loads(str(row["cookies"])), {})

    def test_refresh_accepts_browser_header_paste(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, ["@Mingfan0"])

            exit_code, _out, _err = self._run(
                ["--db", str(db), "--cookies", 'Cookie: auth_token="tok123"; ct0="csrf456" ']
            )
            row = _read_row(db, "@Mingfan0")

        self.assertEqual(exit_code, 0)
        cookies = json.loads(str(row["cookies"]))
        self.assertEqual(cookies["auth_token"], "tok123")
        self.assertEqual(cookies["ct0"], "csrf456")

    def test_refresh_with_multiple_accounts_requires_username(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, ["@Mingfan0", "@Other"])

            exit_code, _out, err = self._run(
                ["--db", str(db), "--cookies", "auth_token=tok; ct0=csrf"]
            )
            exit_code_named, _out2, _err2 = self._run(
                [
                    "--db",
                    str(db),
                    "--username",
                    "@Other",
                    "--cookies",
                    "auth_token=tok; ct0=csrf",
                ]
            )
            other = _read_row(db, "@Other")
            mingfan = _read_row(db, "@Mingfan0")

        self.assertEqual(exit_code, 2)
        self.assertIn("@Mingfan0", err)
        self.assertIn("@Other", err)
        self.assertEqual(exit_code_named, 0)
        self.assertEqual(other["active"], 1)
        self.assertEqual(mingfan["active"], 0)

    def test_refresh_unknown_username_fails_cleanly(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, ["@Mingfan0"])

            exit_code, _out, err = self._run(
                ["--db", str(db), "--username", "@Nobody", "--cookies", "auth_token=t; ct0=c"]
            )

        self.assertEqual(exit_code, 2)
        self.assertIn("@Nobody", err)

    def test_refresh_missing_db_fails_cleanly(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            missing = Path(tmpdir) / "absent.db"

            exit_code, _out, err = self._run(
                ["--db", str(missing), "--cookies", "auth_token=t; ct0=c"]
            )

        self.assertEqual(exit_code, 2)
        self.assertIn("accounts DB", err)


class SetXEmailPasswordTest(unittest.TestCase):
    def _run(self, argv: list[str], password: str) -> tuple[int, str, str]:
        from backend.scripts.set_x_email_password import main

        out, err = StringIO(), StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            exit_code = main(argv, password_reader=lambda prompt: password)
        return exit_code, out.getvalue(), err.getvalue()

    def test_updates_email_password_for_single_account(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, ["@Mingfan0"])

            exit_code, out, _err = self._run(["--db", str(db)], "abcdefghijklmnop")
            row = _read_row(db, "@Mingfan0")

        self.assertEqual(exit_code, 0)
        self.assertEqual(row["email_password"], "abcdefghijklmnop")
        self.assertIn("@Mingfan0", out)
        self.assertIn("email_password updated", out.lower())
        self.assertNotIn("abcdefghijklmnop", out, "secret must never be printed")

    def test_strips_spaces_from_google_display_format(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, ["@Mingfan0"])

            exit_code, _out, _err = self._run(["--db", str(db)], "abcd efgh ijkl mnop")
            row = _read_row(db, "@Mingfan0")

        self.assertEqual(exit_code, 0)
        self.assertEqual(row["email_password"], "abcdefghijklmnop")

    def test_rejects_wrong_length_without_writing(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, ["@Mingfan0"])

            exit_code, _out, err = self._run(["--db", str(db)], "short")
            row = _read_row(db, "@Mingfan0")

        self.assertEqual(exit_code, 2)
        self.assertIn("16", err)
        self.assertEqual(row["email_password"], "epw", "row must stay untouched on validation failure")

    def test_multiple_accounts_require_username(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, ["@Mingfan0", "@Other"])

            exit_code, _out, err = self._run(["--db", str(db)], "abcdefghijklmnop")
            exit_code_named, _out2, _err2 = self._run(
                ["--db", str(db), "--username", "@Other"], "abcdefghijklmnop"
            )
            other = _read_row(db, "@Other")

        self.assertEqual(exit_code, 2)
        self.assertIn("--username", err)
        self.assertEqual(exit_code_named, 0)
        self.assertEqual(other["email_password"], "abcdefghijklmnop")

    def test_missing_db_fails_cleanly(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            missing = Path(tmpdir) / "absent.db"

            exit_code, _out, err = self._run(["--db", str(missing)], "abcdefghijklmnop")

        self.assertEqual(exit_code, 2)
        self.assertIn("accounts DB", err)


if __name__ == "__main__":
    unittest.main()
