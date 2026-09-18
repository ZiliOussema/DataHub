# Datahub

Application web d'import de fichiers CSV et XLSX : détection des types, exploration des données dans un tableau paginé, trié et filtré **côté serveur**, édition unitaire et par lot, et statistiques par colonne. Conçue et mesurée pour des imports d'**un million de lignes**.

Détail technique : [`docs/`](docs/) — [architecture](docs/architecture.md), [import](docs/import.md), [données](docs/donnees.md), [statistiques](docs/statistiques.md), [index MongoDB](docs/mongodb-index.md).

## Démarrage

Prérequis : Docker avec Docker Compose. Rien d'autre à installer.

```
docker compose up -d --build                        # développement : http://localhost:5173
docker compose --env-file .env.prod up -d --build   # production : http://localhost:8080
docker compose down                                 # arrêt, les données sont conservées
```

Les fichiers `.env.dev`, `.env.preprod` et `.env.prod` pilotent chaque environnement. Ils ne contiennent aucun secret, c'est pourquoi ils sont versionnés ; un secret irait dans un `.env.*.local`, exclu par le `.gitignore`.

## Ce que fait l'application

| Écran | Fonctions |
|---|---|
| Accueil | créer, renommer, réordonner et supprimer des imports |
| Import, onglet **Colonnes** | envoyer un CSV ou un XLSX, voir les types détectés avant l'import, suivre la progression, remplacer les données, corriger le type d'une colonne |
| Import, onglet **Données** | pagination de 10 à 1 000 000 lignes, tri et filtre sur chaque colonne, édition d'une ligne, sélection multiple, édition et suppression par lot |
| Import, onglet **Statistiques** | compte, valeurs distinctes, minimum, maximum, moyenne, part de vrai et faux, et tableau valeur/occurrence paginé, trié et filtrable |

Chaque changement de page, de tri, de filtre ou de calcul déclenche un appel à l'API : **aucune donnée complète n'est conservée dans le navigateur**.

## Architecture

```mermaid
flowchart LR
  N[Navigateur<br/>React, TanStack Query] -->|/api| P[nginx ou Vite<br/>relais /api]
  P --> B[FastAPI<br/>api / services / repositories]
  B --> M[(MongoDB 8)]
```

Trois conteneurs : le front (nginx en production, Vite en développement), le backend, et MongoDB. Le front n'appelle jamais MongoDB : tout passe par l'API.

| Couche | Rôle |
|---|---|
| `backend/app/api/` | routes HTTP, validation des paramètres, aucune règle métier |
| `backend/app/services/` | règles métier : détection des types, conversion, filtres, statistiques |
| `backend/app/repositories/` | seule couche qui exécute des requêtes MongoDB : lectures, index, traduction des erreurs |
| `backend/app/schemas/` | contrats d'entrée et de sortie, validés par Pydantic |
| `backend/app/core/` | configuration, connexion MongoDB, erreurs métier, fichiers reçus |
| `frontend/src/pages/` | un composant par écran : la liste des imports, la page d'un import |
| `frontend/src/components/` | interface : ossature, tableau virtualisé, panneaux d'édition, statistiques |
| `frontend/src/hooks/` | état serveur (requêtes, mutations, invalidation) et état de la vue tenu dans l'URL |
| `frontend/src/services/` | appels à l'API : construction des URL, envoi des fichiers, erreurs typées |
| `frontend/src/types/` | contrats TypeScript alignés sur les schémas du backend |
| `frontend/src/theme/` | couleurs, typographie et libellés partagés par les composants |

La séparation se lit à ce que chaque couche **ignore** : une route ne sait pas ce qu'est une valeur valide, une règle métier ne sait pas ce qu'est une collection, un composant ne sait pas ce qu'est une requête HTTP. C'est ce qui permet de vérifier la détection des types, les conversions et les filtres sans démarrer une base de données.

Le détail, les collections et les règles : [`docs/architecture.md`](docs/architecture.md).

## Choix techniques

| Choix | Raison |
|---|---|
| **PyMongo asynchrone** (`AsyncMongoClient`) | Motor est déprécié depuis mai 2025. Aucun appel bloquant dans une route : lecture de fichiers et conversions passent par un thread. |
| **Une collection par import et par version** (`import_data_{id}_v{n}`) | un réimport écrit à côté, puis une **seule écriture** bascule l'import. Sans transactions sur une instance unique, c'est ce qui garantit qu'on ne lit jamais un état intermédiaire. Supprimer un import est un `drop`, pas un `deleteMany` sur un million de documents. |
| **Import et conversion en tâche de fond**, suivis par `GET /api/jobs/{id}` | la requête répond `202` en quelques millisecondes ; le navigateur suit la progression. Pas de Celery ni de broker pour un seul serveur. |
| **Types détectés sur tout le fichier**, jamais sur un échantillon | une seule valeur « N/A » à la ligne 900 000 change le type d'une colonne. |
| **Lecture des CSV avec le module `csv`**, pas `pandas.read_csv` | pandas interprète « NA » ou « 00123 » et **tronque en silence** une ligne trop longue. Ici, une ligne trop longue est refusée avec son numéro. |
| **Tableau virtualisé, paquets de 100 lignes** | une page peut être réglée jusqu'à un million de lignes. Elle est affichée entière, mais seul ce qui est à l'écran est téléchargé : le navigateur ne détient jamais l'ensemble des données. |
| **État du tableau dans l'URL**, plus une mémoire par import | recharger, partager le lien ou revenir sur l'import redonne la même vue. |
| **Statistiques calculées à la demande**, sans cache | la case « appliquer les filtres » impose de toute façon un recalcul, et un cache serait à vider à chaque écriture : le risque de statistiques fausses dépasse le gain. |
| **Index créés au premier usage**, jamais à l'import | on ne sait pas à l'avance quelles colonnes seront triées. Mesures dans [`docs/mongodb-index.md`](docs/mongodb-index.md). |

