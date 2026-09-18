import logging
from uuid import uuid4

from app.core.errors import ConflictError, InvalidError, NotFoundError
from app.repositories.import_data import ImportDataRepository
from app.repositories.imports import Document, ImportRepository
from app.repositories.jobs import JobRepository
from app.schemas.columns import ColumnType, TypeCheck
from app.services.imports import NOT_FOUND
from app.services.uploads import UNEXPECTED, restore

logger = logging.getLogger(__name__)

TYPE_NAMES: dict[ColumnType, str] = {
    "boolean": "des booléens",
    "integer": "des entiers",
    "float": "des décimaux",
    "string": "du texte",
}

# Une seule valeur fautive : « ne peut pas devenir un entier », et non « des entiers ».
TYPE_NAMES_ONE: dict[ColumnType, str] = {
    "boolean": "un booléen",
    "integer": "un entier",
    "float": "un décimal",
    "string": "du texte",
}


def refusal(count: int, examples: list[str], target: ColumnType) -> str:
    """Message qui explique pourquoi une colonne ne peut pas changer de type."""
    values = ", ".join(f"« {example} »" for example in examples)
    one = count == 1
    verb = "ne peut pas devenir" if one else "ne peuvent pas devenir"
    noun = "valeur" if one else "valeurs"
    name = TYPE_NAMES_ONE[target] if one else TYPE_NAMES[target]
    return f"{count} {noun} {verb} {name}, par exemple {values}"


class ColumnTypeService:
    """Correction du type d'une colonne : vérification, puis conversion dans une copie."""

    def __init__(
        self, imports: ImportRepository, data: ImportDataRepository, jobs: JobRepository
    ) -> None:
        self._imports = imports
        self._data = data
        self._jobs = jobs

    async def _ready_column(self, import_id: str, key: str) -> tuple[Document, Document]:
        """Renvoie un import prêt et l'une de ses colonnes. Lève NotFoundError ou ConflictError."""
        item = await self._imports.get(import_id)
        if item is None:
            raise NotFoundError(NOT_FOUND)
        if item["status"] != "ready":
            raise ConflictError("Les données de cet import ne sont pas prêtes")
        column = next((c for c in item["columns"] if c["key"] == key), None)
        if column is None:
            raise NotFoundError("Colonne introuvable")
        return item, column

    async def check(self, import_id: str, key: str, target: ColumnType) -> TypeCheck:
        """Compte les valeurs d'une colonne qui empêchent de lui donner le type cible."""
        item, column = await self._ready_column(import_id, key)
        count, examples = await self._data.check_type(
            import_id, item["version"], key, column["type"], target
        )
        return TypeCheck(invalid_count=count, examples=examples)

    async def start(self, import_id: str, key: str, target: ColumnType) -> Document:
        """Réserve l'import et crée le job. Lève InvalidError si la colonne a déjà ce type."""
        _, column = await self._ready_column(import_id, key)
        if column["type"] == target:
            raise InvalidError("La colonne a déjà ce type")
        job_id = uuid4().hex
        if await self._imports.start_import(import_id, job_id) is None:
            raise ConflictError("Un traitement est déjà en cours pour cet import")
        return await self._jobs.create(job_id, import_id)

    async def run(self, job_id: str, import_id: str, key: str, target: ColumnType) -> None:
        """Revérifie, convertit la colonne puis bascule l'import. Ne lève jamais."""
        try:
            item = await self._imports.get(import_id) or {}
            version = item["version"]
            source = next(c["type"] for c in item["columns"] if c["key"] == key)
            # Revérifié ici : un réimport a pu changer les données depuis la vérification du front.
            count, examples = await self._data.check_type(import_id, version, key, source, target)
            if count > 0:
                raise InvalidError(refusal(count, examples, target))
            await self._data.convert_column(import_id, version, version + 1, key, source, target)
            columns = [{**c, "type": target} if c["key"] == key else c for c in item["columns"]]
            await self._imports.finish_import(import_id, version + 1, columns, item["row_count"])
            await self._data.drop_other_versions(import_id, keep=version + 1)
            await self._jobs.finish(job_id)
        except InvalidError as exc:
            await restore(self._imports, self._data, import_id, str(exc))
            await self._jobs.fail(job_id, str(exc))
        except Exception:
            logger.exception("Conversion de %s dans l'import %s en échec", key, import_id)
            await restore(self._imports, self._data, import_id, UNEXPECTED)
            await self._jobs.fail(job_id, UNEXPECTED)
