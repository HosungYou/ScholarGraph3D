"""
Tests for recommendation feedback endpoints.

Run: pytest tests/test_routers/test_recommendation_feedback.py -v
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from auth.models import User


_FAKE_USER_DATA = {
    "id": "00000000-0000-0000-0000-000000000001",
    "email": "test@example.com",
    "email_confirmed": True,
    "created_at": datetime(2024, 1, 1, tzinfo=timezone.utc),
}


def _make_user() -> User:
    return User(
        id="00000000-0000-0000-0000-000000000001",
        email="test@example.com",
        email_confirmed=True,
        created_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
    )


def _make_row(
    feedback_id: str = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    source_paper_id: str = "seed-paper",
    candidate_paper_id: str = "candidate-paper",
    feedback: str = "relevant",
):
    row = {
        "id": feedback_id,
        "source_paper_id": source_paper_id,
        "candidate_paper_id": candidate_paper_id,
        "feedback": feedback,
        "created_at": datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2024, 6, 2, 8, 30, 0, tzinfo=timezone.utc),
    }
    mock_row = MagicMock()
    mock_row.__getitem__ = lambda self, key: row[key]
    return mock_row


def _make_db(connected: bool = True) -> AsyncMock:
    db = AsyncMock()
    db.is_connected = connected
    db.fetch = AsyncMock(return_value=[])
    db.fetchrow = AsyncMock(return_value=None)
    db.execute = AsyncMock(return_value="DELETE 1")
    return db


@pytest.mark.asyncio
async def test_list_recommendation_feedback_returns_rows(test_client):
    mock_db = _make_db()
    mock_db.fetch = AsyncMock(return_value=[_make_row()])

    from auth.dependencies import get_current_user
    from database import get_db
    from main import app

    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.get(
            "/api/recommendation-feedback?source_paper_id=seed-paper",
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["feedback"] == "relevant"


@pytest.mark.asyncio
async def test_upsert_recommendation_feedback_returns_saved_row(test_client):
    mock_db = _make_db()
    mock_db.fetchrow = AsyncMock(return_value=_make_row())

    from auth.dependencies import get_current_user
    from database import get_db
    from main import app

    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.post(
            "/api/recommendation-feedback",
            json={
                "source_paper_id": "seed-paper",
                "candidate_paper_id": "candidate-paper",
                "feedback": "relevant",
            },
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["candidate_paper_id"] == "candidate-paper"


@pytest.mark.asyncio
async def test_delete_recommendation_feedback_returns_404_when_missing(test_client):
    mock_db = _make_db()
    mock_db.execute = AsyncMock(return_value="DELETE 0")

    from auth.dependencies import get_current_user
    from database import get_db
    from main import app

    app.dependency_overrides[get_current_user] = lambda: _make_user()
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.delete(
            "/api/recommendation-feedback?source_paper_id=seed-paper&candidate_paper_id=missing-paper",
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 404
