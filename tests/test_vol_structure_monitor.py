import unittest
from datetime import datetime, timedelta, timezone


def _history(closes: list[float], end: datetime) -> list[dict[str, str]]:
    rows = []
    start = end - timedelta(days=len(closes) - 1)
    for index, close in enumerate(closes):
        day = start + timedelta(days=index)
        rows.append(
            {
                "date": day.strftime("%Y-%m-%d"),
                "open": f"{close:.6f}",
                "high": f"{close:.6f}",
                "low": f"{close:.6f}",
                "close": f"{close:.6f}",
                "volume": "0.0",
            }
        )
    return rows


def _flat(value: float, count: int) -> list[float]:
    return [value] * count


_END = datetime(2026, 6, 11, tzinfo=timezone.utc)


def _fake_fetch(histories: dict[str, list[dict[str, str]]], quotes: dict[str, dict[str, object]] | None = None):
    quotes = quotes or {}

    def fetch(kind: str, symbol: str) -> object:
        if kind == "history":
            if symbol not in histories:
                raise RuntimeError(f"no history for {symbol}")
            return histories[symbol]
        if kind == "quote":
            if symbol not in quotes:
                raise RuntimeError(f"no quote for {symbol}")
            return quotes[symbol]
        raise ValueError(kind)

    return fetch


class VolStructureMonitorTest(unittest.TestCase):
    def test_low_cor1m_flags_dispersion_crowding_alert(self) -> None:
        from backend.services.vol_structure_monitor import build_vol_structure_monitor

        histories = {
            "_COR1M": _history([*_flat(20.0, 300), *_flat(6.3, 5)], _END),
            "_VIXEQ": _history(_flat(25.0, 305), _END),
            "_VIX": _history(_flat(15.0, 305), _END),
        }
        monitor = build_vol_structure_monitor(fetch=_fake_fetch(histories), now=_END)

        self.assertEqual(monitor["status"], "ok")
        self.assertEqual(monitor["overall_level"], "alert")
        names = {signal["name"]: signal["level"] for signal in monitor["signals"]}
        self.assertEqual(names.get("dispersion_crowding"), "alert")
        self.assertIn("COR1M", monitor["headline"])

    def test_cor1m_spike_flags_correlation_snap_alert(self) -> None:
        from backend.services.vol_structure_monitor import build_vol_structure_monitor

        histories = {
            "_COR1M": _history([*_flat(7.0, 300), 7.0, 13.2], _END),
            "_VIXEQ": _history(_flat(30.0, 302), _END),
            "_VIX": _history(_flat(15.0, 302), _END),
        }
        monitor = build_vol_structure_monitor(fetch=_fake_fetch(histories), now=_END)

        names = {signal["name"]: signal["level"] for signal in monitor["signals"]}
        self.assertEqual(names.get("correlation_snap"), "alert")
        self.assertEqual(monitor["overall_level"], "alert")
        snap = next(s for s in monitor["signals"] if s["name"] == "correlation_snap")
        self.assertIn("pts", snap["detail"])

    def test_high_vixeq_vix_ratio_flags_single_stock_froth(self) -> None:
        from backend.services.vol_structure_monitor import build_vol_structure_monitor

        vixeq = [*_flat(24.0, 300), *_flat(48.0, 5)]
        vix = _flat(15.0, 305)
        histories = {
            "_COR1M": _history(_flat(25.0, 305), _END),
            "_VIXEQ": _history(vixeq, _END),
            "_VIX": _history(vix, _END),
        }
        monitor = build_vol_structure_monitor(fetch=_fake_fetch(histories), now=_END)

        names = {signal["name"]: signal["level"] for signal in monitor["signals"]}
        self.assertEqual(names.get("single_stock_froth"), "alert")
        self.assertGreaterEqual(monitor["derived"]["vixeq_vix_ratio"], 3.0)

    def test_normal_levels_report_normal_with_no_signals(self) -> None:
        from backend.services.vol_structure_monitor import build_vol_structure_monitor

        closes = [20.0 + (index % 7) for index in range(305)]
        histories = {
            "_COR1M": _history(closes, _END),
            "_VIXEQ": _history([c + 5.0 for c in closes], _END),
            "_VIX": _history([c - 5.0 for c in closes], _END),
        }
        monitor = build_vol_structure_monitor(fetch=_fake_fetch(histories), now=_END)

        self.assertEqual(monitor["status"], "ok")
        self.assertEqual(monitor["overall_level"], "normal")
        self.assertEqual(monitor["signals"], [])

    def test_all_fetch_failures_report_error_not_silent(self) -> None:
        from backend.services.vol_structure_monitor import build_vol_structure_monitor

        def fetch(kind: str, symbol: str) -> object:
            raise RuntimeError("cboe unreachable")

        monitor = build_vol_structure_monitor(fetch=fetch, now=_END)

        self.assertEqual(monitor["status"], "error")
        self.assertTrue(monitor["errors"])
        self.assertEqual(monitor["signals"], [])
        self.assertIn("fail", monitor["headline"].lower())

    def test_partial_fetch_failure_is_degraded_and_keeps_cor1m_signals(self) -> None:
        from backend.services.vol_structure_monitor import build_vol_structure_monitor

        histories = {
            "_COR1M": _history([*_flat(20.0, 300), *_flat(6.3, 5)], _END),
            "_VIXEQ": _history(_flat(25.0, 305), _END),
        }
        monitor = build_vol_structure_monitor(fetch=_fake_fetch(histories), now=_END)

        self.assertEqual(monitor["status"], "degraded")
        self.assertTrue(monitor["errors"])
        names = {signal["name"]: signal["level"] for signal in monitor["signals"]}
        self.assertEqual(names.get("dispersion_crowding"), "alert")
        self.assertIsNone(monitor["derived"].get("vixeq_vix_ratio"))

    def test_quote_overrides_history_close_as_live_value(self) -> None:
        from backend.services.vol_structure_monitor import build_vol_structure_monitor

        histories = {
            "_COR1M": _history(_flat(25.0, 305), _END),
            "_VIXEQ": _history(_flat(30.0, 305), _END),
            "_VIX": _history(_flat(15.0, 305), _END),
        }
        quotes = {
            "_COR1M": {"current_price": 26.4, "last_trade_time": "2026-06-11T16:15:01"},
        }
        monitor = build_vol_structure_monitor(fetch=_fake_fetch(histories, quotes), now=_END)

        cor = monitor["indices"]["COR1M"]
        self.assertEqual(cor["live"], 26.4)
        self.assertEqual(cor["close"], 25.0)

    def test_percentiles_use_trailing_year_window(self) -> None:
        from backend.services.vol_structure_monitor import build_vol_structure_monitor

        closes = [*_flat(50.0, 300), *_flat(10.0, 252)]
        histories = {
            "_COR1M": _history(_flat(25.0, 552), _END),
            "_VIXEQ": _history(closes, _END),
            "_VIX": _history(_flat(10.0, 552), _END),
        }
        monitor = build_vol_structure_monitor(fetch=_fake_fetch(histories), now=_END)

        vixeq = monitor["indices"]["VIXEQ"]
        self.assertEqual(vixeq["pctile_1y"], 100.0)
        self.assertLess(vixeq["pctile_full"], 60.0)


if __name__ == "__main__":
    unittest.main()
