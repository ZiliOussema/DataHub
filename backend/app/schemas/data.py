from typing import Any, Literal, Self

from pydantic import BaseModel, Field, model_validator


class DataPage(BaseModel):
    total: int
    rows: list[dict[str, Any]]


class RowChange(BaseModel):
    # Texte tel que saisi, par clé de colonne. Une chaîne vide efface la valeur.
    values: dict[str, str]


class RowSelection(BaseModel):
    # Des lignes choisies à la main, ou toutes celles qui passent les filtres du tableau.
    ids: list[int] | None = Field(default=None, max_length=10_000)
    filters: dict[str, str] | None = None

    @model_validator(mode="after")
    def one_selection(self) -> Self:
        """Refuse une sélection vide ou double : numéros et filtres ne se combinent pas."""
        if (self.ids is None) == (self.filters is None):
            raise ValueError("Indiquez soit des numéros de ligne, soit des filtres")
        return self


class FieldChange(BaseModel):
    action: Literal["set", "clear"]
    value: str = ""


class BatchChange(RowSelection):
    # Une colonne absente est conservée : un champ non touché n'est jamais écrasé.
    changes: dict[str, FieldChange]


class BatchResult(BaseModel):
    count: int
