from typing import Any

from fastapi import Request
from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import PyMongoError

from app.core.config import Settings


def create_client(settings: Settings) -> AsyncMongoClient[dict[str, Any]]:
    """Crée le client MongoDB. La connexion s'ouvre à la première requête."""
    # MongoDB poursuit une requête abandonnée par le navigateur : timeoutMS plafonne sa durée.
    # tz_aware : les dates sont stockées en UTC sans fuseau. Sans ce drapeau PyMongo les relit
    # naïves, et le navigateur les prend pour de l'heure locale.
    return AsyncMongoClient(settings.mongo_uri, timeoutMS=settings.mongo_timeout_ms, tz_aware=True)


async def ping(db: AsyncDatabase[dict[str, Any]]) -> bool:
    """Renvoie True si MongoDB répond, False sinon."""
    try:
        await db.command("ping")
    except PyMongoError:
        return False
    return True


async def mongo_is_up(request: Request) -> bool:
    """Dépendance FastAPI : vérifie la base ouverte au démarrage de l'application."""
    return await ping(request.app.state.db)
