import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.agents.base import AgentConfig
from backend.config import Config, _load_env_file
from backend.core.ai_providers import AIProviderFactory


class _FakeResponse:
    status_code = 200
    text = '{"choices":[{"message":{"content":"ok"}}]}'

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return {"choices": [{"message": {"content": "ok"}}]}


class AIProviderWiringTest(unittest.TestCase):
    def test_deepseek_provider_uses_openai_chat_completions_shape(self) -> None:
        provider = AIProviderFactory.create_provider(
            "deepseek",
            "sk-deepseek",
            "deepseek-v4-flash",
        )

        self.assertIsNotNone(provider)
        with patch("backend.core.ai_providers.requests.post", return_value=_FakeResponse()) as post:
            response = provider.generate_analysis("Summarize NVDA", max_tokens=123)

        self.assertEqual(response, "ok")
        url = post.call_args.args[0]
        headers = post.call_args.kwargs["headers"]
        payload = post.call_args.kwargs["json"]
        self.assertEqual(url, "https://api.deepseek.com/chat/completions")
        self.assertEqual(headers["Authorization"], "Bearer sk-deepseek")
        self.assertEqual(payload["model"], "deepseek-v4-flash")
        self.assertEqual(payload["max_tokens"], 123)
        self.assertEqual(payload["messages"][0]["role"], "system")
        self.assertEqual(payload["messages"][1]["content"], "Summarize NVDA")

    def test_openai_compatible_provider_appends_chat_completions_to_base_url(self) -> None:
        with patch.dict(os.environ, {"OPENAI_COMPATIBLE_BASE_URL": "https://models.example.test/v1"}):
            provider = AIProviderFactory.create_provider(
                "openai_compatible",
                "sk-compatible",
                "provider/free-model",
            )

        self.assertIsNotNone(provider)
        with patch("backend.core.ai_providers.requests.post", return_value=_FakeResponse()) as post:
            response = provider.generate_analysis("Analyze AAPL", max_tokens=50)

        self.assertEqual(response, "ok")
        self.assertEqual(
            post.call_args.args[0],
            "https://models.example.test/v1/chat/completions",
        )
        self.assertEqual(
            post.call_args.kwargs["json"]["model"],
            "provider/free-model",
        )

    def test_opencode_provider_uses_opencode_go_chat_endpoint(self) -> None:
        provider = AIProviderFactory.create_provider(
            "opencode",
            "sk-opencode",
            "deepseek-v4-flash",
        )

        self.assertIsNotNone(provider)
        with patch("backend.core.ai_providers.requests.post", return_value=_FakeResponse()) as post:
            response = provider.generate_analysis("Analyze SPY", max_tokens=75)

        self.assertEqual(response, "ok")
        self.assertEqual(
            post.call_args.args[0],
            "https://opencode.ai/zen/go/v1/chat/completions",
        )
        self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer sk-opencode")
        self.assertEqual(post.call_args.kwargs["json"]["model"], "deepseek-v4-flash")

    def test_env_file_loader_populates_missing_keys_without_overwriting_existing_values(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            env_path = Path(tmpdir) / ".env"
            env_path.write_text(
                "DEEPSEEK_API_KEY=sk-from-file\n"
                "OPENAI_COMPATIBLE_BASE_URL=https://from-file.example/v1\n",
                encoding="utf-8",
            )

            with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "sk-existing"}, clear=True):
                _load_env_file(env_path)
                self.assertEqual(os.environ["DEEPSEEK_API_KEY"], "sk-existing")
                self.assertEqual(
                    os.environ["OPENAI_COMPATIBLE_BASE_URL"],
                    "https://from-file.example/v1",
                )

    def test_native_agent_provider_resolution_uses_deepseek_env_provider(self) -> None:
        from backend.agents.ai_provider_resolver import resolve_agent_ai_provider

        config = AgentConfig(
            name="scanner",
            role="Stock Scanner",
            goal="scan",
            backstory="scan",
            model="claude-haiku-4-5-20251001",
            provider="anthropic",
        )

        with (
            patch.object(Config, "DEFAULT_AI_PROVIDER", "deepseek"),
            patch.object(Config, "DEEPSEEK_API_KEY", "sk-deepseek"),
            patch.object(Config, "DEEPSEEK_MODEL", "deepseek-v4-flash"),
        ):
            resolved = resolve_agent_ai_provider(config)

        self.assertIsNotNone(resolved)
        provider, model = resolved
        self.assertEqual(model, "deepseek-v4-flash")
        self.assertIn("DeepSeek", provider.get_provider_name())

    def test_native_agent_provider_resolution_uses_opencode_env_provider(self) -> None:
        from backend.agents.ai_provider_resolver import resolve_agent_ai_provider

        config = AgentConfig(
            name="scanner",
            role="Stock Scanner",
            goal="scan",
            backstory="scan",
            model="claude-haiku-4-5-20251001",
            provider="anthropic",
        )

        with (
            patch.object(Config, "DEFAULT_AI_PROVIDER", "opencode"),
            patch.object(Config, "OPENCODE_API_KEY", "sk-opencode"),
            patch.object(Config, "OPENCODE_MODEL", "deepseek-v4-flash"),
        ):
            resolved = resolve_agent_ai_provider(config)

        self.assertIsNotNone(resolved)
        provider, model = resolved
        self.assertEqual(model, "deepseek-v4-flash")
        self.assertIn("OpenCode", provider.get_provider_name())

    def test_opencode_agent_resolution_uses_flash_for_scanner_and_pro_for_researcher(self) -> None:
        from backend.agents.ai_provider_resolver import resolve_agent_ai_provider

        scanner_config = AgentConfig(
            name="scanner",
            role="Stock Scanner",
            goal="scan",
            backstory="scan",
            model="claude-haiku-4-5-20251001",
            provider="anthropic",
            tags=["scanner", "technical", "fast"],
        )
        researcher_config = AgentConfig(
            name="researcher",
            role="Research Analyst",
            goal="research",
            backstory="research",
            model="claude-sonnet-4-5-20250929",
            provider="anthropic",
            tags=["researcher", "deep-analysis", "markdown"],
        )

        with (
            patch.object(Config, "DEFAULT_AI_PROVIDER", "opencode"),
            patch.object(Config, "OPENCODE_API_KEY", "sk-opencode"),
            patch.object(Config, "OPENCODE_FLASH_MODEL", "deepseek-v4-flash"),
            patch.object(Config, "OPENCODE_PRO_MODEL", "deepseek-v4-pro"),
        ):
            scanner = resolve_agent_ai_provider(scanner_config)
            researcher = resolve_agent_ai_provider(researcher_config)

        self.assertIsNotNone(scanner)
        self.assertIsNotNone(researcher)
        self.assertEqual(scanner[1], "deepseek-v4-flash")
        self.assertEqual(researcher[1], "deepseek-v4-pro")


    def test_settings_env_provider_reports_deepseek_as_configured(self) -> None:
        from backend.api.settings import _env_ai_provider

        with (
            patch.object(Config, "DEEPSEEK_API_KEY", "sk-deepseek"),
            patch.object(Config, "DEEPSEEK_MODEL", "deepseek-v4-flash"),
        ):
            provider = _env_ai_provider("deepseek")

        self.assertIsNotNone(provider)
        self.assertEqual(provider["provider_name"], "deepseek")
        self.assertEqual(provider["model"], "deepseek-v4-flash")

    def test_settings_env_provider_reports_opencode_as_configured(self) -> None:
        from backend.api.settings import _env_ai_provider

        with (
            patch.object(Config, "OPENCODE_API_KEY", "sk-opencode"),
            patch.object(Config, "OPENCODE_MODEL", "deepseek-v4-flash"),
        ):
            provider = _env_ai_provider("opencode")

        self.assertIsNotNone(provider)
        self.assertEqual(provider["provider_name"], "opencode")
        self.assertEqual(provider["model"], "deepseek-v4-flash")


    def test_chat_provider_config_falls_back_to_env_provider(self) -> None:
        from backend.api.chat import _get_chat_provider_config

        with (
            patch("backend.api.chat.get_active_ai_provider", return_value=None),
            patch.object(Config, "DEFAULT_AI_PROVIDER", "deepseek"),
            patch.object(Config, "DEEPSEEK_API_KEY", "sk-deepseek"),
            patch.object(Config, "DEEPSEEK_MODEL", "deepseek-v4-flash"),
        ):
            provider = _get_chat_provider_config()

        self.assertIsNotNone(provider)
        self.assertEqual(provider["provider_name"], "deepseek")
        self.assertEqual(provider["api_key"], "sk-deepseek")

    def test_opencode_chat_provider_uses_flash_for_quick_and_pro_for_processing(self) -> None:
        from backend.api.chat import _get_chat_provider_config

        with (
            patch("backend.api.chat.get_active_ai_provider", return_value=None),
            patch.object(Config, "DEFAULT_AI_PROVIDER", "opencode"),
            patch.object(Config, "OPENCODE_API_KEY", "sk-opencode"),
            patch.object(Config, "OPENCODE_FLASH_MODEL", "deepseek-v4-flash"),
            patch.object(Config, "OPENCODE_PRO_MODEL", "deepseek-v4-pro"),
        ):
            quick = _get_chat_provider_config("quick")
            balanced = _get_chat_provider_config("balanced")
            deep = _get_chat_provider_config("deep")

        self.assertEqual(quick["model"], "deepseek-v4-flash")
        self.assertEqual(balanced["model"], "deepseek-v4-pro")
        self.assertEqual(deep["model"], "deepseek-v4-pro")


if __name__ == "__main__":
    unittest.main()
