import re

import pytest

from app.core.errors import InvalidError
from app.services.data import build_query

COLUMNS = [
    {"key": "nom", "type": "string"},
    {"key": "age", "type": "integer"},
    {"key": "montant", "type": "float"},
    {"key": "actif", "type": "boolean"},
]


def test_no_parameter_reads_every_row_in_file_order() -> None:
    query = build_query(COLUMNS, None, {"offset": "0"})

    assert (query.filter, query.sort, query.indexable) == ({}, [("_id", 1)], set())
    assert query.hidden == ["_n_nom"]


def test_text_filter_matches_without_accents_and_escapes_special_characters() -> None:
    query = build_query(COLUMNS, None, {"f.nom": "Évry (91)"})

    assert query.filter == {"_n_nom": {"$regex": re.escape("evry (91)")}}
    assert query.indexable == set()


def test_number_bounds_combine_and_accept_a_decimal_comma() -> None:
    query = build_query(COLUMNS, None, {"f.montant.min": "1,5", "f.montant.max": "20"})

    assert query.filter == {"montant": {"$gte": 1.5, "$lte": 20.0}}
    assert query.indexable == {"montant"}


@pytest.mark.parametrize(("value", "expected"), [("vrai", True), ("faux", False), ("vide", None)])
def test_boolean_filter(value: str, expected: bool | None) -> None:
    assert build_query(COLUMNS, None, {"f.actif": value}).filter == {"actif": expected}


def test_empty_filters_are_ignored() -> None:
    assert build_query(COLUMNS, None, {"f.nom": "", "f.age.min": ""}).filter == {}


@pytest.mark.parametrize(("sort", "order"), [("age", 1), ("-age", -1)])
def test_sort_breaks_ties_by_row_number_in_the_same_direction(sort: str, order: int) -> None:
    query = build_query(COLUMNS, sort, {})

    assert query.sort == [("age", order), ("_id", order)]
    assert query.indexable == {"age"}


@pytest.mark.parametrize(
    ("sort", "params"),
    [
        (None, {"f.inconnue": "x"}),
        (None, {"f.nom.min": "3"}),
        (None, {"f.actif": "peut-être"}),
        (None, {"f.age.min": "abc"}),
        (None, {"f.age.max": "nan"}),
        ("inconnue", {}),
    ],
)
def test_unknown_columns_and_values_are_rejected(sort: str | None, params: dict[str, str]) -> None:
    with pytest.raises(InvalidError):
        build_query(COLUMNS, sort, params)
