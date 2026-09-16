from pathlib import Path

import pytest

from app.schemas.columns import ColumnOut, ColumnType
from app.services.type_detection import detect_types


def detect(tmp_path: Path, content: str, chunk_rows: int = 50_000) -> list[ColumnOut]:
    """Écrit un CSV de test et renvoie ses colonnes détectées."""
    path = tmp_path / "data.csv"
    path.write_text(content, encoding="utf-8")
    return detect_types(path, "data.csv", chunk_rows)


def types(tmp_path: Path, content: str, chunk_rows: int = 50_000) -> list[ColumnType]:
    """Renvoie seulement les types détectés."""
    return [column.type for column in detect(tmp_path, content, chunk_rows)]


def one_column(values: list[str]) -> str:
    """Écrit une colonne unique avec son en-tête."""
    return "col\n" + "\n".join(values) + "\n"


@pytest.mark.parametrize(
    ("values", "expected"),
    [
        (["0", "1", "0"], "boolean"),
        (["true", "FALSE"], "boolean"),
        (["Vrai", "faux"], "boolean"),
        (["oui", "Non"], "boolean"),
        (["12", "-3", "+7"], "integer"),
        (["1.5", "-0.25", ".5", "1e3"], "float"),
        (["00123", "75001"], "string"),
        (["Paris", "12"], "string"),
        (["1.2.3"], "string"),
    ],
)
def test_a_column_takes_the_most_precise_type(
    tmp_path: Path, values: list[str], expected: ColumnType
) -> None:
    assert types(tmp_path, one_column(values)) == [expected]


@pytest.mark.parametrize(
    ("values", "expected"),
    [
        (["0", "1", "2"], "integer"),
        (["oui", "non", "12"], "string"),
        (["12", "13", "N/A"], "string"),
        (["Paris", "Lyon", "12", "13"], "string"),
    ],
)
def test_a_value_in_a_later_block_still_changes_the_type(
    tmp_path: Path, values: list[str], expected: ColumnType
) -> None:
    assert types(tmp_path, one_column(values), chunk_rows=2) == [expected]


def test_empty_cells_do_not_vote(tmp_path: Path) -> None:
    assert types(tmp_path, "nom,age\nA,12\nB,\nC,-3\n") == ["string", "integer"]


def test_spaces_around_a_value_are_ignored(tmp_path: Path) -> None:
    assert types(tmp_path, one_column([" 12 ", "7"])) == ["integer"]


def test_an_empty_column_is_text(tmp_path: Path) -> None:
    assert types(tmp_path, "nom,vide\nA,\nB,\n") == ["string", "string"]


def test_a_semicolon_file_accepts_the_decimal_comma_only(tmp_path: Path) -> None:
    assert types(tmp_path, "a;b\n12,5;12.5\n") == ["float", "string"]


def test_columns_keep_their_label_and_their_key(tmp_path: Path) -> None:
    assert detect(tmp_path, "Code postal\n00123\n") == [
        ColumnOut(label="Code postal", key="code_postal", type="string")
    ]
