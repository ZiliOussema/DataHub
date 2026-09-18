# Index MongoDB 

Datahub doit rester fluide sur des imports d'un million de lignes. Plutôt que de choisir les index au jugé, chaque décision ci-dessous repose sur une mesure.

**Protocole.** `backend/scripts/perfs/seed.py` insère 1 000 000 de documents représentatifs d'un import : un nom presque unique et accentué, une ville à 15 valeurs, des nombres, des booléens et des cases vides. `backend/scripts/perfs/explain.py` exécute ensuite huit requêtes, chacune une première fois pour chauffer le cache, puis une seconde fois avec `explain()`. Les deux scripts sont déterministes.

**Environnement.** Intel Core i5-1035G1, 11 Go de RAM, SSD. MongoDB 8.0.30 dans Docker, cache WiredTiger de 1 Go.

```
docker compose up -d --wait mongo
cd backend && uv run python scripts/perfs/seed.py && uv run python scripts/perfs/explain.py
```

## Résultats

Toutes les requêtes demandent une page de 100 lignes, comme le tableau de l'application.

| # | Requête | Plan | Durée | Clés lues | Documents lus |
|---|---|---|---|---|---|
| 1 | tri par ville, sans index | `SORT < COLLSCAN` | 460 ms | 0 | 1 000 000 |
| 2 | tri par ville, index `{ville: 1, _id: 1}` | `IXSCAN` | 0 ms | 100 | 100 |
| 3 | tri `{ville: -1, _id: 1}` | `SORT < COLLSCAN` | 460 ms | 0 | 1 000 000 |
| 4 | tri `{ville: -1, _id: -1}` | `IXSCAN` | 0 ms | 100 | 100 |
| 5a | « contient » sur `_n_nom`, sans index | `COLLSCAN` | 240 ms | 0 | 424 289 |
| 5b | « contient » sur `_n_nom`, avec index | `IXSCAN` | 620 ms | 920 031 | 100 |
| 6 | comptage filtré, 66 666 résultats | — | 20 ms | — | — |
| 7 | page commençant à la ligne 500 000 | `SKIP < IXSCAN` | 240 ms | 500 100 | 100 |
| 8a | `estimated_document_count` | — | 1 ms | — | — |
| 8b | `count_documents({})` | — | 190 ms | — | — |

Taille pour un million de documents : 166 Mo de données, 54 Mo sur disque après compression, 10 à 13 Mo par index.

## Scénarios et décisions

### Trier une colonne (1, 2)

**Question.** Combien coûte l'affichage de la première page triée par ville ?

**Observation.** Sans index, MongoDB lit le million de documents pour ne garder que les 100 premiers : 460 ms, à chaque changement de page. Avec un index `{ville: 1, _id: 1}`, déjà trié, il lit 100 entrées et s'arrête : 0 ms.

**Décision.** Un index `{colonne: 1, _id: 1}` est créé la première fois qu'un utilisateur trie sur une colonne. Il n'est pas créé à l'import : les colonnes sont inconnues à l'avance, et un index par colonne occuperait de la place pour des colonnes jamais triées.

### Inverser le sens du tri (3, 4)

**Question.** L'index sert-il encore quand l'utilisateur trie dans l'autre sens ?

**Observation.** `_id` départage les lignes de même ville, sinon une ligne pourrait apparaître sur deux pages. Si la ville est décroissante et `_id` croissant, l'index est ignoré : retour à 460 ms. Si les deux sont décroissants, MongoDB lit l'index à l'envers : 0 ms.

**Décision.** Le backend donne toujours à `_id` le sens de la colonne triée. Un seul index sert ainsi les deux sens de tri.

### Filtrer avec « contient » (5a, 5b)

**Question.** Un index accélère-t-il la recherche d'un texte au milieu d'une valeur ?

**Observation.** Non, il la ralentit. Sans index, MongoDB parcourt les documents et s'arrête au centième résultat : 240 ms. Avec un index, il le choisit, mais « contient » ne dit pas par où commencer dans un index trié. Il lit alors 920 031 entrées une par une : 620 ms.

**Décision.** Les champs normalisés `_n_…`, qui servent au filtre « contient » insensible aux accents, ne sont jamais indexés.

### Afficher le total d'un tableau filtré (6)

**Question.** Le total affiché sous un tableau filtré est-il coûteux ?

**Observation.** Avec l'index de la colonne filtrée, compter 66 666 lignes prend 20 ms, sans ouvrir aucun document.

**Décision.** Le total est recalculé à chaque requête filtrée. Aucun mécanisme de cache n'est nécessaire à cette volumétrie.

### Aller à une page lointaine (7)

**Question.** Sauter directement à la page 5 001 est-il aussi rapide que la page 1 ?

**Observation.** Non. Même avec l'index, MongoDB doit parcourir les 500 000 entrées sautées : 240 ms au lieu de 0 ms.

**Décision.** Coût accepté. Atteindre directement n'importe quelle page suppose une pagination par numéro, et donc ce parcours. Une pagination par curseur serait constante, mais n'offrirait que « page suivante » et « page précédente » : l'utilisateur ne pourrait plus sauter au milieu d'un million de lignes.

### Afficher le total sans filtre (8)

**Question.** Faut-il compter les documents pour afficher le total d'un tableau non filtré ?

**Observation.** `estimated_document_count` lit un compteur tenu par MongoDB : 1 ms. `count_documents({})` parcourt la collection : 190 ms.

**Décision.** Sans filtre, le total vient de `estimated_document_count`.

## Limites connues

- Une recherche « contient » sur une valeur rare ou absente relit toute la collection, soit environ le double du temps mesuré en 5a.
- Les pages lointaines restent plus lentes que les premières (7).
