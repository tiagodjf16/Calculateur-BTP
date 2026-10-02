# Modules ajoutés à l'espace club

Ces deux fichiers sont déjà inclus dans `index.html` (balises `<script id="evenements-js">` et `<script id="affiches-matchs-js">`,
entre les marqueurs `<!--HABILLAGE-JS-->`). Ils sont ici en clair pour pouvoir les relire ou les modifier.
Ils ne changent rien au script de l'application : ils ajoutent des onglets et se branchent sur ses fonctions.

| Fichier | Ce qu'il ajoute |
|---|---|
| `evenements.js` | Communication › **Événements** : affiches stage, loto, tournoi (ce qui est écrit sur l'affiche, message de l'annonce, publication story / annonce sur Facebook et Instagram, enregistrement). Bouton « Créer l'affiche » sur chaque stage. Outils communs (`window.ASFP_AFF`). |
| `affiches-matchs.js` | Communication › **Affiches matchs** : rencontres, résultats, foot animation (plusieurs adversaires, scores par adversaire), vétérans, jour de match, résultat d'un match, avec les matchs tapés à la main ou repris du calendrier. |

Les deux demandent `api/affiches.php` à jour (route `?manuel=1` pour les affiches matchs, `?apercu=evenement` pour les événements).
Les brouillons sont gardés dans le navigateur (localStorage `asfp-evenements` et `asfp-affiches-matchs`).
