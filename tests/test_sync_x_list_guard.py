import os
import unittest
from unittest import mock

from backend.scripts import sync_x_list


class ResolveTargetTest(unittest.TestCase):
    def setUp(self):
        self._env = os.environ.pop("TWIKIT_X_USERNAME", None)

    def tearDown(self):
        if self._env is not None:
            os.environ["TWIKIT_X_USERNAME"] = self._env
        else:
            os.environ.pop("TWIKIT_X_USERNAME", None)

    def test_empty_arg_and_no_env_returns_empty(self):
        self.assertEqual(sync_x_list._resolve_target(""), "")

    def test_explicit_arg_wins(self):
        self.assertEqual(sync_x_list._resolve_target("  @MingFan0 "), "MingFan0")

    def test_env_used_when_arg_empty(self):
        os.environ["TWIKIT_X_USERNAME"] = "@envuser"
        self.assertEqual(sync_x_list._resolve_target(""), "envuser")


class SyncXListGuardTest(unittest.TestCase):
    def setUp(self):
        self._env = os.environ.pop("TWIKIT_X_USERNAME", None)

    def tearDown(self):
        if self._env is not None:
            os.environ["TWIKIT_X_USERNAME"] = self._env
        else:
            os.environ.pop("TWIKIT_X_USERNAME", None)

    def test_refuses_without_target_account(self):
        with mock.patch.object(sync_x_list, "_build_client") as build:
            rc = sync_x_list.main([])
        self.assertEqual(rc, 2)
        build.assert_not_called()

    def test_dry_run_without_yes_does_not_build_client(self):
        with mock.patch.object(sync_x_list, "_build_client") as build:
            rc = sync_x_list.main(["--username", "MingFan0"])
        self.assertEqual(rc, 0)
        build.assert_not_called()

    def test_existing_list_dry_run_builds_client_for_read_only_diff(self):
        class _Result(list):
            next = None

        class _Client:
            async def get_list_members(self, list_id, count=100):
                return _Result()

        with mock.patch.object(sync_x_list, "_build_client", return_value=_Client()) as build:
            rc = sync_x_list.main(["--username", "MingFan0", "--list-id", "123"])

        self.assertEqual(rc, 0)
        build.assert_called_once()

    def test_yes_flag_proceeds_to_build_client(self):
        with mock.patch.object(
            sync_x_list, "_build_client", side_effect=RuntimeError("stop before network")
        ) as build:
            with self.assertRaises(RuntimeError):
                sync_x_list.main(["--username", "MingFan0", "--yes"])
        build.assert_called_once()


if __name__ == "__main__":
    unittest.main()