## Optimisations, mesurées

Toutes les mesures viennent d'un jeu d'**un million de lignes** sur la machine de développement (Intel i5-1035G1, 11 Go, SSD, MongoDB 8 en conteneur avec 1 Go de cache). Protocole et scripts : [`docs/mongodb-index.md`](docs/mongodb-index.md) et `backend/scripts/perfs/`.

| Sujet | Sans | Avec | Décision |
|---|---|---|---|
| Tri d'une colonne | 460 ms | **0 ms** | index `{colonne, _id}` créé au premier tri, après la réponse |
| Filtre « contient » | 240 ms | 620 ms | **jamais d'index** sur les champs normalisés |
| Total sans filtre | 190 ms | **1 ms** | `estimated_document_count` |
| Import d'un fichier de 52 Mo | — | **~30 s**, backend à 191 Mo | lecture par blocs, insertion par lots de 10 000 |
| Conversion d'une colonne | — | **~13 s** | copie et bascule côté MongoDB (`$out`) |
| Page d'un million de lignes | 150 Mo à télécharger | **~100 lignes à la fois** | virtualisation et paquets |

S'y ajoutent : anti-rebond de 300 ms sur les filtres, lignes et total demandés en parallèle, projections qui excluent les champs internes, `allowDiskUse` sur les agrégations, et compression par nginx : le bundle passe de 345 à 124 Ko, une page de 100 lignes de 15,5 à 2,8 Ko.

## Stratégie de tests

Les tests sont écrits avec le code qu'ils vérifient, dans le même commit.

**Backend** — 172 tests, couverture **100 %**
- `backend/tests/unit/` : une fonction isolée, sans base (détection des types, lecture de fichiers, conversion, filtres).
- `backend/tests/integration/` : le trajet réel jusqu'à un MongoDB 8, marqueur `integration`.

**Frontend** — 51 tests, couverture **95 % des lignes**
- `frontend/tests/` : les écrans vus par l'utilisateur, avec un faux backend. Les éléments sont cherchés par leur rôle et leur texte, jamais par leurs classes CSS, pour que les tests survivent aux changements de style.

**Intégration continue** (GitHub Actions) : format, lint, types, tests des deux côtés, couverture minimale de 70 %, puis un test de fumée qui lance la plateforme complète en production avec `docker compose` et l'interroge. Une étiquette `vX.Y.Z` publie en plus les images sur le registre GitHub.

```
cd backend  && uv run pytest --cov=app --cov-fail-under=70   # MongoDB requis sur localhost:27017
cd backend  && uv run pytest -m "not integration"            # sans base
cd frontend && npm run coverage
```

## Workflow git

`main` ne reçoit que des versions étiquetées. `dev` intègre le travail. Chaque lot part d'une branche `feat/…`, `fix/…`, `ci/…` ou `release/…`, revient dans `dev` par pull request en rebase and merge, et ne fusionne qu'avec un pipeline vert. Les commits suivent Conventional Commits, et leur message explique le **pourquoi** du choix.

Une étiquette `vX.Y.Z` poussée sur `main` relance tout le pipeline, puis publie les images `datahub-backend` et `datahub-frontend` dans le registre de paquets GitHub, étiquetées `X.Y.Z` et `X.Y`.

## Suites possibles

Par ordre de valeur rendue.

| Amélioration | Ce qu'elle change pour l'utilisateur |
|---|---|
| **Exporter le résultat filtré** en CSV ou XLSX | filtrer un million de lignes, puis repartir avec les 8 000 qui restent |
| **Reconnaître les dates** | trier une colonne de dates dans l'ordre chronologique et filtrer sur une période, au lieu d'un tri alphabétique qui range `24/01` avant `03/02` |
| **Revenir à la version précédente d'un import** | annuler un réimport qui s'est révélé mauvais, sans redemander le fichier |
| **Partager un lien vers des statistiques** | rouvrir la même colonne avec les mêmes cases, comme le fait déjà l'onglet Données |
| **Plusieurs imports lourds en parallèle** | ne plus attendre la fin d'un import pour en lancer un autre |

