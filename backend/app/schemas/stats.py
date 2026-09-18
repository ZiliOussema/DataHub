from typing import Any

from pydantic import BaseModel

from app.schemas.columns import ColumnOut


class Occurrence(BaseModel):
    value: Any
    count: int


class StatsOut(BaseModel):
    column: ColumnOut
    # Valeurs non vides prises en compte : les cases vides ne comptent jamais.
    count: int
    distinct: int
    minimum: float | None = None
    maximum: float | None = None
    average: float | None = None
    true_count: int | None = None
    false_count: int | None = None
    occurrences: list[Occurrence]
