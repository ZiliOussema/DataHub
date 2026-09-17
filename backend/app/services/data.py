import math
import re
from collections.abc import Mapping
from dataclasses import dataclass

from app.core.errors import ConflictError, InvalidError, NotFoundError
from app.repositories.import_data import ImportDataRepository
from app.repositories.imports import Document, ImportRepository
from app.schemas.data import DataPage
from app.services.columns import normalize_text
from app.services.imports import NOT_FOUND

FILTER_PREFIX = "f."
BOOLEAN_FILTERS: dict[str, bool | None] = {"vrai": True, "faux": False, "vide": None}


@dataclass(frozen=True)
class DataQuery:
    """Filtre et tri MongoDB tirés de l'URL, et colonnes qui mériteraient un index."""

    filter: Document
    sort: list[tuple[str, int]]
    indexable: set[str]
    hidden: list[str]


def _number(value: str, key: str) -> float:
    """Lit la borne d'un filtre numérique. Lève InvalidError si ce n'est pas un nombre."""
    try:
        number = float(value.replace(",", "."))
    except ValueError:
        number = math.nan
    if not math.isfinite(number):
        raise InvalidError(f"Le filtre de « {key} » attend un nombre")
    return number


def build_query(columns: list[Document], sort: str | None, params: Mapping[str, str]) -> DataQuery:
    """Traduit le tri et les filtres de l'URL. Lève InvalidError sur une clé ou valeur inconnue."""
    # Liste blanche : seules les clés de l'import atteignent MongoDB, jamais un opérateur de l'URL.
    types = {column["key"]: column["type"] for column in columns}
    conditions: Document = {}
    indexable: set[str] = set()
    for name, value in params.items():
        if not name.startswith(FILTER_PREFIX) or value == "":
            continue
        key, _, bound = name.removeprefix(FILTER_PREFIX).partition(".")
        column_type = types.get(key)
        if column_type == "string" and not bound:
            conditions[f"_n_{key}"] = {"$regex": re.escape(normalize_text(value))}
        elif column_type in ("integer", "float") and bound in ("min", "max"):
            operator = "$gte" if bound == "min" else "$lte"
            conditions.setdefault(key, {})[operator] = _number(value, key)
            indexable.add(key)
        elif column_type == "boolean" and not bound and value in BOOLEAN_FILTERS:
            conditions[key] = BOOLEAN_FILTERS[value]
            indexable.add(key)
        else:
            raise InvalidError(f"Filtre invalide : {name}={value}")

    order = [("_id", 1)]
    if sort:
        key = sort.removeprefix("-")
        if key not in types:
            raise InvalidError(f"Tri sur une colonne inconnue : {key}")
        # _id départage les ex æquo, dans le sens de la colonne : un seul index sert les deux sens.
        direction = -1 if sort.startswith("-") else 1
        order = [(key, direction), ("_id", direction)]
        indexable.add(key)
    # Copies du filtre « contient » : inutiles au tableau, elles ne sortent jamais de MongoDB.
    hidden = [f"_n_{key}" for key, column_type in types.items() if column_type == "string"]
    return DataQuery(conditions, order, indexable, hidden)


class DataService:
    """Lecture des données d'un import : filtres, tri, pagination par paquets."""

    def __init__(self, imports: ImportRepository, data: ImportDataRepository) -> None:
        self._imports = imports
        self._data = data

    async def read(
        self, import_id: str, offset: int, limit: int, sort: str | None, params: Mapping[str, str]
    ) -> tuple[DataPage, int, set[str]]:
        """Renvoie un paquet de lignes, la version lue et les colonnes à indexer.

        Lève NotFoundError, ConflictError si l'import n'a pas de données, InvalidError sur l'URL.
        """
        item = await self._imports.get(import_id)
        if item is None:
            raise NotFoundError(NOT_FOUND)
        if item["status"] not in ("ready", "importing") or not item.get("version"):
            raise ConflictError("Cet import n'a pas encore de données")
        query = build_query(item["columns"], sort, params)
        rows, total = await self._data.find_rows(
            import_id, item["version"], query.filter, query.sort, query.hidden, offset, limit
        )
        return DataPage(total=total, rows=rows), item["version"], query.indexable

    async def ensure_indexes(self, import_id: str, version: int, keys: set[str]) -> None:
        """Crée les index des colonnes triées ou filtrées par plage, après la réponse."""
        for key in keys:
            await self._data.ensure_index(import_id, version, key)
