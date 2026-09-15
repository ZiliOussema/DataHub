"""Remplit datahub_bench.rows avec un million de documents représentatifs d'un import.

Depuis backend/, MongoDB lancé :
    uv run python scripts/perfs/seed.py
"""

import os
import unicodedata
from typing import Any

from pymongo import MongoClient

TOTAL = 1_000_000
BATCH = 10_000
VILLES = [
    "Paris", "Lyon", "Marseille", "Toulouse", "Nice", "Nantes", "Strasbourg", "Montpellier",
    "Bordeaux", "Lille", "Évry", "Béziers", "Saint-Étienne", "Orléans", "Besançon",
]  # fmt: skip
PRENOMS = ["Élodie", "Chloé", "Gaëlle", "Inès", "Léo", "Hugo", "Karima", "Farid"]


def normalize(text: str) -> str:
    """Renvoie le texte en minuscules et sans accents."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def row(i: int) -> dict[str, Any]:
    """Renvoie la ligne numéro i, identique d'une exécution à l'autre."""
    # Valeurs calculées, sans hasard : deux exécutions produisent les mêmes mesures.
    nom = f"{PRENOMS[i % len(PRENOMS)]} Dupont-{i}"
    ville = VILLES[(i * 7) % len(VILLES)]
    return {
        "_id": i,
        "nom": nom,
        "_n_nom": normalize(nom),
        "ville": ville,
        "_n_ville": normalize(ville),
        "age": None if i % 20 == 0 else 18 + i % 60,
        "montant": (i * 137) % 1_000_000 / 100,
        "actif": None if i % 10 == 0 else i % 3 != 0,
        "code_postal": str((i * 13) % 95_000).zfill(5),
    }


def main() -> None:
    """Recrée la collection et insère les documents par lots."""
    uri = os.environ.get("DATAHUB_MONGO_URI", "mongodb://localhost:27017")
    with MongoClient[dict[str, Any]](uri) as client:
        rows = client["datahub_bench"]["rows"]
        rows.drop()
        for start in range(0, TOTAL, BATCH):
            batch = [row(i) for i in range(start, min(start + BATCH, TOTAL))]
            rows.insert_many(batch, ordered=False)
        print(f"{rows.estimated_document_count()} documents dans datahub_bench.rows")


if __name__ == "__main__":
    main()
