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
| Entier | `12`, `-3`, `+7`. Pas de zéro initial : `00123` est un code, donc du texte |
| Décimal | `12.5`, `.5`, `1e3`, ou `12,5` dans un fichier séparé par des points-virgules. Jamais les deux écritures dans le même fichier |
| Texte | tout le reste |

- **Tout le fichier est lu, sans échantillon** : une seule valeur « N/A » à la ligne 900 000 fait d'une colonne de nombres une colonne de texte.
- Les cases vides ne comptent pas, et une colonne entièrement vide est du texte.
- Les espaces autour d'une valeur sont ignorés : « 12 » est un entier.
- `0` et `1` seuls donnent un booléen ; un `2` ailleurs dans la colonne en fait un entier. `oui` et `non` suivis d'un nombre donnent du texte.

## Aperçu avant import

`POST /api/imports/{id}/detect-types` renvoie les colonnes et leurs types **sans rien enregistrer**. Le fichier est copié dans un fichier temporaire, supprimé à la fin de la lecture, y compris quand le fichier est refusé. La lecture tourne dans un thread à part, pour que le serveur continue de répondre pendant ce temps.

## Limites connues

- Le séparateur de milliers n'est pas reconnu : `1 234,50` est du texte.
- Les dates ne sont pas détectées et restent du texte ; l'énoncé demande ces quatre types.
