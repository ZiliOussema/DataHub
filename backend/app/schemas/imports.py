from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

from app.schemas.columns import ColumnOut

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
ImportStatus = Literal["empty", "importing", "ready", "failed"]


class ImportName(BaseModel):
    name: Name


class ImportOut(BaseModel):
    id: str
    name: str
    order: int
    status: ImportStatus
    # Valeurs par défaut : un import jamais rempli n'a encore ni colonnes, ni lignes, ni erreur.
    columns: list[ColumnOut] = []
    row_count: int = 0
    error: str | None = None
    job_id: str | None = None
    created_at: datetime
    updated_at: datetime


class ImportOrder(BaseModel):
    ids: list[str]
