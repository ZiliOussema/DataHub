from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.health import router as health_router
from app.api.imports import router as imports_router
from app.api.jobs import router as jobs_router
from app.core.config import settings
from app.core.database import create_client
from app.core.errors import ConflictError, FieldErrors, InvalidError, NotFoundError
from app.repositories.import_data import ImportDataRepository
from app.repositories.imports import ImportRepository
from app.repositories.jobs import JobRepository
from app.services.uploads import UploadService

ERROR_STATUS = {NotFoundError: 404, ConflictError: 409, InvalidError: 422}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Ouvre la connexion MongoDB et crée les index au démarrage, la ferme à l'arrêt."""
    # Un client unique pour toute l'application : il porte le pool de connexions.
    client = create_client(settings)
    app.state.db = client[settings.mongo_db]
    db = app.state.db
    await ImportRepository(db).ensure_indexes()
    # Un import en cours au moment d'un arrêt ne reprendra jamais. On le sort de cet état avant
    # la première requête. Suppose un seul processus serveur, comme dans docker-compose.
    await UploadService(ImportRepository(db), ImportDataRepository(db), JobRepository(db)).recover()
    yield
    await client.close()


async def handle_domain_error(request: Request, exc: Exception) -> JSONResponse:
    """Traduit une erreur métier en réponse HTTP avec son code et son message."""
    status = next(code for error, code in ERROR_STATUS.items() if isinstance(exc, error))
    detail = exc.errors if isinstance(exc, FieldErrors) else str(exc)
    return JSONResponse(status_code=status, content={"detail": detail})


app = FastAPI(title="Datahub", lifespan=lifespan)
for error in ERROR_STATUS:
    app.add_exception_handler(error, handle_domain_error)
app.include_router(health_router, prefix="/api")
app.include_router(imports_router, prefix="/api")
app.include_router(jobs_router, prefix="/api")
