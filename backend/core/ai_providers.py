#!/usr/bin/env python3
"""
AI Providers Module
Supports multiple AI providers: OpenAI (ChatGPT), Anthropic (Claude), Google (Gemini), and xAI (Grok)
"""

import requests
import json
import logging
from typing import Dict, Optional, List
from abc import ABC, abstractmethod

from .utils import mask_secret

logger = logging.getLogger(__name__)


class AIProvider(ABC):
    """Base class for AI providers"""

    def __init__(self, api_key: str):
        self.api_key = api_key

    @abstractmethod
    def generate_analysis_with_usage(
        self, prompt: str, max_tokens: int = 500
    ) -> tuple[str | None, int, str | None]:
        """Call the provider API and return (response_text, tokens_used, error_message).

        Never raises. On success: (text, tokens, None).
        On failure: (None, 0, error_description).
        """
        pass

    def generate_analysis(self, prompt: str, max_tokens: int = 500) -> str:
        """Generate AI analysis from prompt. Returns response text or 'Error: ...' string."""
        text, _, error = self.generate_analysis_with_usage(prompt, max_tokens)
        if error:
            return f"Error: {error}"
        return text or ""

    @abstractmethod
    def get_provider_name(self) -> str:
        """Return provider name"""
        pass


class OpenAIProvider(AIProvider):
    """OpenAI (ChatGPT) Provider"""

    def __init__(self, api_key: str, model: str = "gpt-4"):
        super().__init__(api_key)
        self.model = model
        self.base_url = "https://api.openai.com/v1/chat/completions"

    def generate_analysis_with_usage(
        self, prompt: str, max_tokens: int = 500
    ) -> tuple[str | None, int, str | None]:
        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            data = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": "You are a financial analyst expert providing stock market analysis."},
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": max_tokens,
                "temperature": 0.7,
            }
            response = requests.post(self.base_url, headers=headers, json=data, timeout=30)
            response.raise_for_status()
            result = response.json()
            text = result["choices"][0]["message"]["content"].strip()
            tokens = result.get("usage", {}).get("total_tokens", 0)
            return text, tokens, None
        except Exception as e:
            logger.error("OpenAI API error: %s", e)
            return None, 0, str(e)

    def get_provider_name(self) -> str:
        return f"OpenAI ({self.model})"


class AnthropicProvider(AIProvider):
    """Anthropic (Claude) Provider"""

    def __init__(self, api_key: str, model: str = "claude-3-5-sonnet-20241022"):
        super().__init__(api_key)
        self.model = model
        self.base_url = "https://api.anthropic.com/v1/messages"

    def generate_analysis_with_usage(
        self, prompt: str, max_tokens: int = 500
    ) -> tuple[str | None, int, str | None]:
        try:
            headers = {
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            }
            data = {
                "model": self.model,
                "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": prompt}],
                "system": "You are a financial analyst expert providing stock market analysis.",
            }
            response = requests.post(self.base_url, headers=headers, json=data, timeout=30)
            response.raise_for_status()
            result = response.json()
            text = result["content"][0]["text"].strip()
            usage = result.get("usage", {})
            tokens = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
            return text, tokens, None
        except Exception as e:
            logger.error("Anthropic API error: %s", e)
            return None, 0, str(e)

    def get_provider_name(self) -> str:
        return f"Anthropic ({self.model})"


class GoogleProvider(AIProvider):
    """Google (Gemini) Provider"""

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash"):
        super().__init__(api_key)
        self.model = model
        self.base_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def generate_analysis_with_usage(
        self, prompt: str, max_tokens: int = 500
    ) -> tuple[str | None, int, str | None]:
        try:
            headers = {"Content-Type": "application/json"}
            data = {
                "contents": [{"parts": [{"text": f"You are a financial analyst expert. {prompt}"}]}],
                "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.7},
            }
            response = requests.post(
                f"{self.base_url}?key={self.api_key}",
                headers=headers,
                json=data,
                timeout=30,
            )
            if response.status_code != 200:
                error_msg = f"HTTP {response.status_code}: {response.text}"
                logger.error("Google API error: HTTP %s", response.status_code)
                return None, 0, error_msg
            response.raise_for_status()
            result = response.json()
            text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            usage = result.get("usageMetadata", {})
            tokens = usage.get("totalTokenCount", 0)
            return text, tokens, None
        except Exception as e:
            logger.error("Google API error: %s", e)
            return None, 0, str(e)

    def get_provider_name(self) -> str:
        return f"Google ({self.model})"


