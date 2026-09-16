from typing import Literal

from pydantic import BaseModel

JobStatus = Literal["running", "done", "failed"]


class JobOut(BaseModel):
    id: str
    import_id: str
    status: JobStatus
    processed: int
    total: int
    error: str | None = None
