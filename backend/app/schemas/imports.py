from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class ImportName(BaseModel):
    name: Name


class ImportOut(BaseModel):
    id: str
    name: str
    order: int
    status: Literal["empty"]
    created_at: datetime
    updated_at: datetime


class ImportOrder(BaseModel):
    ids: list[str]
