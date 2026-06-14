from __future__ import annotations

import numpy as np

from backend.services.breadth_monitor import build_breadth_monitor


def _series() -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    up = np.array([100.0 * (1.004 ** i) for i in range(300)])  # index confirmed_up
    spy = np.array([100.0] * 300)
    rsp_narrowing = np.array([100.0 * (0.999 ** i) for i in range(300)])  # RSP lags -> narrowing
    rsp_broad = np.array([100.0 * (1.001 ** i) for i in range(300)])  # RSP leads -> broad
    return up, spy, rsp_narrowing, rsp_broad


def test_divergence_fires_alert_when_index_up_but_breadth_narrowing() -> None:
    up, spy, rsp_narrowing, _ = _series()
    series = {"^GSPC": up, "RSP": rsp_narrowing, "SPY": spy}
    result = build_breadth_monitor(fetch=lambda t: series[t])

    assert result["status"] == "ok"
    assert result["index_phase"] == "confirmed_up"
    assert result["breadth_phase"] == "narrowing"
    assert result["divergence"] is True
    assert any(
        s["key"] == "breadth_divergence" and s["level"] == "alert"
        for s in result["signals"]
    )


def test_no_alert_when_breadth_broad() -> None:
    up, spy, _, rsp_broad = _series()
    series = {"^GSPC": up, "RSP": rsp_broad, "SPY": spy}
    result = build_breadth_monitor(fetch=lambda t: series[t])

    assert result["status"] == "ok"
    assert result["breadth_phase"] == "broad"
    assert result["divergence"] is False
    assert result["signals"] == []


def test_no_alert_when_index_not_confirmed_up() -> None:
    # index grinding down + breadth narrowing is NOT the divergence top-setup
    down = np.array([300.0 * (0.997 ** i) for i in range(400)])
    spy = np.array([100.0] * 400)
    rsp_narrowing = np.array([100.0 * (0.999 ** i) for i in range(400)])
    series = {"^GSPC": down, "RSP": rsp_narrowing, "SPY": spy}
    result = build_breadth_monitor(fetch=lambda t: series[t])

    assert result["divergence"] is False
    assert result["signals"] == []


def test_error_status_when_fetch_fails() -> None:
    def boom(_ticker: str) -> np.ndarray:
        raise RuntimeError("no data")

    result = build_breadth_monitor(fetch=boom)
    assert result["status"] == "error"
    assert result["signals"] == []
