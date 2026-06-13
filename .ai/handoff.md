# Handoff: TickerPulse News Layer

Date: 2026-06-10
Status: standalone `/news` ready for on-demand use

## Current News-Layer Handoff

Use this dated handoff for the current standalone `/news` contract:

```text
C:\Repos\tickerpulse-ai\.ai\handoff-20260610-news-layer.md
```

Key current changes:

- `/news` scrapes configured X accounts/searches and watchlist catalyst events.
- Bernstein remains a public-echo/X monitor lane.
- The default `/news` run no longer scrapes or displays the paywalled Bernstein
  webpage/portal.
- The report must be printed inline for Ming, not only saved as artifacts.

## 2026-06-09 Strategy Handoff

Active investment strategy handoff:

```text
C:\Repos\tickerpulse-ai\.ai\handoff-20260609-cpo-spacex-strategies.md
```

It covers:

- Strategy 1: buy CPO/SIC names on confirmed major pullbacks.
- Strategy 2: SpaceX IPO opening/blowoff/supply-unwind playbook.
- `RKLB` as a possible proxy-rotation short only after relative trend confirmation.
- TickerPulse tracking changes in `dashboard_watchlist.yaml`, `watchlist_notes.yaml`, and `x_watchlists.yaml`.

## User Intent

Ming wants TickerPulse to be the first-pass daily equity/news/idea layer for the
investment workflow. It should surface market-moving watchlist developments,
small but useful signals, X context, AI-infra data, dated events, and a clean
idea-feed artifact. Reddit should not be part of first-pass ranking; it is a
low-volume final diligence check after an idea has already cleared other
filters.

## Repo Boundary

TickerPulse is its own repo:

```text
C:\Repos\tickerpulse-ai
```

It is separate from:

```text
C:\Repos\polymarket-intel
```

Current TickerPulse remote is still the upstream/original:

```text
https://github.com/amitpatole/tickerpulse-ai.git
```

Do not push until Ming creates or confirms the intended private/user-owned
remote.

## Current Runtime Contract

Primary API:

```text
POST http://127.0.0.1:5000/api/market-sweep
```

Default first-pass behavior:

- `include_x = true`
- `include_ai_infra = true`
- `include_reddit = false`
- scanner runs with `ai_summary = false`
- no-ticker sweeps use the active dashboard watchlist first

First-pass outputs:

- `scanner`
- `news`
- `x`
- `ai_infra_update`
- `watchlist_events`
- ranked `insights`

Reddit outputs:

- `reddit`
- `workflow.final_diligence_status`
- `final_diligence`

Reddit is deliberately excluded from `insights`, even when explicitly enabled.
It must remain discovery-only final diligence.

## Watchlist

Canonical config:

```text
C:\Repos\tickerpulse-ai\config\dashboard_watchlist.yaml
```

Runtime DB:

```text
C:\Repos\tickerpulse-ai\stock_news.db
```

Sync command:

```powershell
tp-watchlist-sync
```

Current watchlist state:

- 49 active rows after sync.
- `SPACEX` is included as `market: Private` with `source_symbol: SPACE X`.
- `GENB` is included with dated lock-up notes.
- Crypto context rows include BTC, ETH, DOGE, BNB, and HYPE.

Context notes:

```text
C:\Repos\tickerpulse-ai\config\watchlist_notes.yaml
```

Important current event:

- `GENB` lock-up review date: `2026-08-26`
- Review window: `2026-08-26` to `2026-09-15`

## AI-Infra Source

TickerPulse reads the local GPU rental report:

```text
D:\Crypto Data\Analysis\20260605 - GPU rental daily report\daily-report.md
```

Service:

```text
C:\Repos\tickerpulse-ai\backend\services\ai_infra_update.py
```

API field:

```text
ai_infra_update
```

Insight source:

```text
ai_infra_update
```

Preserve the data boundary: historical rental rows come from the report's
historical section; do not relabel them as direct Vast current-snapshot rows.

## Reddit Policy

Default:

```text
include_reddit = false
```

Final diligence only:

```powershell
$body = @{
  tickers = @("NVDA")
  include_x = $false
  include_reddit = $true
  include_ai_infra = $false
  top_n = 3
  news_max_articles = 0
  reddit_max_tickers = 1
  reddit_posts_per_ticker = 3
} | ConvertTo-Json
Invoke-RestMethod -Uri http://127.0.0.1:5000/api/market-sweep `
  -Method Post -ContentType 'application/json' -Body $body
