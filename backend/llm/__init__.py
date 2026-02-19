"""Multi-provider LLM module for ScholarGraph3D."""

from .base import BaseLLMProvider, LLMResponse
from .openai_provider import OpenAIProvider
from .claude_provider import ClaudeProvider
from .gemini_provider import GeminiProvider
from .groq_provider import GroqProvider, AsyncRateLimiter
from .cached_provider import CachedLLMProvider, wrap_with_cache
from .circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitBreakerOpenError,
    CircuitState,
    get_circuit_breaker,
    reset_all_circuit_breakers,
)
from .user_provider import (
    create_llm_provider,
    create_provider_from_request,
    create_provider_with_fallback,
    SUPPORTED_PROVIDERS,
)

__all__ = [
    # Base
    "BaseLLMProvider",
    "LLMResponse",
    # Providers
    "OpenAIProvider",
    "ClaudeProvider",
    "GeminiProvider",
    "GroqProvider",
    "AsyncRateLimiter",
    # Caching
    "CachedLLMProvider",
    "wrap_with_cache",
    # Circuit Breaker
    "CircuitBreaker",
    "CircuitBreakerConfig",
    "CircuitBreakerOpenError",
    "CircuitState",
    "get_circuit_breaker",
    "reset_all_circuit_breakers",
    # Factory
    "create_llm_provider",
    "create_provider_from_request",
    "create_provider_with_fallback",
    "SUPPORTED_PROVIDERS",
]
