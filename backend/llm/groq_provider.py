"""
Groq LLM Provider for ScholarGraph3D.

Supports Llama 3.3, Llama 3.1, and Mixtral models.
FREE TIER: 14,400 requests/day, 300+ tokens/sec.

Rate Limits:
- Free tier: ~30 requests/minute, 14,400 requests/day
- Built-in AsyncRateLimiter (28 RPM default)
- Automatic retry with exponential backoff for rate limits

Get API key: https://console.groq.com
"""

import asyncio
import logging
import re
import time
from typing import AsyncIterator, Optional

from .base import BaseLLMProvider, LLMResponse

logger = logging.getLogger(__name__)


class AsyncRateLimiter:
    """
    Token bucket rate limiter for Groq API.

    Prevents 429 (Too Many Requests) errors by throttling requests
    using an interval-based approach.
    """

    def __init__(self, requests_per_minute: int = 28):
        """
        Initialize rate limiter.

        Args:
            requests_per_minute: Max requests per minute
                (default: 28, Groq free tier allows 30).
        """
        self.requests_per_minute = requests_per_minute
        self.min_interval = 60.0 / requests_per_minute
        self._last_request_time: float = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self):
        """Wait until a request can be made without exceeding rate limit."""
        async with self._lock:
            current_time = time.monotonic()
            time_since_last = current_time - self._last_request_time

            if time_since_last < self.min_interval:
                wait_time = self.min_interval - time_since_last
                logger.debug(f"Rate limiter: waiting {wait_time:.2f}s")
                await asyncio.sleep(wait_time)

            self._last_request_time = time.monotonic()


class GroqProvider(BaseLLMProvider):
    """
    Groq LLM provider.

    Models:
    - llama-3.3-70b-versatile: Most capable (default)
    - llama-3.1-8b-instant: Fastest
    - mixtral-8x7b-32768: Good for long context

    Features:
    - Built-in rate limiter (28 RPM default)
    - Automatic retry on 429 errors (3 retries)
    - Exponential backoff for transient errors
    - Error sanitization for gsk_* keys
    """

    MODELS = {
        "default": "llama-3.3-70b-versatile",
        "fast": "llama-3.1-8b-instant",
        "mixtral": "mixtral-8x7b-32768",
    }

    BASE_URL = "https://api.groq.com/openai/v1"
    MAX_RETRIES = 3

    def __init__(self, api_key: str, requests_per_minute: int = 28):
        """
        Initialize Groq provider.

        Args:
            api_key: Groq API key.
            requests_per_minute: Rate limit (default: 28).
        """
        self.api_key = api_key
        self._client = None
        self._rate_limiter = AsyncRateLimiter(requests_per_minute)

    @property
    def name(self) -> str:
        return "groq"

    @property
    def default_model(self) -> str:
        return self.MODELS["default"]

    @property
    def client(self):
        """Lazy-load the Groq client (OpenAI SDK with custom base_url)."""
        if self._client is None:
            try:
                import httpx
                from openai import AsyncOpenAI

                http_client = httpx.AsyncClient(
                    timeout=httpx.Timeout(60.0, connect=10.0),
                )

                self._client = AsyncOpenAI(
                    api_key=self.api_key,
                    base_url=self.BASE_URL,
                    max_retries=3,
                    timeout=60.0,
                    http_client=http_client,
                )
            except ImportError:
                raise ImportError(
                    "openai and httpx packages required: "
                    "pip install openai httpx"
                )
        return self._client

    async def _execute_with_retry(
        self, operation, operation_name: str = "API call"
    ):
        """
        Execute an async operation with retry logic.

        Handles 429 (rate limit), timeout, and connection errors
        with exponential backoff.
        """
        last_exception = None

        for attempt in range(self.MAX_RETRIES):
            try:
                await self._rate_limiter.acquire()
                return await operation()

            except Exception as e:
                last_exception = e
                error_str = str(e).lower()

                # Handle rate limit errors (429)
                if (
                    "rate" in error_str and "limit" in error_str
                ) or "429" in error_str:
                    retry_after = self._extract_retry_after(str(e))
                    logger.warning(
                        f"Groq rate limited on {operation_name} "
                        f"(attempt {attempt + 1}/{self.MAX_RETRIES}), "
                        f"waiting {retry_after}s"
                    )
                    await asyncio.sleep(retry_after)
                    continue

                # Handle timeout errors
                if "timeout" in error_str or "timed out" in error_str:
                    wait_time = 2 ** attempt
                    logger.warning(
                        f"Groq timeout on {operation_name} "
                        f"(attempt {attempt + 1}/{self.MAX_RETRIES}), "
                        f"waiting {wait_time}s"
                    )
                    await asyncio.sleep(wait_time)
                    continue

                # Handle connection errors
                if "connection" in error_str or "network" in error_str:
                    wait_time = 2 ** attempt
                    logger.warning(
                        f"Groq connection error on {operation_name} "
                        f"(attempt {attempt + 1}/{self.MAX_RETRIES}), "
                        f"waiting {wait_time}s"
                    )
                    await asyncio.sleep(wait_time)
                    continue

                # Non-retryable errors
                logger.error(
                    f"Groq {operation_name} error ({type(e).__name__}): "
                    f"{self._sanitize_error(str(e))}"
                )
                raise

        logger.error(
            f"Groq {operation_name} failed after {self.MAX_RETRIES} retries"
        )
        raise last_exception

    def _extract_retry_after(self, error_message: str) -> int:
        """Extract retry-after value from error message or return default."""
        patterns = [
            r"retry[_-]?after[:\s]+(\d+)",
            r"wait[:\s]+(\d+)",
            r"(\d+)\s*seconds?",
        ]
        for pattern in patterns:
            match = re.search(pattern, error_message, re.IGNORECASE)
            if match:
                return min(int(match.group(1)), 120)
        return 10

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Generate response using Groq API with automatic retry."""
        model_to_use = model or self.default_model

        async def _call():
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

        return await self._execute_with_retry(_call, "generate")

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        """Generate streaming response using Groq API."""
        model_to_use = model or self.default_model

        await self._rate_limiter.acquire()

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
                f"Groq streaming error ({error_type}): "
                f"{self._sanitize_error(str(e))}"
            )
            raise

    async def generate_json(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
    ) -> dict:
        """Generate JSON response using Groq's JSON mode with retry."""
        import json

        model_to_use = model or self.default_model

        async def _call():
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})

            json_prompt = prompt + "\n\nRespond with valid JSON only."
            messages.append({"role": "user", "content": json_prompt})

            response = await self.client.chat.completions.create(
                model=model_to_use,
                messages=messages,
                max_tokens=4096,
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            return json.loads(response.choices[0].message.content)

        try:
            return await self._execute_with_retry(_call, "generate_json")
        except Exception as e:
            logger.error(
                f"Groq JSON generation failed: "
                f"{self._sanitize_error(str(e))}"
            )
            return {}

    @staticmethod
    def _sanitize_error(error: str) -> str:
        """Remove gsk_* API keys from error messages."""
        sanitized = re.sub(
            r"(gsk_|api[_-]?key)[a-zA-Z0-9\-_]{10,}",
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
                logger.debug("Groq client closed")
            except Exception as e:
                logger.debug(f"Error closing Groq client: {e}")
            finally:
                self._client = None
