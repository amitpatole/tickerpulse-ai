"""
TickerPulse AI v3.0 - Shared domain type definitions.

Centralises TypedDict shapes for DB rows and domain objects so that
callers and implementations share a single source of truth.

Convention: use Python 3.10+ native generics (``X | None``, ``list[...]``)
rather than ``typing.Optional`` / ``typing.List``.
"""

from __future__ import annotations

from typing import TypedDict


# ---------------------------------------------------------------------------
# Alert domain
# ---------------------------------------------------------------------------


class AlertRow(TypedDict):
    """Shape returned by ``alert_manager._row_to_dict`` after a ``SELECT *``
    on the ``price_alerts`` table.

    ``enabled`` is coerced to ``bool`` by ``_row_to_dict``; all timestamp
    fields are ISO-8601 strings or ``None`` when not yet set.
    """

    id: int
    ticker: str
    condition_type: str
    threshold: float
    sound_type: str
    enabled: bool
    notification_sent: int
    fired_at: str | None
    fire_count: int
    triggered_at: str | None
    created_at: str


# ---------------------------------------------------------------------------
# AI provider domain
# ---------------------------------------------------------------------------


class ActiveAIProviderRow(TypedDict):
    """Slim view returned by ``settings_manager.get_active_ai_provider``.

    Omits timestamps and ``is_active`` flag — callers only need the
    credentials and model identifier to make API calls.
    """

    id: int
    provider_name: str
    api_key: str
    model: str | None


class AIProviderRow(TypedDict):
    """Full AI provider row returned by ``settings_manager.get_all_ai_providers``.

    Includes administrative fields (``is_active``, timestamps) but *not*
    ``api_key`` — this view is safe to serialise to the frontend.
    """

    id: int
    provider_name: str
    model: str | None
    is_active: int
    created_at: str
    updated_at: str


class ConfiguredProviderRow(TypedDict):
    """Provider record used by the multi-model comparison engine.

    Returned by ``settings_manager.get_all_configured_providers``.  Includes
    ``api_key`` so the comparison engine can fan-out calls; ``is_active`` is
    intentionally omitted because comparison runs *all* providers.
    """

    provider_name: str
    api_key: str
    model: str
