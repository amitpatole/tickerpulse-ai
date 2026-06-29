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


def _dated_history(start: datetime, closes: list[float]) -> list[dict[str, str]]:
    rows = []
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
        crowding = next(s for s in monitor["signals"] if s["name"] == "dispersion_crowding")
        self.assertIn("snap correlation to 1", crowding["detail"])
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
        self.assertIn("correlation snapping back toward 1", snap["detail"])

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
        froth = next(s for s in monitor["signals"] if s["name"] == "single_stock_froth")
        self.assertIn("pctile 1y", froth["detail"])
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

    def test_regime_window_stats_are_additive_for_cor1m_and_vixeq(self) -> None:
        from backend.services.vol_structure_monitor import build_vol_structure_monitor

        start = datetime(2022, 12, 2, tzinfo=timezone.utc)
        cor_values = [*_flat(40.0, 30), *_flat(25.0, 150), *_flat(10.0, 150)]
        vixeq_values = [*_flat(20.0, 30), *_flat(30.0, 150), *_flat(40.0, 150)]
        histories = {
            "_COR1M": _dated_history(start, cor_values),
            "_VIXEQ": _dated_history(start, vixeq_values),
            "_VIX": _dated_history(start, _flat(18.0, 330)),
        }

        monitor = build_vol_structure_monitor(fetch=_fake_fetch(histories), now=_END)

        cor = monitor["indices"]["COR1M"]
        self.assertEqual(cor["full_start"], "2022-12-02")
        self.assertEqual(cor["full_max"], 40.0)
        self.assertEqual(cor["full_max_date"], "2022-12-02")
        self.assertEqual(cor["pctile_2023"], 50.0)
        self.assertEqual(cor["median_2023"], 17.5)
        self.assertEqual(cor["median_1y"], 10.0)
        self.assertEqual(cor["mean_2023"], 17.5)

        vixeq = monitor["indices"]["VIXEQ"]
        self.assertEqual(vixeq["full_max"], 40.0)
        self.assertEqual(vixeq["full_max_date"], "2023-05-31")
        self.assertEqual(vixeq["pctile_2023"], 100.0)
        self.assertEqual(vixeq["median_2023"], 35.0)
        self.assertEqual(vixeq["median_1y"], 40.0)

        drift = monitor["derived"]["regime_drift"]
        self.assertEqual(drift["COR1M"]["drift_pts"], -7.5)
        self.assertEqual(drift["COR1M"]["direction"], "down")
        self.assertEqual(drift["COR1M"]["signal"], "strong")
        self.assertEqual(drift["VIXEQ"]["drift_pts"], 5.0)
        self.assertEqual(drift["VIXEQ"]["direction"], "up")
        self.assertEqual(drift["VIXEQ"]["signal"], "strong")

        vix = monitor["indices"]["VIX"]
        for field in (
            "full_start",
            "full_max",
            "full_max_date",
            "full_mean",
            "full_median",
            "mean_1y",
            "median_1y",
            "regime_anchor_date",
            "pctile_2023",
            "mean_2023",
            "median_2023",
        ):
            self.assertNotIn(field, vix)

    def test_drift_signal_uses_percent_override_for_strong_baseline_shift(self) -> None:
        from backend.services.vol_structure_monitor import _drift_signal

        self.assertEqual(_drift_signal(3.0, 21.0, 100.0), "strong")
        self.assertEqual(_drift_signal(3.0, 11.0, 100.0), "mild")
        self.assertEqual(_drift_signal(1.9, 25.0, 100.0), "flat")

    def test_cor1m_snap_overrides_low_level_in_style_state(self) -> None:
        from backend.services.vol_structure_monitor import build_vol_structure_monitor

        histories = {
            "_COR1M": _history([*_flat(20.0, 296), 8.0, 8.1, 8.0, 8.0, 8.08, 11.9], _END),
            "_VIXEQ": _history(_flat(35.0, 302), _END),
            "_VIX": _history(_flat(18.0, 302), _END),
        }

        monitor = build_vol_structure_monitor(fetch=_fake_fetch(histories), now=_END)

        state = monitor["derived"]["regime_state"]
        self.assertEqual(state["label"], "macro/beta")
        self.assertIn("correlation snap", state["detail"])


if __name__ == "__main__":
    unittest.main()
