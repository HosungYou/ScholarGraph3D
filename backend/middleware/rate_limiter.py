"""
IP-based rate limiter for ScholarGraph3D.

Limits API abuse without Redis (in-memory with sliding window).
Falls back to no-op if Redis is not configured.

Limits:
- Regular search: 60 requests/hour per IP
- AI/natural search: 20 requests/hour per IP
- Authenticated users: 2x limits
"""

import logging
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional, Tuple

from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)


class SlidingWindowRateLimiter:
    """In-memory sliding window rate limiter."""

    def __init__(self):
        # {ip: deque of timestamps}
        self._windows: Dict[str, Deque[float]] = defaultdict(deque)
        self._last_cleanup = time.time()

    def is_allowed(
        self,
        key: str,
        limit: int,
        window_seconds: int = 3600,
    ) -> Tuple[bool, int]:
        """
        Check if request is allowed under the rate limit.

        Args:
            key: Rate limit key (e.g., IP address)
            limit: Maximum requests in window
            window_seconds: Window size in seconds

        Returns:
            (allowed: bool, remaining: int)
        """
        now = time.time()
        window_start = now - window_seconds

        # Cleanup old entries periodically
        if now - self._last_cleanup > 300:  # every 5 minutes
            self._cleanup(window_start)
            self._last_cleanup = now

        window = self._windows[key]

        # Remove expired entries
        while window and window[0] < window_start:
            window.popleft()

        count = len(window)
        if count >= limit:
            return False, 0

        window.append(now)
        return True, limit - count - 1

    def _cleanup(self, cutoff: float) -> None:
        """Remove all entries older than cutoff."""
        keys_to_delete = []
        for key, window in self._windows.items():
            while window and window[0] < cutoff:
                window.popleft()
            if not window:
                keys_to_delete.append(key)
        for key in keys_to_delete:
            del self._windows[key]


# Global rate limiter instance
_limiter = SlidingWindowRateLimiter()

# Rate limits
SEARCH_LIMIT_PER_HOUR = 60
AI_SEARCH_LIMIT_PER_HOUR = 20
AUTHENTICATED_MULTIPLIER = 2


def get_client_ip(request: Request) -> str:
    """Extract client IP from request headers."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    if request.client:
        return request.client.host
    return "unknown"


async def check_rate_limit(
    request: Request,
    endpoint_type: str = "search",
    is_authenticated: bool = False,
) -> None:
    """
    Check rate limit for a request. Raises HTTP 429 if exceeded.

    Args:
        request: FastAPI request
        endpoint_type: "search" or "ai_search"
        is_authenticated: Whether user is authenticated (2x limit)
    """
    ip = get_client_ip(request)
    multiplier = AUTHENTICATED_MULTIPLIER if is_authenticated else 1

    if endpoint_type == "ai_search":
        limit = AI_SEARCH_LIMIT_PER_HOUR * multiplier
        key = f"ai:{ip}"
    else:
        limit = SEARCH_LIMIT_PER_HOUR * multiplier
        key = f"search:{ip}"

    allowed, remaining = _limiter.is_allowed(key, limit, window_seconds=3600)

    if not allowed:
        logger.warning(f"Rate limit exceeded for IP {ip} on {endpoint_type}")
        raise HTTPException(
            status_code=429,
            detail={
                "error": "Rate limit exceeded",
                "message": f"Too many requests. Limit: {limit}/hour.",
                "retry_after": 3600,
            },
            headers={"Retry-After": "3600"},
        )

    # Log when approaching limit
    if remaining < 5:
        logger.info(f"IP {ip} approaching {endpoint_type} rate limit: {remaining} remaining")
