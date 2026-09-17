# Lecture des données

`GET /api/imports/{id}/data` renvoie un paquet de lignes filtrées et triées, et le nombre total de lignes qui passent les filtres. Pagination, tri et filtrage se font dans MongoDB.

## Paramètres

| Paramètre | Rôle |
|---|---|
| `offset` | Première ligne du paquet, 0 par défaut. |
| `limit` | Taille du paquet, 100 par défaut, **500 au plus** : l'API ne livre jamais une page entière d'un coup. |
| `sort` | Clé de la colonne, précédée de `-` pour un tri décroissant. |
| `f.{clé}` | Texte : la colonne **contient** la valeur, sans tenir compte des accents ni des majuscules. |
| `f.{clé}.min`, `f.{clé}.max` | Nombres : bornes incluses, virgule décimale acceptée. |
| `f.{clé}` avec `vrai`, `faux` ou `vide` | Booléens. |

Le préfixe `f.` évite qu'une colonne nommée « page » ou « sort » se confonde avec la pagination. Chaque clé est vérifiée contre les colonnes de l'import : une clé inconnue, une borne sur du texte ou un nombre illisible donnent une 422, et aucun opérateur venu de l'URL n'atteint MongoDB.

Réponse : `{"total": 1000000, "rows": [{"_id": 0, "nom": "Élodie", "age": 34, …}]}`, où `_id` est le numéro de ligne dans le fichier. Les copies `_n_…` ne sont jamais renvoyées.

## Côté navigateur

L'URL de la page garde tout l'état du tableau : `?tab=donnees&page=2&size=50&sort=-montant&f.ville=par`. Recharger, partager le lien ou revenir sur l'import redonne la même vue. Ouvert sans paramètre, l'import reprend le dernier état mémorisé dans le navigateur, avant la première requête. Colonnes et valeurs inconnues sont ignorées, par exemple après un réimport aux en-têtes différents.

**Une page n'est jamais chargée entière.** Le tableau est virtualisé : seules les lignes à l'écran sont dessinées, et seuls leurs paquets de 100 lignes sont demandés, au fil du défilement. Un paquet quitté est oublié 30 secondes plus tard. Une page d'un million de lignes, que l'énoncé autorise, ne garde ainsi jamais plus de quelques centaines de lignes en mémoire, ce que l'énoncé exige aussi.

Les filtres texte et numériques attendent 300 ms après la dernière frappe avant d'appeler l'API. Au-delà de 10 millions de pixels, hauteur que les navigateurs refusent, la barre de défilement est comprimée et la position réelle recalculée.

## Requêtes et index

Le tri, le total et la politique d'index suivent les mesures de `docs/mongodb-index.md`. S'y ajoutent :

- **lignes et total demandés en parallèle**, plutôt qu'un `$facet` dont la réponse est plafonnée à 16 Mo et dont le tri n'utilise pas l'index ;
- l'index d'une colonne est aussi créé au premier **filtre min/max ou booléen**, et toujours **après la réponse** ;
- **60 index au plus** par collection, sous la limite de 64 de MongoDB ;
- un réimport ou une conversion de type crée une collection sans ces index : ils se recréent au prochain tri.

## Limites connues

Un tri sur une colonne combiné à un filtre sur une autre n'utilise qu'un des deux index. Les autres limites de lecture sont listées dans `docs/mongodb-index.md`.
