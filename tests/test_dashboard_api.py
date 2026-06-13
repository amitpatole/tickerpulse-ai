import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from flask import Flask

from backend.config import Config


def _create_agent_runs_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.execute(
        """
        CREATE TABLE agent_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_name TEXT NOT NULL,
            framework TEXT NOT NULL DEFAULT 'native',
            status TEXT NOT NULL DEFAULT 'success',
            input_data TEXT,
            output_data TEXT,
            tokens_input INTEGER DEFAULT 0,
            tokens_output INTEGER DEFAULT 0,
            estimated_cost REAL DEFAULT 0.0,
            duration_ms INTEGER DEFAULT 0,
            error TEXT,
            metadata TEXT,
            started_at TIMESTAMP,
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    now = datetime.now(timezone.utc).replace(microsecond=0)
    old = now - timedelta(days=45)
    rows = [
        ("regime", "success", 100, 50, 0.01, now.isoformat(), now.isoformat(), now.strftime("%Y-%m-%d %H:%M:%S")),
        ("scanner", "success", 20, 5, 0.0025, now.isoformat(), now.isoformat(), now.strftime("%Y-%m-%d %H:%M:%S")),
        ("regime", "success", 900, 900, 9.0, old.isoformat(), old.isoformat(), old.strftime("%Y-%m-%d %H:%M:%S")),
    ]
    conn.executemany(
        """
        INSERT INTO agent_runs (
            agent_name, status, tokens_input, tokens_output, estimated_cost,
            started_at, completed_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    conn.close()


class DashboardApiTest(unittest.TestCase):
    def test_agent_cost_summary_uses_real_runs_for_days_query(self) -> None:
        from backend.api.agents import agents_bp

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "tickerpulse-test.db"
            _create_agent_runs_db(db_path)

            app = Flask(__name__)
            app.register_blueprint(agents_bp)

            with patch.object(Config, "DB_PATH", str(db_path)):
                response = app.test_client().get("/api/agents/costs?days=30")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["period_days"], 30)
        self.assertEqual(payload["total_runs"], 2)
        self.assertEqual(payload["total_tokens"], 175)
        self.assertEqual(payload["total_tokens_input"], 120)
        self.assertEqual(payload["total_tokens_output"], 55)
        self.assertAlmostEqual(payload["total_cost_usd"], 0.0125)
        self.assertEqual(payload["by_agent"]["regime"]["tokens_used"], 150)
        self.assertEqual(payload["by_agent"]["regime"]["runs"], 1)
        self.assertEqual(payload["by_agent"]["scanner"]["tokens_used"], 25)
        self.assertEqual(payload["daily_costs"][0]["runs"], 2)

    def test_ai_infra_update_endpoint_returns_dashboard_payload(self) -> None:
        from backend.api.market_sweep import market_sweep_bp

        fake_update = {
            "source_status": "ok",
            "report_timestamp_utc": "2026-06-09T18:45:39+00:00",
            "items": [
                {
                    "source": "ai_infra_update",
                    "title": "AI infra update: B200 rental median $4.58",
                    "score": 78.5,
                    "metadata": {
                        "gpu": "B200",
                        "median_usd_per_gpu_hr": 4.58,
                        "offers": 43,
                    },
                }
            ],
            "errors": [],
        }

        app = Flask(__name__)
        app.register_blueprint(market_sweep_bp)

        with patch("backend.api.market_sweep.build_ai_infra_update", return_value=fake_update):
            response = app.test_client().get("/api/ai-infra-update")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["source_status"], "ok")
        self.assertEqual(payload["report_timestamp_utc"], "2026-06-09T18:45:39+00:00")
        self.assertEqual(payload["items"][0]["metadata"]["gpu"], "B200")


if __name__ == "__main__":
    unittest.main()
