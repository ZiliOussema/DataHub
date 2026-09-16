from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

Document = dict[str, Any]


def collection_name(import_id: str, version: int) -> str:
    """Renvoie le nom de la collection qui porte une version des données d'un import."""
    return f"import_data_{import_id}_v{version}"


class ImportDataRepository:
    """Accès aux données des imports : une collection par version, import_data_{id}_v{n}."""

    def __init__(self, db: AsyncDatabase[Document]) -> None:
        self._db = db

    async def insert_batch(self, import_id: str, version: int, docs: list[Document]) -> None:
        """Insère un lot de lignes dans la version en cours de construction."""
        # ordered=False : MongoDB n'a pas à respecter l'ordre du lot, il écrit plus vite.
        # L'ordre des lignes est porté par _id, pas par l'ordre d'insertion.
        await self._db[collection_name(import_id, version)].insert_many(docs, ordered=False)

    async def drop_other_versions(self, import_id: str, keep: int) -> None:
        """Supprime toutes les versions d'un import sauf keep. keep=0 les supprime toutes."""
        pattern = f"^import_data_{import_id}_v[0-9]+$"
        kept = collection_name(import_id, keep)
        for name in await self._db.list_collection_names(filter={"name": {"$regex": pattern}}):
            if name != kept:
                await self._db.drop_collection(name)
