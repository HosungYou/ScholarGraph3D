"""
Tests for bookmark CRUD endpoints in routers/bookmarks.py.

Run: pytest tests/test_routers/test_bookmarks.py -v
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


def _make_user(
    user_id: str = "00000000-0000-0000-0000-000000000001",
    email: str = "test@example.com",
) -> User:
    return User(
        id=user_id,
        email=email,
        email_confirmed=True,
        created_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
    )


def _make_row(
    bookmark_id: str = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    paper_id: str = "paper-1",
    tags: list | None = None,
    memo: str = "Important follow-up",
    paper_title: str | None = "Attention Is All You Need",
    paper_authors: list | None = None,
    paper_year: int | None = 2017,
    paper_venue: str | None = "NeurIPS",
    paper_citation_count: int = 50000,
    created_at: datetime | None = None,
    updated_at: datetime | None = None,
):
    if tags is None:
        tags = ["transformers"]
    if paper_authors is None:
        paper_authors = ["Ashish Vaswani", "Noam Shazeer"]
    if created_at is None:
        created_at = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
    if updated_at is None:
        updated_at = datetime(2024, 6, 2, 8, 30, 0, tzinfo=timezone.utc)

    row = {
        "id": bookmark_id,
        "paper_id": paper_id,
        "tags": tags,
        "memo": memo,
        "paper_title": paper_title,
        "paper_authors": paper_authors,
        "paper_year": paper_year,
        "paper_venue": paper_venue,
        "paper_citation_count": paper_citation_count,
        "created_at": created_at,
        "updated_at": updated_at,
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
async def test_create_bookmark_persists_display_metadata(test_client):
    mock_db = _make_db()
    mock_db.fetchrow = AsyncMock(return_value=_make_row())

    from auth.dependencies import get_current_user
    from database import get_db
    from main import app

    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.post(
            "/api/bookmarks",
            json={
                "paper_id": "paper-1",
                "tags": ["transformers"],
                "memo": "Important follow-up",
                "paper_title": "Attention Is All You Need",
                "paper_authors": ["Ashish Vaswani", "Noam Shazeer"],
                "paper_year": 2017,
                "paper_venue": "NeurIPS",
                "paper_citation_count": 50000,
            },
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 201
    data = response.json()
    assert data["paper_title"] == "Attention Is All You Need"
    assert data["paper_authors"] == ["Ashish Vaswani", "Noam Shazeer"]
    assert data["paper_year"] == 2017
    assert data["paper_venue"] == "NeurIPS"
    assert data["paper_citation_count"] == 50000


@pytest.mark.asyncio
async def test_list_bookmarks_returns_stored_metadata(test_client):
    mock_db = _make_db()
    mock_db.fetch = AsyncMock(return_value=[_make_row()])

    from auth.dependencies import get_current_user
    from database import get_db
    from main import app

    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.get(
            "/api/bookmarks",
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["paper_title"] == "Attention Is All You Need"
    assert data[0]["paper_authors"] == ["Ashish Vaswani", "Noam Shazeer"]
    assert data[0]["paper_venue"] == "NeurIPS"


@pytest.mark.asyncio
async def test_list_bookmarks_backfills_sparse_metadata_from_papers_table(test_client):
    sparse_row = _make_row(
        paper_title=None,
        paper_authors=[],
        paper_year=None,
        paper_venue=None,
        paper_citation_count=0,
    )

    paper_row = MagicMock()
    payload = {
        "title": "Backfilled Title",
        "authors": [{"name": "Author One"}, {"name": "Author Two"}],
        "year": 2022,
        "venue": "ICLR",
        "citation_count": 42,
    }
    paper_row.__getitem__ = lambda self, key: payload[key]

    mock_db = _make_db()
    mock_db.fetch = AsyncMock(return_value=[sparse_row])
    mock_db.fetchrow = AsyncMock(return_value=paper_row)

    from auth.dependencies import get_current_user
    from database import get_db
    from main import app

    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.get(
            "/api/bookmarks",
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data[0]["paper_title"] == "Backfilled Title"
    assert data[0]["paper_authors"] == ["Author One", "Author Two"]
    assert data[0]["paper_year"] == 2022
    assert data[0]["paper_venue"] == "ICLR"
    assert data[0]["paper_citation_count"] == 42
    assert mock_db.execute.await_count == 1


@pytest.mark.asyncio
async def test_update_bookmark_allows_metadata_backfill(test_client):
    mock_db = _make_db()
    mock_db.fetchrow = AsyncMock(
        side_effect=[
            {"id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"},
            _make_row(
                paper_title="Saved paper",
                paper_year=2024,
                paper_venue="ACL",
                paper_citation_count=12,
            ),
        ]
    )

    from auth.dependencies import get_current_user
    from database import get_db
    from main import app

    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.put(
            "/api/bookmarks/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            json={
                "paper_title": "Saved paper",
                "paper_year": 2024,
                "paper_venue": "ACL",
                "paper_citation_count": 12,
            },
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["paper_title"] == "Saved paper"
    assert data["paper_year"] == 2024
    assert data["paper_venue"] == "ACL"
    assert data["paper_citation_count"] == 12
