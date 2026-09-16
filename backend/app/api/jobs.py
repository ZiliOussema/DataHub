from fastapi import APIRouter, Request

from app.core.errors import NotFoundError
from app.repositories.jobs import JobRepository
from app.schemas.jobs import JobOut

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}")
async def get_job(job_id: str, request: Request) -> JobOut:
    """Renvoie l'avancement d'un traitement lancé en arrière-plan."""
    job = await JobRepository(request.app.state.db).get(job_id)
    if job is None:
        raise NotFoundError("Traitement introuvable")
    return JobOut.model_validate(job)
