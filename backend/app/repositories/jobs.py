from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

Document = dict[str, Any]


def _to_domain(doc: Document) -> Document:
    """Remplace le champ _id de MongoDB par un champ id."""
    doc["id"] = doc.pop("_id")
    return doc


class JobRepository:
    """Accès à la collection jobs : suivi des traitements longs lancés en arrière-plan."""

    def __init__(self, db: AsyncDatabase[Document]) -> None:
        self._jobs = db["jobs"]

    async def create(self, job_id: str, import_id: str) -> Document:
        """Crée un job en cours, sans total : il n'est connu qu'après la lecture du fichier."""
        doc: Document = {
            "_id": job_id,
            "import_id": import_id,
            "status": "running",
            "processed": 0,
            "total": 0,
            "error": None,
        }
        await self._jobs.insert_one(doc)
        return _to_domain(doc)

    async def get(self, job_id: str) -> Document | None:
        """Renvoie un job, ou None s'il n'existe pas."""
        doc = await self._jobs.find_one({"_id": job_id})
        return None if doc is None else _to_domain(doc)

    async def progress(self, job_id: str, processed: int, total: int) -> None:
        """Enregistre l'avancement : lignes traitées sur le total."""
        await self._jobs.update_one(
            {"_id": job_id}, {"$set": {"processed": processed, "total": total}}
        )

    async def finish(self, job_id: str) -> None:
        """Marque le job terminé avec succès."""
        await self._jobs.update_one({"_id": job_id}, {"$set": {"status": "done"}})

    async def fail(self, job_id: str, error: str) -> None:
        """Marque le job en échec, avec le message à afficher."""
        await self._jobs.update_one({"_id": job_id}, {"$set": {"status": "failed", "error": error}})

    async def fail_running(self, error: str) -> list[str]:
        """Passe en échec les jobs interrompus par un arrêt du serveur. Renvoie leurs imports."""
        running = await self._jobs.find({"status": "running"}).to_list()
        await self._jobs.update_many(
            {"status": "running"}, {"$set": {"status": "failed", "error": error}}
        )
        return [job["import_id"] for job in running]
