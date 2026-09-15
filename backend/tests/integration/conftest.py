from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient
from pymongo.database import Database

from app.core.config import settings
from app.main import app

TEST_DB = "datahub_test"


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """Application démarrée sur une base de test, supprimée après chaque test."""
    # Remplacé avant le démarrage : le lifespan lit settings.mongo_db en ouvrant la base.
    monkeypatch.setattr(settings, "mongo_db", TEST_DB)
    with TestClient(app) as test_client:
        yield test_client
    with MongoClient[dict[str, object]](settings.mongo_uri) as mongo:
        mongo.drop_database(TEST_DB)


@pytest.fixture
def test_db() -> Iterator[Database[dict[str, object]]]:
    """Accès direct à la base de test, pour préparer ou vérifier des collections."""
    with MongoClient[dict[str, object]](settings.mongo_uri) as mongo:
        yield mongo[TEST_DB]
