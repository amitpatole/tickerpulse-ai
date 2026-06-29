# Handoff: CPO/SIC Pullback And SpaceX IPO Strategies

Date: 2026-06-09
Status: active strategy tracking, no trade execution
Owner: Ming

## Current Objective

Track and act only after confirmation on two strategy-level setups:

1. Buy CPO and SiC names on major pullbacks.
2. Play the SpaceX IPO sequence: low-float opening move, sell into blowoff, then evaluate a defined-risk bearish leg after trend confirmation or lock-up/supply catalysts.

## Source Artifacts

Primary strategy artifact:

```text
D:\Crypto Data\Analysis\20260609 - CPO SpaceX strategy\two_strategy_tracker.md
```

Supporting artifacts:

```text
D:\Crypto Data\Analysis\20260609 - CPO SpaceX strategy\pullback_snapshot.csv
D:\Crypto Data\Analysis\20260609 - CPO SpaceX strategy\spacex_proxy_snapshot.csv
D:\Crypto Data\Analysis\20260609 - CPO SpaceX strategy\spacex-s1a2.htm
D:\Crypto Data\Analysis\20260609 - CPO SpaceX strategy\spacex-s1a2-text.txt
```

Key SEC source:

```text
https://www.sec.gov/Archives/edgar/data/1181412/000162828026040364/spaceexplorationtechnologib.htm
```

## TickerPulse Tracking Changes

Dashboard watchlist:

```text
C:\Repos\tickerpulse-ai\config\dashboard_watchlist.yaml
```

Added:

- `WOLF` - Wolfspeed, SiC/turnaround special situation
- `RKLB` - Rocket Lab, possible SpaceX proxy candidate

Strategy/event notes:

```text
C:\Repos\tickerpulse-ai\config\watchlist_notes.yaml
```

Added active event cards for:

- `AAOI`: CPO/SIC pullback basket strategy
- `SIVE.ST`: Sivers CPO pullback earnings checkpoint, `2026-08-06`
- `AAOI`: Applied Optoelectronics CPO pullback earnings checkpoint, `2026-08-07`
- `LITE`: Lumentum CPO pullback earnings checkpoint, `2026-08-12`
- `SPACEX`: SpaceX IPO opening and blowoff playbook
- `SPACEX`: final prospectus and lock-up calendar rebuild
- `RKLB`: Rocket Lab SpaceX proxy instrument check

X/news-layer searches:

```text
C:\Repos\tickerpulse-ai\config\x_watchlists.yaml
```

Added:

- `cpo_sic_pullback`
- `spacex_ipo_trade`

## Strategy 1: CPO/SIC Pullback Basket

Core names:

- CPO/optical interconnect: `AAOI`, `LITE`, `SIVE.ST`
- SiC/turnaround: `WOLF`
- Confirmation/watch names: `COHR`, `CRDO`, `CIEN`, `MRVL`, `AVGO`

Current rule:

- Do not buy just because the first red day is large.
- Starter only after a major pullback stops making new lows, reclaims a broken level, or forms a higher low.
- Add only after evidence improves: earnings, design-win/customer commentary, sector confirmation, or reclaim of 20DMA/50DMA.
- Keep `WOLF` smaller and separate because it is not pure CPO.

Sizing framework:

- Starter: `0.25%-0.5%` per name or basket starter.
- Max basket size only after thesis evidence and exit rules are written.

Near-term checkpoints:

```text
2026-08-06  SIVE.ST expected earnings candidate; verify with IR
2026-08-07  AAOI expected earnings candidate; verify with IR
2026-08-12  LITE expected earnings candidate; verify with IR
```

## Strategy 2: SpaceX IPO And Proxy Rotation

Current source status:

- Latest local source is SpaceX S-1/A filed 2026-06-03.
- Final 424B4 / final prospectus still must be checked before treating lock-up dates as final.
- Expected IPO price in S-1/A: `$135`.
- Proposed ticker: `SPCX`.

Opening long thesis:

