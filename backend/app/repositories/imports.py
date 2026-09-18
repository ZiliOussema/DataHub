from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING, ReturnDocument, UpdateOne
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.core.errors import ConflictError

Document = dict[str, Any]

# Force 2 : la casse est ignorée, « Clients » et « clients » sont le même nom.
NAME_COLLATION = {"locale": "fr", "strength": 2}


def _object_id(value: str) -> ObjectId | None:
    """Convertit un identifiant texte en ObjectId, ou renvoie None s'il est mal formé."""
    return ObjectId(value) if ObjectId.is_valid(value) else None


def _to_domain(doc: Document) -> Document:
    """Remplace le champ _id de MongoDB par un champ id en texte."""
    doc["id"] = str(doc.pop("_id"))
    return doc


class ImportRepository:
    """Accès à la collection imports. Seule classe qui connaît MongoDB pour les imports."""

    def __init__(self, db: AsyncDatabase[Document]) -> None:
        self._db = db
        self._imports = db["imports"]

    async def ensure_indexes(self) -> None:
        """Crée les index de la collection. Sans effet s'ils existent déjà."""
        await self._imports.create_index("order")
        await self._imports.create_index("name", unique=True, collation=NAME_COLLATION)

    async def list_all(self) -> list[Document]:
        """Renvoie tous les imports, triés par position."""
        cursor = self._imports.find().sort([("order", ASCENDING), ("_id", ASCENDING)])
        return [_to_domain(doc) async for doc in cursor]

    async def get(self, import_id: str) -> Document | None:
        """Renvoie un import, ou None s'il n'existe pas."""
        oid = _object_id(import_id)
        doc = None if oid is None else await self._imports.find_one({"_id": oid})
        return None if doc is None else _to_domain(doc)

    async def last_order(self) -> int:
        """Renvoie la plus grande position, ou -1 s'il n'existe aucun import."""
        last = await self._imports.find_one(sort=[("order", DESCENDING)])
        return -1 if last is None else int(last["order"])

    async def insert(self, name: str, order: int) -> Document:
        """Crée un import vide. Lève ConflictError si le nom est déjà utilisé."""
        now = datetime.now(UTC)
        doc: Document = {
            "name": name,
            "order": order,
            "status": "empty",
            "created_at": now,
            "updated_at": now,
        }
        try:
            await self._imports.insert_one(doc)
        except DuplicateKeyError as exc:
            raise ConflictError(f"Le nom « {name} » est déjà utilisé") from exc
        return _to_domain(doc)

    async def rename(self, import_id: str, name: str) -> Document | None:
        """Renomme un import et renvoie sa nouvelle version, ou None s'il n'existe pas.

        Lève ConflictError si le nom est déjà utilisé.
        """
        oid = _object_id(import_id)
        if oid is None:
            return None
        try:
            doc = await self._imports.find_one_and_update(
                {"_id": oid},
                {"$set": {"name": name, "updated_at": datetime.now(UTC)}},
                return_document=ReturnDocument.AFTER,
            )
        except DuplicateKeyError as exc:
            raise ConflictError(f"Le nom « {name} » est déjà utilisé") from exc
        return None if doc is None else _to_domain(doc)

    async def delete(self, import_id: str) -> bool:
        """Supprime un import et ses collections de données. Renvoie False s'il n'existe pas."""
        oid = _object_id(import_id)
        if oid is None or (await self._imports.delete_one({"_id": oid})).deleted_count == 0:
            return False
        pattern = f"^import_data_{oid}_"
        for name in await self._db.list_collection_names(filter={"name": {"$regex": pattern}}):
            await self._db.drop_collection(name)
        return True

    async def set_order(self, ids: list[str]) -> None:
        """Enregistre les positions dans l'ordre de la liste, en un seul aller-retour."""
        await self._imports.bulk_write(
            [UpdateOne({"_id": ObjectId(i)}, {"$set": {"order": pos}}) for pos, i in enumerate(ids)]
        )

    async def start_import(self, import_id: str, job_id: str) -> Document | None:
        """Passe un import en cours d'import et renvoie son état d'avant.

        Renvoie None s'il n'existe pas ou si un import de fichier y est déjà en cours.
        """
        oid = _object_id(import_id)
        if oid is None:
            return None
        # Condition et écriture en une seule opération : deux envois simultanés sur le même
        # import ne peuvent pas démarrer tous les deux.
        doc = await self._imports.find_one_and_update(
            {"_id": oid, "status": {"$ne": "importing"}},
            # Le job est rattaché à l'import : sa progression se retrouve après un rechargement.
            {"$set": {"status": "importing", "job_id": job_id, "error": None}},
        )
        return None if doc is None else _to_domain(doc)

    async def finish_import(
        self, import_id: str, version: int, columns: list[Document], row_count: int
    ) -> None:
        """Bascule un import sur sa nouvelle version de données, en une seule écriture."""
        await self._imports.update_one(
            {"_id": ObjectId(import_id)},
            {
                "$set": {
                    "status": "ready",
                    "version": version,
                    "columns": columns,
                    "row_count": row_count,
                    "error": None,
                    "updated_at": datetime.now(UTC),
                }
            },
        )

    async def remove_rows(self, import_id: str, count: int) -> None:
        """Retranche des lignes supprimées du total affiché, sans recompter la collection."""
        await self._imports.update_one(
            {"_id": ObjectId(import_id)},
            {"$inc": {"row_count": -count}, "$set": {"updated_at": datetime.now(UTC)}},
        )

    async def fail_import(self, import_id: str, error: str) -> None:
        """Sort un import de l'état en cours : prêt s'il a déjà des données, en échec sinon."""
        # Pipeline : le nouvel état dépend de la version en place, lue dans la même écriture.
        # $literal empêche MongoDB de lire un message commençant par « $ » comme un champ.
        await self._imports.update_one(
            {"_id": ObjectId(import_id)},
            [
                {
                    "$set": {
                        "status": {"$cond": [{"$gt": ["$version", 0]}, "ready", "failed"]},
                        "error": {"$literal": error},
                    }
                }
            ],
        )
