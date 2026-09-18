import asyncio
import re
from collections.abc import Mapping

from app.core.errors import ConflictError, InvalidError, NotFoundError
from app.repositories.import_data import ImportDataRepository
from app.repositories.imports import Document, ImportRepository
from app.schemas.columns import ColumnOut
from app.schemas.stats import Occurrence, StatsOut
from app.services.columns import normalize_text
from app.services.data import build_query
from app.services.imports import NOT_FOUND

OCCURRENCES_PER_PAGE = 20
# _id est la valeur regroupée : il départage deux valeurs de même nombre d'occurrences.
OCCURRENCE_SORTS: dict[str, Document] = {
    "-count": {"count": -1, "_id": 1},
    "count": {"count": 1, "_id": 1},
    "value": {"_id": 1},
    "-value": {"_id": -1},
}


def _page(value: str) -> int:
    """Lit un numéro de page. Lève InvalidError s'il n'est pas un entier positif."""
    try:
        page = int(value)
    except ValueError as exc:
        raise InvalidError("Page des occurrences invalide") from exc
    if page < 1:
        raise InvalidError("Page des occurrences invalide")
    return page


class StatsService:
    """Statistiques d'une colonne, calculées par MongoDB à chaque demande."""

    def __init__(self, imports: ImportRepository, data: ImportDataRepository) -> None:
        self._imports = imports
        self._data = data

    async def read(self, import_id: str, key: str, params: Mapping[str, str]) -> StatsOut:
        """Renvoie les chiffres d'une colonne et une page de son tableau valeur/occurrence.

        Lève NotFoundError, ConflictError sans données, InvalidError sur un paramètre invalide.
        """
        item = await self._imports.get(import_id)
        if item is None:
            raise NotFoundError(NOT_FOUND)
        if not item.get("version"):
            raise ConflictError("Cet import n'a pas encore de données")
        column = next((c for c in item["columns"] if c["key"] == key), None)
        if column is None:
            raise NotFoundError("Colonne introuvable")

        # Case 1 : les statistiques portent sur les lignes que le tableau afficherait.
        # Comparaison à « 1 » : en Python la chaîne « 0 » est vraie, et cocher puis décocher
        # une case laisse « filtered=0 » dans une URL partagée.
        filters = (
            build_query(item["columns"], None, params).filter
            if params.get("filtered") == "1"
            else {}
        )
        # Le filtre du tableau des occurrences restreint toujours ce tableau.
        search = params.get("search", "").strip()
        occurrences = filters
        if search and column["type"] == "string":
            contains = {f"_n_{key}": {"$regex": re.escape(normalize_text(search))}}
            occurrences = {"$and": [filters, contains]} if filters else contains
        # Case 2 : les chiffres du haut suivent ce filtre, au lieu de porter sur toute la colonne.
        summarized = occurrences if params.get("searched") == "1" else filters

        sort = OCCURRENCE_SORTS.get(params.get("sort", "-count"))
        if sort is None:
            raise InvalidError("Tri des occurrences inconnu")
        page = _page(params.get("page", "1"))

        summary, (rows, distinct) = await asyncio.gather(
            self._data.summary(import_id, item["version"], summarized, key, column["type"]),
            self._data.occurrences(
                import_id,
                item["version"],
                occurrences,
                key,
                sort,
                (page - 1) * OCCURRENCES_PER_PAGE,
                OCCURRENCES_PER_PAGE,
            ),
        )
        count = int(summary.get("count", 0))
        true_count = summary.get("true_count")
        return StatsOut(
            column=ColumnOut.model_validate(column),
            count=count,
            distinct=distinct,
            minimum=summary.get("minimum"),
            maximum=summary.get("maximum"),
            average=summary.get("average"),
            true_count=true_count,
            false_count=None if true_count is None else count - true_count,
            occurrences=[Occurrence(**row) for row in rows],
        )
