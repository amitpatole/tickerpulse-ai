import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.config import Config
from backend.jobs._helpers import _get_agent_registry


class SchedulerAgentRegistryTest(unittest.TestCase):
    def test_scheduled_jobs_receive_registered_default_agents(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = str(Path(tmpdir) / "tickerpulse-test.db")
            with (
                patch.object(Config, "DB_PATH", db_path),
                patch.object(Config, "GITHUB_TOKEN", "test-token"),
            ):
                registry = _get_agent_registry()

        agent_names = {agent["name"] for agent in registry.list_agents()}
        self.assertIn("scanner", agent_names)
        self.assertIn("researcher", agent_names)
        self.assertIn("regime", agent_names)
        self.assertIn("investigator", agent_names)


if __name__ == "__main__":
    unittest.main()
