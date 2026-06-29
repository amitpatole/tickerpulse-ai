# Pre-Mortem Report

**Scope:** `backend/agents/tools/technical.py`, `backend/agents/tools/reddit_scanner.py`, X watchlist ingestion, and lightweight market sweep glue.
**Date:** 2026-06-05

## Summary

The main fragility is at external-source boundaries: Yahoo-style OHLCV arrays can contain nulls or mismatched lengths, Reddit public endpoints can degrade behind 403/429 responses, and X ingestion depends on stringly typed YAML and `twscrape` subprocess output. The hardening target is to normalize and label those boundary failures in one place so later sweep/report code does not confuse missing data with a true lack of signal.

## Post-Mortems

### Null OHLCV Bars Broke Every Scanner Result

**Severity:** High
**Component:** `backend/agents/tools/technical.py`
**Fragility type:** Assumptions baked into data transformations

#### What happened

The scanner started returning zero valid tickers even though Yahoo/yfinance had recent data. Every ticker failed during stochastic or ATR calculation with a `NoneType` arithmetic error.

#### The change that caused it

A data provider upgrade began returning trailing `None` values for the most recent OHLC bar while leaving older close values valid. The existing analyzer filtered close values for RSI/MACD but passed the raw arrays to ATR/VWAP/OBV/stochastic.

#### Why it broke

`TechnicalAnalyzer._analyze` used filtered `closes` for some indicators and raw `closes_raw`, `highs_raw`, and `lows_raw` for others. Future callers reasonably assumed the tool handled provider nulls because the first half of the function already filtered close values.

#### How it was caught

The manual on-demand sweep logged scanner errors for every ticker. A focused test with a trailing null close would have caught it before deployment.

#### Hardening suggestions

Normalize OHLCV rows into aligned valid bars before calculating any indicator. Return a clear insufficient-data error if too few valid rows remain. Add a regression test with trailing nulls and mismatched high/low values.

### Reddit 403 Looked Like Zero Social Mentions

**Severity:** Medium
**Component:** `backend/agents/tools/reddit_scanner.py`
**Fragility type:** Coincidental correctness

#### What happened

The social report said no tickers were being discussed, but the real issue was Reddit returning 403 to public JSON requests. The sweep suppressed the source failure and downstream code interpreted empty posts as low crowd attention.

#### The change that caused it

Reddit tightened public endpoint access or temporarily blocked the user agent. The scanner kept returning an empty post list for non-200 responses.

#### Why it broke

`_search_subreddit` returned `[]` for any non-200 status. `_scan` had no structured way to distinguish "no posts matched" from "source unavailable."

#### How it was caught

Only console warnings revealed the 403s. API consumers and reports did not receive the degraded-source state.

#### Hardening suggestions

Track source errors in the scanner result, include a `source_status`, and let downstream agents downgrade confidence when Reddit is unavailable.

### X Watchlist Drift Silently Dropped High-Signal Accounts

**Severity:** Medium
**Component:** `config/x_watchlists.yaml`, X collector
**Fragility type:** Stringly-typed contracts

#### What happened

The sweep missed key AI supply-chain posts because a future edit renamed a watchlist key or added an account without a `handle`. The collector skipped it without surfacing a configuration issue.

#### The change that caused it

A user added a new account block by hand and used `username` instead of `handle`, which looked natural but did not match the collector's implicit contract.

#### Why it broke

YAML is human-editable but untyped. Without validation, the collector can only discover malformed accounts at runtime.

#### How it was caught

The account simply disappeared from monitoring until someone manually compared the config with collected posts.

#### Hardening suggestions

Load the watchlist through a small parser that validates required keys and returns config warnings. Include those warnings in sweep output.

### Fast X Search Consumed Rate Budget Before Core Accounts

**Severity:** Medium
**Component:** X collector
**Fragility type:** Implicit ordering dependencies

#### What happened

The monitor exhausted `twscrape` search/account availability on broad queries, then failed to fetch the core user accounts. The final report had noisy cashtag spam but missed priority sources.

#### The change that caused it

A future developer placed search-query collection before account timeline collection for code cleanliness.

#### Why it broke

Core account timelines have higher information value than broad search. The priority order is a product invariant, not just an implementation detail.

#### How it was caught

The collector logged `NoAccountError` after broad search calls. The report had lower quality but no hard failure.

#### Hardening suggestions

Collect `user_seed_core` and high-priority accounts before search queries. Make search collection optional and bounded.
