from typing import Any

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration

UNKNOWN_ID = "0123456789abcdef01234567"
# Âge : deux fois 34, une fois 18, une case vide. Actif : deux vrai, un faux, une case vide.
CSV = "Nom;Age;Montant;Actif\nÉlodie;34;12,5;oui\nFarid;;3;non\nInès;34;7,25;\nLéo;18;;oui\n"


def ready_import(client: TestClient) -> str:
    """Crée un import rempli avec le CSV de test et renvoie son identifiant."""
    import_id = str(client.post("/api/imports", json={"name": "Ventes"}).json()["id"])
    client.post(f"/api/imports/{import_id}/upload", files={"file": ("v.csv", CSV.encode())})
    return import_id


def stats(client: TestClient, import_id: str, key: str, **params: Any) -> Any:
    """Lit les statistiques d'une colonne et renvoie la réponse brute."""
    return client.get(f"/api/imports/{import_id}/stats/{key}", params=params)


def test_numbers_get_their_count_bounds_and_average(client: TestClient) -> None:
    body = stats(client, ready_import(client), "age").json()

    assert (body["count"], body["minimum"], body["maximum"]) == (3, 18.0, 34.0)
    assert body["average"] == pytest.approx(28.67, abs=0.01)
    # Les occurrences sont décroissantes par défaut : 34 apparaît deux fois.
    assert body["occurrences"] == [{"value": 34, "count": 2}, {"value": 18, "count": 1}]
    assert body["distinct"] == 2


def test_booleans_get_their_shares_and_ignore_empty_cells(client: TestClient) -> None:
    body = stats(client, ready_import(client), "actif").json()

    assert (body["count"], body["true_count"], body["false_count"]) == (3, 2, 1)


def test_text_gets_its_count_and_distinct_values(client: TestClient) -> None:
    body = stats(client, ready_import(client), "nom").json()

    assert (body["count"], body["distinct"]) == (4, 4)
    assert body["occurrences"][0]["count"] == 1


def test_the_first_checkbox_applies_the_table_filters(client: TestClient) -> None:
    import_id = ready_import(client)

    body = stats(client, import_id, "age", filtered="1", **{"f.age.min": "20"}).json()

    assert (body["count"], body["minimum"]) == (2, 34.0)


def test_the_occurrence_search_always_filters_its_table_never_the_figures(
    client: TestClient,
) -> None:
    import_id = ready_import(client)

    searched = stats(client, import_id, "nom", search="ELO").json()
    both = stats(client, import_id, "nom", search="ELO", searched="1").json()

    # Le tableau ne montre qu'Élodie dans les deux cas.
    assert searched["occurrences"] == both["occurrences"] == [{"value": "Élodie", "count": 1}]
    # Sans la case 2, les chiffres portent sur toute la colonne ; avec, sur la recherche.
    assert (searched["count"], both["count"]) == (4, 1)


def test_occurrences_can_be_sorted_by_value_and_paged(client: TestClient) -> None:
    import_id = ready_import(client)

    body = stats(client, import_id, "nom", sort="value").json()
    second = stats(client, import_id, "nom", sort="value", page="2").json()

    assert [row["value"] for row in body["occurrences"]] == ["Farid", "Inès", "Léo", "Élodie"]
    assert second["occurrences"] == []


@pytest.mark.parametrize(
    ("key", "params", "status"),
    [
        ("inconnue", {}, 404),
        ("nom", {"sort": "n'importe quoi"}, 422),
        ("nom", {"page": "0"}, 422),
        ("nom", {"page": "abc"}, 422),
        ("nom", {"filtered": "1", "f.inconnue": "x"}, 422),
    ],
)
def test_invalid_requests_are_rejected(
    client: TestClient, key: str, params: dict[str, str], status: int
) -> None:
    assert stats(client, ready_import(client), key, **params).status_code == status


def test_an_unknown_or_empty_import_has_no_statistics(client: TestClient) -> None:
    empty_id = str(client.post("/api/imports", json={"name": "Vide"}).json()["id"])

    assert stats(client, UNKNOWN_ID, "nom").status_code == 404
    assert stats(client, empty_id, "nom").status_code == 409
