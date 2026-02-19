"""
Centralized authentication policy configuration for ScholarGraph3D.

Simplified policy: search/papers = PUBLIC, graphs = REQUIRED auth.
"""

import fnmatch
import logging
from enum import Enum
from typing import List, Set, Tuple

logger = logging.getLogger(__name__)


class AuthLevel(str, Enum):
    NONE = "none"
    OPTIONAL = "optional"
    REQUIRED = "required"


PUBLIC_PATHS: Set[str] = {
    "/",
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
}

AUTH_POLICIES: List[Tuple[str, AuthLevel]] = [
    # Auth routes — no auth for login/signup
    ("/api/auth/signup", AuthLevel.NONE),
    ("/api/auth/login", AuthLevel.NONE),
    ("/api/auth/refresh", AuthLevel.NONE),
    ("/api/auth/me", AuthLevel.REQUIRED),
    ("/api/auth/logout", AuthLevel.REQUIRED),

    # Search and papers — public access
    ("/api/search", AuthLevel.NONE),
    ("/api/papers", AuthLevel.NONE),
    ("/api/papers/*", AuthLevel.NONE),

    # Graphs — require authentication
    ("/api/graphs", AuthLevel.REQUIRED),
    ("/api/graphs/*", AuthLevel.REQUIRED),
]


def _match_pattern(pattern: str, path: str) -> bool:
    if pattern == path:
        return True
    if pattern.endswith("/*"):
        prefix = pattern[:-1]
        if path.startswith(prefix) or path == prefix[:-1]:
            return True
    if "*" in pattern:
        return fnmatch.fnmatch(path, pattern)
    return False


def get_auth_level(path: str) -> AuthLevel:
    """Get the authentication level required for a given path."""
    path = path.rstrip("/")
    if not path:
        path = "/"

    if path in PUBLIC_PATHS:
        return AuthLevel.NONE

    best_match = None
    best_specificity = -1

    for pattern, level in AUTH_POLICIES:
        if _match_pattern(pattern, path):
            specificity = len(pattern) - pattern.count("*") * 5
            if specificity > best_specificity:
                best_specificity = specificity
                best_match = level

    if best_match is not None:
        return best_match

    return AuthLevel.OPTIONAL
