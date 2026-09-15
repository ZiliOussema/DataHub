# Architecture

## Backend

| Dossier | Rôle |
|---|---|
| `app/api/` | Routes HTTP, sans code métier. |
| `app/services/` | Règles métier. |
| `app/repositories/` | Seul accès à MongoDB : requêtes, index, traduction des erreurs. |
| `app/schemas/` | Contrats des données échangées avec le frontend. |
| `app/core/` | Configuration et connexion MongoDB. |

## Frontend

| Dossier | Rôle |
|---|---|
| `src/` | Application React. |
| `src/theme/` | Couleurs de la charte, seule source des couleurs. |
| `tests/` | Tests Vitest et React Testing Library. |
