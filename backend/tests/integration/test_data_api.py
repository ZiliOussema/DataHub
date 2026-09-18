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


def update(client: TestClient, import_id: str, row_id: int | str, values: dict[str, str]) -> Any:
    """Modifie une ligne et renvoie la réponse brute."""
    return client.patch(f"/api/imports/{import_id}/data/{row_id}", json={"values": values})


def test_update_reads_values_like_the_import_and_keeps_the_text_searchable(
    client: TestClient,
) -> None:
    import_id = ready_import(client)

    response = update(
        client, import_id, 1, {"nom": " Zoé ", "age": "35", "montant": "12,5", "actif": ""}
    )

    assert response.status_code == 200
    assert response.json() == {"_id": 1, "nom": "Zoé", "age": 35, "montant": 12.5, "actif": None}
    assert ids(read(client, import_id, **{"f.nom": "zoe"})) == [1]
    assert ids(read(client, import_id, **{"f.nom": "farid"})) == []


def test_update_returns_one_message_per_refused_field(client: TestClient) -> None:
    import_id = ready_import(client)

    response = update(
        client, import_id, 0, {"age": "12.5", "actif": "peut-être", "inconnue": "x", "nom": "Ok"}
    )

    assert response.status_code == 422
    assert set(response.json()["detail"]) == {"age", "actif", "inconnue"}
    assert read(client, import_id).json()["rows"][0]["nom"] == "Élodie"


def test_update_is_refused_during_a_treatment_and_on_unknown_targets(
    client: TestClient, test_db: Db
) -> None:
    import_id = ready_import(client)

    assert update(client, import_id, 999, {"nom": "X"}).status_code == 404
    assert update(client, UNKNOWN_ID, 0, {"nom": "X"}).status_code == 404
    assert update(client, import_id, 0, {}).status_code == 422
    empty_id = str(client.post("/api/imports", json={"name": "Vide"}).json()["id"])
    assert update(client, empty_id, 0, {"nom": "X"}).status_code == 409
    test_db["imports"].update_one({"name": "Ventes"}, {"$set": {"status": "importing"}})
    assert update(client, import_id, 0, {"nom": "X"}).status_code == 409


def batch(client: TestClient, import_id: str, body: dict[str, Any]) -> Any:
    """Modifie une sélection de lignes et renvoie la réponse brute."""
    return client.post(f"/api/imports/{import_id}/data/batch", json=body)


def batch_delete(client: TestClient, import_id: str, body: dict[str, Any]) -> Any:
    """Supprime une sélection de lignes et renvoie la réponse brute."""
    return client.post(f"/api/imports/{import_id}/data/batch-delete", json=body)


def test_batch_changes_chosen_rows_and_keeps_the_other_columns(client: TestClient) -> None:
    import_id = ready_import(client)

    response = batch(
        client,
        import_id,
        {
            "ids": [0, 1],
            "changes": {"age": {"action": "set", "value": "50"}, "nom": {"action": "clear"}},
        },
    )

    assert response.json() == {"count": 2}
    rows = read(client, import_id).json()["rows"]
    assert [(row["age"], row["nom"], row["montant"]) for row in rows[:3]] == [
        (50, None, 12.5),
        (50, None, 3.0),
        (34, "Inès", 7.25),
    ]


def test_batch_on_filters_reaches_every_matching_row_without_listing_them(
    client: TestClient,
) -> None:
    import_id = ready_import(client)

    response = batch(
        client,
        import_id,
        {"filters": {"age.min": "20"}, "changes": {"actif": {"action": "set", "value": "oui"}}},
    )

    assert response.json() == {"count": 2}
    # Léo était déjà à oui dans le fichier : le lot a mis à jour Élodie et Inès.
    assert ids(read(client, import_id, **{"f.actif": "vrai"})) == [0, 2, 3]


def test_batch_refuses_a_value_that_does_not_match_the_column(client: TestClient) -> None:
    import_id = ready_import(client)

    response = batch(
        client,
        import_id,
        {
            "ids": [0],
            "changes": {
                "age": {"action": "set", "value": "12,5"},
                "montant": {"action": "set", "value": ""},
            },
        },
    )

    assert response.status_code == 422
    assert set(response.json()["detail"]) == {"age", "montant"}
    assert read(client, import_id).json()["rows"][0]["age"] == 34


def test_batch_delete_removes_the_rows_without_renumbering_the_others(client: TestClient) -> None:
    import_id = ready_import(client)

    response = batch_delete(client, import_id, {"ids": [0, 1]})

    assert response.json() == {"count": 2}
    body = read(client, import_id).json()
    assert (body["total"], ids(read(client, import_id))) == (2, [2, 3])


def test_batch_delete_on_filters_removes_every_matching_row(client: TestClient) -> None:
    import_id = ready_import(client)

    # « el » sans accent ne trouve qu'Élodie : le filtre du lot est celui du tableau.
    assert batch_delete(client, import_id, {"filters": {"nom": "el"}}).json() == {"count": 1}
    assert ids(read(client, import_id)) == [1, 2, 3]


@pytest.mark.parametrize(
    "body",
    [
        {"changes": {"age": {"action": "clear"}}},
        {"ids": [0], "filters": {}, "changes": {"age": {"action": "clear"}}},
        {"ids": [0], "changes": {}},
        {"ids": [0], "changes": {"inconnue": {"action": "clear"}}},
    ],
)
def test_batch_rejects_an_ambiguous_or_empty_request(
    client: TestClient, body: dict[str, Any]
) -> None:
    assert batch(client, ready_import(client), body).status_code == 422
