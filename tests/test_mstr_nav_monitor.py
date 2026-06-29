import math
import unittest


class MstrNavMonitorTest(unittest.TestCase):
    def test_parse_number_accepts_usd_percent_and_parentheses(self) -> None:
        from backend.services.mstr_nav_monitor import parse_number

        self.assertEqual(parse_number("USD$1,234.50%"), 1234.5)
        self.assertEqual(parse_number("(1,234.50)"), -1234.5)

    def test_snapshot_uses_common_nav_not_gross_btc_discount_for_signal(self) -> None:
        from backend.services.mstr_nav_monitor import calculate_mstr_nav

        mstr = {
            "ufPrice": 85.33,
            "timeStampUtc": "2026-06-25T20:00:00",
            "marketCap": "30,624",
            "entVal": "51,445",
            "debt": "6,754",
            "pref": "15,467",
        }
        btc = {
            "latestPrice": 59_469,
            "timestamp": "2026-06-25T21:10:00",
            "btcHoldings": "847,363",
            "priceVarPerc": "-2.16",
        }

        result = calculate_mstr_nav(mstr, btc, btc_stable=True)

        self.assertEqual(result["source_status"], "ok")
        self.assertEqual(result["signal"], "NO_DISCOUNT_PREMIUM")
        self.assertTrue(math.isclose(float(result["common_nav_m"]), 29_570.83, abs_tol=0.01))
        self.assertLess(float(result["common_discount_pct"]), 0)
        self.assertGreater(float(result["gross_btc_discount_pct"]), 30)
        self.assertTrue(math.isclose(float(result["common_breakeven_btc"]), 24_571.52, abs_tol=0.01))

    def test_live_payload_builder_accepts_strategy_array_and_btc_object(self) -> None:
        from backend.services.mstr_nav_monitor import build_mstr_nav_monitor

        def fetch_json(url: str) -> object:
            if url.endswith("/mstrKpiData"):
                return [
                    {
                        "ufPrice": 85.33,
                        "timeStampUtc": "2026-06-25T20:00:00",
                        "marketCap": "30,624",
                        "entVal": "51,445",
                        "debt": "6,754",
                        "pref": "15,467",
                    }
                ]
            return {
                "timestamp": "2026-06-25T21:10:00",
                "results": {
                    "latestPrice": 59_469,
                    "btcHoldings": "847,363",
                    "priceVarPerc": "-2.16",
                },
            }

        result = build_mstr_nav_monitor(fetch_json=fetch_json)

        self.assertEqual(result["source_status"], "ok")
        self.assertEqual(result["btc_timestamp"], "2026-06-25T21:10:00")
        self.assertEqual(result["mstr_timestamp_utc"], "2026-06-25T20:00:00")


if __name__ == "__main__":
    unittest.main()
