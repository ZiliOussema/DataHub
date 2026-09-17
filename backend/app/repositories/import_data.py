import asyncio
from typing import Any

import pymongo
from pymongo.asynchronous.database import AsyncDatabase

from app.schemas.columns import ColumnType
from app.services.conversion import TRUE_VALUES
from app.services.type_detection import BOOLEANS, INTEGER_PATTERN, float_pattern

Document = dict[str, Any]

EXAMPLES = 3
# Au-delà de 2⁵³, un entier converti en décimal perd ses derniers chiffres.
EXACT_FLOAT = 2**53
# Tâches de fond : copie ou index d'un million de lignes dépassent le plafond de 5 s du navigateur.
BACKGROUND_TIMEOUT_S = 600
# MongoDB accepte 64 index par collection, _id compris : on garde une marge.
MAX_INDEXES = 60


def collection_name(import_id: str, version: int) -> str:
    """Renvoie le nom de la collection qui porte une version des données d'un import."""
    return f"import_data_{import_id}_v{version}"


def _valid(field: str, source: ColumnType, target: ColumnType) -> object:
    """Expression vraie si la valeur non vide du champ peut prendre le type cible sans perte."""
    value = f"${field}"
    if target == "string" or source == "boolean":
        return True
    if source == "string" and target == "integer":
        return {"$regexMatch": {"input": value, "regex": f"^(?:{INTEGER_PATTERN})$"}}
    if source == "string" and target == "float":
        return {"$regexMatch": {"input": _dotted(value), "regex": f"^(?:{float_pattern(False)})$"}}
    if source == "string":
        return {"$in": [{"$toLower": value}, sorted(BOOLEANS)]}
    if target == "boolean":
        return {"$in": [value, [0, 1]]}
    if target == "integer":
        return {"$and": [{"$eq": [value, {"$trunc": value}]}, {"$lt": [{"$abs": value}, 10**18]}]}
    return {"$lte": [{"$abs": value}, EXACT_FLOAT]}


def _converted(field: str, source: ColumnType, target: ColumnType) -> object:
    """Expression qui donne la valeur non vide du champ dans le type cible, déjà vérifiée."""
    value = f"${field}"
    if target == "string":
        return {"$toString": value}
    if source == "boolean":
        return {"$cond": [value, 1, 0]} if target == "integer" else {"$cond": [value, 1.0, 0.0]}
    if source == "string" and target == "integer":
        return {"$toLong": value}
    if source == "string" and target == "float":
        return {"$toDouble": _dotted(value)}
    if source == "string":
        return {"$in": [{"$toLower": value}, sorted(TRUE_VALUES)]}
    if target == "integer":
        return {"$toLong": value}
    if target == "float":
        return {"$toDouble": value}
    return {"$eq": [value, 1]}


def _dotted(value: str) -> object:
    """Remplace la virgule décimale par un point, pour lire « 12,5 » comme « 12.5 »."""
    return {"$replaceAll": {"input": value, "find": ",", "replacement": "."}}


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

    async def check_type(
        self, import_id: str, version: int, key: str, source: ColumnType, target: ColumnType
    ) -> tuple[int, list[str]]:
        """Compte les valeurs non vides impossibles à convertir, avec quelques exemples."""
        invalid = {"$match": {key: {"$ne": None}, "$expr": {"$not": [_valid(key, source, target)]}}}
        data = self._db[collection_name(import_id, version)]
        counted = await (await data.aggregate([invalid, {"$count": "n"}])).to_list()
        sample = await (
            await data.aggregate(
                [invalid, {"$limit": EXAMPLES}, {"$project": {"v": {"$toString": f"${key}"}}}]
            )
        ).to_list()
        return (counted[0]["n"] if counted else 0, [doc["v"] for doc in sample])

    async def convert_column(
        self,
        import_id: str,
        version: int,
        new_version: int,
        key: str,
        source: ColumnType,
        target: ColumnType,
    ) -> None:
        """Écrit une nouvelle version où la colonne a le type cible, valeurs déjà vérifiées."""
        value = f"${key}"
        normalized = f"_n_{key}"
        converted = {"$cond": [{"$eq": [value, None]}, None, _converted(key, source, target)]}
        pipeline: list[Document] = [{"$set": {key: converted}}]
        if target == "string":
            # $toLower transforme une valeur vide en chaîne vide : la copie doit rester vide aussi.
            lowered = {"$cond": [{"$eq": [value, None]}, None, {"$toLower": value}]}
            pipeline.append({"$set": {normalized: lowered}})
        if source == "string":
            pipeline.append({"$unset": normalized})
        # $out remplace d'un coup la collection cible : la version n'existe qu'une fois complète.
        pipeline.append({"$out": collection_name(import_id, new_version)})
        with pymongo.timeout(BACKGROUND_TIMEOUT_S):
            cursor = await self._db[collection_name(import_id, version)].aggregate(
                pipeline, allowDiskUse=True
            )
            await cursor.to_list()

    async def find_rows(
        self,
        import_id: str,
        version: int,
        query: Document,
        sort: list[tuple[str, int]],
        hidden: list[str],
        offset: int,
        limit: int,
    ) -> tuple[list[Document], int]:
        """Renvoie un paquet de lignes et le nombre total de lignes qui passent les filtres."""
        data = self._db[collection_name(import_id, version)]
        rows = data.find(query, {field: 0 for field in hidden} or None)
        rows = rows.sort(sort).skip(offset).limit(limit)
        # Sans filtre, le total vient d'un compteur tenu par MongoDB : 1 ms au lieu de 190 ms.
        total = data.count_documents(query) if query else data.estimated_document_count()
        return await asyncio.gather(rows.to_list(), total)

    async def ensure_index(self, import_id: str, version: int, key: str) -> None:
        """Crée l'index (clé, _id) d'une colonne s'il manque, dans la limite de MAX_INDEXES."""
        data = self._db[collection_name(import_id, version)]
        names = [index["name"] for index in await (await data.list_indexes()).to_list()]
        if f"{key}_1__id_1" in names or len(names) > MAX_INDEXES:
            return
        with pymongo.timeout(BACKGROUND_TIMEOUT_S):
            await data.create_index([(key, 1), ("_id", 1)])
