#!/usr/bin/env python3
"""
AI Providers Module
Supports multiple AI providers: OpenAI (ChatGPT), Anthropic (Claude), Google (Gemini), and xAI (Grok)
"""

import requests
import json
import logging
import os
from typing import Dict, Optional, List
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class AIProvider(ABC):
    """Base class for AI providers"""

    def __init__(self, api_key: str):
        self.api_key = api_key

    @abstractmethod
    def generate_analysis(self, prompt: str, max_tokens: int = 500) -> str:
        """Generate AI analysis from prompt"""
        pass

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

    def generate_analysis(self, prompt: str, max_tokens: int = 500) -> str:
        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }

            data = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": "You are a financial analyst expert providing stock market analysis."},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": max_tokens,
                "temperature": 0.7
            }

            response = requests.post(self.base_url, headers=headers, json=data, timeout=30)
            response.raise_for_status()

            result = response.json()
            return result['choices'][0]['message']['content'].strip()

        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            return f"Error: {str(e)}"

    def get_provider_name(self) -> str:
        return f"OpenAI ({self.model})"


def _chat_completions_url(base_url: str) -> str:
    """Return a chat-completions endpoint for an OpenAI-compatible base URL."""
    normalized = base_url.rstrip("/")
    if normalized.endswith("/chat/completions"):
        return normalized
    return f"{normalized}/chat/completions"


class OpenAICompatibleProvider(AIProvider):
    """Provider for OpenAI-compatible chat-completions APIs."""

    provider_label = "OpenAI Compatible"

    def __init__(self, api_key: str, model: str, base_url: str):
        super().__init__(api_key)
        if not base_url:
            raise ValueError("OpenAI-compatible base URL is required")
        self.model = model
        self.base_url = _chat_completions_url(base_url)

    def generate_analysis(self, prompt: str, max_tokens: int = 500) -> str:
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

            if response.status_code != 200:
                error_msg = f"HTTP {response.status_code}: {response.text}"
                logger.error("%s API error: %s", self.provider_label, error_msg)
                return f"Error: {error_msg}"

            response.raise_for_status()

            result = response.json()
            message = result['choices'][0]['message']
            content = (message.get('content') or '').strip()
            if content:
                return content
            if message.get('reasoning_content'):
                return "Error: Model returned reasoning only; increase max_tokens."
            return "Error: Model returned an empty response."

        except Exception as e:
            logger.error("%s API error: %s", self.provider_label, e)
            return f"Error: {str(e)}"

    def get_provider_name(self) -> str:
        return f"{self.provider_label} ({self.model})"


class DeepSeekProvider(OpenAICompatibleProvider):
    """DeepSeek provider using its OpenAI-compatible API."""

    provider_label = "DeepSeek"

    def __init__(self, api_key: str, model: str = "deepseek-v4-flash"):
        try:
            from backend.config import Config
            base_url = Config.DEEPSEEK_BASE_URL
        except ImportError:
            base_url = "https://api.deepseek.com"
        super().__init__(api_key, model, base_url)


class OpenCodeProvider(OpenAICompatibleProvider):
    """OpenCode Go provider using its OpenAI-compatible chat API."""

    provider_label = "OpenCode"

    def __init__(self, api_key: str, model: str = "deepseek-v4-flash"):
        try:
            from backend.config import Config
            base_url = Config.OPENCODE_BASE_URL
        except ImportError:
            base_url = "https://opencode.ai/zen/go/v1"
        super().__init__(api_key, model, base_url)


class GenericOpenAICompatibleProvider(OpenAICompatibleProvider):
    """Generic OpenAI-compatible provider for OpenCode/OpenRouter-style APIs."""

    def __init__(self, api_key: str, model: str = ""):
        try:
            from backend.config import Config
            base_url = os.getenv("OPENAI_COMPATIBLE_BASE_URL", Config.OPENAI_COMPATIBLE_BASE_URL)
            selected_model = model or os.getenv("OPENAI_COMPATIBLE_MODEL", Config.OPENAI_COMPATIBLE_MODEL)
        except ImportError:
            base_url = os.getenv("OPENAI_COMPATIBLE_BASE_URL", "")
            selected_model = model
        super().__init__(api_key, selected_model, base_url)


