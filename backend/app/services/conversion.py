from collections.abc import Callable
from typing import Any

import pandas as pd

from app.schemas.columns import ColumnOut, ColumnType
from app.services.columns import normalize_text

Document = dict[str, Any]

TRUE_VALUES = frozenset({"true", "vrai", "oui", "1"})


def _converter(column_type: ColumnType, decimal_comma: bool) -> Callable[[str], object]:
    """Renvoie la fonction qui transforme un texte non vide en valeur du type de la colonne."""
    if column_type == "boolean":
        return lambda value: value.lower() in TRUE_VALUES
    if column_type == "integer":
        return int
    if column_type == "float" and decimal_comma:
        return lambda value: float(value.replace(",", "."))
    if column_type == "float":
        return float
    return str


def to_documents(
    chunk: pd.DataFrame, columns: list[ColumnOut], start_id: int, decimal_comma: bool
) -> list[Document]:
    """Transforme un bloc de lignes texte en documents typés, numérotés à partir de start_id."""
    # _id est le numéro de ligne : l'ordre du fichier sert de tri par défaut, et de départage
    # stable quand deux lignes ont la même valeur dans la colonne triée.
    docs: list[Document] = [{"_id": start_id + offset} for offset in range(len(chunk))]
    for position, column in enumerate(columns):
        convert = _converter(column.type, decimal_comma)
        for doc, value in zip(docs, chunk[position].str.strip().tolist(), strict=True):
            doc[column.key] = convert(value) if value else None
            if column.type == "string":
                # Copie sans accents ni majuscules, pour le filtre « contient ». Jamais indexée :
                # un index la ralentit, mesuré dans docs/mongodb-index.md.
                doc[f"_n_{column.key}"] = normalize_text(value) if value else None
    return docs
