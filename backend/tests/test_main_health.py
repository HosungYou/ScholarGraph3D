"""
Tests for backend health endpoints in main.py.

Focus:
- `/health` remains 200 when DB is unavailable
- response reports degraded memory-only mode instead of failing readiness
"""

from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_health_reports_degraded_without_db(test_client):
    """Health should stay 200 in memory-only mode so deploys do not flap."""
    with (
        patch(
            "main.db.get_health_snapshot",
            AsyncMock(return_value={"db_ok": False, "pgvector_ok": False}),
        ),
        patch("main.supabase_client.is_configured", return_value=False),
    ):
        response = await test_client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "degraded"
    assert data["database"] == "disconnected"
    assert data["persistence"] == "memory-only"
