from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from app.schemas.columns import ColumnOut, ColumnType
from app.services.columns import build_columns
from app.services.file_reader import CHUNK_ROWS, open_table

BOOLEANS = frozenset({"true", "false", "vrai", "faux", "oui", "non", "0", "1"})

# Pas de zéro initial : « 00123 » est un code postal ou un identifiant, il reste du texte.
_NUMBER = r"[+-]?(?:0|[1-9]\d*)"
_EXPONENT = r"(?:[eE][+-]?\d+)?"


def _float_pattern(decimal_comma: bool) -> str:
    """Renvoie l'expression d'un décimal, écrit avec une virgule ou avec un point."""
    # Jamais les deux : dans un fichier français, « 1.234 » signifie mille deux cent trente-quatre.
    mark = "," if decimal_comma else r"\."
    return rf"{_NUMBER}(?:{mark}\d+)?{_EXPONENT}|[+-]?{mark}\d+{_EXPONENT}"


@dataclass
class _Candidates:
    """Types encore possibles pour une colonne, d'après toutes les valeurs lues jusqu'ici."""

    boolean: bool = True
    integer: bool = True
    floating: bool = True
    seen: bool = False

    def narrow(self, values: "pd.Series[str]", float_pattern: str) -> None:
        """Écarte les types que contredisent les valeurs non vides de ce bloc."""
        if not (self.boolean or self.integer or self.floating):
            return  # déjà du texte : les blocs suivants ne peuvent plus rien changer
        filled = values.str.strip()
        filled = filled[filled != ""]
        if filled.empty:
            return
        self.seen = True
        if self.boolean:
            self.boolean = bool(filled.str.lower().isin(BOOLEANS).all())
        if self.integer:
            self.integer = bool(filled.str.fullmatch(_NUMBER).all())
        if self.floating:
            self.floating = bool(filled.str.fullmatch(float_pattern).all())

    def type(self) -> ColumnType:
        """Renvoie le type le plus précis encore possible. Une colonne sans valeur est du texte."""
        if not self.seen:
            return "string"
        if self.boolean:
            return "boolean"
        if self.integer:
            return "integer"
        if self.floating:
            return "float"
        return "string"


def detect_types(path: Path, filename: str, chunk_rows: int = CHUNK_ROWS) -> list[ColumnOut]:
    """Lit tout le fichier et renvoie ses colonnes typées. Lève InvalidError s'il est illisible."""
    table = open_table(path, filename, chunk_rows)
    float_pattern = _float_pattern(table.decimal_comma)
    candidates = [_Candidates() for _ in table.headers]
    # Tout le fichier, sans échantillon : une seule valeur « N/A » à la ligne 900 000 suffit
    # à faire d'une colonne de nombres une colonne de texte.
    for chunk in table.chunks:
        for position, candidate in enumerate(candidates):
            candidate.narrow(chunk[position], float_pattern)
    return [
        ColumnOut(label=label, key=key, type=candidate.type())
        for (label, key), candidate in zip(build_columns(table.headers), candidates, strict=True)
    ]
