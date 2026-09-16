import tempfile
from datetime import UTC, datetime
from pathlib import Path

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from httpx import Response
from pymongo.database import Database

from app.core.config import settings
from app.main import app

pytestmark = pytest.mark.integration

UNKNOWN_ID = "0123456789abcdef01234567"
CSV = "Nom;Montant;Actif\nÉlodie;12,50;oui\nFarid;;non\n".encode()
Db = Database[dict[str, object]]


def create_import(client: TestClient) -> str:
    """Crée un import par l'API et renvoie son identifiant."""
    return str(client.post("/api/imports", json={"name": "Ventes"}).json()["id"])


def upload(client: TestClient, import_id: str, content: bytes) -> Response:
    """Envoie un CSV à l'import et renvoie la réponse brute."""
    response: Response = client.post(
        f"/api/imports/{import_id}/upload", files={"file": ("ventes.csv", content)}
    )
    return response


def job_of(client: TestClient, response: Response) -> dict[str, object]:
    """Relit le job renvoyé par un upload, une fois la tâche de fond terminée."""
    job: dict[str, object] = client.get(f"/api/jobs/{response.json()['id']}").json()
    return job


def data_collections(db: Db) -> list[str]:
    """Noms des collections de données, triés."""
    return sorted(db.list_collection_names(filter={"name": {"$regex": "^import_data_"}}))


def test_upload_inserts_typed_rows_and_makes_the_import_ready(
    client: TestClient, test_db: Db
) -> None:
    import_id = create_import(client)

    response = upload(client, import_id, CSV)

    assert response.status_code == 202
    assert job_of(client, response) | {"id": None} == {
        "id": None,
        "import_id": import_id,
        "status": "done",
        "processed": 2,
        "total": 2,
        "error": None,
    }
    item = client.get("/api/imports").json()[0]
    assert (item["status"], item["row_count"], item["error"]) == ("ready", 2, None)
    assert item["job_id"] == response.json()["id"]
    assert [column["type"] for column in item["columns"]] == ["string", "float", "boolean"]
    docs = list(test_db[f"import_data_{import_id}_v1"].find().sort("_id"))
    assert docs == [
        {"_id": 0, "nom": "Élodie", "_n_nom": "elodie", "montant": 12.5, "actif": True},
        {"_id": 1, "nom": "Farid", "_n_nom": "farid", "montant": None, "actif": False},
    ]


def test_reimport_switches_to_a_new_version_and_drops_the_old_one(
    client: TestClient, test_db: Db
) -> None:
    import_id = create_import(client)
    upload(client, import_id, CSV)

    upload(client, import_id, b"Ville\nLyon\nNice\nParis\n")

    assert data_collections(test_db) == [f"import_data_{import_id}_v2"]
    item = client.get("/api/imports").json()[0]
    assert (item["row_count"], [c["key"] for c in item["columns"]]) == (3, ["ville"])


def test_a_refused_first_file_leaves_the_import_failed_without_data(
    client: TestClient, test_db: Db
) -> None:
    import_id = create_import(client)

    job = job_of(client, upload(client, import_id, b"a,b\n1,2,3\n"))

    assert job["status"] == "failed"
    assert "ligne 2" in str(job["error"])
    item = client.get("/api/imports").json()[0]
    assert item["status"] == "failed"
    assert "ligne 2" in item["error"]
    assert data_collections(test_db) == []


def test_a_refused_reimport_keeps_the_previous_data(client: TestClient, test_db: Db) -> None:
    import_id = create_import(client)
    upload(client, import_id, CSV)

    job = job_of(client, upload(client, import_id, b"a,b\n1,2,3\n"))

    assert job["status"] == "failed"
    item = client.get("/api/imports").json()[0]
    assert (item["status"], item["row_count"]) == ("ready", 2)
    assert data_collections(test_db) == [f"import_data_{import_id}_v1"]


def test_an_unexpected_error_is_reported_without_details(
    client: TestClient, test_db: Db, monkeypatch: pytest.MonkeyPatch
) -> None:
    def broken(*args: object) -> None:
        raise RuntimeError("détail interne")

    monkeypatch.setattr("app.services.uploads.to_documents", broken)
    import_id = create_import(client)

    job = job_of(client, upload(client, import_id, CSV))

    assert job["error"] == "L'import a échoué sur une erreur inattendue"
    assert data_collections(test_db) == []


@pytest.mark.parametrize(
    ("case", "status"), [("inconnu", 404), ("mal formé", 404), ("occupé", 409)]
)
def test_refused_uploads_leave_no_temporary_file(
    client: TestClient,
    test_db: Db,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    case: str,
    status: int,
) -> None:
    monkeypatch.setattr(tempfile, "tempdir", str(tmp_path))
    import_id = {"inconnu": UNKNOWN_ID, "mal formé": "pas-un-id"}.get(case, "")
    if case == "occupé":
        import_id = create_import(client)
        test_db["imports"].update_one(
            {"_id": ObjectId(import_id)}, {"$set": {"status": "importing"}}
        )

    response = upload(client, import_id, CSV)

    assert response.status_code == status
    assert list(tmp_path.iterdir()) == []


def test_an_unknown_job_returns_404(client: TestClient) -> None:
    assert client.get("/api/jobs/inconnu").status_code == 404


def test_startup_recovers_an_import_interrupted_by_a_restart(
    test_db: Db, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "mongo_db", test_db.name)
    now = datetime.now(UTC)
    import_id = (
        test_db["imports"]
        .insert_one(
            {
                "name": "Ventes",
                "order": 0,
                "status": "importing",
                "created_at": now,
                "updated_at": now,
            }
        )
        .inserted_id
    )
    test_db["jobs"].insert_one(
        {"_id": "j1", "import_id": str(import_id), "status": "running", "processed": 1, "total": 2}
    )
    test_db[f"import_data_{import_id}_v1"].insert_one({"_id": 0})
    try:
        with TestClient(app) as client:
            job = client.get("/api/jobs/j1").json()
            item = client.get("/api/imports").json()[0]
        collections = data_collections(test_db)
    finally:
        test_db.client.drop_database(test_db.name)

    assert job["status"] == "failed"
    assert (item["status"], "interrompu" in item["error"]) == ("failed", True)
    assert collections == []
