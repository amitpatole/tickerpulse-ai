"""Auto-relogin guard for the shared twscrape X session pool.

Before collection, checks whether any pool account has a usable session:
active AND (login-flow ``authorization`` header OR an imported
``auth_token``+``ct0`` cookie pair - cookie-only accounts are valid in
twscrape and must not be wiped by a relogin). If none are usable, makes at
most one bounded ``twscrape relogin`` attempt per cooldown window, then
verifies success by re-reading the accounts DB - the twscrape CLI exits 0
even when the login flow fails, so the DB is the only truth.

Failed attempts are classified from the captured login output
(``classify_relogin_failure``: cloudflare_block / bad_credentials /
email_challenge_failed / mfa_required / ip_ban / unknown) and the cause plus
a one-line error is persisted in the state file and surfaced with a concrete
remediation in the guard detail. When automated login is blocked upstream
(e.g. Cloudflare on VPN/datacenter IPs), restore the session manually with
``python -m backend.scripts.refresh_x_session``.

Safety properties:
- one attempt per cooldown window (state file next to accounts.db), never
  per-request retries, so a broken login flow cannot hammer X and lock the
  account
- only accounts with stored password+email are attempted
- ``TICKERPULSE_X_AUTO_RELOGIN=0`` disables the guard entirely
"""

from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
import subprocess
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

STATE_FILENAME = "relogin_guard_state.json"
DEFAULT_COOLDOWN_HOURS = 6.0
_RELOGIN_TIMEOUT_SECONDS = 300
_ERROR_LINE_MAX_CHARS = 300

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")

# A session is usable only when the queue selector will pick the account
# (active = 1) AND it carries either login-flow headers or an imported
# auth_token+ct0 cookie pair (cookie-only accounts are valid in twscrape).
_LOGGED_IN_SQL = """
SELECT
    username,
    active = 1 AND (
        COALESCE(json_extract(headers, '$.authorization'), '') <> ''
        OR (
            COALESCE(json_extract(cookies, '$.auth_token'), '') <> ''
            AND COALESCE(json_extract(cookies, '$.ct0'), '') <> ''
        )
    ) AS logged_in,
    COALESCE(password, '') <> '' AND COALESCE(email, '') <> '' AS has_creds
FROM accounts
"""

# Classified relogin failure causes -> operator remediation. The twscrape CLI
# exits 0 even when the login flow fails, so the captured log output is the
# only signal of WHY a relogin failed.
_FAILURE_REMEDIATION = {
    "cloudflare_block": (
        "X login API blocked by Cloudflare from this IP/network (VPN and "
        "datacenter exits are commonly blocked). Retry from a residential IP, "
        "or restore the session with browser-exported cookies via "
        "`python -m backend.scripts.refresh_x_session --cookies \"auth_token=...; ct0=...\"`."
    ),
    "bad_credentials": (
        "X rejected the stored password; update the twscrape account password "
        "before the next attempt."
    ),
    "email_challenge_failed": (
        "X asked for an email confirmation code and IMAP retrieval failed; "
        "store a Gmail IMAP app password (16 chars) as email_password, or use "
        "the cookie refresh helper."
    ),
    "mfa_required": (
        "Account requires TOTP MFA; store mfa_code in the twscrape pool or use "
        "the cookie refresh helper."
    ),
    "ip_ban": (
        "Login flow finished without session cookies (twscrape flags this as a "
        "likely IP ban); change network or refresh cookies from a browser."
    ),
    "unknown": (
        "Unclassified login failure; inspect the captured output line and "
        "refresh cookies via backend.scripts.refresh_x_session if it persists."
    ),
}


def classify_relogin_failure(output: str) -> str:
    """Map raw twscrape relogin output to a stable failure cause label."""
    text = _ANSI_RE.sub("", output).lower()
    if "cloudflare" in text or "attention required" in text or "you have been blocked" in text:
        return "cloudflare_block"
    if "wrong password" in text or '"code":399' in text:
        return "bad_credentials"
    if "login_step=loginacid" in text or "imap" in text or "confirmation code" in text:
        return "email_challenge_failed"
    if "mfa code is required" in text or "login_step=logintwofactorauthchallenge" in text:
        return "mfa_required"
    if "ct0 not in cookies" in text:
        return "ip_ban"
    return "unknown"


def _extract_error_line(output: str) -> str:
    """One ANSI-free line describing the failure, preferring twscrape's own error line."""
    clean = _ANSI_RE.sub("", output)
    lines = [line.strip() for line in clean.splitlines() if line.strip()]
    for line in lines:
        if "failed to login" in line.lower():
            return line[:_ERROR_LINE_MAX_CHARS]
    return lines[0][:_ERROR_LINE_MAX_CHARS] if lines else ""


def default_twscrape_repo() -> Path:
    return Path(os.getenv("TWSCRAPE_REPO", r"C:\Repos\twscrape"))