- SpaceX can squeeze because public float is small relative to total share base and the brand/retail/index demand can overwhelm valuation.
- If participating in the opening move, use tiny tracking size and a marketable limit, not an unlimited market order.
- Pre-write exit before entry: sell into vertical strength, VWAP failure, opening-range breakdown, or predetermined profit bands.

Proxy rotation thesis:

- Once SpaceX is public, capital may rotate out of public proxies such as `RKLB` into the real asset, creating a short opportunity.
- This is plausible but must be confirmed by tape.
- The core confirmation is: `SPCX` strong while `RKLB` is weak, below VWAP, failing prior highs, or breaking prior lows.

Decision matrix:

```text
SPCX strong, RKLB weak      => proxy rotation; consider RKLB put spread
SPCX strong, RKLB strong    => space sympathy mania; do not short RKLB
SPCX weak, RKLB weak        => sector risk-off; bearish setup possible, but not clean rotation
SPCX weak, RKLB strong      => RKLB idiosyncratic strength; do not proxy-short RKLB
```

Bearish instrument hierarchy:

1. `SPCX` put spread after options are listed and liquid.
2. `SPCX` puts if IV/reward is acceptable and timing is tied to failed high or supply event.
3. `RKLB` put spread if proxy rotation confirms.
4. Outright `SPCX` or `RKLB` short only after borrow, cost, recall risk, and stop are explicit.
5. Leveraged ETFs are last choice; avoid unless holdings and exposure match the actual trade.

Do not do:

- Do not naked short the first-day squeeze.
- Do not short `RKLB` merely because SpaceX valuation is high.
- Do not use leveraged ETFs as a lazy substitute for direct exposure.
- Do not act on lock-up timing before final prospectus date is verified.

## SpaceX Lock-Up Work Still Needed

After final 424B4/final prospectus posts:

1. Confirm final pricing, final share count, over-allotment status, first trading date, and ticker.
2. Recalculate dates from the final prospectus date:
   - 70 days
   - 90 days
   - 105 days
   - 120 days
   - 135 days
   - 180 days
   - 280 days
   - 340 days
   - 366 days
3. Confirm Q2 2026 earnings release date because the S-1/A describes a major release tied to the first earnings release.
4. Confirm whether the +30% trigger is met. With expected IPO price `$135`, the +30% level is `$175.50`.
5. Rebuild the `SPACEX` watchlist event dates from the final prospectus date.

## Verification Already Run

Commands passed:

```powershell
venv\Scripts\python.exe -m backend.scripts.sync_dashboard_watchlist
```

Result:

```text
upserted: 51
```

Focused tests passed:

```powershell
venv\Scripts\python.exe -m unittest tests.test_dashboard_watchlist_config tests.test_market_sweep_service.MarketSweepServiceTest.test_watchlist_notes_loader_builds_due_event_insights tests.test_market_sweep_service.MarketSweepServiceTest.test_market_sweep_includes_watchlist_events tests.test_daily_idea_sweep.DailyIdeaSweepTest.test_watchlist_events_are_added_to_idea_feed tests.test_news_layer_review
```

Result:

```text
11 tests OK
```

Config checks:

```text
dashboard_watchlist.yaml ok; 51 items
watchlist_notes.yaml ok; 15 events
x_watchlists.yaml ok; 8 searches
```

## Known Caveat

The dashboard watchlist has 51 items while `MarketSweepService._dedupe_tickers()` caps default quote scanning at 50. `WOLF` and `RKLB` were inserted before the tail, so they are included, but one tail symbol may be skipped by default quote sweeps until the cap is raised or the list is prioritized.

## Next Agent Checklist

1. Check SEC for final `SPCX` 424B4 before any SpaceX lock-up calendar answer.
2. On IPO day, classify tape first:
   - `SPCX` trend
   - `RKLB` relative behavior
   - space ETF behavior
   - options/borrow availability
3. Do not recommend shorting `RKLB` unless proxy rotation confirms.
4. For CPO/SIC, do not recommend buying until pullback absorption confirms.
5. Keep all ad hoc outputs under:

```text
D:\Crypto Data\Analysis\20260609 - CPO SpaceX strategy
```
