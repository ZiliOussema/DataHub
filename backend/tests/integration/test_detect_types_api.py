import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from pymongo.database import Database

pytestmark = pytest.mark.integration

UNKNOWN_ID = "0123456789abcdef01234567"
CSV = "Nom;Code postal;Montant;Actif\nÉlodie;00123;12,50;oui\nFarid;75001;;non\n".encode()


def create_import(client: TestClient) -> str:
    """Crée un import par l'API et renvoie son identifiant."""
    return str(client.post("/api/imports", json={"name": "Ventes"}).json()["id"])


def detect(client: TestClient, import_id: str, content: bytes) -> Response:
    """Envoie un CSV à la détection des types et renvoie la réponse brute."""
    response: Response = client.post(
        f"/api/imports/{import_id}/detect-types", files={"file": ("ventes.csv", content)}
    )
    return response


def test_detect_types_returns_the_typed_columns(client: TestClient) -> None:
    response = detect(client, create_import(client), CSV)

    assert response.status_code == 200
    assert response.json() == [
        {"label": "Nom", "key": "nom", "type": "string"},
        {"label": "Code postal", "key": "code_postal", "type": "string"},
        {"label": "Montant", "key": "montant", "type": "float"},
        {"label": "Actif", "key": "actif", "type": "boolean"},
    ]


def test_detect_types_on_an_unknown_import_returns_404(client: TestClient) -> None:
    assert detect(client, UNKNOWN_ID, CSV).status_code == 404


def test_an_unusable_file_returns_422_and_leaves_no_temporary_file(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(tempfile, "tempdir", str(tmp_path))

    response = detect(client, create_import(client), b"a,b\n1,2,3\n")

    assert response.status_code == 422
    assert "ligne 2" in response.json()["detail"]
    assert list(tmp_path.iterdir()) == []


def test_detection_stores_nothing(client: TestClient, test_db: Database[dict[str, object]]) -> None:
    detect(client, create_import(client), CSV)

    assert test_db.list_collection_names() == ["imports"]
    assert client.get("/api/imports").json()[0]["status"] == "empty"
