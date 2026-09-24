import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml
from flask import Flask


class DashboardWatchlistConfigTest(unittest.TestCase):
    def test_add_stock_api_updates_database_and_central_watchlist_config(self) -> None:
        from backend.api.stocks import stocks_bp
        from backend.core.stock_manager import init_stocks_table

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            config_dir = root / "config"
            config_dir.mkdir()
            watchlist_path = config_dir / "dashboard_watchlist.yaml"
            watchlist_path.write_text(
                """
updated_at: "2026-06-07"
items:
  - ticker: NVDA
    name: NVIDIA Corporation
    market: US
""",
                encoding="utf-8",
            )
            db_path = str(root / "stocks.db")

            app = Flask(__name__)
            app.register_blueprint(stocks_bp)

            with (
                patch("backend.config.Config.DB_PATH", db_path),
                patch("backend.services.dashboard_watchlist.Config.BASE_DIR", root),
            ):
                init_stocks_table()
                response = app.test_client().post(
                    "/api/stocks",
                    json={"ticker": "RBRK", "name": "Rubrik Inc.", "market": "US"},
                )

                conn = sqlite3.connect(db_path)
                conn.row_factory = sqlite3.Row
                row = conn.execute(
                    "SELECT ticker, name, market, active FROM stocks WHERE ticker = ?",
                    ("RBRK",),
                ).fetchone()
                conn.close()

            payload = response.get_json()
            saved = yaml.safe_load(watchlist_path.read_text(encoding="utf-8"))

        self.assertEqual(response.status_code, 200)
        self.assertTrue(payload["success"])
        self.assertEqual(row["active"], 1)
        self.assertTrue(any(item["ticker"] == "RBRK" for item in saved["items"]))

    def test_remove_stock_api_updates_database_and_central_watchlist_config(self) -> None:
        from backend.api.stocks import stocks_bp
        from backend.core.stock_manager import add_stock, init_stocks_table

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            config_dir = root / "config"
            config_dir.mkdir()
            watchlist_path = config_dir / "dashboard_watchlist.yaml"
            watchlist_path.write_text(
                """
updated_at: "2026-06-07"
items:
  - ticker: NVDA
    name: NVIDIA Corporation
    market: US
  - ticker: RBRK
    name: Rubrik Inc.
    market: US
""",
                encoding="utf-8",
            )
            db_path = str(root / "stocks.db")

            app = Flask(__name__)
            app.register_blueprint(stocks_bp)

            with (
                patch("backend.config.Config.DB_PATH", db_path),
                patch("backend.services.dashboard_watchlist.Config.BASE_DIR", root),
            ):
                init_stocks_table()
                add_stock("RBRK", "Rubrik Inc.", "US")
                response = app.test_client().delete("/api/stocks/RBRK")

                conn = sqlite3.connect(db_path)
                conn.row_factory = sqlite3.Row
                row = conn.execute(
                    "SELECT active FROM stocks WHERE ticker = ?",
                    ("RBRK",),
                ).fetchone()
                conn.close()

            saved = yaml.safe_load(watchlist_path.read_text(encoding="utf-8"))

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["success"])
        self.assertEqual(row["active"], 0)
        self.assertFalse(any(item["ticker"] == "RBRK" for item in saved["items"]))

    def test_sync_central_watchlist_config_to_database(self) -> None:
        from backend.core.stock_manager import init_stocks_table
        from backend.services.dashboard_watchlist import sync_dashboard_watchlist_to_db

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            config_path = root / "dashboard_watchlist.yaml"
            config_path.write_text(
                """
updated_at: "2026-06-07"
items:
  - ticker: RBRK
    name: Rubrik Inc.
    market: US
  - ticker: HYPE32196-USD
    name: Hyperliquid USD
    market: Crypto
    source_symbol: HYPE
""",
                encoding="utf-8",
            )
            db_path = str(root / "stocks.db")

            with patch("backend.config.Config.DB_PATH", db_path):
                init_stocks_table()
                summary = sync_dashboard_watchlist_to_db(config_path)
                conn = sqlite3.connect(db_path)
                conn.row_factory = sqlite3.Row
                rows = conn.execute(
                    "SELECT ticker, market, active FROM stocks WHERE ticker IN (?, ?) ORDER BY ticker",
                    ("RBRK", "HYPE32196-USD"),
                ).fetchall()
                conn.close()

        self.assertEqual(summary["upserted"], 2)
        self.assertEqual([row["ticker"] for row in rows], ["HYPE32196-USD", "RBRK"])
        self.assertTrue(all(row["active"] == 1 for row in rows))

    def test_load_dashboard_watchlist_excludes_news_false_by_default(self) -> None:
        from backend.services.dashboard_watchlist import load_dashboard_watchlist

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "dashboard_watchlist.yaml"
            path.write_text(
                """
updated_at: "2026-06-15"
items:
  - ticker: NVDA
    name: NVIDIA Corporation
    market: US
    bucket: core_ai
  - ticker: UCTT
    name: Ultra Clean Holdings Inc.
    market: US
    bucket: semicap
    news: false
  - ticker: WMT
    name: Walmart Inc.
    market: US
""",
                encoding="utf-8",
            )
            default_items = load_dashboard_watchlist(path)
            all_items = load_dashboard_watchlist(path, include_all=True)

        # Default view drops chart-only (news: false) names so the /news universe
        # stays lean; the escape hatch returns the full master list.
        self.assertEqual([item["ticker"] for item in default_items], ["NVDA", "WMT"])
        self.assertEqual(
            [item["ticker"] for item in all_items], ["NVDA", "UCTT", "WMT"]
        )

    def test_sync_to_db_skips_news_false_items(self) -> None:
        from backend.core.stock_manager import init_stocks_table
        from backend.services.dashboard_watchlist import sync_dashboard_watchlist_to_db

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            config_path = root / "dashboard_watchlist.yaml"
            config_path.write_text(
                """
updated_at: "2026-06-15"
items:
  - ticker: NVDA
    name: NVIDIA Corporation
    market: US
    bucket: core_ai
  - ticker: UCTT
    name: Ultra Clean Holdings Inc.
    market: US
    bucket: semicap
    news: false
""",
                encoding="utf-8",
            )
            db_path = str(root / "stocks.db")

            with patch("backend.config.Config.DB_PATH", db_path):
                init_stocks_table()
                summary = sync_dashboard_watchlist_to_db(config_path)
                conn = sqlite3.connect(db_path)
                conn.row_factory = sqlite3.Row
                rows = conn.execute(
                    "SELECT ticker, active FROM stocks WHERE ticker IN (?, ?)",
                    ("NVDA", "UCTT"),
                ).fetchall()
                conn.close()

        # The sync upserts only the news-tracked name; the chart-only (news: false)
        # name is never seeded into the /news DB.
        self.assertEqual(summary["upserted"], 1)
        seeded = {row["ticker"]: row["active"] for row in rows}
        self.assertEqual(seeded.get("NVDA"), 1)
        self.assertNotIn("UCTT", seeded)


if __name__ == "__main__":
    unittest.main()
