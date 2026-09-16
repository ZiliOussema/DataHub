from datetime import date
from pathlib import Path

import pytest
from openpyxl import Workbook
from openpyxl.worksheet.worksheet import Worksheet

from app.core.errors import InvalidError
from app.services.file_reader import Table, open_table


def write(tmp_path: Path, content: bytes, name: str = "data.csv") -> Path:
    """Écrit un fichier de test et renvoie son chemin."""
    path = tmp_path / name
    path.write_bytes(content)
    return path


def rows(table: Table) -> list[list[str]]:
    """Lit tous les blocs et renvoie les lignes à plat."""
    return [list(map(str, row)) for chunk in table.chunks for row in chunk.itertuples(index=False)]


def test_csv_with_commas(tmp_path: Path) -> None:
    table = open_table(write(tmp_path, b"Nom,Age\nA,1\nB,\n"), "data.csv")

    assert table.headers == ["Nom", "Age"]
    assert table.decimal_comma is False
    assert rows(table) == [["A", "1"], ["B", ""]]


def test_semicolon_means_decimal_comma_and_the_bom_is_removed(tmp_path: Path) -> None:
    content = "﻿Nom;Montant\nÉlodie;12,50\n".encode()

    table = open_table(write(tmp_path, content), "data.csv")

    assert table.headers == ["Nom", "Montant"]
    assert table.decimal_comma is True
    assert rows(table) == [["Élodie", "12,50"]]


def test_windows_1252_is_read_when_the_file_is_not_utf8(tmp_path: Path) -> None:
    content = "Nom;Ville\nA;Évry\n".encode("cp1252")

    assert rows(open_table(write(tmp_path, content), "data.csv")) == [["A", "Évry"]]


def test_values_are_kept_as_written(tmp_path: Path) -> None:
    content = b'Code,Valeur,Adresse\nNA,null,"1, rue X"\n00123,,x\n'

    assert rows(open_table(write(tmp_path, content), "data.csv")) == [
        ["NA", "null", "1, rue X"],
        ["00123", "", "x"],
    ]


def test_a_single_column_file_has_no_separator(tmp_path: Path) -> None:
    table = open_table(write(tmp_path, b"Nom\nA\nB\n"), "data.csv")

    assert (table.headers, rows(table)) == (["Nom"], [["A"], ["B"]])


def test_a_short_row_is_padded_with_empty_cells(tmp_path: Path) -> None:
    assert rows(open_table(write(tmp_path, b"a,b,c\n1\n"), "data.csv")) == [["1", "", ""]]


def test_a_row_longer_than_the_header_is_rejected_with_its_line(tmp_path: Path) -> None:
    table = open_table(write(tmp_path, b"a,b\n1,2\n3,4,5\n"), "data.csv")

    with pytest.raises(InvalidError, match="ligne 3"):
        rows(table)


def test_a_trailing_separator_is_tolerated(tmp_path: Path) -> None:
    assert rows(open_table(write(tmp_path, b"a,b\n1,2,\n"), "data.csv")) == [["1", "2"]]


def test_blank_lines_are_skipped_and_rows_come_in_blocks(tmp_path: Path) -> None:
    table = open_table(write(tmp_path, b"a\n1\n2\n\n3\n"), "data.csv", chunk_rows=2)

    assert [len(chunk) for chunk in table.chunks] == [2, 1]


@pytest.mark.parametrize(
    ("content", "filename", "message"),
    [
        (b"", "data.csv", "vide"),
        (b",,\n1,2,3\n", "data.csv", "nom des colonnes"),
        (b"a\n1\n", "data.txt", "CSV ou XLSX"),
        (b"pas un zip", "data.xlsx", "illisible"),
    ],
)
def test_unusable_files_are_rejected(
    tmp_path: Path, content: bytes, filename: str, message: str
) -> None:
    with pytest.raises(InvalidError, match=message):
        open_table(write(tmp_path, content, filename), filename)


def test_xlsx_cells_are_written_as_csv_text(tmp_path: Path) -> None:
    workbook = Workbook()
    sheet = workbook.active
    assert isinstance(sheet, Worksheet)
    sheet.append(["Nom", "Actif", "Date", "Montant", None])
    sheet.append(["A", True, date(2026, 9, 16), 12.5, None])
    sheet.append([None, None, None, None, None])
    path = tmp_path / "data.xlsx"
    workbook.save(path)

    table = open_table(path, "data.xlsx")

    assert table.headers == ["Nom", "Actif", "Date", "Montant"]
    assert table.decimal_comma is False
    assert rows(table) == [["A", "true", "2026-09-16T00:00:00", "12.5"]]


def test_an_xlsx_without_header_is_rejected(tmp_path: Path) -> None:
    workbook = Workbook()
    sheet = workbook.active
    assert isinstance(sheet, Worksheet)
    sheet.append([None, None])
    sheet.append(["A", "B"])
    path = tmp_path / "data.xlsx"
    workbook.save(path)

    with pytest.raises(InvalidError, match="nom des colonnes"):
        open_table(path, "data.xlsx")
