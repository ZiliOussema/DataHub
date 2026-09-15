from app.core.errors import InvalidError, NotFoundError
from app.repositories.imports import Document, ImportRepository

NOT_FOUND = "Import introuvable"


class ImportService:
    """Règles métier des imports : position, ordre complet, import introuvable."""

    def __init__(self, repository: ImportRepository) -> None:
        self._repository = repository

    async def list_imports(self) -> list[Document]:
        """Renvoie les imports dans l'ordre d'affichage."""
        return await self._repository.list_all()

    async def create(self, name: str) -> Document:
        """Crée un import vide, placé après le dernier."""
        return await self._repository.insert(name, await self._repository.last_order() + 1)

    async def rename(self, import_id: str, name: str) -> Document:
        """Renomme un import. Lève NotFoundError s'il n'existe pas."""
        renamed = await self._repository.rename(import_id, name)
        if renamed is None:
            raise NotFoundError(NOT_FOUND)
        return renamed

    async def delete(self, import_id: str) -> None:
        """Supprime un import et ses données. Lève NotFoundError s'il n'existe pas."""
        if not await self._repository.delete(import_id):
            raise NotFoundError(NOT_FOUND)

    async def reorder(self, ids: list[str]) -> list[Document]:
        """Applique un nouvel ordre et renvoie la liste réordonnée.

        Lève InvalidError si la liste ne contient pas chaque import exactement une fois.
        """
        existing = {doc["id"] for doc in await self._repository.list_all()}
        if len(ids) != len(set(ids)) or set(ids) != existing:
            raise InvalidError("L'ordre doit contenir chaque import exactement une fois")
        await self._repository.set_order(ids)
        return await self._repository.list_all()
