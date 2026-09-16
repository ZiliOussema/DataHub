import pytest

from app.services.columns import build_columns, normalize_text


def test_normalize_text_removes_case_and_accents() -> None:
    assert normalize_text("Évry-Courcouronnes") == "evry-courcouronnes"


@pytest.mark.parametrize(
    ("header", "key"),
    [
        ("Code postal", "code_postal"),
        ("Âge", "age"),
        ("Chiffre d'affaires €", "chiffre_d_affaires"),
        ("  Nom  ", "nom"),
    ],
)
def test_build_columns_turns_a_header_into_a_mongodb_key(header: str, key: str) -> None:
    assert build_columns([header]) == [(header, key)]


def test_build_columns_names_an_empty_header_by_its_position() -> None:
    assert build_columns(["Nom", "", "€€"]) == [
        ("Nom", "nom"),
        ("", "colonne_2"),
        ("€€", "colonne_3"),
    ]


def test_build_columns_suffixes_duplicate_keys() -> None:
    keys = [key for _, key in build_columns(["Ville", "ville", "VILLE"])]

    assert keys == ["ville", "ville_2", "ville_3"]


def test_build_columns_skips_a_suffix_already_taken_by_a_header() -> None:
    keys = [key for _, key in build_columns(["ville_2", "Ville", "Ville"])]

    assert keys == ["ville_2", "ville", "ville_3"]
