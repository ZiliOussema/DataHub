import re
import unicodedata
from collections.abc import Sequence

# Une clé de colonne sert de nom de champ MongoDB : on la réduit aux lettres, chiffres
# et tirets bas, car le point et le dollar y sont interdits.
_NON_ALPHANUMERIQUE = re.compile(r"[^a-z0-9]+")


def normalize_text(text: str) -> str:
    """Renvoie le texte en minuscules et sans accents, pour comparer « Évry » et « evry »."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def build_columns(headers: Sequence[str]) -> list[tuple[str, str]]:
    """Renvoie un couple (en-tête d'origine, clé MongoDB) par colonne, les clés étant uniques."""
    columns: list[tuple[str, str]] = []
    taken: set[str] = set()
    for position, header in enumerate(headers, start=1):
        base = _NON_ALPHANUMERIQUE.sub("_", normalize_text(header)).strip("_")
        base = base or f"colonne_{position}"
        key = base
        suffix = 1
        while key in taken:
            suffix += 1
            key = f"{base}_{suffix}"
        taken.add(key)
        columns.append((header, key))
    return columns
