import json
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch


NOW = datetime(2026, 6, 11, 6, 0, tzinfo=timezone.utc)

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


def _make_db(
    path: Path,
    *,
    logged_in: bool,
    with_creds: bool = True,
    active: bool = True,
    cookies: str = "{}",
) -> None:
    headers = json.dumps({"authorization": "Bearer abc"}) if logged_in else "{}"
    con = sqlite3.connect(path)
    con.execute(_ACCOUNTS_SCHEMA)
    con.execute(
        "INSERT INTO accounts (username, password, email, email_password, active, locks, headers, cookies, stats)"
        " VALUES (?, ?, ?, ?, ?, '{}', ?, ?, '{}')",
        (
            "Mingfan0",
            "pw" if with_creds else "",
            "a@b.c" if with_creds else "",
            "epw" if with_creds else "",
            1 if active else 0,
            headers,
            cookies,
        ),
    )
    con.commit()
    con.close()


class _RecordingRunner:
    def __init__(
        self,
        db_path: Path,
        *,
        succeed: bool = True,
        raise_error: bool = False,
        error_text: str = "login flow exploded",
        output: str | None = None,
    ) -> None:
        self.db_path = db_path
        self.succeed = succeed
        self.raise_error = raise_error
        self.error_text = error_text
        self.output = output
        self.calls: list[list[str]] = []

    def __call__(self, usernames: list[str]) -> str | None:
        self.calls.append(list(usernames))
        if self.raise_error:
            raise RuntimeError(self.error_text)
        if self.succeed:
            # Mirror real twscrape login(): success sets headers AND active=1.
            con = sqlite3.connect(self.db_path)
            con.execute(
                "UPDATE accounts SET headers = ?, active = 1 WHERE username = ?",
                (json.dumps({"authorization": "Bearer fresh"}), "Mingfan0"),
            )
            con.commit()
            con.close()
        return self.output


