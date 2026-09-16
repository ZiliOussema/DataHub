import shutil
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import BinaryIO

_COPY_BYTES = 1024 * 1024


def save_upload(source: BinaryIO) -> Path:
    """Copie un fichier reçu sur le disque et renvoie son chemin. L'appelant le supprime."""
    # Le lecteur relit le fichier plusieurs fois, pour l'encodage puis pour les lignes :
    # il lui faut un vrai chemin, pas le flux reçu par FastAPI.
    with tempfile.NamedTemporaryFile(delete=False) as target:
        shutil.copyfileobj(source, target, _COPY_BYTES)
    return Path(target.name)


@contextmanager
def saved_upload(source: BinaryIO) -> Iterator[Path]:
    """Copie un fichier reçu sur le disque, fournit son chemin, et le supprime à la sortie."""
    path = save_upload(source)
    try:
        yield path
    finally:
        path.unlink(missing_ok=True)
