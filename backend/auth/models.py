"""
Authentication models for ScholarGraph3D.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    """Base user model."""
    email: EmailStr


class UserCreate(UserBase):
    """User creation model."""
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None


class UserLogin(UserBase):
    """User login model."""
    password: str


class User(UserBase):
    """User model returned from auth."""
    id: str
    email_confirmed: bool = False
    created_at: Optional[datetime] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """Token response model."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: User


class RefreshTokenRequest(BaseModel):
    """Refresh token request model."""
    refresh_token: str
