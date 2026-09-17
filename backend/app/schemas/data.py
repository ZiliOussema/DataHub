from typing import Any

from pydantic import BaseModel


class DataPage(BaseModel):
    total: int
    rows: list[dict[str, Any]]
