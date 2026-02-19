"""
Anthropic Claude LLM Provider for ScholarGraph3D.

Supports Claude Haiku 4.5, Claude Sonnet 4.6, and Claude Opus 4.6.
"""

import logging
import re
from typing import AsyncIterator, Optional

from .base import BaseLLMProvider, LLMResponse

logger = logging.getLogger(__name__)


class ClaudeProvider(BaseLLMProvider):
    """
    Anthropic Claude LLM provider.

    Models:
    - claude-haiku-4-5-20251001: Fast, cost-effective (default)
    - claude-sonnet-4-6: Balanced performance
    - claude-opus-4-6: Most capable
    """

    MODELS = {
        "fast": "claude-haiku-4-5-20251001",
        "standard": "claude-sonnet-4-6",
        "opus": "claude-opus-4-6",
    }

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._client = None

    @property
    def name(self) -> str:
        return "anthropic"

    @property
    def default_model(self) -> str:
        return self.MODELS["fast"]

    @property
    def client(self):
        """Lazy-load the async Anthropic client."""
        if self._client is None:
            try:
                import anthropic
                self._client = anthropic.AsyncAnthropic(api_key=self.api_key)
            except ImportError:
                raise ImportError(
                    "anthropic package required: pip install anthropic"
                )
        return self._client

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Generate response using Claude API."""
        model_to_use = model or self.default_model

        try:
            messages = [{"role": "user", "content": prompt}]

            kwargs = {
                "model": model_to_use,
                "max_tokens": max_tokens,
                "messages": messages,
            }

            if system_prompt:
                kwargs["system"] = system_prompt

            if temperature != 0.7:
                kwargs["temperature"] = temperature

            response = await self.client.messages.create(**kwargs)

            tokens_used = 0
            if response.usage:
                tokens_used = (
                    response.usage.input_tokens + response.usage.output_tokens
                )

            return LLMResponse(
                content=response.content[0].text,
                model=model_to_use,
                tokens_used=tokens_used,
                provider_name=self.name,
            )

        except Exception as e:
            error_type = type(e).__name__
            logger.error(
                f"Claude API error ({error_type}): "
                f"{self._sanitize_error(str(e))}"
            )
            raise

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        """Generate streaming response using Claude API."""
        model_to_use = model or self.default_model

        try:
            messages = [{"role": "user", "content": prompt}]

            kwargs = {
                "model": model_to_use,
                "max_tokens": max_tokens,
                "messages": messages,
            }

            if system_prompt:
                kwargs["system"] = system_prompt

            if temperature != 0.7:
                kwargs["temperature"] = temperature

            async with self.client.messages.stream(**kwargs) as stream:
                async for text in stream.text_stream:
                    yield text

        except Exception as e:
            error_type = type(e).__name__
            logger.error(
                f"Claude streaming error ({error_type}): "
                f"{self._sanitize_error(str(e))}"
            )
            raise

    async def generate_json(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
    ) -> dict:
        """Generate JSON response using system prompt instruction."""
        import json

        json_system = (
            "You must respond with valid JSON only. No other text."
        )
        if system_prompt:
            json_system = f"{system_prompt}\n\n{json_system}"

        response = await self.generate(
            prompt=prompt,
            system_prompt=json_system,
            model=model,
            temperature=0.1,
            max_tokens=4096,
        )

        try:
            json_start = response.content.find("{")
            json_end = response.content.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                return json.loads(response.content[json_start:json_end])
        except json.JSONDecodeError:
            pass

        return {}

    @staticmethod
    def _sanitize_error(error: str) -> str:
        """Remove API keys from error messages."""
        sanitized = re.sub(
            r"(sk-ant-|api[_-]?key)[a-zA-Z0-9\-_]{10,}",
            "[redacted]",
            error,
            flags=re.IGNORECASE,
        )
        return sanitized[:200] if len(sanitized) > 200 else sanitized

    async def close(self) -> None:
        """Release client resources."""
        if self._client is not None:
            try:
                if hasattr(self._client, "close"):
                    await self._client.close()
                logger.debug("Claude client closed")
            except Exception as e:
                logger.debug(f"Error closing Claude client: {e}")
            finally:
                self._client = None
