"""Unit tests for the X List reconciliation logic in sync_x_list.

Proves the 46->25 cut is enforceable: cut handles (members no longer in config)
are computed for removal, not just left as stale members. Pure-function tests;
no twikit/X session required.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def test_reconcile_members_adds_missing_and_removes_cut() -> None:
    from backend.scripts.sync_x_list import reconcile_members

    configured = {"1", "2", "3"}      # current top-25 (by user id)
    current = {"2", "3", "8", "9"}    # live list still holds cut handles 8, 9

    to_add, to_remove = reconcile_members(configured, current)

    assert set(to_add) == {"1"}                   # missing configured handle added
    assert set(to_remove) == {"8", "9"}           # cut handles flagged for removal
    assert configured.isdisjoint(set(to_remove))  # never removes a kept handle


def test_reconcile_members_noop_when_in_sync() -> None:
    from backend.scripts.sync_x_list import reconcile_members

    ids = {"1", "2", "3"}
    to_add, to_remove = reconcile_members(ids, set(ids))

    assert to_add == []
    assert to_remove == []


class _FakeUser:
    def __init__(self, uid: str, screen: str) -> None:
        self.id = uid
        self.screen_name = screen


class _FakeResult(list):
    next = None  # single page; no pagination


class _FakeAccount:
    def __init__(self, handle: str, user_id: str = "") -> None:
        self.handle = handle
        self.user_id = user_id


class _FakeClient:
    """Minimal stand-in for the twikit Client used by reconcile_list."""

    def __init__(self, members, *, resolve=None, fail_resolve=(), fail_remove=()):
        self._members = {uid: screen for uid, screen in members}
        self._resolve = dict(resolve or {})
        self._fail_resolve = set(fail_resolve)
        self._fail_remove = set(fail_remove)
        self.added: list[str] = []
        self.removed: list[str] = []

    async def get_user_by_screen_name(self, handle: str):
        if handle in self._fail_resolve:
            raise RuntimeError("rate limit")
        uid = self._resolve.get(handle)
        if uid is None:
            raise RuntimeError("not found")
        return _FakeUser(uid, handle)

    async def get_list_members(self, list_id: str, count: int = 20, cursor=None):
        return _FakeResult(_FakeUser(uid, s) for uid, s in self._members.items())

    async def add_list_member(self, list_id: str, uid: str):
        self.added.append(uid)
        self._members[uid] = uid

    async def remove_list_member(self, list_id: str, uid: str):
        if uid in self._fail_remove:
            raise RuntimeError("permission denied")
        self.removed.append(uid)
        self._members.pop(uid, None)


def test_reconcile_list_adds_missing_and_removes_cut() -> None:
    from backend.scripts.sync_x_list import reconcile_list, reconcile_ok

    accounts = [_FakeAccount("keep1", "1"), _FakeAccount("keep2", "2"), _FakeAccount("new3", "3")]
    client = _FakeClient(members=[("1", "keep1"), ("2", "keep2"), ("8", "cut8"), ("9", "cut9")])

    result = asyncio.run(reconcile_list(client, accounts, "L1", write=True))

    assert set(client.added) == {"3"}
    assert set(client.removed) == {"8", "9"}
    assert result["verify_stale"] == []
    assert reconcile_ok(result)


def test_reconcile_list_does_not_remove_unresolved_keeper() -> None:
    """F4: a configured keeper with no stored user_id whose live lookup fails must
    NOT be removed, even though its id is on the list and absent from configured_ids."""
    from backend.scripts.sync_x_list import reconcile_list, reconcile_ok

    accounts = [_FakeAccount("keep_withid", "1"), _FakeAccount("keep_noid", "")]
    client = _FakeClient(
        members=[("1", "keep_withid"), ("9", "keep_noid")],
        fail_resolve={"keep_noid"},
    )

    result = asyncio.run(reconcile_list(client, accounts, "L1", write=True))

    assert client.removed == []                      # keeper NOT deleted
    assert "keep_noid" in result["skipped_removals"]
    assert not reconcile_ok(result)                  # surfaces as a nonzero exit


def test_reconcile_list_remove_failure_is_not_ok() -> None:
    """F5: a failed removal leaves the cut member on the list and must make the
    command report failure (nonzero), not exit 0."""
    from backend.scripts.sync_x_list import reconcile_list, reconcile_ok

    accounts = [_FakeAccount("keep1", "1")]
    client = _FakeClient(members=[("1", "keep1"), ("8", "cut8")], fail_remove={"8"})

    result = asyncio.run(reconcile_list(client, accounts, "L1", write=True))

    assert result["remove_failures"]                 # failure recorded
    assert result["verify_stale"] == ["cut8"]        # cut member still present
    assert not reconcile_ok(result)


def test_reconcile_list_unresolved_missing_account_is_not_ok() -> None:
    """F6: an unresolved configured account that is not yet on the list cannot be
    added, so the run must report failure (nonzero) rather than silently exit 0,
    even when there are no stale members to remove."""
    from backend.scripts.sync_x_list import reconcile_list, reconcile_ok

    accounts = [_FakeAccount("keep1", "1"), _FakeAccount("missing_noid", "")]
    # list has only keep1; missing_noid has no user_id and live lookup fails; and
    # there are NO stale members, so nothing is skipped or removed.
    client = _FakeClient(members=[("1", "keep1")], fail_resolve={"missing_noid"})

    result = asyncio.run(reconcile_list(client, accounts, "L1", write=True))

    assert result["unresolved"]                       # missing_noid unresolved
    assert result["to_remove"] == []                  # nothing stale
    assert result["skipped_removals"] == []           # no removal was skipped
    assert client.removed == []
    assert not reconcile_ok(result)                   # F6: still NOT ok
