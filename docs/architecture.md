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
| `src/pages/` | Composants de route, un par écran. |
| `src/components/` | Composants d'interface, dont l'ossature `AppShell` (barre latérale et fil d'Ariane). |
| `src/hooks/` | État serveur : requêtes, mutations, invalidation du cache. |
| `src/services/` | Client HTTP et appels à l'API. |
| `src/types/` | Contrats TypeScript alignés sur les schémas du backend. |
| `src/theme/` | Tokens de la charte graphique et constantes d'affichage partagées. |
| `tests/` | Tests des services, des composants et des écrans. |
