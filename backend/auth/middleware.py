"""
Authentication middleware for ScholarGraph3D.

Enforces auth policies at request level based on centralized policy config.
"""

import logging
from typing import Optional

from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from .policies import get_auth_level, AuthLevel
from .supabase_client import verify_jwt

logger = logging.getLogger(__name__)


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware that enforces authentication policies at the request level.

    Checks auth policy for the route, validates JWT if present,
    and attaches user info to request.state.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        path = request.url.path
        method = request.method

        # Skip OPTIONS requests (CORS preflight)
        if method == "OPTIONS":
            return await call_next(request)

        auth_level = get_auth_level(path)

        # Initialize user state
        request.state.user = None
        request.state.user_id = None

        # NONE level — no authentication needed
        if auth_level == AuthLevel.NONE:
            return await call_next(request)

        # Extract token from Authorization header
        auth_header = request.headers.get("Authorization")
        token = None
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]

        # Verify token if present
        user_data = None
        if token:
            try:
                user_data = await verify_jwt(token)
                if user_data:
                    request.state.user = user_data
                    request.state.user_id = user_data.get("id")
            except Exception as e:
                logger.warning(f"Token verification failed: {e}")

        # Enforce REQUIRED auth
        if auth_level == AuthLevel.REQUIRED and not user_data:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "detail": "Invalid or expired token" if token else "Authentication required"
                },
                headers={"WWW-Authenticate": "Bearer"},
            )

        return await call_next(request)
