"""
Google Gemini LLM Provider for ScholarGraph3D.

Supports Gemini 2.5 Flash and Gemini 2.5 Pro.
Uses the google-genai async client.
"""

import logging
import re
from typing import AsyncIterator, Optional

from .base import BaseLLMProvider, LLMResponse

logger = logging.getLogger(__name__)


class GeminiProvider(BaseLLMProvider):
    """
    Google Gemini LLM provider.

    Models:
    - gemini-2.5-flash: Fast, cost-effective (default)
    - gemini-2.5-pro: Most capable
    """

    MODELS = {
        "fast": "gemini-2.5-flash",
        "pro": "gemini-2.5-pro",
    }

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._client = None

    @property
    def name(self) -> str:
        return "google"

    @property
    def default_model(self) -> str:
        return self.MODELS["fast"]

    @property
    def client(self):
        """Lazy-load the google-genai client."""
        if self._client is None:
            try:
                from google import genai
                self._client = genai.Client(api_key=self.api_key)
            except ImportError:
                raise ImportError(
                    "google-genai package required: pip install google-genai"
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
        """Generate response using Gemini API."""
        model_to_use = model or self.default_model

        try:
            from google.genai import types

            config = types.GenerateContentConfig(
                max_output_tokens=max_tokens,
                temperature=temperature,
            )
            if system_prompt:
                config.system_instruction = system_prompt

            response = await self.client.aio.models.generate_content(
                model=model_to_use,
                contents=prompt,
                config=config,
            )

            tokens_used = 0
            if response.usage_metadata:
                tokens_used = (
                    getattr(response.usage_metadata, "total_token_count", 0)
                    or 0
                )

            return LLMResponse(
                content=response.text or "",
                model=model_to_use,
                tokens_used=tokens_used,
                provider_name=self.name,
            )

        except Exception as e:
            error_type = type(e).__name__
            logger.error(
                f"Gemini API error ({error_type}): "
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
        """Generate streaming response using Gemini API."""
        model_to_use = model or self.default_model

        try:
            from google.genai import types

            config = types.GenerateContentConfig(
                max_output_tokens=max_tokens,
                temperature=temperature,
            )
            if system_prompt:
                config.system_instruction = system_prompt

            async for chunk in self.client.aio.models.generate_content_stream(
                model=model_to_use,
                contents=prompt,
                config=config,
            ):
                if chunk.text:
                    yield chunk.text

        except Exception as e:
            error_type = type(e).__name__
            logger.error(
                f"Gemini streaming error ({error_type}): "
                f"{self._sanitize_error(str(e))}"
            )
            raise

    async def generate_json(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
    ) -> dict:
        """Generate JSON response using Gemini's JSON mode."""
        import json

        model_to_use = model or self.default_model

        try:
            from google.genai import types

            config = types.GenerateContentConfig(
                max_output_tokens=4096,
                temperature=0.1,
                response_mime_type="application/json",
            )
            if system_prompt:
                config.system_instruction = system_prompt

            response = await self.client.aio.models.generate_content(
                model=model_to_use,
                contents=prompt,
                config=config,
            )

            return json.loads(response.text)

        except Exception as e:
            error_type = type(e).__name__
            logger.error(
                f"Gemini JSON error ({error_type}): "
                f"{self._sanitize_error(str(e))}"
            )
            return {}

    @staticmethod
    def _sanitize_error(error: str) -> str:
        """Remove API keys from error messages."""
        sanitized = re.sub(
            r"(AIza|api[_-]?key)[a-zA-Z0-9\-_]{10,}",
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
                logger.debug("Gemini client closed")
            except Exception as e:
                logger.debug(f"Error closing Gemini client: {e}")
            finally:
                self._client = None
