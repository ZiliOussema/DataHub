from typing import Any

import pytest
from fastapi.testclient import TestClient
from pymongo.database import Database

pytestmark = pytest.mark.integration

UNKNOWN_ID = "0123456789abcdef01234567"
# Ref : texte (« A1 », zéro initial) ; Code : entier ; Prix : décimal, case vide ; Actif : booléen.
CSV = b"Ref;Code;Prix;Actif\nA1;12;1,5;oui\n0012;7;2;non\n7;3;;oui\n"
Db = Database[dict[str, object]]


def ready_import(client: TestClient) -> str:
    """Crée un import et le remplit avec le CSV de test. Renvoie son identifiant."""
    import_id = str(client.post("/api/imports", json={"name": "Ventes"}).json()["id"])
    client.post(f"/api/imports/{import_id}/upload", files={"file": ("ventes.csv", CSV)})
    return import_id


def check(client: TestClient, import_id: str, key: str, target: str) -> Any:
    """Appelle la vérification de type et renvoie la réponse brute."""
    return client.get(f"/api/imports/{import_id}/columns/{key}/type-check", params={"type": target})


def change(client: TestClient, import_id: str, key: str, target: str) -> Any:
    """Lance la conversion et renvoie la réponse brute."""
    return client.patch(f"/api/imports/{import_id}/columns/{key}/type", json={"type": target})


def column_types(client: TestClient) -> dict[str, str]:
    """Types des colonnes du premier import, par clé."""
    return {c["key"]: c["type"] for c in client.get("/api/imports").json()[0]["columns"]}


def data_collections(db: Db) -> list[str]:
    """Noms des collections de données, triés."""
    return sorted(db.list_collection_names(filter={"name": {"$regex": "^import_data_"}}))


def test_check_counts_the_values_that_block_a_conversion(client: TestClient) -> None:
    import_id = ready_import(client)

    blocked = check(client, import_id, "ref", "integer").json()
    possible = check(client, import_id, "code", "string").json()

    assert blocked["invalid_count"] == 2
    assert sorted(blocked["examples"]) == ["0012", "A1"]
    assert possible == {"invalid_count": 0, "examples": []}


def test_a_possible_change_converts_the_column_in_a_new_version(
    client: TestClient, test_db: Db
) -> None:
    import_id = ready_import(client)

    response = change(client, import_id, "code", "string")

    assert response.status_code == 202
    assert client.get(f"/api/jobs/{response.json()['id']}").json()["status"] == "done"
    assert column_types(client)["code"] == "string"
    assert data_collections(test_db) == [f"import_data_{import_id}_v2"]
    first = test_db[f"import_data_{import_id}_v2"].find_one({"_id": 0})
    assert first is not None
    assert (first["code"], first["_n_code"]) == ("12", "12")


def test_a_change_from_text_removes_the_normalized_copy(client: TestClient, test_db: Db) -> None:
    import_id = ready_import(client)
    change(client, import_id, "code", "string")

    change(client, import_id, "code", "integer")

    first = test_db[f"import_data_{import_id}_v3"].find_one({"_id": 0})
    assert first is not None
    assert first["code"] == 12
    assert "_n_code" not in first


def test_the_job_refuses_a_change_that_would_lose_values(client: TestClient, test_db: Db) -> None:
    import_id = ready_import(client)

    job_id = change(client, import_id, "prix", "integer").json()["id"]

    job = client.get(f"/api/jobs/{job_id}").json()
    assert job["status"] == "failed"
    assert job["error"] == "1 valeur ne peut pas devenir des entiers, par exemple « 1.5 »"
    item = client.get("/api/imports").json()[0]
    assert (item["status"], column_types(client)["prix"]) == ("ready", "float")
    assert data_collections(test_db) == [f"import_data_{import_id}_v1"]


@pytest.mark.parametrize(
    ("call", "status"),
    [
        (lambda c, i: check(c, UNKNOWN_ID, "code", "string"), 404),
        (lambda c, i: check(c, i, "inconnue", "string"), 404),
        (lambda c, i: check(c, i, "code", "date"), 422),
        (lambda c, i: change(c, i, "code", "integer"), 422),
    ],
)
def test_invalid_requests_are_rejected(client: TestClient, call: Any, status: int) -> None:
    assert call(client, ready_import(client)).status_code == status


def test_an_import_without_data_cannot_change_a_type(client: TestClient) -> None:
    import_id = str(client.post("/api/imports", json={"name": "Vide"}).json()["id"])

    assert check(client, import_id, "code", "string").status_code == 409


def test_a_concurrent_treatment_returns_409(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import_id = ready_import(client)

    async def taken(*args: object) -> None:
        return None

    monkeypatch.setattr("app.repositories.imports.ImportRepository.start_import", taken)

    assert change(client, import_id, "code", "string").status_code == 409


def test_an_unexpected_error_keeps_the_previous_version(
    client: TestClient, test_db: Db, monkeypatch: pytest.MonkeyPatch
) -> None:
    import_id = ready_import(client)

    async def broken(*args: object) -> None:
        raise RuntimeError("détail interne")

    monkeypatch.setattr("app.repositories.import_data.ImportDataRepository.convert_column", broken)

    job_id = change(client, import_id, "code", "string").json()["id"]

    assert client.get(f"/api/jobs/{job_id}").json()["error"] == (
        "L'import a échoué sur une erreur inattendue"
    )
    assert column_types(client)["code"] == "integer"
    assert data_collections(test_db) == [f"import_data_{import_id}_v1"]


# Chaque type sait passer en texte et revenir, et les nombres et booléens s'échangent sans perte.
ROUND_TRIP = b"Entier;Decimal;Rond;Actif\n12;1,5;2,0;oui\n-3;-0,25;3,0;non\n"


@pytest.mark.parametrize(
    ("key", "steps", "values"),
    [
        ("entier", ["string", "integer"], [12, -3]),
        ("decimal", ["string", "float"], [1.5, -0.25]),
        ("actif", ["string", "boolean"], [True, False]),
        ("actif", ["integer", "boolean"], [True, False]),
        ("actif", ["float", "boolean"], [True, False]),
        ("rond", ["integer", "float"], [2.0, 3.0]),
    ],
)
def test_conversions_back_and_forth_keep_every_value(
    client: TestClient, test_db: Db, key: str, steps: list[str], values: list[object]
) -> None:
    import_id = str(client.post("/api/imports", json={"name": "Aller-retour"}).json()["id"])
    client.post(f"/api/imports/{import_id}/upload", files={"file": ("a.csv", ROUND_TRIP)})

    for target in steps:
        assert check(client, import_id, key, target).json()["invalid_count"] == 0
        job_id = change(client, import_id, key, target).json()["id"]
        assert client.get(f"/api/jobs/{job_id}").json()["status"] == "done"

    [collection] = data_collections(test_db)
    assert [doc[key] for doc in test_db[collection].find().sort("_id")] == values
