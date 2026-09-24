# TickerPulse News Layer Process

## Unconfirmed Signals

Unconfirmed does not mean ignored.

The daily news layer must surface material unconfirmed items when the market
impact can be large. Official confirmation changes confidence and report
labeling; it is not required for inclusion in the fast-tape section.

Use these buckets:

+----------------------+---------------------------------------------------------+
| Bucket               | Meaning                                                 |
+----------------------+---------------------------------------------------------+
| Confirmed official   | Company, government, regulator, exchange, or filing     |
| Confirmed by wire    | Major wire/top-tier media cites source or official stmt |
| X fast tape          | High-signal account/search item, not yet confirmed      |
| China/local tape     | Chinese-language source, forum, or A-share rumor        |
| Unconfirmed watch    | Material but not source-confirmed; keep visible         |
| Dropped noise        | Spam, promo, old duplicate, or non-material             |
+----------------------+---------------------------------------------------------+

For every material unconfirmed item, include:

- why it matters
- affected watchlist names
- earliest source found
- confidence label
- next verification step

Do not promote an item to `Confirmed official` unless a primary company,
government, regulator, exchange, or filing source exists.

## Top-Level Intake Surfaces

The standalone news-layer review should keep the major intake surfaces visible
at the top level:

- TickerPulse watchlist catalyst events, using a 180-day lookahead window
- X account tape from configured high-signal accounts
- X search tape from configured thematic/search lanes
- standing monitors such as Bernstein AI/semi research

## Morning Briefing Contract

The daily briefing is not allowed to lead with generic topic counts when
configured X follows are available. Use this order:

1. `Ranked Twitter Following`: the most interesting posts from configured
   followed accounts, ranked by freshness, source reliability, signal score,
   and recency. Each item must include the handle, lane, reason it matters,
   affected tickers when detected, and an action with an explicit `because`
   clause.
2. `Top News And Tickers`: the top search/news items and top detected tickers.
   This section is separate from followed-account ranking so generic search
   output cannot bury trusted-account insight.
3. Bernstein monitor, watchlist catalyst events, raw fast tape, and source
   health.

Action lines should be decision-useful. Avoid vague wording such as "watch" or
"research" without explaining the causal reason. Prefer:

- verify primary company/channel source before sizing because the item is
  thesis-relevant X tape but not final confirmation
- check quote/filing/transcript follow-up because the post names a concrete
  ticker and configured watchlist keyword
- treat as risk-appetite monitor because liquidity stress needs price or flow
  confirmation before it affects equity positioning

Style requirement: write ranked items in concise financial-journalism prose,
closer to Barron's than an internal scanner log. Do not use cryptic shorthand
such as "SemiAnalysis influence" or "AI infra signal" without explaining the
market point. Each ranked item should have:

- `What happened`: one plain-English sentence that says the actual claim/news
- `Expectation delta`: whether the item is faster/slower, earlier/later,
  better/worse, bigger/smaller, cleaner/messier, or more/less certain than the
  market expected
- `Impact`: the stock/sector implication and why it matters
- `What to do`: the next research/trading step with a causal `because` clause

The expectation delta is the point of the briefing. For example, "pushed to
2028" means "slower/later than the 2027 ramp investors were pricing"; it is not
enough to say "timing changed." Always write the impact on exposed tickers or
baskets.

## Story Cards And Executive Summary

The executive summary is built from clustered story cards, not post counts.
`backend/services/news_story_cards.py` sits between raw posts and the Markdown
report:

- Related posts and search hits are clustered into one story by ordered theme
  (CPO/800VDC first, generic Bernstein last so a Bernstein CPO echo joins the
  CPO story), with a first-cashtag fallback. Search hits with no theme and no
  cashtag do not form stories on their own.
- Each story card carries: claim (`What happened`), `Expectation delta`,
  `Impact`, `Affected tickers` (detected cashtags, else a theme basket labeled
  `(theme basket)`), `Confidence`, graded `Sources`, and a causal `Next check`.
- Source grade ladder: followed account citing primary/official source >
  followed account citing named research/wire > followed account original post
  > search echo citing primary/official > search echo citing research/wire >
  generic search echo > uncited search echo (downgraded) > promotional
  (dropped from the story layer; still visible in raw tape).
- Confidence ladder: cites primary/official source > corroborated by two or
  more followed accounts > single followed-account claim > search echoes only.
- Only fresh posts (within 7 days, 48-hour bucket preferred) form stories.
- Raw `Fast X Tape` and `X Search Tape` sections stay in the report below the
  story summary; post counts moved to `Source Health`.

The Bernstein monitor lead list (`top_public_echoes`) only contains fresh,
AI/semi-relevant echoes, each labeled `public summary of Bernstein` or
`unconfirmed echo`; stale or off-topic echoes are suppressed from the lead and
reported as a suppressed count. The total echo count is unchanged and the raw
posts remain in the raw JSON artifact.

## Source Reliability Scores

Source reliability is part of the followed-account ranking contract. The
initial day-zero scores start on 2026-06-10 and are seeded from the CRDO
follow-list study, not from long-run measured hit rates yet. Preserve
`reliability_started_at` and `reliability_basis` in configured X accounts so
future reviews can distinguish seeded priors from accumulated evidence.

Watchlist catalyst events are not X/news claims. They are dated TickerPulse
reminders sourced from `config/watchlist_notes.yaml`, such as CBRS lock-up
tranche checks. Treat them as research-calendar prompts and verify price action,
filings, source quality, and current market data before acting.

## Bernstein AI/Semi Monitor

Bernstein is a standing news-layer monitor lane because its AI data-center,
semiconductor, CPO, 800VDC, HBM, and Rubin work can lead market discussion.

Daily handling:

- do not scrape the paywalled Bernstein Research webpage/portal in the default
  `/news` run
- scrape the TickerPulse X search query `bernstein_ai_semis`
- check public echoes from high-signal accounts and China/local sources
- label output as `primary Bernstein report`, `public summary of Bernstein`, or
  `unconfirmed echo`
- never imply the primary report was read unless it was obtained separately
  through entitled Bernstein/SG Markets/Bloomberg/FactSet/AlphaSense access
- cross-check affected watchlist names before promoting to the executive summary

## Callable Review Command

Run the standalone news-layer review from TickerPulse:

```powershell
cd C:\Repos\tickerpulse-ai
venv\Scripts\python.exe -m backend.scripts.run_news_layer_review
```

Optional bounded run for smoke testing:

```powershell
venv\Scripts\python.exe -m backend.scripts.run_news_layer_review --posts-per-account 1 --posts-per-query 1
```

The command writes:

- `tickerpulse_news_layer_raw.json`
- `tickerpulse_news_layer_summary.json`
- `daily_news_layer_report.md`

Default output directory:

```text
D:\Crypto Data\Analysis\YYYYMMDD - TickerPulse news layer daily
```

Use `--output-dir "<path>"` to override the artifact directory. Use `--json`
when another tool needs machine-readable metadata instead of printed Markdown.

If the report returns `source_status=error` with
`No account available for queue UserTweets`, the TickerPulse function is
working but the local `twscrape` account pool needs an available X session for
account timelines. X searches may still run and should be labeled separately.
