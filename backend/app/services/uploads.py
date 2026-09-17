import logging
from pathlib import Path
from uuid import uuid4

from fastapi.concurrency import run_in_threadpool

from app.core.errors import ConflictError, InvalidError, NotFoundError
from app.repositories.import_data import ImportDataRepository
from app.repositories.imports import Document, ImportRepository
from app.repositories.jobs import JobRepository
from app.services.conversion import to_documents
from app.services.file_reader import open_table
from app.services.imports import NOT_FOUND
from app.services.type_detection import detect_types

logger = logging.getLogger(__name__)

# 10 000 lignes par lot : un aller-retour MongoDB de taille raisonnable, et une barre de
# progression qui avance toutes les secondes environ sur un million de lignes.
BATCH_ROWS = 10_000
UNEXPECTED = "L'import a échoué sur une erreur inattendue"
INTERRUPTED = "L'import a été interrompu par un redémarrage du serveur"


class UploadService:
    """Import d'un fichier en arrière-plan : lecture, insertion par lots, bascule de version."""

    def __init__(
        self, imports: ImportRepository, data: ImportDataRepository, jobs: JobRepository
    ) -> None:
        self._imports = imports
        self._data = data
        self._jobs = jobs

    async def start(self, import_id: str) -> Document:
        """Réserve l'import et crée son job. Lève NotFoundError, ou ConflictError s'il est pris."""
        # Identifiant texte aléatoire plutôt qu'ObjectId : un job n'est cherché que par lui, et
        # un identifiant mal formé ne trouve simplement rien.
        job_id = uuid4().hex
        if await self._imports.start_import(import_id, job_id) is None:
            if await self._imports.get(import_id) is None:
                raise NotFoundError(NOT_FOUND)
            raise ConflictError("Un fichier est déjà en cours d'import pour cet import")
        return await self._jobs.create(job_id, import_id)

    async def run(self, job_id: str, import_id: str, path: Path, filename: str) -> None:
        """Importe le fichier puis bascule l'import sur la nouvelle version. Ne lève jamais."""
        # Tâche de fond : personne n'attend son exception, tout échec est écrit dans le job.
        try:
            current = await self._imports.get(import_id)
            version = (current or {}).get("version", 0) + 1
            detection = await run_in_threadpool(detect_types, path, filename)
            await self._jobs.progress(job_id, 0, detection.row_count)
            table = await run_in_threadpool(open_table, path, filename, BATCH_ROWS)
            inserted = 0
            while (chunk := await run_in_threadpool(next, table.chunks, None)) is not None:
                docs = await run_in_threadpool(
                    to_documents, chunk, detection.columns, inserted, table.decimal_comma
                )
                await self._data.insert_batch(import_id, version, docs)
                inserted += len(docs)
                await self._jobs.progress(job_id, inserted, detection.row_count)
            columns = [column.model_dump() for column in detection.columns]
            await self._imports.finish_import(import_id, version, columns, inserted)
            await self._data.drop_other_versions(import_id, keep=version)
            await self._jobs.finish(job_id)
        except InvalidError as exc:
            await restore(self._imports, self._data, import_id, str(exc))
            await self._jobs.fail(job_id, str(exc))
        except Exception:
            logger.exception("Import %s en échec", import_id)
            await restore(self._imports, self._data, import_id, UNEXPECTED)
            await self._jobs.fail(job_id, UNEXPECTED)
        finally:
            path.unlink(missing_ok=True)

    async def recover(self) -> None:
        """Au démarrage, sort de l'état en cours les imports interrompus par un arrêt du serveur."""
        for import_id in await self._jobs.fail_running(INTERRUPTED):
            await restore(self._imports, self._data, import_id, INTERRUPTED)


async def restore(
    imports: ImportRepository, data: ImportDataRepository, import_id: str, error: str
) -> None:
    """Remet un import dans un état stable après un échec, et supprime sa version partielle."""
    await imports.fail_import(import_id, error)
    current = await imports.get(import_id)
    await data.drop_other_versions(import_id, keep=(current or {}).get("version", 0))
