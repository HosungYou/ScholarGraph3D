"""
Configuration management for ScholarGraph3D backend.
"""

import os
from functools import lru_cache
from typing import List, Literal, Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str = "postgresql://localhost:5432/scholargraph3d"

    # Supabase Auth
    supabase_url: str = ""
    supabase_key: str = ""  # Anon key
    supabase_jwt_secret: str = ""

    # Semantic Scholar API
    s2_api_key: str = ""  # Optional: for higher rate limits (1 RPS authenticated)
    s2_rate_limit: float = 1.0  # Requests per second (authenticated)

    # OpenAlex API
    oa_api_key: str = ""  # For premium access (100K credits/day)
    oa_email: str = ""  # For polite pool access (higher rate limits)
    oa_daily_credit_limit: int = 100000

    # Redis (Upstash)
    redis_url: str = ""

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:3001"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    # Security
    require_auth: bool = True
    environment: Literal["development", "staging", "production"] = "development"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins into list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
