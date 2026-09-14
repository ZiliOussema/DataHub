import pytest
from fastapi.testclient import TestClient

from app.main import app

pytestmark = pytest.mark.integration


def test_health_is_ok_against_a_real_mongodb() -> None:
    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "mongo": "ok"}