class XSessionGuardTest(unittest.TestCase):
    def _guard(self, tmpdir: str, **kwargs):
        from backend.services.x_session_guard import ensure_x_session

        defaults = {
            "twscrape_repo": Path(tmpdir),
            "now": NOW,
        }
        defaults.update(kwargs)
        return ensure_x_session(**defaults)

    def test_logged_in_pool_skips_relogin(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, logged_in=True)
            runner = _RecordingRunner(db)

            result = self._guard(tmpdir, relogin_runner=runner)

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["logged_in_accounts"], ["Mingfan0"])
        self.assertEqual(runner.calls, [])

    def test_logged_out_pool_triggers_single_relogin_and_verifies_via_db(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, logged_in=False)
            runner = _RecordingRunner(db, succeed=True)

            result = self._guard(tmpdir, relogin_runner=runner)
            state = json.loads((Path(tmpdir) / "relogin_guard_state.json").read_text(encoding="utf-8"))

        self.assertEqual(result["status"], "relogged_in")
        self.assertEqual(runner.calls, [["Mingfan0"]])
        self.assertEqual(result["attempted"], ["Mingfan0"])
        self.assertEqual(state["last_outcome"], "relogged_in")
        self.assertEqual(state["last_attempt_at"], NOW.isoformat())

    def test_failed_relogin_reports_failure_and_records_attempt(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, logged_in=False)
            runner = _RecordingRunner(db, raise_error=True)

            result = self._guard(tmpdir, relogin_runner=runner)
            state = json.loads((Path(tmpdir) / "relogin_guard_state.json").read_text(encoding="utf-8"))

        self.assertEqual(result["status"], "relogin_failed")
        self.assertIn("login flow exploded", result["detail"])
        self.assertEqual(state["last_outcome"], "relogin_failed")

    def test_relogin_that_exits_clean_but_stays_logged_out_is_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, logged_in=False)
            runner = _RecordingRunner(db, succeed=False)

            result = self._guard(tmpdir, relogin_runner=runner)

        self.assertEqual(result["status"], "relogin_failed")
        self.assertEqual(runner.calls, [["Mingfan0"]])

    def test_recent_attempt_within_cooldown_skips_relogin(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, logged_in=False)
            state_path = Path(tmpdir) / "relogin_guard_state.json"
            state_path.write_text(
                json.dumps(
                    {
                        "last_attempt_at": (NOW - timedelta(hours=1)).isoformat(),
                        "last_outcome": "relogin_failed",
                    }
                ),
                encoding="utf-8",
            )
            runner = _RecordingRunner(db)

            result = self._guard(tmpdir, relogin_runner=runner)

        self.assertEqual(result["status"], "cooldown")
        self.assertEqual(runner.calls, [])
        self.assertIn("cooldown_until", result)

    def test_attempt_outside_cooldown_runs_again(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, logged_in=False)
            state_path = Path(tmpdir) / "relogin_guard_state.json"
            state_path.write_text(
                json.dumps(
                    {
                        "last_attempt_at": (NOW - timedelta(hours=7)).isoformat(),
                        "last_outcome": "relogin_failed",
                    }
                ),
                encoding="utf-8",
            )
            runner = _RecordingRunner(db, succeed=True)

            result = self._guard(tmpdir, relogin_runner=runner)

        self.assertEqual(result["status"], "relogged_in")
        self.assertEqual(runner.calls, [["Mingfan0"]])

    def test_env_kill_switch_disables_guard(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, logged_in=False)
            runner = _RecordingRunner(db)

            with patch.dict("os.environ", {"TICKERPULSE_X_AUTO_RELOGIN": "0"}):
                result = self._guard(tmpdir, relogin_runner=runner)

        self.assertEqual(result["status"], "disabled")
        self.assertEqual(runner.calls, [])

    def test_missing_db_reports_no_db_without_attempt(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            runner = _RecordingRunner(Path(tmpdir) / "accounts.db")

            result = self._guard(tmpdir, relogin_runner=runner)

        self.assertEqual(result["status"], "no_db")
        self.assertEqual(runner.calls, [])

    def test_accounts_without_stored_creds_are_not_attempted(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, logged_in=False, with_creds=False)
            runner = _RecordingRunner(db)

            result = self._guard(tmpdir, relogin_runner=runner)

        self.assertEqual(result["status"], "no_candidates")
        self.assertEqual(runner.calls, [])

    def test_cookie_only_active_account_counts_as_logged_in(self) -> None:
        cookies = json.dumps({"auth_token": "tok", "ct0": "csrf"})
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, logged_in=False, active=True, cookies=cookies)
            runner = _RecordingRunner(db)

            result = self._guard(tmpdir, relogin_runner=runner)

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["logged_in_accounts"], ["Mingfan0"])
        self.assertEqual(runner.calls, [], "guard must not wipe a cookie-imported session")

    def test_partial_cookies_without_auth_header_are_not_logged_in(self) -> None:
        cookies = json.dumps({"ct0": "csrf"})
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, logged_in=False, active=True, cookies=cookies)
            runner = _RecordingRunner(db, succeed=True)

            result = self._guard(tmpdir, relogin_runner=runner)

        self.assertEqual(result["status"], "relogged_in")
        self.assertEqual(runner.calls, [["Mingfan0"]])

    def test_inactive_account_with_auth_header_is_not_logged_in(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, logged_in=True, active=False)
            runner = _RecordingRunner(db, succeed=True)

            result = self._guard(tmpdir, relogin_runner=runner)

        self.assertEqual(result["status"], "relogged_in")
        self.assertEqual(runner.calls, [["Mingfan0"]])

    def test_failed_relogin_classifies_cloudflare_block(self) -> None:
        cf_output = (
            "2026-06-11 09:24:15.845 | ERROR | twscrape.accounts_pool:login:162 - "
            "Failed to login '@Mingfan0': 403 - <!DOCTYPE html>... "
            "<title>Attention Required! | Cloudflare</title> Sorry, you have been blocked"
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, logged_in=False)
            runner = _RecordingRunner(db, succeed=False, output=cf_output)

            result = self._guard(tmpdir, relogin_runner=runner)
            state = json.loads((Path(tmpdir) / "relogin_guard_state.json").read_text(encoding="utf-8"))

        self.assertEqual(result["status"], "relogin_failed")
        self.assertEqual(result["failure_cause"], "cloudflare_block")
        self.assertIn("Cloudflare", result["detail"])
        self.assertIn("refresh_x_session", result["detail"])
        self.assertEqual(state["last_failure_cause"], "cloudflare_block")
        self.assertIn("Failed to login", state["last_error_line"])

    def test_failed_relogin_classifies_bad_credentials_from_raised_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, logged_in=False)
            runner = _RecordingRunner(
                db,
                succeed=False,
                raise_error=True,
                error_text='Failed to login: 400 - {"errors":[{"code":399,"message":"Wrong password!"}]}',
            )

            result = self._guard(tmpdir, relogin_runner=runner)
            state = json.loads((Path(tmpdir) / "relogin_guard_state.json").read_text(encoding="utf-8"))

        self.assertEqual(result["status"], "relogin_failed")
        self.assertEqual(result["failure_cause"], "bad_credentials")
        self.assertIn("password", result["detail"].lower())
        self.assertEqual(state["last_failure_cause"], "bad_credentials")

    def test_failed_relogin_classifies_email_challenge(self) -> None:
        output = (
            "ERROR | Failed to login '@Mingfan0': "
            "login_step=LoginAcid err=imap login failed for a@b.c"
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, logged_in=False)
            runner = _RecordingRunner(db, succeed=False, output=output)

            result = self._guard(tmpdir, relogin_runner=runner)

        self.assertEqual(result["status"], "relogin_failed")
        self.assertEqual(result["failure_cause"], "email_challenge_failed")
        self.assertIn("app password", result["detail"])

    def test_failed_relogin_unknown_cause_keeps_error_line(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, logged_in=False)
            runner = _RecordingRunner(db, succeed=False, output="something novel went sideways")

            result = self._guard(tmpdir, relogin_runner=runner)
            state = json.loads((Path(tmpdir) / "relogin_guard_state.json").read_text(encoding="utf-8"))

        self.assertEqual(result["status"], "relogin_failed")
        self.assertEqual(result["failure_cause"], "unknown")
        self.assertEqual(state["last_failure_cause"], "unknown")
        self.assertIn("something novel went sideways", state["last_error_line"])

    def test_failure_cause_strips_ansi_codes_before_classification(self) -> None:
        cf_output = (
            "\x1b[32m2026-06-11\x1b[0m | \x1b[31m\x1b[1mERROR\x1b[0m | "
            "Failed to login '@Mingfan0': 403 - \x1b[31mCloudflare\x1b[0m block page"
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, logged_in=False)
            runner = _RecordingRunner(db, succeed=False, output=cf_output)

            result = self._guard(tmpdir, relogin_runner=runner)
            state = json.loads((Path(tmpdir) / "relogin_guard_state.json").read_text(encoding="utf-8"))

        self.assertEqual(result["failure_cause"], "cloudflare_block")
        self.assertNotIn("\x1b", state["last_error_line"])

    def test_cooldown_detail_includes_last_failure_cause(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db = Path(tmpdir) / "accounts.db"
            _make_db(db, logged_in=False)
            state_path = Path(tmpdir) / "relogin_guard_state.json"
            state_path.write_text(
                json.dumps(
                    {
                        "last_attempt_at": (NOW - timedelta(hours=1)).isoformat(),
                        "last_outcome": "relogin_failed",
                        "last_failure_cause": "cloudflare_block",
                    }
                ),
                encoding="utf-8",
            )
            runner = _RecordingRunner(db)

            result = self._guard(tmpdir, relogin_runner=runner)

        self.assertEqual(result["status"], "cooldown")
        self.assertEqual(result["failure_cause"], "cloudflare_block")
        self.assertIn("cloudflare_block", result["detail"])
        self.assertEqual(runner.calls, [])


if __name__ == "__main__":
    unittest.main()
