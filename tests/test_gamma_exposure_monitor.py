import unittest
from datetime import date, datetime, timezone

_END = datetime(2026, 6, 11, tzinfo=timezone.utc)


def _symbol(root: str, expiry_yymmdd: str, cp: str, strike: float) -> str:
    return f"{root}{expiry_yymmdd}{cp}{int(round(strike * 1000)):08d}"


def _opt(
    root: str,
    expiry_yymmdd: str,
    cp: str,
    strike: float,
    *,
    iv: float = 0.2,
    oi: float = 5000.0,
) -> dict[str, object]:
    return {
        "option": _symbol(root, expiry_yymmdd, cp, strike),
        "iv": iv,
        "open_interest": oi,
        "gamma": 0.001,
        "volume": 10.0,
    }


def _fake_fetch(chains: dict[str, dict[str, object]]):
    def fetch(symbol: str) -> dict[str, object]:
        if symbol not in chains:
            raise RuntimeError(f"no chain for {symbol}")
        return chains[symbol]

    return fetch


class GammaExposureMonitorTest(unittest.TestCase):
    def test_put_dominated_spot_flags_negative_gamma_alert(self) -> None:
        from backend.services.gamma_exposure_monitor import build_gamma_exposure_monitor

        chains = {
            "_TST": {
                "current_price": 100.0,
                "options": [
                    _opt("TST", "260710", "P", 105.0, oi=5000.0),
                    _opt("TST", "260710", "C", 115.0, oi=5000.0),
                ],
            }
        }
        monitor = build_gamma_exposure_monitor(
            fetch=_fake_fetch(chains), now=_END, symbols={"TST": "_TST"}
        )

        self.assertEqual(monitor["status"], "ok")
        info = monitor["underlyings"]["TST"]
        self.assertEqual(info["regime"], "negative")
        self.assertIsNotNone(info["flip_level"])
        self.assertGreater(info["flip_level"], 100.0)
        self.assertLess(info["net_gex_usd_per_pct"], 0.0)
        names = {signal["name"]: signal["level"] for signal in monitor["signals"]}
        self.assertEqual(names.get("negative_gamma"), "alert")
        self.assertEqual(monitor["overall_level"], "alert")
        detail = next(s for s in monitor["signals"] if s["name"] == "negative_gamma")["detail"]
        self.assertIn("flip", detail.lower())
        self.assertIn("sell", detail.lower())

    def test_call_dominated_spot_is_positive_regime_with_no_signals(self) -> None:
        from backend.services.gamma_exposure_monitor import build_gamma_exposure_monitor

        chains = {
            "_TST": {
                "current_price": 100.0,
                "options": [
                    _opt("TST", "260710", "P", 85.0, oi=5000.0),
                    _opt("TST", "260710", "C", 95.0, oi=5000.0),
                ],
            }
        }
        monitor = build_gamma_exposure_monitor(
            fetch=_fake_fetch(chains), now=_END, symbols={"TST": "_TST"}
        )

        self.assertEqual(monitor["status"], "ok")
        info = monitor["underlyings"]["TST"]
        self.assertEqual(info["regime"], "positive")
        self.assertIsNotNone(info["flip_level"])
        self.assertLess(info["flip_level"], 100.0)
        self.assertGreater(info["distance_to_flip_pct"], 1.0)
        self.assertEqual(monitor["signals"], [])
        self.assertEqual(monitor["overall_level"], "normal")
        self.assertTrue(monitor["thresholds"])
        self.assertIn("method", monitor)

    def test_spot_just_above_flip_flags_proximity_watch(self) -> None:
        from backend.services.gamma_exposure_monitor import build_gamma_exposure_monitor

        chains = {
            "_TST": {
                "current_price": 100.0,
                "options": [
                    _opt("TST", "260625", "P", 99.4, iv=0.10, oi=10000.0),
                    _opt("TST", "260625", "C", 100.6, iv=0.10, oi=11500.0),
                ],
            }
        }
        monitor = build_gamma_exposure_monitor(
            fetch=_fake_fetch(chains), now=_END, symbols={"TST": "_TST"}
        )

        info = monitor["underlyings"]["TST"]
        self.assertEqual(info["regime"], "positive")
        self.assertIsNotNone(info["flip_level"])
        self.assertGreater(info["distance_to_flip_pct"], 0.0)
        self.assertLess(info["distance_to_flip_pct"], 1.0)
        names = {signal["name"]: signal["level"] for signal in monitor["signals"]}
        self.assertEqual(names.get("gamma_flip_proximity"), "watch")
        self.assertEqual(monitor["overall_level"], "watch")

    def test_all_fetch_failures_report_error_not_calm(self) -> None:
        from backend.services.gamma_exposure_monitor import build_gamma_exposure_monitor

        def fetch(symbol: str) -> dict[str, object]:
            raise RuntimeError("cboe unreachable")

        monitor = build_gamma_exposure_monitor(fetch=fetch, now=_END)

        self.assertEqual(monitor["status"], "error")
        self.assertTrue(monitor["errors"])
        self.assertEqual(monitor["signals"], [])
        self.assertEqual(monitor["overall_level"], "unknown")
        self.assertIn("fail", monitor["headline"].lower())

    def test_partial_fetch_failure_is_degraded_and_keeps_other_symbol(self) -> None:
        from backend.services.gamma_exposure_monitor import build_gamma_exposure_monitor

        chains = {
            "_TST": {
                "current_price": 100.0,
                "options": [
                    _opt("TST", "260710", "P", 105.0, oi=5000.0),
                    _opt("TST", "260710", "C", 115.0, oi=5000.0),
                ],
            }
        }
        monitor = build_gamma_exposure_monitor(
            fetch=_fake_fetch(chains),
            now=_END,
            symbols={"TST": "_TST", "OTHER": "_OTHER"},
        )

        self.assertEqual(monitor["status"], "degraded")
        self.assertTrue(any("_OTHER" in error for error in monitor["errors"]))
        self.assertIn("TST", monitor["underlyings"])
        names = {signal["name"]: signal["level"] for signal in monitor["signals"]}
        self.assertEqual(names.get("negative_gamma"), "alert")

    def test_unusable_contracts_are_skipped_not_counted(self) -> None:
        from backend.services.gamma_exposure_monitor import build_gamma_exposure_monitor

        chains = {
            "_TST": {
                "current_price": 100.0,
                "options": [
                    _opt("TST", "260710", "P", 85.0, oi=5000.0),
                    _opt("TST", "260710", "C", 95.0, oi=5000.0),
                    _opt("TST", "260710", "C", 96.0, oi=0.0),
                    _opt("TST", "250101", "C", 95.0, oi=5000.0),
                    _opt("TST", "260710", "C", 97.0, iv=0.0, oi=5000.0),
                    {"option": "GARBAGE", "iv": 0.2, "open_interest": 100.0},
                    _opt("TST", "260710", "C", 250.0, oi=5000.0),
                ],
            }
        }
        monitor = build_gamma_exposure_monitor(
            fetch=_fake_fetch(chains), now=_END, symbols={"TST": "_TST"}
        )

        info = monitor["underlyings"]["TST"]
        self.assertEqual(info["contracts_used"], 2)
        self.assertEqual(info["contracts_skipped"], 5)
        self.assertEqual(info["regime"], "positive")

    def test_call_only_chain_has_no_flip_and_no_signals(self) -> None:
        from backend.services.gamma_exposure_monitor import build_gamma_exposure_monitor

        chains = {
            "_TST": {
                "current_price": 100.0,
                "options": [_opt("TST", "260710", "C", 100.0, oi=5000.0)],
            }
        }
        monitor = build_gamma_exposure_monitor(
            fetch=_fake_fetch(chains), now=_END, symbols={"TST": "_TST"}
        )

        info = monitor["underlyings"]["TST"]
        self.assertEqual(info["regime"], "positive")
        self.assertIsNone(info["flip_level"])
        self.assertEqual(monitor["signals"], [])

    def test_option_symbol_parser(self) -> None:
        from backend.services.gamma_exposure_monitor import parse_option_symbol

        self.assertEqual(
            parse_option_symbol("SPXW260624P07295000"),
            (date(2026, 6, 24), "P", 7295.0),
        )
        self.assertEqual(
            parse_option_symbol("SMH261120C00230000"),
            (date(2026, 11, 20), "C", 230.0),
        )
        self.assertIsNone(parse_option_symbol("GARBAGE"))
        self.assertIsNone(parse_option_symbol(""))

    def test_bs_gamma_positive_and_peaked_near_atm(self) -> None:
        from backend.services.gamma_exposure_monitor import bs_gamma

        atm = bs_gamma(spot=100.0, strike=100.0, iv=0.2, t_years=0.1)
        otm = bs_gamma(spot=100.0, strike=130.0, iv=0.2, t_years=0.1)
        self.assertGreater(atm, 0.0)
        self.assertGreater(otm, 0.0)
        self.assertGreater(atm, otm)
        self.assertEqual(bs_gamma(spot=100.0, strike=100.0, iv=0.0, t_years=0.1), 0.0)
        self.assertEqual(bs_gamma(spot=100.0, strike=100.0, iv=0.2, t_years=0.0), 0.0)

    def test_default_symbols_include_spx_smh_qqq(self) -> None:
        from backend.services.gamma_exposure_monitor import _SYMBOLS

        self.assertIn("SPX", _SYMBOLS)
        self.assertIn("SMH", _SYMBOLS)
        self.assertIn("QQQ", _SYMBOLS)


