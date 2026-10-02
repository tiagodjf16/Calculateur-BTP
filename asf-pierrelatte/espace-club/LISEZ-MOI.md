# Module ajouté à l'espace club

Ce fichier est déjà inclus dans `index.html` (balise `<script id="evenements-js">`, entre les marqueurs `<!--HABILLAGE-JS-->`).
Il est ici en clair pour pouvoir le relire ou le modifier. Il ne change rien au script de l'application : il ajoute un onglet
et se branche sur ses fonctions.

| Fichier | Ce qu'il ajoute |
|---|---|
| `evenements.js` | Communication › **Événements** : affiches stage, loto, tournoi (ce qui est écrit sur l'affiche, message de l'annonce, publication story / annonce sur Facebook et Instagram, enregistrement). Bouton « Créer l'affiche » sur chaque stage. |

Il demande `api/affiches.php` à jour (`?apercu=evenement`). Le brouillon est gardé dans le navigateur (localStorage `asfp-evenements`).
Les affiches des matchs restent celles de l'onglet **Affiches**, remplies toutes seules avec les matchs du site (liens FFF).
