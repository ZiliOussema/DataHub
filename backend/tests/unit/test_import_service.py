import asyncio
from typing import Any

import pytest

from app.core.errors import InvalidError, NotFoundError
from app.services.imports import ImportService


class FakeRepository:
    """Repository en mémoire : teste les règles du service sans MongoDB."""

    def __init__(self) -> None:
        self.docs: dict[str, dict[str, Any]] = {}

    async def list_all(self) -> list[dict[str, Any]]:
        """Renvoie les imports triés par position."""
        return sorted(self.docs.values(), key=lambda doc: doc["order"])

    async def last_order(self) -> int:
        """Renvoie la plus grande position, ou -1 s'il n'existe aucun import."""
        return max((doc["order"] for doc in self.docs.values()), default=-1)

    async def insert(self, name: str, order: int) -> dict[str, Any]:
        """Ajoute un import et le renvoie."""
        doc: dict[str, Any] = {"id": f"id-{len(self.docs)}", "name": name, "order": order}
        self.docs[doc["id"]] = doc
        return doc

    async def get(self, import_id: str) -> dict[str, Any] | None:
        """Renvoie un import, ou None s'il n'existe pas."""
        return self.docs.get(import_id)

    async def rename(self, import_id: str, name: str) -> dict[str, Any] | None:
        """Renomme un import, ou renvoie None s'il n'existe pas."""
        doc = self.docs.get(import_id)
        if doc is not None:
            doc["name"] = name
        return doc

    async def delete(self, import_id: str) -> bool:
        """Supprime un import. Renvoie False s'il n'existe pas."""
        return self.docs.pop(import_id, None) is not None

    async def set_order(self, ids: list[str]) -> None:
        """Enregistre les positions dans l'ordre de la liste."""
        for position, import_id in enumerate(ids):
            self.docs[import_id]["order"] = position


@pytest.fixture
def service() -> ImportService:
    return ImportService(FakeRepository())  # type: ignore[arg-type]


def test_create_places_new_import_last(service: ImportService) -> None:
    asyncio.run(service.create("Clients"))

    created = asyncio.run(service.create("Produits"))

    assert created["order"] == 1


def test_rename_unknown_import_raises_not_found(service: ImportService) -> None:
    with pytest.raises(NotFoundError):
        asyncio.run(service.rename("inconnu", "Clients"))


def test_get_returns_an_existing_import(service: ImportService) -> None:
    created = asyncio.run(service.create("Clients"))

    assert asyncio.run(service.get(created["id"])) == created


def test_get_unknown_import_raises_not_found(service: ImportService) -> None:
    with pytest.raises(NotFoundError):
        asyncio.run(service.get("inconnu"))


def test_delete_unknown_import_raises_not_found(service: ImportService) -> None:
    with pytest.raises(NotFoundError):
        asyncio.run(service.delete("inconnu"))


def test_reorder_applies_the_given_order(service: ImportService) -> None:
    a = asyncio.run(service.create("A"))["id"]
    b = asyncio.run(service.create("B"))["id"]

    reordered = asyncio.run(service.reorder([b, a]))

    assert [doc["name"] for doc in reordered] == ["B", "A"]


@pytest.mark.parametrize("ids", [["id-0"], ["id-0", "id-0"], ["id-0", "inconnu"]])
def test_reorder_rejects_a_list_that_is_not_every_import_once(
    service: ImportService, ids: list[str]
) -> None:
    asyncio.run(service.create("A"))
    asyncio.run(service.create("B"))

    with pytest.raises(InvalidError):
        asyncio.run(service.reorder(ids))
