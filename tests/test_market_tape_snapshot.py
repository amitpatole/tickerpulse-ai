import unittest
from datetime import datetime, timezone


def _closes(*values, start_day=1):
    return [
        (f"2026-06-{start_day + i:02d}", float(value))
        for i, value in enumerate(values)
    ]


class MarketTapeSnapshotTest(unittest.TestCase):
    def test_rows_compute_1d_and_5d_changes(self):
        from backend.services.market_tape_snapshot import TAPE_SYMBOLS, build_market_tape_snapshot

        data = {symbol: _closes(100, 101, 102, 103, 104, 110) for symbol, _ in TAPE_SYMBOLS}
        payload = build_market_tape_snapshot(
            fetch_closes=lambda symbols: data,
            now=datetime(2026, 6, 12, tzinfo=timezone.utc),
        )

        self.assertEqual(payload["source_status"], "ok")
        self.assertEqual(len(payload["rows"]), len(TAPE_SYMBOLS))
        row = payload["rows"][0]
        self.assertEqual(row["last"], 110.0)
        self.assertAlmostEqual(row["chg_1d_pct"], (110 / 104 - 1) * 100, places=2)
        self.assertAlmostEqual(row["chg_5d_pct"], (110 / 100 - 1) * 100, places=2)
        self.assertEqual(row["as_of"], "2026-06-06")

    def test_partial_failure_degraded_with_row_errors(self):
        from backend.services.market_tape_snapshot import TAPE_SYMBOLS, build_market_tape_snapshot

        data = {symbol: _closes(100, 101, 102, 103, 104, 110) for symbol, _ in TAPE_SYMBOLS}
        first_symbol = TAPE_SYMBOLS[0][0]
        data[first_symbol] = _closes(100)  # insufficient history

        payload = build_market_tape_snapshot(fetch_closes=lambda symbols: data)

        self.assertEqual(payload["source_status"], "degraded")
        self.assertEqual(len(payload["rows"]), len(TAPE_SYMBOLS) - 1)
        self.assertTrue(any(first_symbol in str(err) for err in payload["errors"]))

    def test_total_failure_is_error_with_no_rows(self):
        from backend.services.market_tape_snapshot import build_market_tape_snapshot

        def explode(symbols):
            raise RuntimeError("network down")

        payload = build_market_tape_snapshot(fetch_closes=explode)
        self.assertEqual(payload["source_status"], "error")
        self.assertEqual(payload["rows"], [])
        self.assertTrue(payload["errors"])


if __name__ == "__main__":
    unittest.main()
