import codecs
import csv
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, datetime, time
from pathlib import Path
from zipfile import BadZipFile

import pandas as pd
from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException
from openpyxl.workbook.workbook import Workbook

from app.core.errors import InvalidError

CHUNK_ROWS = 50_000
SEPARATORS = ",;\t|"
_BLOCK_BYTES = 1024 * 1024
_SNIFF_CHARS = 64 * 1024


@dataclass(frozen=True)
class Table:
    """Fichier ouvert : en-têtes, écriture des décimaux, et lignes par blocs de cellules texte."""

    headers: list[str]
    decimal_comma: bool
    chunks: Iterator[pd.DataFrame]


def open_table(path: Path, filename: str, chunk_rows: int = CHUNK_ROWS) -> Table:
    """Ouvre un CSV ou un XLSX. Lève InvalidError si le format ou l'en-tête est inexploitable."""
    # Le fichier reçu est enregistré sous un nom temporaire : l'extension vient du nom d'origine.
    suffix = Path(filename).suffix.lower()
    if suffix == ".csv":
        return _open_csv(path, chunk_rows)
    if suffix == ".xlsx":
        return _open_xlsx(path, chunk_rows)
    raise InvalidError("Format non pris en charge : envoyez un fichier CSV ou XLSX")


def _encoding(path: Path) -> str:
    """Renvoie utf-8-sig si tout le fichier est de l'UTF-8 valide, cp1252 sinon."""
    # Tout le fichier est vérifié, par blocs : un « é » en Windows-1252 à la ligne 800 000
    # ferait échouer l'import au milieu si seul le début était testé.
    decoder = codecs.getincrementaldecoder("utf-8")()
    with path.open("rb") as file:
        try:
            while block := file.read(_BLOCK_BYTES):
                decoder.decode(block)
            decoder.decode(b"", final=True)
        except UnicodeDecodeError:
            return "cp1252"
    return "utf-8-sig"


def _open_csv(path: Path, chunk_rows: int) -> Table:
    """Détecte encodage et séparateur, lit l'en-tête, prépare la lecture par blocs."""
    encoding = _encoding(path)
    with path.open(encoding=encoding, newline="") as file:
        sample = file.read(_SNIFF_CHARS)
        if not sample.strip():
            raise InvalidError("Le fichier est vide")
        try:
            separator = csv.Sniffer().sniff(sample, delimiters=SEPARATORS).delimiter
        except csv.Error:
            separator = ","  # une seule colonne : il n'y a aucun séparateur à trouver
        file.seek(0)
        headers = next(csv.reader(file, delimiter=separator))
    _check_headers(headers)
    chunks = _csv_chunks(path, encoding, separator, len(headers), chunk_rows)
    # Convention française : le point-virgule sépare les colonnes parce que la virgule est décimale.
    return Table(headers, separator == ";", chunks)


def _csv_chunks(
    path: Path, encoding: str, separator: str, width: int, chunk_rows: int
) -> Iterator[pd.DataFrame]:
    """Relit le CSV après son en-tête et le livre par blocs."""
    # Le module csv plutôt que pandas.read_csv : pandas tronque en silence une ligne plus
    # longue que l'en-tête, ou décale toutes les colonnes si c'est la première.
    with path.open(encoding=encoding, newline="") as file:
        rows = csv.reader(file, delimiter=separator)
        next(rows)
        yield from _blocks(rows, width, chunk_rows)


def _open_xlsx(path: Path, chunk_rows: int) -> Table:
    """Ouvre la première feuille en lecture seule et lit son en-tête."""
    try:
        workbook = load_workbook(path, read_only=True, data_only=True)
    except (BadZipFile, InvalidFileException, KeyError) as exc:
        raise InvalidError("Ce fichier XLSX est illisible") from exc
    sheet = workbook.worksheets[0].iter_rows(values_only=True)
    rows = ([_text(value) for value in row] for row in sheet)
    headers = next(rows, [])
    # Excel déclare souvent des colonnes vides à droite, juste parce qu'elles ont été formatées.
    while headers and not headers[-1]:
        headers.pop()
    try:
        _check_headers(headers)
    except InvalidError:
        workbook.close()
        raise
    return Table(headers, False, _xlsx_chunks(workbook, rows, len(headers), chunk_rows))


def _xlsx_chunks(
    workbook: Workbook, rows: Iterator[list[str]], width: int, chunk_rows: int
) -> Iterator[pd.DataFrame]:
    """Livre la feuille par blocs, et ferme le classeur à la fin de la lecture."""
    try:
        yield from _blocks(rows, width, chunk_rows)
    finally:
        workbook.close()


def _blocks(rows: Iterator[list[str]], width: int, chunk_rows: int) -> Iterator[pd.DataFrame]:
    """Regroupe les lignes en blocs de largeur fixe. Lève InvalidError sur une ligne trop longue."""
    block: list[list[str]] = []
    # La ligne 1 est l'en-tête : les numéros correspondent à ceux d'Excel et d'un éditeur de texte.
    for number, cells in enumerate(rows, start=2):
        if any(cells[width:]):
            raise InvalidError(f"La ligne {number} contient plus de valeurs que l'en-tête")
        cells = cells[:width]
        if not any(cells):
            continue
        block.append(cells + [""] * (width - len(cells)))
        if len(block) == chunk_rows:
            yield pd.DataFrame(block)
            block = []
    if block:
        yield pd.DataFrame(block)


def _text(value: object) -> str:
    """Écrit une cellule Excel comme elle apparaîtrait dans un CSV."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, datetime | date | time):
        return value.isoformat()
    return str(value)


def _check_headers(headers: list[str]) -> None:
    """Lève InvalidError si la première ligne ne contient aucun nom de colonne."""
    if not any(header.strip() for header in headers):
        raise InvalidError("La première ligne doit contenir le nom des colonnes")