class GammaFreshnessTest(unittest.TestCase):
    def test_live_during_session(self) -> None:
        from backend.services.gamma_exposure_monitor import assess_freshness

        # Fri 2026-06-12, last trade 13:45 ET; now 13:50 ET == 17:50 UTC (EDT-4)
        now = datetime(2026, 6, 12, 17, 50, tzinfo=timezone.utc)
        out = assess_freshness("2026-06-12T13:45:00", now)

        self.assertEqual(out["freshness"], "live")
        self.assertLess(out["age_minutes"], 20.0)
        self.assertTrue(out["as_of"])

    def test_prior_close_on_weekend(self) -> None:
        from backend.services.gamma_exposure_monitor import assess_freshness

        now = datetime(2026, 6, 13, 6, 38, tzinfo=timezone.utc)  # Saturday
        out = assess_freshness("2026-06-12T16:14:59", now)  # Friday close, ET

        self.assertEqual(out["freshness"], "prior_close")
        self.assertGreater(out["age_minutes"], 60.0)

    def test_stale_when_lagging_mid_session(self) -> None:
        from backend.services.gamma_exposure_monitor import assess_freshness

        # Fri now 14:30 ET (18:30 UTC); last trade 13:00 ET -> 90 min old, market open
        now = datetime(2026, 6, 12, 18, 30, tzinfo=timezone.utc)
        out = assess_freshness("2026-06-12T13:00:00", now)

        self.assertEqual(out["freshness"], "stale")

    def test_stale_when_feed_frozen_too_long(self) -> None:
        from backend.services.gamma_exposure_monitor import assess_freshness

        now = datetime(2026, 6, 12, 6, 0, tzinfo=timezone.utc)  # pre-open, closed
        out = assess_freshness("2026-06-05T16:00:00", now)  # 7 days old

        self.assertEqual(out["freshness"], "stale")

    def test_unknown_when_unparseable(self) -> None:
        from backend.services.gamma_exposure_monitor import assess_freshness

        out = assess_freshness("", _END)

        self.assertEqual(out["freshness"], "unknown")
        self.assertIsNone(out["age_minutes"])

    def test_chain_carries_freshness_and_prior_close_keeps_status_ok(self) -> None:
        from backend.services.gamma_exposure_monitor import build_gamma_exposure_monitor

        chains = {
            "_TST": {
                "current_price": 100.0,
                "last_trade_time": "2026-06-12T16:14:59",
                "options": [
                    _opt("TST", "260710", "P", 85.0, oi=5000.0),
                    _opt("TST", "260710", "C", 95.0, oi=5000.0),
                ],
            }
        }
        now = datetime(2026, 6, 13, 6, 38, tzinfo=timezone.utc)  # Saturday
        monitor = build_gamma_exposure_monitor(
            fetch=_fake_fetch(chains), now=now, symbols={"TST": "_TST"}
        )

        info = monitor["underlyings"]["TST"]
        self.assertEqual(info["freshness"], "prior_close")
        self.assertTrue(info["as_of"])
        self.assertIsNotNone(info["age_minutes"])
        # prior_close is expected when the market is shut: must NOT degrade status
        self.assertEqual(monitor["status"], "ok")
        self.assertEqual(monitor["freshness"], "prior_close")
        self.assertIn("prior close", monitor["headline"].lower())

    def test_stale_underlying_degrades_status_but_keeps_regime(self) -> None:
        from backend.services.gamma_exposure_monitor import build_gamma_exposure_monitor

        chains = {
            "_TST": {
                "current_price": 100.0,
                "last_trade_time": "2026-06-12T13:00:00",
                "options": [
                    _opt("TST", "260710", "P", 105.0, oi=5000.0),
                    _opt("TST", "260710", "C", 115.0, oi=5000.0),
                ],
            }
        }
        now = datetime(2026, 6, 12, 18, 30, tzinfo=timezone.utc)  # RTH, 90 min lag
        monitor = build_gamma_exposure_monitor(
            fetch=_fake_fetch(chains), now=now, symbols={"TST": "_TST"}
        )

        info = monitor["underlyings"]["TST"]
        self.assertEqual(info["freshness"], "stale")
        self.assertEqual(info["regime"], "negative")  # regime still computed
        self.assertEqual(monitor["status"], "degraded")
        self.assertEqual(monitor["freshness"], "stale")
        self.assertIn("stale", monitor["headline"].lower())


if __name__ == "__main__":
    unittest.main()
