"""
Supabase client initialization for ScholarGraph3D.
"""

import logging
from typing import Optional

from supabase import create_client, Client

logger = logging.getLogger(__name__)


class SupabaseClient:
    """Singleton wrapper for Supabase client."""

    _client: Optional[Client] = None
    _url: Optional[str] = None
    _key: Optional[str] = None

    @classmethod
    def initialize(cls, url: str, key: str) -> None:
        """Initialize the Supabase client."""
        if not url or not key:
            logger.warning("Supabase credentials not provided. Auth will be disabled.")
            return

        cls._url = url
        cls._key = key
        cls._client = create_client(url, key)
        logger.info(f"Supabase client initialized: {url[:30]}...")

    @classmethod
    def get_client(cls) -> Optional[Client]:
        return cls._client

    @classmethod
    def is_configured(cls) -> bool:
        return cls._client is not None


supabase_client = SupabaseClient()


def get_supabase() -> Optional[Client]:
    """Dependency to get Supabase client."""
    return supabase_client.get_client()


async def verify_jwt(token: str) -> Optional[dict]:
    """
    Verify a JWT token with Supabase.

    Returns user data dict if valid, None otherwise.
    """
    client = supabase_client.get_client()
    if not client:
        return None

    try:
        response = client.auth.get_user(token)
        if response and response.user:
            return {
                "id": response.user.id,
                "email": response.user.email,
                "email_confirmed": response.user.email_confirmed_at is not None,
                "created_at": response.user.created_at,
                "user_metadata": response.user.user_metadata or {},
            }
    except Exception as e:
        logger.warning(f"JWT verification failed: {e}")

    return None