```

Rules:

- Run Reddit only after scanner/news/X/AI-infra/events and financial checks make
  a candidate worth pursuing.
- Keep Reddit one ticker / low volume.
- Treat Reddit as discovery only, never confirmation.
- If Reddit is blocked, throttled, or degraded, continue the workflow and mark
  the gap.

Current caveat:

- Reddit public endpoints are unreliable from this machine and often return
  403/429/degraded.
- Reddit API approval is uncertain.
- The no-approval `old.reddit.com` HTML fallback parser has not been
  implemented yet.

## Idea Feed

Service:

```text
C:\Repos\tickerpulse-ai\backend\services\idea_feed.py
```

Scheduled job:

```text
C:\Repos\tickerpulse-ai\backend\jobs\daily_idea_sweep.py
```

Latest artifact:

```text
C:\Repos\tickerpulse-ai\data\idea_sweeps\latest.json
```

The idea feed consumes first-pass `insights` plus `watchlist_events`. Reddit
does not enter the first-pass idea feed through `insights`.

## Investment Workflow Integration

Canonical workflow repo:

```text
C:\Repos\investment-agent-playbook
```

Main skill:

```text
C:\Repos\investment-agent-playbook\skills\inv-workflow\SKILL.md
```

Daily playbook:

```text
C:\Repos\investment-agent-playbook\playbooks\daily-market-check.md
```

Current process:

```text
scanner/news/X/AI-infra/events -> candidate list -> financial/filing checks -> optional focused Reddit pulse
```

## Useful Commands

Start backend:

```powershell
cd C:\Repos\tickerpulse-ai
.\venv\Scripts\python.exe -m backend.app
```

Default first-pass sweep:

```powershell
$body = @{
  tickers = @("NVDA")
  include_x = $false
  include_ai_infra = $true
  top_n = 5
  news_max_articles = 0
} | ConvertTo-Json
Invoke-RestMethod -Uri http://127.0.0.1:5000/api/market-sweep `
  -Method Post -ContentType 'application/json' -Body $body
```

Run daily idea sweep manually:

```powershell
cd C:\Repos\tickerpulse-ai
.\venv\Scripts\python.exe -c "from backend.jobs.daily_idea_sweep import run_daily_idea_sweep; run_daily_idea_sweep()"
```

Verify watchlist DB:

```powershell
cd C:\Repos\tickerpulse-ai
.\venv\Scripts\python.exe -c "import sqlite3; c=sqlite3.connect('stock_news.db'); print(c.execute('select count(*) from stocks where active=1').fetchone()[0]); print(c.execute('select ticker,name,market from stocks where ticker=?', ('SPACEX',)).fetchone()); c.close()"
```

## Verification Evidence

Last verified:

- `.\venv\Scripts\python.exe -m unittest discover -s tests` passed with 34
  tests.
- `.\venv\Scripts\python.exe -m compileall backend` passed.
- `.\venv\Scripts\python.exe -m pip check` passed.
- `python scripts\validate_repo.py` passed in
  `C:\Repos\investment-agent-playbook`.
- Live default `/api/market-sweep` returned `source_status=ok`,
  `reddit.source_status=skipped`, and no final-diligence items.
- Live explicit Reddit follow-up returned `source_status=ok` while
  `reddit.source_status=degraded`; `insights` stayed first-pass only.
- `tp-watchlist-sync` reported `upserted=49`.
- DB has `SPACEX` as active private watchlist row.

## Important Files

```text
C:\Repos\tickerpulse-ai\backend\services\market_sweep.py
C:\Repos\tickerpulse-ai\backend\api\market_sweep.py
C:\Repos\tickerpulse-ai\backend\services\idea_feed.py
C:\Repos\tickerpulse-ai\backend\services\ai_infra_update.py
C:\Repos\tickerpulse-ai\backend\jobs\daily_idea_sweep.py
C:\Repos\tickerpulse-ai\config\dashboard_watchlist.yaml
C:\Repos\tickerpulse-ai\config\watchlist_notes.yaml
C:\Repos\tickerpulse-ai\.ai\pre-mortem-reddit-final-diligence.md
```

## Open Items

- Implement a low-volume `old.reddit.com` public HTML fallback only if Ming still
  wants Reddit without API approval.
- Create or confirm Ming's own TickerPulse remote before any push.
- Consider excluding `market: Private` rows like `SPACEX` from technical scanner
  calls if scanner error noise becomes annoying.
- If GPU rental report location changes, update
  `backend/services/ai_infra_update.py` and this handoff.

## Do Not Do

- Do not put Reddit back into first-pass `insights`.
- Do not make Reddit default-on.
- Do not treat Reddit degradation as a first-pass sweep failure.
- Do not pretend SpaceX is a public equity ticker.
- Do not push to the current upstream remote without confirming the target repo.
