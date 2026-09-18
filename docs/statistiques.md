# Statistiques

`GET /api/imports/{id}/stats/{clé}` renvoie les chiffres d'une colonne et une page de son tableau valeur/occurrence. Tout est calculé par MongoDB à la demande, par agrégation.

## Ce que renvoie chaque type

| Type | Chiffres | Tableau valeur / occurrence |
|---|---|---|
| Texte | compte, valeurs distinctes | oui |
| Entier, décimal | compte, minimum, maximum, moyenne | oui |
| Booléen | compte, nombre de vrai et de faux | oui |

Les cases vides ne sont jamais comptées, comme à la détection des types. Le tableau est trié par occurrences décroissantes par défaut, la valeur départageant les ex æquo, et se trie aussi par valeur. Vingt lignes par page.

## Les deux cases à cocher

| Paramètre | Effet |
|---|---|
| `filtered=1` | **case 1** : les statistiques portent sur les lignes que l'onglet Données afficherait, avec ses filtres `f.…` |
| `search=evry` | la recherche du tableau valeur/occurrence, qui filtre **toujours** ce tableau, colonnes de texte seulement |
| `searched=1` | **case 2** : les chiffres du haut suivent aussi cette recherche |

La distinction entre `search` et `searched` est le point à comprendre : filtrer ce qu'on lit n'est pas la même chose que changer ce qu'on compte. Chercher « evry » montre toujours la seule ligne « Évry » dans le tableau ; le compte global reste celui de toute la colonne, sauf si la case 2 est cochée.

## Calcul à la demande

Aucune statistique n'est précalculée ni mise en cache. La case 1 impose de toute façon un recalcul à chaque changement de filtre, et un cache devrait être vidé à chaque modification de ligne, de lot ou de type. Le prix est une agrégation à chaque ouverture de l'onglet ; le gain est qu'aucune statistique ne peut être périmée.

Les chiffres et la page d'occurrences partent en **deux agrégations parallèles**, avec `allowDiskUse` : sur un million de lignes, un regroupement dépasse les 100 Mo autorisés en mémoire à une étape.
