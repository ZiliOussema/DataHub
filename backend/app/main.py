from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.health import router as health_router
from app.core.config import settings
from app.core.database import create_client


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Un client unique pour toute l'application : il porte le pool de connexions.
    client = create_client(settings)
    app.state.db = client[settings.mongo_db]
    yield
    await client.close()


app = FastAPI(title="Datahub", lifespan=lifespan)
app.include_router(health_router, prefix="/api")