class GrokProvider(AIProvider):
    """xAI (Grok) Provider"""

    def __init__(self, api_key: str, model: str = "grok-4"):
        super().__init__(api_key)
        self.model = model
        self.base_url = "https://api.x.ai/v1/chat/completions"

    def generate_analysis_with_usage(
        self, prompt: str, max_tokens: int = 500
    ) -> tuple[str | None, int, str | None]:
        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            data = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": "You are a financial analyst expert providing stock market analysis."},
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": max_tokens,
                "temperature": 0.7,
            }
            logger.debug(
                "Grok API request - model: %s, url: %s",
                self.model, self.base_url,
            )
            response = requests.post(self.base_url, headers=headers, json=data, timeout=30)
            if response.status_code != 200:
                error_msg = f"HTTP {response.status_code}: {response.text}"
                logger.error("Grok API error: %s", error_msg)
                return None, 0, error_msg
            response.raise_for_status()
            result = response.json()
            text = result["choices"][0]["message"]["content"].strip()
            tokens = result.get("usage", {}).get("total_tokens", 0)
            return text, tokens, None
        except Exception as e:
            logger.error("Grok API error: %s", e)
            if hasattr(e, "response"):
                try:
                    logger.error("Grok API response detail: %s", e.response.json())
                except Exception:
                    pass
            return None, 0, str(e)

    def get_provider_name(self) -> str:
        return f"xAI ({self.model})"


class AIProviderFactory:
    """Factory to create AI provider instances"""

    PROVIDERS = {
        'openai': OpenAIProvider,
        'anthropic': AnthropicProvider,
        'google': GoogleProvider,
        'grok': GrokProvider
    }

    @classmethod
    def create_provider(cls, provider_name: str, api_key: str, model: Optional[str] = None) -> Optional[AIProvider]:
        """Create an AI provider instance"""
        provider_class = cls.PROVIDERS.get(provider_name.lower())

        if not provider_class:
            logger.error(f"Unknown provider: {provider_name}")
            return None

        try:
            if model:
                return provider_class(api_key, model)
            else:
                return provider_class(api_key)
        except Exception as e:
            logger.error(f"Error creating provider {provider_name}: {e}")
            return None

    @classmethod
    def get_available_providers(cls) -> List[Dict[str, str]]:
        """Get list of available providers"""
        return [
            {
                'id': 'openai',
                'name': 'OpenAI (ChatGPT)',
                'models': ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
                'default_model': 'gpt-4o'
            },
            {
                'id': 'anthropic',
                'name': 'Anthropic (Claude)',
                'models': ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
                'default_model': 'claude-3-5-sonnet-20241022'
            },
            {
                'id': 'google',
                'name': 'Google (Gemini)',
                'models': ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-pro-latest'],
                'default_model': 'gemini-2.5-flash'
            },
            {
                'id': 'grok',
                'name': 'xAI (Grok)',
                'models': ['grok-4', 'grok-4-vision', 'grok-4-latest', 'grok-2', 'grok-2-vision-1212', 'grok-latest'],
                'default_model': 'grok-4'
            }
        ]


def test_provider_connection(provider_name: str, api_key: str, model: Optional[str] = None) -> Dict:
    """Test AI provider connection"""
    try:
        provider = AIProviderFactory.create_provider(provider_name, api_key, model)
        if not provider:
            return {'success': False, 'error': 'Invalid provider'}

        # Simple test prompt
        response = provider.generate_analysis("Say 'OK' if you can read this.", max_tokens=10)

        if response and not response.startswith('Error:'):
            return {'success': True, 'provider': provider.get_provider_name()}
        else:
            return {'success': False, 'error': response}

    except Exception as e:
        return {'success': False, 'error': str(e)}


if __name__ == '__main__':
    # Example usage
    print("AI Providers Module")
    print("Available providers:", [p['name'] for p in AIProviderFactory.get_available_providers()])
