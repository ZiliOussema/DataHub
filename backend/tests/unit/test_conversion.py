import pandas as pd

from app.schemas.columns import ColumnOut, ColumnType
from app.services.conversion import to_documents


def columns(*types: ColumnType) -> list[ColumnOut]:
    """Colonnes de test nommées c0, c1… dans l'ordre des types donnés."""
    return [ColumnOut(label=f"C{i}", key=f"c{i}", type=t) for i, t in enumerate(types)]


def test_booleans_accept_every_writing_and_case() -> None:
    chunk = pd.DataFrame([["oui"], ["NON"], ["1"], ["false"], ["Vrai"]])

    docs = to_documents(chunk, columns("boolean"), 0, decimal_comma=False)

    assert [doc["c0"] for doc in docs] == [True, False, True, False, True]


def test_numbers_are_native_python_values() -> None:
    chunk = pd.DataFrame([[" 12 ", "1.5"], ["+7", "1e3"]])

    docs = to_documents(chunk, columns("integer", "float"), 0, decimal_comma=False)

    assert [(doc["c0"], doc["c1"]) for doc in docs] == [(12, 1.5), (7, 1000.0)]
    assert type(docs[0]["c0"]) is int
    assert type(docs[0]["c1"]) is float


def test_decimal_comma_is_read_as_a_point() -> None:
    chunk = pd.DataFrame([["12,50"], ["-0,5"]])

    docs = to_documents(chunk, columns("float"), 0, decimal_comma=True)

    assert [doc["c0"] for doc in docs] == [12.5, -0.5]


def test_empty_cells_become_none_in_every_type() -> None:
    chunk = pd.DataFrame([["", "  ", "", ""]])

    docs = to_documents(chunk, columns("boolean", "integer", "float", "string"), 0, False)

    assert docs == [{"_id": 0, "c0": None, "c1": None, "c2": None, "c3": None, "_n_c3": None}]


def test_text_gets_a_normalized_copy_for_the_contains_filter() -> None:
    chunk = pd.DataFrame([[" Évry-Courcouronnes "]])

    docs = to_documents(chunk, columns("string"), 0, decimal_comma=False)

    assert docs == [{"_id": 0, "c0": "Évry-Courcouronnes", "_n_c0": "evry-courcouronnes"}]


def test_ids_continue_from_the_previous_block() -> None:
    chunk = pd.DataFrame([["a"], ["b"]])

    docs = to_documents(chunk, columns("string"), 10_000, decimal_comma=False)

    assert [doc["_id"] for doc in docs] == [10_000, 10_001]
