import asyncio
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pymongo.errors import ServerSelectionTimeoutError

from app.core.database import mongo_is_up, ping
from app.main import app


@pytest.fixture
def client() -> Iterator[TestClient]:
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_health_returns_200_when_mongo_answers(client: TestClient) -> None:
    app.dependency_overrides[mongo_is_up] = lambda: True

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "mongo": "ok"}


def test_health_returns_503_when_mongo_is_unreachable(client: TestClient) -> None:
    app.dependency_overrides[mongo_is_up] = lambda: False

    response = client.get("/api/health")

    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "mongo": "unreachable"}


class _DownDatabase:
    async def command(self, name: str) -> None:
        raise ServerSelectionTimeoutError("injoignable")


class _UpDatabase:
    async def command(self, name: str) -> dict[str, float]:
        return {"ok": 1.0}


def test_ping_is_false_when_mongo_raises() -> None:
    assert asyncio.run(ping(_DownDatabase())) is False  # type: ignore[arg-type]


def test_ping_is_true_when_mongo_answers() -> None:
    assert asyncio.run(ping(_UpDatabase())) is True  # type: ignore[arg-type]
