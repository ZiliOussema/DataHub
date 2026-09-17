from typing import Any

import pytest
from fastapi.testclient import TestClient
from pymongo.database import Database

pytestmark = pytest.mark.integration

UNKNOWN_ID = "0123456789abcdef01234567"
# Âge a des ex æquo (34) et une case vide, pour vérifier le départage et l'ordre des vides.
CSV = "Nom;Age;Montant;Actif\nÉlodie;34;12,5;oui\nFarid;;3;non\nInès;34;7,25;\nLéo;18;;oui\n"
Db = Database[dict[str, object]]


def ready_import(client: TestClient) -> str:
    """Crée un import rempli avec le CSV de test et renvoie son identifiant."""
    import_id = str(client.post("/api/imports", json={"name": "Ventes"}).json()["id"])
    client.post(f"/api/imports/{import_id}/upload", files={"file": ("v.csv", CSV.encode())})
    return import_id


def read(client: TestClient, import_id: str, **params: Any) -> Any:
    """Lit les données avec des paramètres d'URL, dont les filtres f.…"""
    return client.get(f"/api/imports/{import_id}/data", params=params)


def ids(response: Any) -> list[int]:
    """Numéros de ligne renvoyés, dans l'ordre."""
    return [row["_id"] for row in response.json()["rows"]]


def test_rows_come_typed_in_file_order_without_normalized_copies(client: TestClient) -> None:
    body = read(client, ready_import(client)).json()

    assert body["total"] == 4
    assert body["rows"][0] == {"_id": 0, "nom": "Élodie", "age": 34, "montant": 12.5, "actif": True}


def test_offset_and_limit_select_a_block(client: TestClient) -> None:
    response = read(client, ready_import(client), offset=1, limit=2)

    assert (ids(response), response.json()["total"]) == ([1, 2], 4)


@pytest.mark.parametrize(("sort", "expected"), [("age", [1, 3, 0, 2]), ("-age", [2, 0, 3, 1])])
def test_sort_is_stable_on_ties_in_both_directions(
    client: TestClient, sort: str, expected: list[int]
) -> None:
    assert ids(read(client, ready_import(client), sort=sort)) == expected


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"f.nom": "ÉLO"}, [0]),
        ({"f.age.min": "20", "f.age.max": "40"}, [0, 2]),
        ({"f.actif": "faux"}, [1]),
        ({"f.actif": "vide"}, [2]),
    ],
)
def test_filters_narrow_rows_and_total(
    client: TestClient, params: dict[str, str], expected: list[int]
) -> None:
    response = read(client, ready_import(client), **params)

    assert (ids(response), response.json()["total"]) == (expected, len(expected))


def test_a_sort_indexes_its_column_but_a_text_filter_never_does(
    client: TestClient, test_db: Db
) -> None:
    import_id = ready_import(client)

    read(client, import_id, sort="age", **{"f.nom": "lé"})
    read(client, import_id, sort="-age")

    names = {index["name"] for index in test_db[f"import_data_{import_id}_v1"].list_indexes()}
    assert names == {"_id_", "age_1__id_1"}


def test_invalid_requests_are_rejected(client: TestClient) -> None:
    import_id = ready_import(client)
    empty_id = str(client.post("/api/imports", json={"name": "Vide"}).json()["id"])

    assert read(client, import_id, **{"f.inconnue": "x"}).status_code == 422
    assert read(client, import_id, limit=501).status_code == 422
    assert read(client, empty_id).status_code == 409
    assert read(client, UNKNOWN_ID).status_code == 404
