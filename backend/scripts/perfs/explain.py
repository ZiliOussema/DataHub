"""Mesure huit requêtes clés sur datahub_bench.rows. Lancer seed.py avant.

Depuis backend/, MongoDB lancé :
    uv run python scripts/perfs/explain.py
"""

import os
import time
from collections.abc import Callable
from typing import Any

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.cursor import Cursor

PAGE = 100
Document = dict[str, Any]


def stage_names(plan: Document) -> str:
    """Résume l'arbre d'exécution en une ligne, de l'étape finale à la première."""
    names: list[str] = []

    def walk(node: Document | None) -> None:
        if node is None:
            return
        names.append(node["stage"])
        walk(node.get("inputStage"))
        for child in node.get("inputStages", []):
            walk(child)

    # Selon le moteur d'exécution choisi, MongoDB 8 range l'arbre sous queryPlan ou à la racine.
    walk(plan.get("queryPlan", plan))
    return " < ".join(names)


def used_disk(node: object) -> bool:
    """Renvoie True si une étape du compte rendu a dû écrire sur le disque."""
    if isinstance(node, dict):
        return node.get("usedDisk") is True or any(used_disk(v) for v in node.values())
    if isinstance(node, list):
        return any(used_disk(v) for v in node)
    return False


def measure_find(label: str, make_cursor: Callable[[], Cursor[Document]]) -> None:
    """Affiche le plan, la durée, les clés et documents lus d'une recherche."""
    # Première exécution sans mesure : le cache chaud reflète une application en service.
    list(make_cursor())
    explain = make_cursor().explain()
    stats = explain["executionStats"]
    print(
        " | ".join(
            [
                label,
                stage_names(explain["queryPlanner"]["winningPlan"]),
                f"{stats['executionTimeMillis']} ms",
                f"clés {stats['totalKeysExamined']}",
                f"documents {stats['totalDocsExamined']}",
                "disque" if used_disk(explain) else "mémoire",
            ]
        )
    )


def measure_call(label: str, call: Callable[[], int]) -> None:
    """Affiche la durée et le résultat d'un comptage."""
    call()
    start = time.perf_counter()
    result = call()
    print(f"{label} | {(time.perf_counter() - start) * 1000:.0f} ms | résultat {result}")


def run(rows: Collection[Document]) -> None:
    """Enchaîne les scénarios dans l'ordre où les index sont créés."""
    by_ville = [("ville", ASCENDING), ("_id", ASCENDING)]
    rows.drop_indexes()

    measure_find("1. tri ville, sans index", lambda: rows.find().sort(by_ville).limit(PAGE))

    rows.create_index(by_ville)
    measure_find("2. tri ville, avec index", lambda: rows.find().sort(by_ville).limit(PAGE))
    measure_find(
        "3. tri sens mixte",
        lambda: rows.find().sort([("ville", DESCENDING), ("_id", ASCENDING)]).limit(PAGE),
    )
    measure_find(
        "4. tri inversé",
        lambda: rows.find().sort([("ville", DESCENDING), ("_id", DESCENDING)]).limit(PAGE),
    )

    contains = {"_n_nom": {"$regex": "dupont-4242"}}
    measure_find("5a. contient, sans index", lambda: rows.find(contains).limit(PAGE))
    rows.create_index("_n_nom")
    measure_find("5b. contient, avec index", lambda: rows.find(contains).limit(PAGE))

    measure_call("6. comptage filtré", lambda: rows.count_documents({"ville": "Lyon"}))
    measure_find("7. page lointaine", lambda: rows.find().sort(by_ville).skip(500_000).limit(PAGE))
    measure_call("8a. estimated_document_count", rows.estimated_document_count)
    measure_call("8b. count_documents({})", lambda: rows.count_documents({}))


def main() -> None:
    """Se connecte à la base de mesure et lance les scénarios."""
    uri = os.environ.get("DATAHUB_MONGO_URI", "mongodb://localhost:27017")
    with MongoClient[Document](uri) as client:
        run(client["datahub_bench"]["rows"])


if __name__ == "__main__":
    main()