def ensure_x_session(
    *,
    twscrape_repo: Path | None = None,
    cooldown_hours: float = DEFAULT_COOLDOWN_HOURS,
    relogin_runner: Callable[[list[str]], str | None] | None = None,
    now: datetime | None = None,
) -> dict[str, object]:
    """Check the pool and relogin once if needed. Never raises; returns a status dict."""
    repo = Path(twscrape_repo) if twscrape_repo is not None else default_twscrape_repo()
    db_path = repo / "accounts.db"
    state_path = repo / STATE_FILENAME
    reference = now or datetime.now(timezone.utc)

    if os.getenv("TICKERPULSE_X_AUTO_RELOGIN", "1").strip().lower() in {"0", "false", "off"}:
        return _result("disabled", detail="TICKERPULSE_X_AUTO_RELOGIN disabled the guard.")
    if not db_path.exists():
        return _result("no_db", detail=f"twscrape accounts DB not found at {db_path}.")

    try:
        rows = _read_pool(db_path)
    except sqlite3.Error as exc:
        return _result("no_db", detail=f"Could not read accounts DB: {exc}")

    logged_in = [row["username"] for row in rows if row["logged_in"]]
    if logged_in:
        return _result("ok", logged_in_accounts=logged_in, detail="Pool has a logged-in session.")

    candidates = [row["username"] for row in rows if row["has_creds"]]
    if not candidates:
        return _result(
            "no_candidates",
            detail="No logged-out account has stored password+email; manual cookie refresh needed.",
        )

    state = _read_state(state_path)
    cooldown_until = _cooldown_until(state, cooldown_hours)
    if cooldown_until is not None and reference < cooldown_until:
        last_cause = str(state.get("last_failure_cause") or "")
        cause_note = f", cause {last_cause}" if last_cause else ""
        return _result(
            "cooldown",
            detail=(
                f"Last relogin attempt at {state.get('last_attempt_at')} "
                f"({state.get('last_outcome')}{cause_note}); next attempt allowed after cooldown."
            ),
            cooldown_until=cooldown_until.isoformat(),
            failure_cause=last_cause,
        )

    runner = relogin_runner or (lambda usernames: _run_twscrape_relogin(repo, usernames))
    detail = ""
    captured_output = ""
    try:
        logger.info("X session guard: attempting relogin for %s", candidates)
        captured_output = runner(candidates) or ""
    except Exception as exc:
        captured_output = str(exc)
        detail = f"Relogin attempt raised: {exc}"

    try:
        relogged_in = [row["username"] for row in _read_pool(db_path) if row["logged_in"]]
    except sqlite3.Error as exc:
        relogged_in = []
        detail = detail or f"Could not re-read accounts DB after relogin: {exc}"

    if relogged_in:
        _write_state(
            state_path,
            {"last_attempt_at": reference.isoformat(), "last_outcome": "relogged_in"},
        )
        return _result(
            "relogged_in",
            logged_in_accounts=relogged_in,
            attempted=candidates,
            detail="Relogin restored a logged-in session.",
        )

    cause = classify_relogin_failure(captured_output)
    error_line = _extract_error_line(captured_output)
    _write_state(
        state_path,
        {
            "last_attempt_at": reference.isoformat(),
            "last_outcome": "relogin_failed",
            "last_failure_cause": cause,
            "last_error_line": error_line,
        },
    )
    detail_parts = [detail or "Relogin ran but no account shows a logged-in session afterwards."]
    if error_line:
        detail_parts.append(f"Login error: {error_line}")
    detail_parts.append(_FAILURE_REMEDIATION.get(cause, _FAILURE_REMEDIATION["unknown"]))
    return _result(
        "relogin_failed",
        attempted=candidates,
        failure_cause=cause,
        detail=" ".join(detail_parts),
    )


def _result(status: str, **extra: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "status": status,
        "logged_in_accounts": [],
        "attempted": [],
        "detail": "",
        "failure_cause": "",
    }
    payload.update(extra)
    return payload


def _read_pool(db_path: Path) -> list[dict[str, object]]:
    con = sqlite3.connect(db_path)
    try:
        rows = con.execute(_LOGGED_IN_SQL).fetchall()
    finally:
        con.close()
    return [
        {"username": str(username), "logged_in": bool(logged_in), "has_creds": bool(has_creds)}
        for username, logged_in, has_creds in rows
    ]


def _read_state(state_path: Path) -> dict[str, object]:
    if not state_path.exists():
        return {}
    try:
        raw = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return raw if isinstance(raw, dict) else {}


def _write_state(state_path: Path, state: dict[str, object]) -> None:
    try:
        state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    except OSError as exc:
        logger.warning("X session guard could not persist state: %s", exc)


def _cooldown_until(state: dict[str, object], cooldown_hours: float) -> datetime | None:
    raw = str(state.get("last_attempt_at") or "").strip()
    if not raw:
        return None
    try:
        last_attempt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if last_attempt.tzinfo is None:
        last_attempt = last_attempt.replace(tzinfo=timezone.utc)
    return last_attempt + timedelta(hours=cooldown_hours)


def _run_twscrape_relogin(repo: Path, usernames: list[str]) -> str:
    """Run twscrape relogin and return its combined output.

    The CLI exits 0 even when the login flow fails, so the caller must keep
    the output to classify failures after verifying the DB.
    """
    env = dict(os.environ)
    env["PYTHONUTF8"] = "1"
    completed = subprocess.run(
        ["uv", "run", "twscrape", "relogin", *usernames],
        cwd=str(repo),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=_RELOGIN_TIMEOUT_SECONDS,
        env=env,
        check=False,
    )
    output = "\n".join(part for part in (completed.stderr, completed.stdout) if part).strip()
    if completed.returncode != 0:
        raise RuntimeError(output or f"twscrape relogin exited {completed.returncode}")
    return output
