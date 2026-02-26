"""
Tests for graph CRUD endpoints in routers/graphs.py.

Endpoints under test:
  GET    /api/graphs            → list_graphs
  POST   /api/graphs            → create_graph
  GET    /api/graphs/{graph_id} → get_graph
  DELETE /api/graphs/{graph_id} → delete_graph

Covers:
- test_list_graphs_empty: authenticated user with no saved graphs → []
- test_list_graphs_db_disconnected: DB not available → 503
- test_create_graph_with_graph_data: graph_data nodes drive paper_count
- test_create_graph_minimal: name only, no optional fields
- test_get_graph_with_graph_data: returns GraphDetail with graph_data
- test_get_graph_not_found: wrong id/user → 404
- test_delete_graph: returns 204 on success
- test_delete_graph_not_found: non-existent graph → 404
- test_list_graphs_unauthenticated: no auth header → 401 or 403

Run: pytest tests/test_routers/test_graphs.py -v
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from auth.models import User


# ==================== Helpers ====================

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
    """Build a minimal User fixture for dependency override."""
    return User(
        id=user_id,
        email=email,
        email_confirmed=True,
        created_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
    )


def _make_db_row(
    graph_id: str = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    name: str = "My Test Graph",
    seed_query: str = "transformer attention",
    paper_ids: list = None,
    layout_state: dict = None,
    graph_data: dict = None,
    created_at: datetime = None,
    updated_at: datetime = None,
) -> dict:
    """Build a dict that mimics an asyncpg Record row for user_graphs."""
    if paper_ids is None:
        paper_ids = ["p1", "p2", "p3"]
    if created_at is None:
        created_at = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
    if updated_at is None:
        updated_at = datetime(2024, 6, 2, 8, 30, 0, tzinfo=timezone.utc)

    row = {
        "id": graph_id,
        "name": name,
        "seed_query": seed_query,
        "paper_ids": paper_ids,
        "layout_state": layout_state,
        "graph_data": graph_data,
        "created_at": created_at,
        "updated_at": updated_at,
    }
    # Make it subscriptable like asyncpg Record
    mock_row = MagicMock()
    mock_row.__getitem__ = lambda self, key: row[key]
    mock_row.get = lambda key, default=None: row.get(key, default)
    return mock_row


def _make_db(connected: bool = True) -> AsyncMock:
    """Build a minimal mock Database."""
    db = AsyncMock()
    db.is_connected = connected
    db.fetch = AsyncMock(return_value=[])
    db.fetchrow = AsyncMock(return_value=None)
    db.execute = AsyncMock(return_value="DELETE 1")
    return db


# ==================== List Graphs ====================

@pytest.mark.asyncio
async def test_list_graphs_empty(test_client):
    """Authenticated user with no saved graphs → 200 with empty list."""
    mock_db = _make_db()
    mock_db.fetch = AsyncMock(return_value=[])

    from main import app
    from auth.dependencies import get_current_user
    from database import get_db

    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.get(
            "/api/graphs",
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_list_graphs_returns_summary_fields(test_client):
    """List endpoint returns GraphSummary fields (id, name, paper_count, etc.)."""
    row = _make_db_row(
        graph_id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        name="NLP Graph",
        seed_query="bert transformers",
        paper_ids=["p1", "p2"],
        graph_data=None,
    )

    mock_db = _make_db()
    mock_db.fetch = AsyncMock(return_value=[row])

    from main import app
    from auth.dependencies import get_current_user
    from database import get_db

    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.get(
            "/api/graphs",
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1

    summary = data[0]
    assert summary["id"] == "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    assert summary["name"] == "NLP Graph"
    assert summary["seed_query"] == "bert transformers"
    assert "paper_count" in summary
    assert summary["paper_count"] == 2  # falls back to len(paper_ids)
    assert "created_at" in summary
    assert "updated_at" in summary


@pytest.mark.asyncio
async def test_list_graphs_db_disconnected(test_client):
    """DB not connected → 503 Service Unavailable."""
    mock_db = _make_db(connected=False)

    from main import app
    from auth.dependencies import get_current_user
    from database import get_db

    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.get(
            "/api/graphs",
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 503


# ==================== Create Graph ====================

@pytest.mark.asyncio
async def test_create_graph_with_graph_data(test_client):
    """Create graph with graph_data containing nodes → paper_count from nodes length."""
    graph_data_payload = {
        "nodes": [{"id": "p1"}, {"id": "p2"}, {"id": "p3"}],
        "links": [],
    }

    returned_row = _make_db_row(
        graph_id="11111111-2222-3333-4444-555555555555",
        name="Research Graph",
        seed_query="neural networks",
        paper_ids=[],
        graph_data=graph_data_payload,
    )

    mock_db = _make_db()
    mock_db.fetchrow = AsyncMock(return_value=returned_row)

    from main import app
    from auth.dependencies import get_current_user
    from database import get_db

    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.post(
            "/api/graphs",
            json={
                "name": "Research Graph",
                "seed_query": "neural networks",
                "paper_ids": [],
                "graph_data": graph_data_payload,
            },
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 201
    data = response.json()

    assert data["id"] == "11111111-2222-3333-4444-555555555555"
    assert data["name"] == "Research Graph"
    assert data["paper_count"] == 3  # 3 nodes in graph_data
    assert data["graph_data"] == graph_data_payload
    assert "paper_ids" in data
    assert "created_at" in data
    assert "updated_at" in data


@pytest.mark.asyncio
async def test_create_graph_minimal(test_client):
    """Create graph with only required field (name) → 201."""
    returned_row = _make_db_row(
        graph_id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        name="Minimal Graph",
        seed_query=None,
        paper_ids=[],
        graph_data=None,
    )

    mock_db = _make_db()
    mock_db.fetchrow = AsyncMock(return_value=returned_row)

    from main import app
    from auth.dependencies import get_current_user
    from database import get_db

    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.post(
            "/api/graphs",
            json={"name": "Minimal Graph"},
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Minimal Graph"
    assert data["paper_count"] == 0
    assert data["seed_query"] is None


@pytest.mark.asyncio
async def test_create_graph_missing_name(test_client):
    """Missing required 'name' field → 422."""
    mock_db = _make_db()

    from main import app
    from auth.dependencies import get_current_user
    from database import get_db

    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.post(
            "/api/graphs",
            json={"seed_query": "transformers"},
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 422


# ==================== Get Graph ====================

@pytest.mark.asyncio
async def test_get_graph_with_graph_data(test_client):
    """GET /api/graphs/{id} returns GraphDetail including graph_data."""
    graph_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    graph_data = {"nodes": [{"id": "p1"}, {"id": "p2"}], "links": []}

    row = _make_db_row(
        graph_id=graph_id,
        name="Detail Graph",
        seed_query="attention mechanism",
        paper_ids=["p1", "p2"],
        graph_data=graph_data,
    )

    mock_db = _make_db()
    mock_db.fetchrow = AsyncMock(return_value=row)

    from main import app
    from auth.dependencies import get_current_user
    from database import get_db

    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.get(
            f"/api/graphs/{graph_id}",
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()

    assert data["id"] == graph_id
    assert data["name"] == "Detail Graph"
    assert data["graph_data"] == graph_data
    assert data["paper_count"] == 2  # 2 nodes in graph_data
    assert isinstance(data["paper_ids"], list)
    assert "layout_state" in data


@pytest.mark.asyncio
async def test_get_graph_not_found(test_client):
    """GET with non-existent graph_id → 404 Not Found."""
    mock_db = _make_db()
    mock_db.fetchrow = AsyncMock(return_value=None)  # no row found

    from main import app
    from auth.dependencies import get_current_user
    from database import get_db

    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.get(
            "/api/graphs/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_graph_paper_count_from_paper_ids_fallback(test_client):
    """When graph_data is None, paper_count falls back to len(paper_ids)."""
    graph_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    row = _make_db_row(
        graph_id=graph_id,
        name="Fallback Graph",
        paper_ids=["p1", "p2", "p3", "p4"],
        graph_data=None,
    )

    mock_db = _make_db()
    mock_db.fetchrow = AsyncMock(return_value=row)

    from main import app
    from auth.dependencies import get_current_user
    from database import get_db

    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.get(
            f"/api/graphs/{graph_id}",
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["paper_count"] == 4


# ==================== Delete Graph ====================

@pytest.mark.asyncio
async def test_delete_graph(test_client):
    """DELETE /api/graphs/{id} returns 204 No Content on success."""
    graph_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    mock_db = _make_db()
    mock_db.execute = AsyncMock(return_value="DELETE 1")

    from main import app
    from auth.dependencies import get_current_user
    from database import get_db

    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.delete(
            f"/api/graphs/{graph_id}",
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 204
    assert response.content == b""  # no body on 204


@pytest.mark.asyncio
async def test_delete_graph_not_found(test_client):
    """DELETE non-existent graph → 404 Not Found."""
    graph_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    mock_db = _make_db()
    mock_db.execute = AsyncMock(return_value="DELETE 0")  # 0 rows deleted

    from main import app
    from auth.dependencies import get_current_user
    from database import get_db

    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.delete(
            f"/api/graphs/{graph_id}",
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_delete_graph_db_disconnected(test_client):
    """DELETE when DB disconnected → 503."""
    mock_db = _make_db(connected=False)

    from main import app
    from auth.dependencies import get_current_user
    from database import get_db

    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("auth.middleware.verify_jwt", return_value=_FAKE_USER_DATA):
        response = await test_client.delete(
            "/api/graphs/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            headers={"Authorization": "Bearer fake-token"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 503
