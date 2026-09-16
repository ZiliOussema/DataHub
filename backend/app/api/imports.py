from typing import Annotated

from fastapi import APIRouter, Depends, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool

from app.core.uploads import saved_upload
from app.repositories.imports import ImportRepository
from app.schemas.columns import ColumnOut
from app.schemas.imports import ImportName, ImportOrder, ImportOut
from app.services.imports import ImportService
from app.services.type_detection import detect_types

router = APIRouter(prefix="/imports", tags=["imports"])


def get_service(request: Request) -> ImportService:
    """Construit le service des imports sur la base ouverte au démarrage."""
    return ImportService(ImportRepository(request.app.state.db))


Service = Annotated[ImportService, Depends(get_service)]


def _detect(file: UploadFile) -> list[ColumnOut]:
    """Copie le fichier reçu et détecte ses types. Lève InvalidError s'il est illisible."""
    with saved_upload(file.file) as path:
        return detect_types(path, file.filename or "")


@router.get("")
async def list_imports(service: Service) -> list[ImportOut]:
    """Liste les imports dans l'ordre d'affichage."""
    return [ImportOut.model_validate(doc) for doc in await service.list_imports()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_import(body: ImportName, service: Service) -> ImportOut:
    """Crée un import vide, placé en dernière position."""
    return ImportOut.model_validate(await service.create(body.name))


@router.put("/order")
async def reorder_imports(body: ImportOrder, service: Service) -> list[ImportOut]:
    """Enregistre l'ordre complet des imports."""
    return [ImportOut.model_validate(doc) for doc in await service.reorder(body.ids)]


@router.patch("/{import_id}")
async def rename_import(import_id: str, body: ImportName, service: Service) -> ImportOut:
    """Renomme un import."""
    return ImportOut.model_validate(await service.rename(import_id, body.name))


@router.delete("/{import_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_import(import_id: str, service: Service) -> None:
    """Supprime un import et ses données."""
    await service.delete(import_id)


@router.post("/{import_id}/detect-types")
async def detect_column_types(
    import_id: str, file: UploadFile, service: Service
) -> list[ColumnOut]:
    """Aperçu avant import : colonnes et types détectés, sans rien enregistrer."""
    await service.get(import_id)
    # Lecture du fichier entier : hors de la boucle asynchrone, sinon le serveur ne répond
    # plus à personne pendant la détection.
    return await run_in_threadpool(_detect, file)
