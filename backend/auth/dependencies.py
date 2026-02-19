"""
Authentication dependencies for FastAPI.
"""

import logging
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from .supabase_client import supabase_client, verify_jwt
from .models import User

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> User:
    """Get the current authenticated user. Raises 401 if not authenticated."""
    if not supabase_client.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service not configured",
        )

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_data = await verify_jwt(credentials.credentials)

    if not user_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return User(
        id=user_data["id"],
        email=user_data["email"],
        email_confirmed=user_data["email_confirmed"],
        created_at=user_data.get("created_at"),
        full_name=user_data.get("user_metadata", {}).get("full_name"),
        avatar_url=user_data.get("user_metadata", {}).get("avatar_url"),
    )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[User]:
    """Get the current user if authenticated, None otherwise."""
    if not supabase_client.is_configured():
        return None

    if not credentials:
        return None

    user_data = await verify_jwt(credentials.credentials)

    if not user_data:
        return None

    return User(
        id=user_data["id"],
        email=user_data["email"],
        email_confirmed=user_data["email_confirmed"],
        created_at=user_data.get("created_at"),
        full_name=user_data.get("user_metadata", {}).get("full_name"),
        avatar_url=user_data.get("user_metadata", {}).get("avatar_url"),
    )


def require_auth(user: User = Depends(get_current_user)) -> User:
    """Dependency that requires authentication."""
    return user
