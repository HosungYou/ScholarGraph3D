"""
Circuit Breaker Pattern for LLM Providers in ScholarGraph3D.

Prevents cascading failures when LLM services are unavailable.

States: CLOSED -> OPEN -> HALF_OPEN -> CLOSED
- CLOSED: Normal operation, requests pass through.
- OPEN: Blocking calls after failure_threshold reached.
- HALF_OPEN: Testing if service recovered with limited calls.
"""

import asyncio
import logging
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class CircuitState(Enum):
    """Circuit breaker states."""

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerOpenError(Exception):
    """Raised when circuit is open and calls are blocked."""

    pass


@dataclass
class CircuitBreakerConfig:
    """Configuration for circuit breaker behavior."""

    failure_threshold: int = 5
    recovery_timeout: float = 30.0
    success_threshold: int = 2


@dataclass
class _CircuitBreakerState:
    """Internal state tracking."""

    state: CircuitState = CircuitState.CLOSED
    failure_count: int = 0
    success_count: int = 0
    last_failure_time: float = 0.0
    half_open_calls: int = 0


class CircuitBreaker:
    """
    Circuit breaker for protecting LLM calls.

    Usage:
        breaker = CircuitBreaker(name="openai")
        result = await breaker.call(provider.generate, prompt="Hello")

    Configuration:
        - failure_threshold: Failures before opening (default: 5).
        - recovery_timeout: Seconds before trying again (default: 30).
        - success_threshold: Successes to close from half-open (default: 2).
    """

    def __init__(
        self,
        name: str,
        config: CircuitBreakerConfig = None,
    ):
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self._state = _CircuitBreakerState()
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        """Current circuit state."""
        return self._state.state

    @property
    def is_closed(self) -> bool:
        return self._state.state == CircuitState.CLOSED

    @property
    def is_open(self) -> bool:
        return self._state.state == CircuitState.OPEN

    async def call(
        self,
        func: Callable[..., Any],
        *args,
        **kwargs,
    ) -> T:
        """
        Execute function with circuit breaker protection.

        Args:
            func: Async function to call.
            *args, **kwargs: Arguments to pass to function.

        Returns:
            Result from function.

        Raises:
            CircuitBreakerOpenError: If circuit is open.
            Exception: If function raises and circuit stays closed.
        """
        async with self._lock:
            await self._check_state_transition()

        if self._state.state == CircuitState.OPEN:
            logger.warning(
                f"Circuit breaker '{self.name}' is OPEN, blocking call"
            )
            raise CircuitBreakerOpenError(
                f"Circuit breaker '{self.name}' is open. "
                f"Service may be unavailable."
            )

        try:
            result = await func(*args, **kwargs)
            await self._on_success()
            return result
        except Exception as e:
            await self._on_failure(e)
            raise

    async def _check_state_transition(self) -> None:
        """Check if state should transition based on time."""
        if self._state.state == CircuitState.OPEN:
            elapsed = time.time() - self._state.last_failure_time
            if elapsed >= self.config.recovery_timeout:
                logger.info(
                    f"Circuit breaker '{self.name}' "
                    f"transitioning to HALF_OPEN"
                )
                self._state.state = CircuitState.HALF_OPEN
                self._state.half_open_calls = 0
                self._state.success_count = 0

    async def _on_success(self) -> None:
        """Handle successful call."""
        async with self._lock:
            self._state.failure_count = 0

            if self._state.state == CircuitState.HALF_OPEN:
                self._state.success_count += 1
                if (
                    self._state.success_count
                    >= self.config.success_threshold
                ):
                    logger.info(
                        f"Circuit breaker '{self.name}' "
                        f"transitioning to CLOSED"
                    )
                    self._state.state = CircuitState.CLOSED

    async def _on_failure(self, error: Exception) -> None:
        """Handle failed call."""
        async with self._lock:
            self._state.failure_count += 1
            self._state.last_failure_time = time.time()

            logger.warning(
                f"Circuit breaker '{self.name}' failure "
                f"{self._state.failure_count}/"
                f"{self.config.failure_threshold}: {error}"
            )

            if self._state.state == CircuitState.HALF_OPEN:
                logger.warning(
                    f"Circuit breaker '{self.name}' "
                    f"transitioning to OPEN (failed in half-open)"
                )
                self._state.state = CircuitState.OPEN
            elif (
                self._state.failure_count >= self.config.failure_threshold
            ):
                logger.warning(
                    f"Circuit breaker '{self.name}' "
                    f"transitioning to OPEN"
                )
                self._state.state = CircuitState.OPEN

    def reset(self) -> None:
        """Reset circuit breaker to initial state (for testing)."""
        self._state = _CircuitBreakerState()


# Singleton registry of circuit breakers per provider name
_circuit_breakers: dict[str, CircuitBreaker] = {}


def get_circuit_breaker(name: str) -> CircuitBreaker:
    """
    Get or create a circuit breaker for a provider.

    Args:
        name: Provider name (e.g., 'openai', 'anthropic').

    Returns:
        CircuitBreaker singleton for that provider name.
    """
    if name not in _circuit_breakers:
        _circuit_breakers[name] = CircuitBreaker(
            name=name,
            config=CircuitBreakerConfig(
                failure_threshold=5,
                recovery_timeout=30.0,
                success_threshold=2,
            ),
        )
    return _circuit_breakers[name]


def reset_all_circuit_breakers() -> None:
    """Reset all circuit breakers (for testing)."""
    for breaker in _circuit_breakers.values():
        breaker.reset()
