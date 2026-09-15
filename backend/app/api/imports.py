from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from app.repositories.imports import ImportRepository
from app.schemas.imports import ImportName, ImportOrder, ImportOut
from app.services.imports import ImportService

router = APIRouter(prefix="/imports", tags=["imports"])


def get_service(request: Request) -> ImportService:
    """Construit le service des imports sur la base ouverte au démarrage."""
    return ImportService(ImportRepository(request.app.state.db))


Service = Annotated[ImportService, Depends(get_service)]


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
