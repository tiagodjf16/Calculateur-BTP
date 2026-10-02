# Nouvelles affiches sur le site · ASF Pierrelatte

Ce dossier contient tout ce qu'il faut mettre sur le serveur du site (chez o2switch) pour que les affiches
publiées automatiquement prennent le nouveau style « stade de nuit » : résultats et rencontres du week-end,
foot animation, vétérans (domicile et extérieur), jour de match, et événements (stage, loto, tournoi…).

Rien d'autre ne change : mêmes matchs, mêmes textes, même publication du lundi à 9 h sur Facebook et Instagram.

## Où mettre chaque fichier

Le dossier est rangé comme le site. Dans le gestionnaire de fichiers d'o2switch (cPanel), ouvre le dossier du site
(celui qui contient déjà `api` et `img`), puis :

| Dans ce dossier | À mettre sur le site | Ce que c'est |
|---|---|---|
| `api/affiches.php` | `api/affiches.php` (**remplace** l'ancien) | Le programme qui dessine et publie les affiches. Ton fichier, avec la nouvelle mise en page en plus. |
| `api/polices/` (10 fichiers .ttf) | `api/polices/` | Les polices. Les 4 Barlow Condensed y sont déjà ; il faut ajouter les 6 nouvelles (italiques et Source Sans 3). Tu peux tout envoyer, ça remplace à l'identique. |
| `img/affiches-nuit/` (6 images) | `img/affiches-nuit/` (nouveau dossier) | Les décors : le stade Gustave Jaume de nuit avec le ballon du club, en 3 formats × domicile / extérieur. |

Le dossier `apercus/` n'est pas à envoyer : ce sont des exemples d'affiches dessinées par ce programme.

Conseil : avant de remplacer `api/affiches.php`, télécharge l'ancien sur ton ordinateur (copie de secours).

## Vérifier

1. Connecte-toi au site avec un compte coach ou bureau.
2. Ouvre `https://asf-pierrelatte.fr/api/affiches.php?diag=1` : la ligne « Affiches « stade de nuit » » doit dire **ACTIVES**,
   avec les 6 décors « présent » et les 6 polices « présente ».
3. Regarde une affiche sans rien publier :
   - résultats à l'extérieur, format publication : `/api/affiches.php?apercu=resultats&lieu=ext&format=carre`
   - rencontres à domicile, format story : `/api/affiches.php?apercu=programme&lieu=dom`
   - foot animation : `apercu=plateaux` ou `apercu=plateaux-resultats` ; vétérans : `apercu=veterans` ou `apercu=veterans-resultats`
   - format Facebook : ajoute `&format=fb`
   - un événement : `/api/affiches.php?apercu=evenement&titre=Stage de la Toussaint&sous=U7 à U13&date=2026-10-19&heure=09:00&lieu=Stade Gustave Jaume, Pierrelatte&texte=Repas compris`

Les aperçus de l'espace club (« Affiches de la semaine ») montrent aussi directement le nouveau style.

## Ce que fait le programme

- **Toute la liste tient sur l'affiche** : la taille des lignes est calculée selon le nombre de matchs (testé jusqu'à 9 matchs
  sur le format Instagram). Les noms trop longs sont réduits puis passent sur deux lignes, sans jamais être coupés.
- **Un seul match** (souvent les vétérans) : grande carte avec les deux blasons, l'heure ou le score, la date et le stade.
- **Aucun match** : « Aucun match programmé ce week-end ».
- **Résultats** : cases vertes (victoire), grises (nul), rouges (défaite) ; la case de Pierrelatte est cerclée d'or à domicile,
  d'argent à l'extérieur ; « NC » quand le score n'est pas encore connu.
- **Domicile / extérieur** : décor doré avec la maison, ou argent bleuté avec l'avion. Le club qui reçoit est toujours à gauche.
- **Partenaires** : la moitié des logos sur l'affiche domicile, l'autre moitié sur l'affiche extérieur, comme avant.
  Sans partenaires (`sponsors=0`), le bas porte le nom du site.
- **Événements** (stage, loto, tournoi…) : le titre passe sur deux lignes s'il est long, et la carte « Infos pratiques »
  reprend la date, l'heure, le lieu et chaque ligne du texte.
- La saison écrite en haut (« Saison 2026-2027 ») change toute seule au mois d'août.

## Revenir aux anciennes affiches

Supprime (ou renomme) le dossier `img/affiches-nuit` : le programme redessine aussitôt les anciennes affiches.
Pour revenir complètement en arrière, remets l'ancien `api/affiches.php`.

## Changer un décor

Les décors sont faits avec le kit des affiches (`affiches-semaine/kit/`). Pour en refaire un, ouvre l'affiche dans le kit,
cache tout sauf le fond, le blason, « 1923 » et la signature, puis enregistre l'image au même nom (même taille :
1080 × 2160 pour `fb`, 1080 × 1920 pour `story`, 1080 × 1350 pour `insta`).
