"""
Caching LLM Provider Wrapper for ScholarGraph3D.

Decorator pattern wrapping any BaseLLMProvider with in-memory caching.
Streaming responses are NOT cached (real-time requirement).
"""

import hashlib
import json
import logging
import time
from typing import AsyncIterator, Dict, Optional, Tuple

from .base import BaseLLMProvider, LLMResponse

logger = logging.getLogger(__name__)


class CachedLLMProvider(BaseLLMProvider):
    """
    Wrapper that adds in-memory caching to any LLM provider.

    Features:
    - In-memory dict cache with configurable TTL (default 1 hour).
    - Cache key = hash(prompt + system_prompt + model + temperature + max_tokens).
    - generate() checks cache; generate_stream() bypasses cache.
    - Automatic expiration of stale entries.

    Usage:
        provider = OpenAIProvider(api_key="...")
        cached = CachedLLMProvider(provider, default_ttl=3600)
        response = await cached.generate(prompt="...")
    """

    def __init__(
        self,
        provider: BaseLLMProvider,
        cache_enabled: bool = True,
        default_ttl: int = 3600,
    ):
        self._provider = provider
        self._cache_enabled = cache_enabled
        self._default_ttl = default_ttl
        # Cache: {key: (LLMResponse, expiry_timestamp)}
        self._cache: Dict[str, Tuple[LLMResponse, float]] = {}

    @property
    def name(self) -> str:
        return f"cached_{self._provider.name}"

    @property
    def default_model(self) -> str:
        return self._provider.default_model

    @staticmethod
    def _make_cache_key(
        prompt: str,
        system_prompt: Optional[str],
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> str:
        """Generate a deterministic cache key from call parameters."""
        key_data = json.dumps(
            {
                "prompt": prompt,
                "system_prompt": system_prompt or "",
                "model": model,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
            sort_keys=True,
        )
        return hashlib.sha256(key_data.encode()).hexdigest()

    def _get_cached(self, key: str) -> Optional[LLMResponse]:
        """Get a cached response if it exists and is not expired."""
        entry = self._cache.get(key)
        if entry is None:
            return None

        response, expiry = entry
        if time.time() > expiry:
            del self._cache[key]
            return None

        return response

    def _set_cached(
        self, key: str, response: LLMResponse, ttl: Optional[int] = None
    ) -> None:
        """Store a response in the cache with TTL."""
        effective_ttl = ttl if ttl is not None else self._default_ttl
        self._cache[key] = (response, time.time() + effective_ttl)

    def _cleanup_expired(self) -> None:
        """Remove expired entries. Called periodically to prevent unbounded growth."""
        now = time.time()
        expired_keys = [
            k for k, (_, expiry) in self._cache.items() if now > expiry
        ]
        for k in expired_keys:
            del self._cache[k]

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Generate response with caching support."""
        resolved_model = model or self._provider.default_model

        if self._cache_enabled:
            cache_key = self._make_cache_key(
                prompt, system_prompt, resolved_model, temperature, max_tokens
            )

            cached = self._get_cached(cache_key)
            if cached is not None:
                logger.debug(
                    f"Cache hit for LLM call (model={resolved_model})"
                )
                return cached

        # Generate from underlying provider
        response = await self._provider.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        if self._cache_enabled:
            self._set_cached(cache_key, response)
            logger.debug(f"Cached LLM response (model={resolved_model})")

            # Periodic cleanup (every 100 entries)
            if len(self._cache) > 100 and len(self._cache) % 50 == 0:
                self._cleanup_expired()

        return response

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        """Stream responses -- NOT cached (real-time requirement)."""
        async for chunk in self._provider.generate_stream(
            prompt=prompt,
            system_prompt=system_prompt,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        ):
            yield chunk

    async def generate_json(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
    ) -> dict:
        """Generate JSON response with caching support."""
        # Delegate to provider's native JSON mode if available
        if hasattr(self._provider, "generate_json"):
            resolved_model = model or self._provider.default_model

            if self._cache_enabled:
                cache_key = self._make_cache_key(
                    prompt,
                    system_prompt,
                    resolved_model,
                    0.1,
                    4096,
                )
                # Check for cached JSON (stored as LLMResponse with JSON content)
                cached = self._get_cached(cache_key)
                if cached is not None:
                    try:
                        return json.loads(cached.content)
                    except (json.JSONDecodeError, TypeError):
                        pass

            result = await self._provider.generate_json(
                prompt=prompt,
                system_prompt=system_prompt,
                model=model,
            )

            # Cache the JSON result as an LLMResponse
            if self._cache_enabled and result:
                response = LLMResponse(
                    content=json.dumps(result),
                    model=resolved_model,
                    provider_name=self._provider.name,
                )
                self._set_cached(cache_key, response)

            return result

        # Fallback to base class implementation
        return await super().generate_json(
            prompt=prompt,
            system_prompt=system_prompt,
            model=model,
        )

    async def close(self) -> None:
        """Release resources and clear cache."""
        self._cache.clear()
        await self._provider.close()

    @property
    def cache_size(self) -> int:
        """Current number of cached entries."""
        return len(self._cache)

    def clear_cache(self) -> None:
        """Manually clear all cached entries."""
        self._cache.clear()
        logger.debug("LLM cache cleared")


def wrap_with_cache(
    provider: BaseLLMProvider,
    enabled: bool = True,
    default_ttl: int = 3600,
) -> BaseLLMProvider:
    """
    Convenience function to wrap a provider with caching.

    Args:
        provider: The LLM provider to wrap.
        enabled: Whether caching is enabled.
        default_ttl: Default TTL in seconds (default: 1 hour).

    Returns:
        CachedLLMProvider wrapping the original, or the original if disabled.
    """
    if not enabled:
        return provider

    return CachedLLMProvider(
        provider=provider,
        cache_enabled=enabled,
        default_ttl=default_ttl,
    )
