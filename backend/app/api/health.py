from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.core.database import mongo_is_up
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(
    response: Response, mongo_up: Annotated[bool, Depends(mongo_is_up)]
) -> HealthResponse:
    """Indique si le backend et MongoDB répondent : 200 si oui, 503 si la base manque."""
    if not mongo_up:
        # 503 et non 500 : le backend tourne, c'est sa base qui manque.
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return HealthResponse(status="degraded", mongo="unreachable")
    return HealthResponse(status="ok", mongo="ok")
