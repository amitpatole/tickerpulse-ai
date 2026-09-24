"""Shared AI provider resolution for native agents."""

import logging
from typing import Optional, Tuple

from backend.agents.base import AgentConfig
from backend.config import Config
from backend.core.ai_providers import AIProvider, AIProviderFactory

logger = logging.getLogger(__name__)


def _provider_api_key(provider_name: str) -> str:
    key_by_provider = {
        "anthropic": Config.ANTHROPIC_API_KEY,
        "openai": Config.OPENAI_API_KEY,
        "google": Config.GOOGLE_AI_KEY,
        "grok": Config.XAI_API_KEY,
        "xai": Config.XAI_API_KEY,
        "deepseek": Config.DEEPSEEK_API_KEY,
        "opencode": Config.OPENCODE_API_KEY,
        "openai_compatible": Config.OPENAI_COMPATIBLE_API_KEY,
    }
    return key_by_provider.get(provider_name, "")


def _provider_model(provider_name: str, agent_config: AgentConfig) -> str:
    if provider_name == agent_config.provider:
        return agent_config.model
    if provider_name == "deepseek":
        return Config.DEEPSEEK_MODEL
    if provider_name == "opencode":
        return _opencode_model_for_agent(agent_config)
    if provider_name == "openai_compatible":
        return Config.OPENAI_COMPATIBLE_MODEL
    return Config.DEFAULT_MODELS.get(provider_name, agent_config.model)


def _opencode_model_for_agent(agent_config: AgentConfig) -> str:
    processing_names = {"researcher", "regime"}
    processing_tags = {"deep-analysis", "macro", "researcher", "regime"}
    tags = set(agent_config.tags or [])
    if agent_config.name in processing_names or tags.intersection(processing_tags):
        return Config.OPENCODE_PRO_MODEL
    return Config.OPENCODE_FLASH_MODEL


def _create_provider(provider_name: str, api_key: str, model: str) -> Optional[Tuple[AIProvider, str]]:
    provider = AIProviderFactory.create_provider(provider_name, api_key, model)
    if not provider:
        return None
    return provider, model


def _active_db_provider() -> Optional[Tuple[AIProvider, str]]:
    try:
        from backend.core.settings_manager import get_active_ai_provider
        row = get_active_ai_provider()
    except Exception as exc:
        logger.debug("Could not read active DB AI provider: %s", exc)
        return None

    if not row or not row.get("api_key"):
        return None

    provider_name = str(row.get("provider_name", "")).lower()
    model = row.get("model") or Config.DEFAULT_MODELS.get(provider_name, "")
    return _create_provider(provider_name, row["api_key"], model)


def resolve_agent_ai_provider(agent_config: AgentConfig) -> Optional[Tuple[AIProvider, str]]:
    """Resolve the provider native agents should use for AI summaries."""
    explicit_provider = Config.DEFAULT_AI_PROVIDER
    if explicit_provider:
        api_key = _provider_api_key(explicit_provider)
        if not api_key:
            logger.warning("DEFAULT_AI_PROVIDER=%s has no configured API key", explicit_provider)
            return None
        return _create_provider(
            explicit_provider,
            api_key,
            _provider_model(explicit_provider, agent_config),
        )

    db_provider = _active_db_provider()
    if db_provider:
        return db_provider

    provider_order = [
        agent_config.provider,
        "opencode",
        "deepseek",
        "openai_compatible",
        "anthropic",
        "openai",
        "google",
        "xai",
    ]
    seen: set[str] = set()
    for provider_name in provider_order:
        if provider_name in seen:
            continue
        seen.add(provider_name)

        api_key = _provider_api_key(provider_name)
        if not api_key:
            continue

        resolved = _create_provider(
            provider_name,
            api_key,
            _provider_model(provider_name, agent_config),
        )
        if resolved:
            return resolved

    return None
