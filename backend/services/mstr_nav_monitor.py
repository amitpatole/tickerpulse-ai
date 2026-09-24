"""MSTR common-equity NAV discount monitor for the daily news layer."""

from __future__ import annotations

import json
import math
import urllib.request
from collections.abc import Callable, Mapping


MSTR_KPI_URL = "https://api.strategy.com/btc/mstrKpiData"
BTC_KPI_URL = "https://api.strategy.com/btc/bitcoinKpis"


JsonPayload = Mapping[str, object] | list[object]


def parse_number(value: object) -> float:
    if isinstance(value, bool):
        raise ValueError("boolean is not a numeric input")
    if isinstance(value, int | float):
        return float(value)
    if not isinstance(value, str):
        raise ValueError(f"unsupported numeric input: {value!r}")

    text = value.strip().replace(",", "").replace("$", "").replace("%", "")
    text = text.removeprefix("USD").removeprefix("US").strip()
    if text.startswith("(") and text.endswith(")"):
        text = f"-{text[1:-1]}"
    if not text:
        raise ValueError("empty numeric input")
    return float(text)


def calculate_mstr_nav(
    mstr: Mapping[str, object],
    btc: Mapping[str, object],
    *,
    btc_stable: bool = False,
    starter_discount_pct: float = 10.0,
    strong_discount_pct: float = 15.0,
) -> dict[str, object]:
    market_cap_m = parse_number(mstr["marketCap"])
    enterprise_value_m = parse_number(mstr["entVal"])
    debt_m = parse_number(mstr["debt"])
    pref_m = parse_number(mstr["pref"])
    stock_price = parse_number(mstr.get("ufPrice", mstr.get("price", 0)))
    holdings_btc = parse_number(btc["btcHoldings"])
    btc_price = parse_number(btc["latestPrice"])

    btc_nav_m = holdings_btc * btc_price / 1_000_000.0
    usd_reserve_m = market_cap_m + debt_m + pref_m - enterprise_value_m
    common_nav_m = btc_nav_m + usd_reserve_m - debt_m - pref_m
    basic_shares_m = market_cap_m / stock_price if stock_price > 0 else math.nan
    common_nav_per_share = common_nav_m / basic_shares_m if basic_shares_m > 0 else math.nan
    common_discount_pct = (
        (common_nav_m - market_cap_m) / common_nav_m * 100.0 if common_nav_m > 0 else math.nan
    )
    gross_btc_discount_pct = (btc_nav_m - market_cap_m) / btc_nav_m * 100.0
    common_breakeven_btc = (debt_m + pref_m - usd_reserve_m) * 1_000_000.0 / holdings_btc

    return {
        "source_status": "ok",
        "signal": _classify_signal(
            common_nav_m,
            common_discount_pct,
            btc_stable,
            starter_discount_pct,
            strong_discount_pct,
        ),
        "btc_stable": btc_stable,
        "btc_price": round(btc_price, 2),
        "btc_1d_change_pct": _optional_number(btc.get("priceVarPerc")),
        "btc_holdings": round(holdings_btc),
        "btc_nav_m": round(btc_nav_m, 3),
        "usd_reserve_m": round(usd_reserve_m, 3),
        "debt_m": round(debt_m, 3),
        "pref_m": round(pref_m, 3),
        "common_nav_m": round(common_nav_m, 3),
        "market_cap_m": round(market_cap_m, 3),
        "common_nav_per_basic_share": round(common_nav_per_share, 3),
        "common_discount_pct": round(common_discount_pct, 3),
        "gross_btc_discount_pct": round(gross_btc_discount_pct, 3),
        "common_breakeven_btc": round(common_breakeven_btc, 2),
        "mstr_timestamp_utc": mstr.get("timeStampUtc"),
        "btc_timestamp": btc.get("timestamp"),
        "errors": [],
    }


def build_mstr_nav_monitor(
    *,
    fetch_json: Callable[[str], object] | None = None,
    btc_stable: bool = False,
) -> dict[str, object]:
    loader = fetch_json or _fetch_json
    mstr_payload = loader(MSTR_KPI_URL)
    btc_payload = loader(BTC_KPI_URL)
    mstr = _extract_mstr_row(mstr_payload)
    btc = _extract_btc_results(btc_payload)
    return calculate_mstr_nav(mstr, btc, btc_stable=btc_stable)


def _classify_signal(
    common_nav_m: float,
    common_discount_pct: float,
    btc_stable: bool,
    starter_discount_pct: float,
    strong_discount_pct: float,
) -> str:
    if common_nav_m <= 0:
        return "COMMON_NAV_NEGATIVE"
    if common_discount_pct < 0:
        return "NO_DISCOUNT_PREMIUM"
    if common_discount_pct < starter_discount_pct:
        return "WATCH_SMALL_DISCOUNT"
    if not btc_stable:
        return "WATCH_DISCOUNT_WAIT_BTC_STABILITY"
    if common_discount_pct >= strong_discount_pct:
        return "STRONG_DISCOUNT_CANDIDATE"
    return "STARTER_DISCOUNT_CANDIDATE"


def _optional_number(value: object) -> float | None:
    try:
        return round(parse_number(value), 3)
    except ValueError:
        return None


def _fetch_json(url: str) -> JsonPayload:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "tickerpulse-mstr-nav/1.0", "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict | list):
        raise ValueError(f"expected object or list payload from {url}")
    return payload


def _extract_mstr_row(payload: object) -> Mapping[str, object]:
    rows: object
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, Mapping):
        rows = payload.get("value")
    else:
        raise ValueError("Strategy MSTR API returned an unexpected payload")
    if not isinstance(rows, list) or not rows:
        raise ValueError("Strategy MSTR API returned no rows")
    first_row = rows[0]
    if not isinstance(first_row, Mapping):
        raise ValueError("Strategy MSTR API first row is not an object")
    return first_row


def _extract_btc_results(payload: object) -> Mapping[str, object]:
    if not isinstance(payload, Mapping):
        raise ValueError("Strategy BTC API returned an unexpected payload")
    results = payload.get("results")
    if not isinstance(results, Mapping):
        raise ValueError("Strategy BTC API returned no results object")
    merged = dict(results)
    merged["timestamp"] = payload.get("timestamp")
    return merged
