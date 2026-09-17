from typing import Any

from pydantic import BaseModel


class DataPage(BaseModel):
    total: int
    rows: list[dict[str, Any]]


class RowChange(BaseModel):
    # Texte tel que saisi, par clé de colonne. Une chaîne vide efface la valeur.
    values: dict[str, str]
