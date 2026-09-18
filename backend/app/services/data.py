import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import cast

from app.core.errors import ConflictError, FieldErrors, InvalidError, NotFoundError
from app.repositories.import_data import ImportDataRepository
from app.repositories.imports import Document, ImportRepository
from app.schemas.columns import ColumnType
from app.schemas.data import BatchChange, DataPage, RowSelection
from app.services.columns import normalize_text
from app.services.conversion import TRUE_VALUES
from app.services.imports import NOT_FOUND
from app.services.type_detection import BOOLEANS, INTEGER_PATTERN, float_pattern

FILTER_PREFIX = "f."
BOOLEAN_FILTERS: dict[str, bool | None] = {"vrai": True, "faux": False, "vide": None}
_INTEGER = re.compile(INTEGER_PATTERN)
_FLOAT = re.compile(float_pattern(False))


@dataclass(frozen=True)
class DataQuery:
    """Filtre et tri MongoDB tirés de l'URL, et colonnes qui mériteraient un index."""

    filter: Document
    sort: list[tuple[str, int]]
    indexable: set[str]
    hidden: list[str]


def _hidden(types: Mapping[str, str]) -> list[str]:
    """Copies du filtre « contient » : inutiles au tableau, elles ne sortent jamais de MongoDB."""
    return [f"_n_{key}" for key, column_type in types.items() if column_type == "string"]


def parse_cell(text: str, column_type: ColumnType) -> object:
    """Lit une valeur saisie selon les règles de l'import. Lève ValueError avec le message."""
    value = text.strip()
    if value == "":
        return None
    if column_type == "integer":
        if not _INTEGER.fullmatch(value):
            raise ValueError("Nombre entier attendu, par exemple 42")
        return int(value)
    if column_type == "float":
        dotted = value.replace(",", ".")
        if not _FLOAT.fullmatch(dotted):
            raise ValueError("Nombre attendu, par exemple 12,5")
        return float(dotted)
    if column_type == "boolean":
        if value.lower() not in BOOLEANS:
            raise ValueError("Valeur attendue : vrai, faux, oui, non, 1 ou 0")
        return value.lower() in TRUE_VALUES
    return value


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
    return DataQuery(conditions, order, indexable, _hidden(types))


def _changes(types: Mapping[str, str], values: Mapping[str, str | None], empty: bool) -> Document:
    """Valeurs lues selon le type de leur colonne, prêtes pour un $set. Lève FieldErrors.

    Une valeur None efface la colonne. `empty` autorise une saisie vide à effacer aussi.
    """
    changes: Document = {}
    errors: dict[str, str] = {}
    for key, text in values.items():
        if key not in types:
            errors[key] = "Colonne inconnue"
            continue
        value: object = None
        if text is not None:
            try:
                # Le type vient du document de l'import, donc toujours l'un des quatre connus.
                value = parse_cell(text, cast(ColumnType, types[key]))
            except ValueError as exc:
                errors[key] = str(exc)
                continue
            if value is None and not empty:
                errors[key] = "Saisissez une valeur, ou choisissez de la vider"
                continue
        changes[key] = value
        if types[key] == "string":
            # La copie suit la valeur, sinon « contient » ne retrouverait plus la ligne.
            changes[f"_n_{key}"] = normalize_text(value) if isinstance(value, str) else None
    if errors:
        raise FieldErrors(errors)
    return changes


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

    async def _writable(self, import_id: str) -> Document:
        """Renvoie un import dont les données peuvent être modifiées. Lève 404 ou 409."""
        item = await self._imports.get(import_id)
        if item is None:
            raise NotFoundError(NOT_FOUND)
        # Écrite dans la version qu'un réimport va remplacer, la modification serait perdue.
        if item["status"] == "importing":
            raise ConflictError("Un traitement est en cours sur cet import")
        if not item.get("version"):
            raise ConflictError("Cet import n'a pas encore de données")
        return item

    def _selection(self, item: Document, selection: RowSelection) -> Document:
        """Filtre MongoDB d'une sélection : des numéros de ligne, ou les filtres du tableau."""
        if selection.ids is not None:
            return {"_id": {"$in": selection.ids}}
        filters = selection.filters or {}
        params = {f"{FILTER_PREFIX}{name}": value for name, value in filters.items()}
        return build_query(item["columns"], None, params).filter

    async def update_row(self, import_id: str, row_id: int, values: Mapping[str, str]) -> Document:
        """Modifie une ligne, chaque valeur lue selon le type de sa colonne.

        Lève NotFoundError, ConflictError pendant un traitement, FieldErrors sur une valeur refusée.
        """
        item = await self._writable(import_id)
        types = {column["key"]: column["type"] for column in item["columns"]}
        changes = _changes(types, values, empty=True)
        if not changes:
            raise InvalidError("Aucune valeur à modifier")
        row = await self._data.update_row(
            import_id, item["version"], row_id, changes, _hidden(types)
        )
        if row is None:
            raise NotFoundError("Ligne introuvable")
        return row

    async def update_rows(self, import_id: str, body: BatchChange) -> int:
        """Applique les mêmes changements à toute la sélection. Renvoie le nombre de lignes."""
        item = await self._writable(import_id)
        types = {column["key"]: column["type"] for column in item["columns"]}
        values = {
            key: None if change.action == "clear" else change.value
            for key, change in body.changes.items()
        }
        changes = _changes(types, values, empty=False)
        if not changes:
            raise InvalidError("Aucune colonne à modifier")
        query = self._selection(item, body)
        return await self._data.update_rows(import_id, item["version"], query, changes)

    async def delete_rows(self, import_id: str, selection: RowSelection) -> int:
        """Supprime toute la sélection. Renvoie le nombre de lignes supprimées."""
        item = await self._writable(import_id)
        query = self._selection(item, selection)
        deleted = await self._data.delete_rows(import_id, item["version"], query)
        # Le total de la fiche mentirait jusqu'au prochain import : il est retranché ici.
        if deleted:
            await self._imports.remove_rows(import_id, deleted)
        return deleted
