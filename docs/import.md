# Import d'un fichier

## Lecture

- **Formats** : CSV et XLSX, première feuille seulement. Toute autre extension est refusée.
- **Encodage des CSV** : UTF-8, vérifié sur tout le fichier et non sur son début, BOM accepté. Au premier octet invalide, lecture en Windows-1252, l'encodage des exports Excel sous Windows.
- **Séparateur** : détecté parmi la virgule, le point-virgule, la tabulation et la barre verticale. Un fichier séparé par des points-virgules est lu avec la virgule décimale, la convention française.
- **Mémoire constante** : le fichier est lu par blocs de 50 000 lignes, quelle que soit sa taille.
- **Valeurs lues telles qu'écrites** : « NA », « null » ou « 00123 » restent ce texte. La bibliothèque pandas n'est pas utilisée pour lire les CSV, car elle interprète ces valeurs et tronque en silence une ligne trop longue.
- **Lignes irrégulières** : une ligne vide est ignorée, une ligne courte est complétée par des cases vides, une ligne plus longue que l'en-tête est refusée avec son numéro. Des cases vides en trop, dues à un séparateur final, sont tolérées.
- **Excel** : une formule donne sa valeur calculée. Les colonnes vides à droite de l'en-tête, créées par une simple mise en forme, sont ignorées.

## Clés des colonnes

Chaque en-tête garde son libellé pour l'affichage et reçoit une clé pour MongoDB : minuscules sans accents, tout autre caractère qu'une lettre ou un chiffre remplacé par `_`. « Chiffre d'affaires € » devient `chiffre_d_affaires`. Un en-tête vide devient `colonne_3`, selon sa position. Deux en-têtes qui donnent la même clé deviennent `ville` et `ville_2`.

## Détection des types

Quatre types, du plus précis au moins précis : **booléen**, **entier**, **décimal**, **texte**. Chacun est inclus dans le suivant. Une colonne reçoit le plus précis compatible avec **toutes** ses valeurs non vides.

| Type | Valeurs acceptées |
|---|---|
| Booléen | `true` `false` `vrai` `faux` `oui` `non` `0` `1`, sans tenir compte des majuscules |
| Entier | `12`, `-3`, `+7`, au plus 18 chiffres. Pas de zéro initial : `00123` est un code, donc du texte |
| Décimal | `12.5`, `.5`, `1e3`, ou `12,5` dans un fichier séparé par des points-virgules. Jamais les deux écritures dans le même fichier |
| Texte | tout le reste |

- **Tout le fichier est lu, sans échantillon** : une seule valeur « N/A » à la ligne 900 000 fait d'une colonne de nombres une colonne de texte.
- Les cases vides ne comptent pas, et une colonne entièrement vide est du texte.
- Les espaces autour d'une valeur sont ignorés : « 12 » est un entier, et « Paris » est stocké sans ses espaces.
- Un nombre de plus de 18 chiffres est du texte : MongoDB refuse un entier au-delà de 8 octets, et un décimal perdrait ses derniers chiffres.
- `0` et `1` seuls donnent un booléen ; un `2` ailleurs dans la colonne en fait un entier. `oui` et `non` suivis d'un nombre donnent du texte.

## Aperçu avant import

`POST /api/imports/{id}/detect-types` renvoie les colonnes et leurs types **sans rien enregistrer**. Le fichier est copié dans un fichier temporaire, supprimé à la fin de la lecture, y compris quand le fichier est refusé. La lecture tourne dans un thread à part, pour que le serveur continue de répondre pendant ce temps.

## Import en arrière-plan

`POST /api/imports/{id}/upload` répond `202` avec un job, et l'import continue après la réponse. Le front suit son avancement avec `GET /api/jobs/{id}`. L'identifiant du job est aussi enregistré sur l'import : la progression se retrouve après avoir quitté ou rechargé la page.

1. **Réservation** : l'import passe « en cours » par une seule écriture conditionnelle. Un second envoi simultané reçoit 409.
2. **Détection** sur tout le fichier. Elle donne aussi le nombre de lignes, donc le total de la progression.
3. **Insertion par lots de 10 000** dans une nouvelle collection `import_data_{id}_v{n}`. Pendant ce temps, l'import pointe toujours vers la version précédente, qui reste consultable.
4. **Bascule** : version, colonnes et nombre de lignes changent en une seule écriture. L'ancienne version est supprimée ensuite.

**Valeurs stockées** : types natifs, `null` pour une case vide, `_id` égal au numéro de ligne à partir de 0. Chaque colonne de texte a une copie `_n_{clé}` sans accents ni majuscules pour le filtre « contient », jamais indexée.

**Échec** : un fichier refusé affiche la raison, une erreur inattendue un message générique, la trace allant dans les journaux du serveur. L'import redevient prêt s'il avait déjà des données, sinon il passe en échec. La version partielle et le fichier temporaire sont toujours supprimés.

**Redémarrage** : au démarrage, un import resté « en cours » est remis dans le même état qu'après un échec, avec un message qui l'explique.

## Mesure sur un million de lignes

Fichier CSV français de 52 Mo, huit colonnes des quatre types, cases vides comprises. Import lancé depuis le navigateur, stack `docker compose` de développement, même machine que `docs/mongodb-index.md`.

| | Valeur |
|---|---|
| Durée de l'import, de la réponse `202` à l'état prêt | environ 30 secondes |
| Mémoire maximale du backend | 191 Mo |
| Mémoire maximale de MongoDB | 624 Mo, sous la limite de 2 Go |
| Processeur du backend | un cœur à 100 % pendant la lecture et la conversion |

La mémoire du backend reste plate du début à la fin : le fichier n'est jamais chargé en entier, seul un lot de 10 000 lignes est en mémoire à la fois.

## Limites connues

- Le séparateur de milliers n'est pas reconnu : `1 234,50` est du texte.
- Les dates ne sont pas détectées et restent du texte ; l'énoncé demande ces quatre types.
- Le fichier est lu deux fois, pour la détection puis pour l'insertion : insérer pendant la détection obligerait à écrire avant de connaître les types définitifs.
- Un seul processus serveur est supposé : avec plusieurs, la reprise au démarrage de l'un passerait en échec les imports en cours dans un autre. Il faudrait alors une vraie file de travaux.
