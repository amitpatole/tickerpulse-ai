# Pre-Mortem Report

**Scope:** `backend/config.py`, `backend/core/ai_providers.py`, settings API/provider routing, native agent AI calls
**Date:** 2026-06-04

## Summary

The main fragility is split provider wiring: Settings/chat use `AIProviderFactory`, while native scheduled agents directly read `Config.ANTHROPIC_API_KEY` and instantiate Anthropic. A provider patch that only changes one side would appear successful in the UI while scheduled monitoring remains on fallback summaries.

## Post-Mortems

### 1. DeepSeek Works In Settings But Scheduled Agents Stay Non-AI

**Severity:** High
**Component:** `backend/api/settings.py`, `backend/agents/scanner_agent.py`, `backend/agents/researcher_agent.py`, `backend/agents/regime_agent.py`, `backend/agents/investigator_agent.py`
**Fragility type:** Stringly-typed contracts / semantic coupling

#### What happened

The Settings page showed DeepSeek as configured and testable, but the technical monitor and regime jobs kept producing non-AI fallback summaries. Users assumed monitoring was using DeepSeek, while scheduled jobs silently skipped AI generation.

#### The change that caused it

A developer added `deepseek` to `AIProviderFactory` and the Settings API, then stopped there because provider tests passed.

#### Why it broke

Native agents do not ask the Settings provider registry for the active provider. They directly read `Config.ANTHROPIC_API_KEY` and create `"anthropic"` providers, so new provider IDs are invisible to scheduled jobs.

#### How it was caught

Only manual inspection of scheduled job output caught it. A provider factory test alone would not cover the scheduled monitoring path.

#### Hardening suggestions

Add a shared helper that resolves the configured AI provider for native agents. Test at least one native agent summary path with a non-Anthropic provider.

### 2. `.env` Key Added But Backend Still Sees No API Key

**Severity:** High
**Component:** `backend/config.py`
**Fragility type:** Load-bearing defaults

#### What happened

The user put `DEEPSEEK_API_KEY` in `.env`, restarted the app, and AI features still reported no provider key. The backend process only read inherited environment variables.

#### The change that caused it

A developer documented `.env` settings for DeepSeek without adding `.env` loading to the Python backend.

#### Why it broke

`Config` reads `os.getenv(...)` at import time. There is no `load_dotenv` call in the backend, so `.env` is not a source of truth for Python unless another launcher exports it.

#### How it was caught

Backend provider tests failed when process env was cleared and only `.env` was present.

#### Hardening suggestions

Load `.env` before defining config values and add a dependency/test for env-file loading.

## Themes and Recommendations

Provider selection should be centralized. The app currently has several provider paths: Settings, chat, CrewAI, and native agents. This patch should introduce a small shared resolver for native agents and tests that exercise both provider factory creation and native agent use.
