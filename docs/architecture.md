# Architecture

## Backend

| Dossier | Rôle |
|---|---|
| `app/api/` | Routes HTTP, sans code métier. |
| `app/services/` | Règles métier. |
| `app/repositories/` | Seul accès à MongoDB : requêtes, index, traduction des erreurs. |
| `app/schemas/` | Contrats des données échangées avec le frontend. |
| `app/core/` | Configuration et connexion MongoDB. |

## Collections MongoDB

| Collection | Contenu |
|---|---|
| `imports` | Un document par import : nom, position, état, version en place, colonnes typées, nombre de lignes, dernière erreur. |
| `import_data_{id}_v{n}` | Les lignes d'une version des données d'un import, une par document, `_id` égal au numéro de ligne. |
| `jobs` | Suivi des traitements en arrière-plan : état, lignes traitées sur le total, message d'erreur. |

## Frontend

| Dossier | Rôle |
|---|---|
| `src/pages/` | Composants de route, un par écran. |
| `src/components/` | Composants d'interface, dont l'ossature `AppShell` (barre latérale et fil d'Ariane). |
| `src/hooks/` | État serveur : requêtes, mutations, invalidation du cache. |
| `src/services/` | Client HTTP et appels à l'API. |
| `src/types/` | Contrats TypeScript alignés sur les schémas du backend. |
| `src/theme/` | Tokens de la charte graphique et constantes d'affichage partagées. |
| `tests/` | Tests des services, des composants et des écrans. |

## Règles du CRUD des imports

- **Noms uniques, insensibles à la casse et aux accents.** L'index unique sur `name` porte la collation `{locale: "fr", strength: 2}` : « Clients » et « clients » sont le même nom. C'est MongoDB qui refuse le doublon, pas une vérification préalable, donc deux créations simultanées ne peuvent pas passer toutes les deux.
- **Aucune erreur MongoDB ne sort du repository.** `DuplicateKeyError` y devient `ConflictError`. `app/main.py` traduit ensuite chaque erreur métier en code HTTP : `NotFoundError` 404, `ConflictError` 409, `InvalidError` 422. Aucune route ne manipule d'exception PyMongo.
- **Un identifiant mal formé n'est pas une erreur serveur.** S'il ne peut pas être un `ObjectId`, le repository répond « absent » : 404, et non 500.
- **L'ordre est enregistré en un seul aller-retour.** `set_order` envoie toutes les positions dans un `bulk_write`, et la liste est relue triée sur `(order, _id)`.
- **Les dates sortent en UTC avec leur fuseau.** Elles sont écrites par `datetime.now(UTC)` et relues avec `tz_aware=True` : sans ce drapeau PyMongo les rend naïves, et le navigateur affiche l'heure UTC comme si elle était locale.
- **Supprimer un import supprime ses données.** Les collections `import_data_…`, `stats_…` et `stats_cache_…` du même identifiant sont retirées dans la foulée : aucune collection orpheline.
