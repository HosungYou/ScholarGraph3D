"""
User LLM Provider Factory for ScholarGraph3D.

Simple factory: users provide provider name + API key in request.
No server-side key storage -- users bring their own keys.
"""

import logging
from typing import Optional

from .base import BaseLLMProvider
from .claude_provider import ClaudeProvider
from .openai_provider import OpenAIProvider
from .groq_provider import GroqProvider
from .gemini_provider import GeminiProvider

logger = logging.getLogger(__name__)

# Supported provider names mapped to their factory
_PROVIDER_FACTORIES = {
    "openai": lambda key: OpenAIProvider(api_key=key),
    "anthropic": lambda key: ClaudeProvider(api_key=key),
    "google": lambda key: GeminiProvider(api_key=key),
    "groq": lambda key: GroqProvider(api_key=key, requests_per_minute=28),
}

# Valid provider names for user-facing validation
SUPPORTED_PROVIDERS = list(_PROVIDER_FACTORIES.keys())


def create_llm_provider(
    provider_name: str,
    api_key: str,
) -> BaseLLMProvider:
    """
    Create an LLM provider instance.

    Args:
        provider_name: Provider name ('openai', 'anthropic', 'google', 'groq').
        api_key: API key for the provider.

    Returns:
        BaseLLMProvider instance.

    Raises:
        ValueError: If provider_name is unsupported or api_key is empty.
    """
    if not api_key or not api_key.strip():
        raise ValueError("API key is required")

    provider_name = provider_name.lower().strip()

    factory = _PROVIDER_FACTORIES.get(provider_name)
    if factory is None:
        raise ValueError(
            f"Unsupported provider '{provider_name}'. "
            f"Supported: {', '.join(SUPPORTED_PROVIDERS)}"
        )

    logger.info(f"Creating LLM provider: {provider_name}")
    return factory(api_key.strip())


def create_provider_from_request(
    provider: str,
    api_key: str,
) -> BaseLLMProvider:
    """
    Create an LLM provider from a request's provider and API key fields.

    Convenience wrapper around create_llm_provider for use in route handlers.

    Args:
        provider: Provider name from request header or body.
        api_key: API key from request header or body.

    Returns:
        BaseLLMProvider instance.

    Raises:
        ValueError: If provider or api_key is invalid.
    """
    if not provider:
        raise ValueError("LLM provider name is required")
    return create_llm_provider(provider_name=provider, api_key=api_key)


def create_provider_with_fallback(
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Optional[BaseLLMProvider]:
    """
    Create an LLM provider with fallback to server-side keys.

    Tries user-provided key first, then falls back to server env vars.

    Args:
        provider_name: Preferred provider name (optional).
        api_key: User-provided API key (optional).

    Returns:
        BaseLLMProvider instance or None if no keys available.
    """
    # Try user-provided key first
    if provider_name and api_key:
        try:
            return create_llm_provider(provider_name, api_key)
        except ValueError as e:
            logger.warning(f"Failed to create user provider: {e}")

    # Fallback to server-side keys
    try:
        from config import settings

        fallback_keys = {
            "groq": settings.groq_api_key,
            "openai": settings.openai_api_key,
            "anthropic": settings.anthropic_api_key,
            "google": settings.google_api_key,
        }

        # Use user's preferred provider with server key
        if provider_name:
            server_key = fallback_keys.get(provider_name.lower(), "")
            if server_key:
                return create_llm_provider(provider_name, server_key)

        # Use default provider from settings
        default_provider = getattr(settings, "default_llm_provider", "groq")
        default_key = fallback_keys.get(default_provider, "")
        if default_key:
            return create_llm_provider(default_provider, default_key)

        # Try any available server key
        for name, key in fallback_keys.items():
            if key:
                return create_llm_provider(name, key)

    except Exception as e:
        logger.warning(f"Failed to create fallback provider: {e}")

    return None
