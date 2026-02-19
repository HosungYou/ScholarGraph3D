"""
OpenAI GPT LLM Provider for ScholarGraph3D.

Supports GPT-4o-mini, GPT-4o, and GPT-4 Turbo.
"""

import logging
import re
from typing import AsyncIterator, Optional

from .base import BaseLLMProvider, LLMResponse

logger = logging.getLogger(__name__)


class OpenAIProvider(BaseLLMProvider):
    """
    OpenAI GPT LLM provider.

    Models:
    - gpt-4o-mini: Fast, cost-effective (default)
    - gpt-4o: Balanced performance
    - gpt-4-turbo: Most capable
    """

    MODELS = {
        "fast": "gpt-4o-mini",
        "standard": "gpt-4o",
        "turbo": "gpt-4-turbo",
    }

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._client = None

    @property
    def name(self) -> str:
        return "openai"

    @property
    def default_model(self) -> str:
        return self.MODELS["fast"]

    @property
    def client(self):
        """Lazy-load the async OpenAI client."""
        if self._client is None:
            try:
                from openai import AsyncOpenAI
                self._client = AsyncOpenAI(api_key=self.api_key)
            except ImportError:
                raise ImportError("openai package required: pip install openai")
        return self._client

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Generate response using OpenAI API."""
        model_to_use = model or self.default_model

        try:
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            response = await self.client.chat.completions.create(
                model=model_to_use,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )

            usage = response.usage
            return LLMResponse(
                content=response.choices[0].message.content,
                model=model_to_use,
                tokens_used=usage.total_tokens if usage else 0,
                provider_name=self.name,
            )

        except Exception as e:
            error_type = type(e).__name__
            logger.error(
                f"OpenAI API error ({error_type}): {self._sanitize_error(str(e))}"
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
        """Generate streaming response using OpenAI API."""
        model_to_use = model or self.default_model

        try:
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            stream = await self.client.chat.completions.create(
                model=model_to_use,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=True,
            )

            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except Exception as e:
            error_type = type(e).__name__
            logger.error(
                f"OpenAI streaming error ({error_type}): "
                f"{self._sanitize_error(str(e))}"
            )
            raise

    async def generate_json(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
    ) -> dict:
        """Generate JSON response using OpenAI's native JSON mode."""
        import json

        model_to_use = model or self.default_model

        try:
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            response = await self.client.chat.completions.create(
                model=model_to_use,
                messages=messages,
                max_tokens=4096,
                temperature=0.1,
                response_format={"type": "json_object"},
            )

            return json.loads(response.choices[0].message.content)

        except Exception as e:
            error_type = type(e).__name__
            logger.error(
                f"OpenAI JSON error ({error_type}): "
                f"{self._sanitize_error(str(e))}"
            )
            return {}

    @staticmethod
    def _sanitize_error(error: str) -> str:
        """Remove API keys from error messages."""
        sanitized = re.sub(
            r"(sk-|api[_-]?key)[a-zA-Z0-9\-_]{10,}",
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
                logger.debug("OpenAI client closed")
            except Exception as e:
                logger.debug(f"Error closing OpenAI client: {e}")
            finally:
                self._client = None
