import tempfile
import unittest
from pathlib import Path

from backend.services.token_usage_update import build_token_usage_update

_CSV = (
    '"key","label","latestCompletedWeek","latestTokens","latestTokensT",'
    '"latestSharePct","change4wPct","change12wPct","shareChange4wPct","shareChange12wPct"\n'
    '"deepseek","DeepSeek","2026-06-01","6746639180969","6.747","18.6705","125.77","445.71","7.06","11.36"\n'
    '"claude","Claude (Anthropic)","2026-06-01","5292323178165","5.292","14.6458","41.64","103.81","0.13","-0.72"\n'
)
_SUMMARY = "# OpenRouter Model Usage Trend\n\nGenerated: 2026-06-13\nSource: OpenRouter rankings public API.\n"


class BuildTokenUsageTest(unittest.TestCase):
    def _report_dir(self) -> str:
        d = tempfile.mkdtemp()
        Path(d, "model_family_trend_summary_completed_weeks.csv").write_text(_CSV, encoding="utf-8")
        Path(d, "summary.md").write_text(_SUMMARY, encoding="utf-8")
        return d

    def test_parses_families_sorted_by_abs_4w_change(self):
        out = build_token_usage_update(report_dir=self._report_dir())
        self.assertEqual(out["source_status"], "ok")
        items = out["items"]
        self.assertEqual(len(items), 2)
        # DeepSeek 4W +125.77 sorts above Claude 4W +41.64
        top = items[0]["metadata"]
        self.assertEqual(top["family"], "DeepSeek")
        self.assertAlmostEqual(top["tokens_trillions"], 6.747)
        self.assertAlmostEqual(top["share_pct"], 18.6705)
        self.assertAlmostEqual(top["token_change_4w_pct"], 125.77)
        self.assertAlmostEqual(top["token_change_12w_pct"], 445.71)
        self.assertAlmostEqual(top["share_change_4w_pp"], 7.06)
        self.assertAlmostEqual(top["share_change_12w_pp"], 11.36)
        self.assertEqual(out["report_timestamp_utc"], "2026-06-13T00:00:00+00:00")

    def test_missing_csv_is_degraded(self):
        out = build_token_usage_update(report_dir=tempfile.mkdtemp())
        self.assertEqual(out["source_status"], "degraded")
        self.assertEqual(out["items"], [])
        self.assertTrue(out["errors"])


if __name__ == "__main__":
    unittest.main()
