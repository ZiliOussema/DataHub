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
