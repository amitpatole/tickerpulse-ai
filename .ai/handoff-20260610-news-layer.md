# Handoff: Standalone TickerPulse News Layer

Date: 2026-06-10
Status: ready for daily on-demand use

## Objective

Ming wants a standalone `/news` function that produces a consumable daily
market-news executive summary before any trade sizing, SEPA validation, or
downstream `inv-workflow` ranking.

The news layer should prioritize speed and source separation:

- X/Twitter is the first-alert layer.
- Official/company/government releases are the verification layer.
- Watchlist catalyst events are research-calendar prompts.
- Bernstein remains a public-echo/X search monitor, not a paywalled webpage
  scrape.

## How To Run

Preferred global wrapper:

```powershell
news
```

Bounded smoke:

```powershell
news --posts-per-account 1 --posts-per-query 1
```

Direct repo command:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m backend.scripts.run_news_layer_review
```

Default artifacts:

```text
D:\Crypto Data\Analysis\YYYYMMDD - TickerPulse news layer daily
```

Expected files:

```text
tickerpulse_news_layer_raw.json
tickerpulse_news_layer_summary.json
daily_news_layer_report.md
```

## Current Contract

Core callable:

```text
C:\Repos\tickerpulse-ai\backend\services\news_layer_review.py
```

CLI:

```text
C:\Repos\tickerpulse-ai\backend\scripts\run_news_layer_review.py
```

Process note:

```text
C:\Repos\tickerpulse-ai\.ai\news-layer-process.md
```

Global skill wrapper:

```text
C:\Users\MingC\.agents\skills\news\SKILL.md
```

The callable:

- scrapes all configured X accounts
- scrapes all configured X searches
- includes TickerPulse watchlist catalyst events with a 180-day lookahead
- builds a Bernstein public-echo monitor from X/search output
- writes raw JSON, summary JSON, and Markdown
- returns `report_markdown` so the executive summary can be printed inline

## Source Rules

Unconfirmed does not mean ignored. Material X/China/local tape stays visible as
`X fast tape`, `China/local tape`, or `Unconfirmed watch` with source, watchlist
impact, confidence, and next verification step.

Do not label something `Confirmed official` unless it comes from a company,
government, regulator, exchange, filing, or other primary issuer source.

## Bernstein Rules

Bernstein is still a standing market-leading monitor lane because its AI data
center, semiconductor, CPO, 800VDC, HBM, and Rubin research can move the tape.

Default `/news` behavior:

- keep the `bernstein_ai_semis` X/search lane
- check public echoes from high-signal accounts and China/local sources
- do not scrape or display the paywalled Bernstein Research webpage/portal
- do not display the public Bernstein insights webpage as a sell-side report
  source
- label output as `primary Bernstein report`, `public summary of Bernstein`, or
  `unconfirmed echo`
- use `primary Bernstein report` only when the report is separately obtained
  through entitled Bernstein/SG Markets/Bloomberg/FactSet/AlphaSense access

## X Sources

Important current account/search requirements:

- `config/x_watchlists.yaml` must include `qinbafrank`.
- `config/x_watchlists.yaml` must include the `bernstein_ai_semis` search.
- Herman Jin (`ShanghaoJin`) remains important for early private-flow hints,
  including replies and quote tweets.

For the CPO/800V source-trace example:

- CPO timing skepticism was catchable before SemiAnalysis through Bernstein
  public echoes and qinbafrank/Herman.
- 800VDC pushout was not found as a clean public pre-SemiAnalysis source; the
  public trace started on X after the SemiAnalysis note circulated.
- X was the fastest monitorable public layer.

Source-trace artifacts:

```text
D:\Crypto Data\Analysis\20260609 - CPO 800V source trace
```

## Watchlist Integration

Standalone `/news` now includes watchlist catalyst events from:

```text
C:\Repos\tickerpulse-ai\config\watchlist_notes.yaml
```

Current important event themes include:

- CBRS staged lock-up supply absorption checks
- CPO/SIC pullback basket reminders
- SpaceX IPO/opening/supply-unwind playbook reminders
- RKLB as a conditional SpaceX proxy instrument check

Treat watchlist events as prompts, not confirmed news.

## Last Verification

Focused tests:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m unittest tests.test_news_layer_review
```

Result: passed, 5 tests.

Backend compile:

```powershell
venv\Scripts\python.exe -m compileall -q backend
```

Result: passed.

Playbook validation:

```powershell
cd C:\Repos\investment-agent-playbook
python scripts\validate_repo.py
```

Result: passed.

Global skill validation:

```powershell
python C:\Users\MingC\.agents\skills\.system\skill-creator\scripts\quick_validate.py C:\Users\MingC\.agents\skills\news
```

Result: passed.

Bounded smoke:

```powershell
news --output-dir "D:\Crypto Data\Analysis\20260609 - TickerPulse news layer no Bernstein webpage smoke" --posts-per-account 1 --posts-per-query 1
```

Result: passed, `source_status=ok`.

Invariant grep on smoke artifacts found no:

```text
official_web_checks
bernsteinresearch.com
bernstein.com/our-insights
Official portal
Public insights page
```

## Current Caveats

- Search quality still needs hardening. The latest bounded smoke surfaced a
  low-quality Bernstein/AI crypto echo. Fix this with spam/dedupe/source scoring,
  not by reintroducing the Bernstein webpage check.
- Some account timelines may return stale pinned posts. The next hardening pass
  should demote stale/pinned account posts in executive summaries.
- If `twscrape` reports no account/session for account timelines, report the
  source status clearly. X searches may still complete.

## Next Useful Work

1. Add spam and stale-pinned-post filtering before executive summary promotion.
2. Add source tiers for X accounts/searches so `qinbafrank`, `ShanghaoJin`,
   `AStockLink`, `QQ_Timmy`, `nft_hu`, and similar relay accounts rank above
   generic keyword hits.
3. Add a calls-only extraction section for market-moving reports:
   `call`, `earliest public source`, `watchlist impact`, `verification step`.
4. Keep `/news` separate from `C:\Repos\inv-workflow` unless Ming asks for idea
   ranking, SEPA validation, sizing, staged reports, or decision cards.

## Do Not Do

- Do not scrape the paywalled Bernstein webpage/portal in the default `/news`
  run.
- Do not call a public echo a primary Bernstein report.
- Do not drop unconfirmed but material X/China/local tape only because it is
  not official.
- Do not route to downstream `inv-workflow` for sizing or ranking unless Ming
  explicitly asks after the news review.
- Do not push TickerPulse work until Ming confirms the intended private/user
  remote.