class AnthropicProvider(AIProvider):
    """Anthropic (Claude) Provider"""

    def __init__(self, api_key: str, model: str = "claude-3-5-sonnet-20241022"):
        super().__init__(api_key)
        self.model = model
        self.base_url = "https://api.anthropic.com/v1/messages"

    def generate_analysis(self, prompt: str, max_tokens: int = 500) -> str:
        try:
            headers = {
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json"
            }

            data = {
                "model": self.model,
                "max_tokens": max_tokens,
                "messages": [
                    {"role": "user", "content": prompt}
                ],
                "system": "You are a financial analyst expert providing stock market analysis."
            }

            response = requests.post(self.base_url, headers=headers, json=data, timeout=30)
            response.raise_for_status()

            result = response.json()
            return result['content'][0]['text'].strip()

        except Exception as e:
            logger.error(f"Anthropic API error: {e}")
            return f"Error: {str(e)}"

    def get_provider_name(self) -> str:
        return f"Anthropic ({self.model})"


class GoogleProvider(AIProvider):
    """Google (Gemini) Provider"""

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash"):
        super().__init__(api_key)
        self.model = model
        self.base_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def generate_analysis(self, prompt: str, max_tokens: int = 500) -> str:
        try:
            headers = {
                "Content-Type": "application/json"
            }

            data = {
                "contents": [{
                    "parts": [{
                        "text": f"You are a financial analyst expert. {prompt}"
                    }]
                }],
                "generationConfig": {
                    "maxOutputTokens": max_tokens,
                    "temperature": 0.7
                }
            }

            response = requests.post(
                f"{self.base_url}?key={self.api_key}",
                headers=headers,
                json=data,
                timeout=30
            )

            # Log error details if request fails
            if response.status_code != 200:
                error_msg = f"HTTP {response.status_code}: {response.text}"
                logger.error(f"Google API error: {error_msg}")
                return f"Error: {error_msg}"

            response.raise_for_status()

            result = response.json()
            return result['candidates'][0]['content']['parts'][0]['text'].strip()

        except Exception as e:
            logger.error(f"Google API error: {e}")
            return f"Error: {str(e)}"

    def get_provider_name(self) -> str:
        return f"Google ({self.model})"


class GrokProvider(AIProvider):
    """xAI (Grok) Provider"""

    def __init__(self, api_key: str, model: str = "grok-4"):
        super().__init__(api_key)
        self.model = model
        self.base_url = "https://api.x.ai/v1/chat/completions"

    def generate_analysis(self, prompt: str, max_tokens: int = 500) -> str:
        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }

            data = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": "You are a financial analyst expert providing stock market analysis."},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": max_tokens,
                "temperature": 0.7
            }

            # Log debug info (API key first 10 chars only for security)
            api_key_preview = self.api_key[:10] + "..." if len(self.api_key) > 10 else "***"
            logger.debug(f"Grok API request - Model: {self.model}, API Key: {api_key_preview}, URL: {self.base_url}")

            response = requests.post(self.base_url, headers=headers, json=data, timeout=30)

            # Log error details if request fails
            if response.status_code != 200:
                error_msg = f"HTTP {response.status_code}: {response.text}"
                logger.error(f"Grok API error: {error_msg}")
                return f"Error: {error_msg}"

            response.raise_for_status()

            result = response.json()
            return result['choices'][0]['message']['content'].strip()

        except Exception as e:
            error_msg = f"Grok API error: {str(e)}"
            logger.error(error_msg)
            # Include detailed error info for debugging
            if hasattr(e, 'response'):
                try:
                    error_detail = e.response.json()
                    logger.error(f"Grok API response detail: {error_detail}")
                except Exception as je:
                    logger.error(f"Could not parse response JSON: {str(je)}")
            return f"Error: {str(e)}"

    def get_provider_name(self) -> str:
        return f"xAI ({self.model})"


class AIProviderFactory:
    """Factory to create AI provider instances"""

    PROVIDERS = {
        'openai': OpenAIProvider,
        'openai_compatible': GenericOpenAICompatibleProvider,
        'deepseek': DeepSeekProvider,
        'opencode': OpenCodeProvider,
        'anthropic': AnthropicProvider,
        'google': GoogleProvider,
        'grok': GrokProvider,
        'xai': GrokProvider,
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
                'id': 'deepseek',
                'name': 'DeepSeek',
                'models': ['deepseek-v4-flash', 'deepseek-v4-pro'],
                'default_model': 'deepseek-v4-flash'
            },
            {
                'id': 'opencode',
                'name': 'OpenCode',
                'models': ['deepseek-v4-flash', 'deepseek-v4-pro', 'kimi-k2.6', 'kimi-k2.5', 'glm-5.1', 'glm-5'],
                'default_model': 'deepseek-v4-flash'
            },
            {
                'id': 'openai_compatible',
                'name': 'OpenAI-Compatible',
                'models': ['provider/free-model'],
                'default_model': 'provider/free-model'
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
        response = provider.generate_analysis("Say 'OK' if you can read this.", max_tokens=160)

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
