from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from pymongo.database import Database

pytestmark = pytest.mark.integration

UNKNOWN_ID = "0123456789abcdef01234567"


def create(client: TestClient, name: str) -> Response:
    """Crée un import par l'API et renvoie la réponse brute."""
    response: Response = client.post("/api/imports", json={"name": name})
    return response


def test_create_places_imports_in_creation_order(client: TestClient) -> None:
    first = create(client, "Clients")
    second = create(client, "Produits")

    assert first.status_code == 201
    assert (first.json()["order"], second.json()["order"]) == (0, 1)
    assert [i["name"] for i in client.get("/api/imports").json()] == ["Clients", "Produits"]


def test_create_trims_the_name(client: TestClient) -> None:
    assert create(client, "  Clients  ").json()["name"] == "Clients"


def test_create_rejects_a_blank_name(client: TestClient) -> None:
    assert create(client, "   ").status_code == 422


def test_create_rejects_a_name_taken_ignoring_case(client: TestClient) -> None:
    create(client, "Clients")

    response = create(client, "clients")

    assert response.status_code == 409
    assert "déjà utilisé" in response.json()["detail"]


def test_dates_carry_their_timezone(client: TestClient) -> None:
    create(client, "Clients")

    # La date relue dans MongoDB, pas celle gardée en mémoire à la création : c'est la relecture
    # qui perd le fuseau, et c'est elle que le navigateur affiche.
    created_at = client.get("/api/imports").json()[0]["created_at"]

    assert datetime.fromisoformat(created_at).tzinfo is not None


def test_rename_changes_the_name(client: TestClient) -> None:
    import_id = create(client, "Clients").json()["id"]

    response = client.patch(f"/api/imports/{import_id}", json={"name": "Clients 2026"})

    assert response.status_code == 200
    assert response.json()["name"] == "Clients 2026"


@pytest.mark.parametrize("import_id", [UNKNOWN_ID, "pas-un-id"])
def test_rename_returns_404_for_unknown_or_malformed_id(client: TestClient, import_id: str) -> None:
    response = client.patch(f"/api/imports/{import_id}", json={"name": "Clients"})

    assert response.status_code == 404


def test_rename_to_a_taken_name_returns_409(client: TestClient) -> None:
    create(client, "Clients")
    import_id = create(client, "Produits").json()["id"]

    response = client.patch(f"/api/imports/{import_id}", json={"name": "CLIENTS"})

    assert response.status_code == 409


def test_delete_removes_the_import_and_only_its_collections(
    client: TestClient, test_db: Database[dict[str, object]]
) -> None:
    import_id = create(client, "Clients").json()["id"]
    test_db[f"import_data_{import_id}_v1"].insert_one({"_id": 0})
    test_db["import_data_autre_v1"].insert_one({"_id": 0})

    response = client.delete(f"/api/imports/{import_id}")

    assert response.status_code == 204
    assert client.get("/api/imports").json() == []
    assert test_db.list_collection_names(filter={"name": {"$regex": "^import_data_"}}) == [
        "import_data_autre_v1"
    ]


def test_delete_unknown_import_returns_404(client: TestClient) -> None:
    assert client.delete(f"/api/imports/{UNKNOWN_ID}").status_code == 404


def test_reorder_saves_the_new_order(client: TestClient) -> None:
    a, b, c = (create(client, name).json()["id"] for name in ("A", "B", "C"))

    response = client.put("/api/imports/order", json={"ids": [c, a, b]})

    assert response.status_code == 200
    assert [i["name"] for i in client.get("/api/imports").json()] == ["C", "A", "B"]


def test_reorder_rejects_an_incomplete_list(client: TestClient) -> None:
    a = create(client, "A").json()["id"]
    create(client, "B")

    response = client.put("/api/imports/order", json={"ids": [a]})

    assert response.status_code == 422
