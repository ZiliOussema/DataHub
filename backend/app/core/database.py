from typing import Any

from fastapi import Request
from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import PyMongoError

from app.core.config import Settings


def create_client(settings: Settings) -> AsyncMongoClient[dict[str, Any]]:
    # MongoDB poursuit une requête abandonnée par le navigateur : timeoutMS plafonne sa durée.
    return AsyncMongoClient(settings.mongo_uri, timeoutMS=settings.mongo_timeout_ms)


async def ping(db: AsyncDatabase[dict[str, Any]]) -> bool:
    try:
        await db.command("ping")
    except PyMongoError:
        return False
    return True


async def mongo_is_up(request: Request) -> bool:
    return await ping(request.app.state.db)
