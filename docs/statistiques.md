# Statistiques

`GET /api/imports/{id}/stats/{clé}` renvoie les chiffres d'une colonne et une page de son tableau valeur/occurrence. Tout est calculé par MongoDB à la demande, par agrégation : rien n'est précalculé, rien n'est mis en cache.

## Paramètres

| Paramètre | Rôle |
|---|---|
| `sort` | Tri du tableau des occurrences : `-count` par défaut, puis `count`, `value`, `-value`. Toute autre valeur donne une 422. |
| `page` | Page du tableau des occurrences, 1 par défaut, **20 valeurs par page**. |
| `filtered=1` | **Case 1** : ne prendre que les lignes que l'onglet Données afficherait, avec ses filtres `f.…`. |
| `f.{clé}` | Les filtres du tableau de données, écrits comme dans `docs/donnees.md`. Ils ne servent que si `filtered=1`. |
| `search` | Recherche du tableau des occurrences, sans accents ni majuscules. Colonnes de texte seulement. |
| `searched=1` | **Case 2** : appliquer aussi cette recherche aux chiffres du haut. |

Les deux cases ne valent que sur la chaîne exacte `1`. Une valeur absente, `0`, ou toute autre chaîne laisse la case décochée.

## Ce que renvoie chaque type

| Type | Chiffres | Tableau valeur / occurrence |
|---|---|---|
| Texte | compte, valeurs distinctes | oui |
| Entier, décimal | compte, minimum, maximum, moyenne | oui |
| Booléen | compte, nombre de vrai et de faux | oui |

Les cases vides ne sont jamais comptées, comme à la détection des types : `count` est le nombre de valeurs **renseignées**, pas le nombre de lignes. Une colonne entièrement vide renvoie donc un compte nul et un tableau vide, sans erreur.

Le tableau des occurrences est trié par nombre décroissant par défaut.

## Réponse

```json
{
  "column": { "label": "Actif", "key": "actif", "type": "boolean" },
  "count": 933593,
  "distinct": 2,
  "minimum": null, "maximum": null, "average": null,
  "true_count": 466969, "false_count": 466624,
  "occurrences": [
    { "value": true, "count": 466969 },
    { "value": false, "count": 466624 }
  ]
}
```

Les champs sans objet pour le type demandé valent `null` plutôt que d'être absents : le navigateur n'a pas à tester leur présence. `distinct` compte les valeurs distinctes de **toute** la sélection, pas seulement celles de la page affichée.

## Les deux cases à cocher

La distinction entre `search` et `searched` est le point à comprendre : filtrer ce qu'on lit n'est pas la même chose que changer ce qu'on compte.

Sur une colonne Ville d'un million de lignes, chercher « evry » :

| Cases | Chiffres du haut | Tableau |
|---|---|---|
| aucune | toute la colonne : 933 593 valeurs, 12 villes | la seule ligne « Évry » |
| case 2 seule | les 77 687 lignes d'Évry, 1 valeur distincte | la seule ligne « Évry » |
| case 1 seule | les lignes que l'onglet Données afficherait | les villes de ces lignes, réduites à « Évry » |

Les deux cases se cumulent : la case 1 restreint la population, la case 2 lui applique en plus la recherche.

## Côté navigateur

L'onglet Statistiques choisit une colonne, coche les deux cases, cherche, trie et pagine le tableau. Chaque changement déclenche un appel : rien n'est recalculé dans le navigateur, qui ne reçoit jamais que les chiffres et vingt occurrences.

La recherche attend **300 ms** après la dernière frappe avant d'appeler l'API, et revient à la page 1 : chercher puis rester sur la page 7 d'un résultat qui n'en compte que deux n'aurait rien affiché.

La case 1 n'apparaît que si l'onglet Données a des filtres actifs, et son libellé les rappelle (« ville : evry ») : cocher une case dont on ne voit pas l'effet est une source d'erreur.

## Calcul à la demande

Aucune statistique n'est précalculée ni mise en cache. La case 1 impose de toute façon un recalcul à chaque changement de filtre, et un cache devrait être vidé à chaque modification de ligne, de lot ou de type. Le prix est une agrégation à chaque ouverture de l'onglet ; le gain est qu'aucun chiffre ne peut être périmé.

Une demande lance **trois agrégations en parallèle** : les chiffres du haut, la page d'occurrences, et le nombre de valeurs distinctes. Toutes passent `allowDiskUse` : sur un million de lignes, un regroupement dépasse les 100 Mo autorisés en mémoire à une étape. Le délai est celui des opérations longues, deux minutes.

**Aucun index n'est créé ni utilisé ici.** Un regroupement parcourt de toute façon la collection entière, et la colonne statistiquée n'est pas forcément celle que l'utilisateur trie dans l'onglet Données : poser un index pour une agrégation coûterait sa construction sans rien accélérer.

## Mesures

Sur un import d'un million de lignes, temps de réponse HTTP complet, machine de développement :

| Colonne | Valeurs distinctes | Temps |
|---|---|---|
| Nom (texte) | 15 | 405 ms |
| Ville (texte) | 12 | 486 ms |
| Actif (booléen) | 2 | 612 ms |
| Montant (décimal) | 603 343 | 1,73 s |
| Ville, case 1 cochée | 1 | 1,72 s |

Le coût suit le nombre de valeurs distinctes, pas le nombre de lignes : regrouper un million de montants presque tous différents demande un tri sur disque, regrouper douze villes non. Cocher la case 1 ajoute le parcours du filtre à chacune des trois agrégations.

## Erreurs

| Cas | Réponse |
|---|---|
| Import inconnu, ou identifiant mal formé | 404 |
| Colonne inconnue dans cet import | 404 |
| Import sans données, ou import en cours | 409 |
| Tri inconnu, page invalide, filtre `f.…` illisible | 422 |

## Limites connues

- **L'état de l'onglet ne survit pas à un rechargement.** Colonne, cases, recherche, tri et page vivent dans le composant, pas dans l'URL comme l'onglet Données. Recharger revient à la première colonne.
- **Les chiffres disparaissent pendant un recalcul** au lieu de rester affichés en attendant : sur une colonne à forte cardinalité, l'écran reste vide une à deux secondes.
- **Le nombre de valeurs distinctes coûte une agrégation complète** à lui seul. Sur une colonne quasi unique, c'est l'essentiel du temps de réponse.
- **La recherche ne porte que sur les colonnes de texte**, faute de forme normalisée pour les autres types.
