import tempfile
import unittest
from pathlib import Path


REPORT_TEXT = """# GPU Rental Daily Report

Run timestamp UTC: 2026-06-07T22:39:33+00:00

## Source Status

- RunPod GraphQL: succeeded; public unauthenticated query returned GPU price/stock fields.
- Vast.ai filtered offers: succeeded; 500 verified, rentable, unrented offers returned before GPU normalization.

## Historical Market Snapshot

+-----------+------------+--------+--------+--------+---------+
| GPU       | Date       | Median | Offers | 7D Chg | 30D Chg |
+-----------+------------+--------+--------+--------+---------+
| B200      | 2026-06-07 |  $6.24 |     35 |  -2.5% |  +33.3% |
| H100 SXM  | 2026-06-07 |  $2.40 |     16 | -41.9% |   +4.7% |
+-----------+------------+--------+--------+--------+---------+

## Price + Offer Count Read

+-----------+----------+--------------+---------------------------------------+-----------+---------------+-------------------------+
| GPU       | 7D Price | 7D Offer Chg | 7D Read                               | 30D Price | 30D Offer Chg | 30D Read                |
+-----------+----------+--------------+---------------------------------------+-----------+---------------+-------------------------+
| B200      |    -2.5% |          +10 | Looser                                |    +33.3% |           +12 | Demand absorbing supply |
| H100 SXM  |   -41.9% |           +2 | Looser                                |     +4.7% |           +11 | Demand absorbing supply |
+-----------+----------+--------------+---------------------------------------+-----------+---------------+-------------------------+

## First-Run Read

- B200: Vast p25 $4.25/GPU-hr vs RunPod low $5.89/GPU-hr; spread $-1.64.
"""


class AiInfraUpdateTest(unittest.TestCase):
    def test_gpu_report_becomes_ai_infra_update_items(self) -> None:
        from backend.services.ai_infra_update import build_ai_infra_update

        with tempfile.TemporaryDirectory() as tmpdir:
            report_path = Path(tmpdir) / "daily-report.md"
            report_path.write_text(REPORT_TEXT, encoding="utf-8")

            update = build_ai_infra_update(Path(tmpdir))

        self.assertEqual(update["source_status"], "ok")
        self.assertEqual(update["report_timestamp_utc"], "2026-06-07T22:39:33+00:00")
        self.assertEqual(len(update["items"]), 2)
        self.assertEqual(update["items"][0]["source"], "ai_infra_update")
        self.assertIn("H100 SXM", update["items"][0]["title"])
        self.assertGreater(update["items"][0]["score"], update["items"][1]["score"])
        self.assertEqual(update["items"][1]["metadata"]["gpu"], "B200")
        self.assertEqual(update["items"][1]["metadata"]["price_change_30d_pct"], 33.3)
        self.assertEqual(update["items"][1]["metadata"]["price_read_30d"], "Demand absorbing supply")
        self.assertIn("NVDA", update["items"][1]["metadata"]["related_tickers"])

    def test_missing_gpu_report_degrades_without_throwing(self) -> None:
        from backend.services.ai_infra_update import build_ai_infra_update

        with tempfile.TemporaryDirectory() as tmpdir:
            update = build_ai_infra_update(Path(tmpdir))

        self.assertEqual(update["source_status"], "degraded")
        self.assertEqual(update["items"], [])
        self.assertIn("daily-report.md", update["errors"][0]["message"])


if __name__ == "__main__":
    unittest.main()
