"""
Authentication module for ScholarGraph3D.

Uses Supabase Auth for user management and JWT verification.
Simplified from ScholaRAG_Graph: search/papers = PUBLIC, graphs = REQUIRED auth.
"""

from .supabase_client import supabase_client, get_supabase, verify_jwt
from .dependencies import (
    get_current_user,
    get_optional_user,
    require_auth,
)
from .models import User, UserCreate, TokenResponse
from .policies import AuthLevel, get_auth_level, PUBLIC_PATHS, AUTH_POLICIES
from .middleware import AuthMiddleware

__all__ = [
    "supabase_client",
    "get_supabase",
    "verify_jwt",
    "get_current_user",
    "get_optional_user",
    "require_auth",
    "User",
    "UserCreate",
    "TokenResponse",
    "AuthLevel",
    "get_auth_level",
    "PUBLIC_PATHS",
    "AUTH_POLICIES",
    "AuthMiddleware",
]
