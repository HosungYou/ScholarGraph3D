"""
Base LLM Provider Interface for ScholarGraph3D.

Abstract interface for LLM providers (OpenAI, Anthropic, Google, Groq).
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator, Optional


@dataclass
class LLMResponse:
    """Response from an LLM provider."""

    content: str
    model: str
    tokens_used: int = 0
    provider_name: str = ""


class BaseLLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name (e.g., 'openai', 'anthropic', 'google', 'groq')."""
        pass

    @property
    @abstractmethod
    def default_model(self) -> str:
        """Default model to use."""
        pass

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """
        Generate a response from the LLM.

        Args:
            prompt: User prompt.
            system_prompt: Optional system prompt.
            model: Specific model to use (overrides default).
            temperature: Sampling temperature (0-1).
            max_tokens: Maximum tokens in response.

        Returns:
            LLMResponse with content, model, tokens_used, provider_name.
        """
        pass

    @abstractmethod
    async def generate_stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        """
        Generate a streaming response from the LLM.

        Yields:
            Chunks of generated text.
        """
        pass

    async def generate_json(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
    ) -> dict:
        """
        Generate a JSON response.

        Default implementation calls generate() and parses JSON.
        Subclasses can override for native JSON mode support.
        """
        import json

        response = await self.generate(
            prompt=prompt,
            system_prompt=system_prompt,
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

    async def close(self) -> None:
        """Release client resources. Called during application shutdown."""
        pass
