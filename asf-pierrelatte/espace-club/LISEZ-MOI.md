# Modules ajoutés à l'espace club

Ces fichiers sont déjà inclus dans `index.html` (balises `<script id="evenements-js">` et `<script id="plateaux-js">`, entre les marqueurs `<!--HABILLAGE-JS-->`).
Ils sont ici en clair pour pouvoir les relire ou les modifier. Ils ne changent rien au script de l'application : ils se branchent sur ses fonctions.

| Fichier | Ce qu'il ajoute |
|---|---|
| `plateaux.js` | Matchs et plateaux › **Foot animation** : chaque rendez-vous est un plateau, un brassage ou des poules. Horaire et score de chaque match ; poules avec toutes leurs équipes (plusieurs équipes du même club : Pierrelatte 1, 2, 3…), matchs créés chacun contre chacun. Enregistré dans la fiche du rendez-vous ; les affiches les reprennent toutes seules, avec les logos des clubs. |
| `evenements.js` | Communication › **Événements** : affiches stage, loto, tournoi (ce qui est écrit sur l'affiche, message de l'annonce, publication story / annonce sur Facebook et Instagram, enregistrement). Bouton « Créer l'affiche » sur chaque stage. |

Il demande `api/affiches.php` à jour (`?apercu=evenement`). Le brouillon est gardé dans le navigateur (localStorage `asfp-evenements`).
Les affiches des matchs restent celles de l'onglet **Affiches**, remplies toutes seules avec les matchs du site (liens FFF).
