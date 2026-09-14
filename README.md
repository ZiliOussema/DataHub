# Datahub

Application web d'import de fichiers CSV et XLSX : exploration des données dans un tableau paginé, trié et filtré côté serveur, et calcul de statistiques par colonne. Conçue pour des imports d'un million de lignes.

## Sommaire

- Architecture
- Choix techniques
- Lancement
- Stratégie de tests
- Optimisations
- Limitations connues

Chaque section est rédigée au fil de la construction, commit après commit. Le détail vit dans le dossier `docs/`.

## Lancement

Prérequis : Docker avec Docker Compose.

```
docker compose up -d --build                        # développement : http://localhost:5173
docker compose --env-file .env.prod up -d --build   # production : http://localhost:8080
docker compose down                                 # arrêt, les données sont conservées
```

Les fichiers `.env.dev`, `.env.preprod` et `.env.prod` pilotent chaque environnement. Ils ne contiennent aucun secret, c'est pourquoi ils sont versionnés. Un secret irait dans un fichier `.env.*.local`, exclu par le `.gitignore`.

## Workflow git

`main` ne reçoit que des versions étiquetées. `dev` intègre le travail. Chaque lot part d'une branche `feat/…`, revient dans `dev` par pull request en rebase and merge, et ne fusionne qu'avec un pipeline vert. Les commits suivent Conventional Commits.

## Stratégie de tests

Les tests sont écrits avec le code qu'ils vérifient, dans le même commit.

**Backend** (pytest)
- Tests unitaires, dans `backend/tests/unit/` : ils vérifient une fonction ou une route seule. MongoDB y est remplacé, donc ils tournent sans base, en quelques millisecondes.
- Tests d'intégration, dans `backend/tests/integration/` : ils vérifient le trajet réel jusqu'à un MongoDB 8. Ils portent le marqueur `integration`.

**Frontend** (Vitest, React Testing Library)
- Tests de composants, dans `frontend/tests/` : ils vérifient ce que l'utilisateur voit à l'écran. Les éléments sont cherchés par leur rôle et leur texte, pas par leurs classes CSS, pour que les tests survivent aux changements de style.

**Intégration continue**
- La couverture minimale est de 70 % de chaque côté. Le pipeline échoue en dessous.
- Un test de fumée lance la plateforme complète en production avec `docker compose` et vérifie qu'elle répond.

```
cd backend  && uv run pytest --cov=app --cov-fail-under=70   # MongoDB requis sur localhost:27017
cd backend  && uv run pytest -m "not integration"            # sans base
cd frontend && npm run coverage
```
