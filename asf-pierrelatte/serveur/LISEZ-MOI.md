# Nouveau fond et nouvelles écritures des affiches · ASF Pierrelatte

On garde tout ce qui est déjà sur l'hébergeur, avec les mêmes noms. On remplace seulement :
**les deux fonds** (domicile et extérieur) et **les écritures** (c'est `api/affiches.php` qui écrit les textes sur les affiches).

## Ce qu'il faut remplacer sur l'hébergeur

| Fichier de ce dossier | Sur l'hébergeur | Ce qui change |
|---|---|---|
| `img/fond-domicile.jpg` | remplace `img/fond-domicile.jpg` | le fond « à domicile » : le stade Gustave Jaume de nuit avec le ballon du club |
| `img/fond-exterieur.jpg` | remplace `img/fond-exterieur.jpg` | le fond « à l'extérieur » : le même stade, vu de l'autre côté |
| `api/affiches.php` | remplace `api/affiches.php` | les écritures : titres, liste des matchs, blason et « 1923 », devise, partenaires |
| `api/polices/` (11 polices) | à mettre dans `api/polices/` (le dossier existe déjà) | les polices des nouvelles écritures (italiques, Source Sans 3, écriture manuscrite) |

Rien d'autre ne bouge : `index.html`, `img/blason.png`, `img/partenaires/`, `img/adversaires/`, `logos/`, `affiches/`,
`confidentialite.html` restent comme ils sont.
Le dossier `apercus/` ne va pas sur l'hébergeur : ce sont des exemples d'affiches dessinées par ce programme.

Conseil : avant de remplacer, télécharge les anciens `fond-domicile.jpg`, `fond-exterieur.jpg` et `affiches.php` sur ton ordinateur.

## Publications : une pour le domicile, une pour l'extérieur

Chaque annonce (rencontres, résultats, foot animation, vétérans) part en **deux publications séparées** : les matchs à domicile,
puis ceux à l'extérieur, chacune avec son message. Quand un lieu a trop de matchs pour une seule page, sa publication en a
**deux** (« page 1/2 », « page 2/2 ») ; sinon une seule. Les stories suivent : une par page.
Foot animation : tout sur une ou deux affiches quand il y a peu de plateaux ; sinon une affiche par catégorie
(U6 · U7, U8 · U9, U10 · U11, U13 en brassage), toutes dans la même annonce (domicile, et une autre pour l'extérieur).
C'est vrai le lundi à 9 h (publication automatique) comme avec le bouton « Publier maintenant » de l'onglet Affiches.
Les affiches d'événement (stage, loto, tournoi) ne changent pas.

## Domicile, extérieur, et chaque format

Chaque annonce a toujours sa feuille **domicile** (fond doré, maison) et sa feuille **extérieur** (fond argent bleuté, avion).
Chaque feuille est faite pour chaque format, sans bande vide ni affiche réduite :

| Format | Taille | Où |
|---|---|---|
| Story | 1080 × 1920 | story Facebook et story Instagram |
| Publication Instagram | 1080 × 1350 | annonce (carrousel domicile + extérieur) dans le fil Instagram |
| Publication Facebook | 1080 × 1350, ou 1080 × 2160 pour deux pages | une page seule part en 1080 × 1350 ; deux pages partent côte à côte en 1080 × 2160, montrées en entier |

Une seule image de fond par lieu suffit : le serveur y prend la bonne partie pour chaque format, le ballon toujours à sa place.

Ce que font les nouvelles écritures :
- la liste prend la place qu'il faut selon le nombre de matchs (testé jusqu'à 9 matchs sur le format Instagram) ;
  les noms trop longs sont réduits puis passent sur deux lignes, sans jamais être coupés ;
- un seul match (souvent les vétérans) : grande carte avec les deux blasons, l'heure ou le score, la date et le stade ;
- résultats : cases vertes (victoire), grises (nul), rouges (défaite), « NC » quand le score n'est pas encore connu ;
- mêmes affiches pour le foot animation, les vétérans, le jour de match et les événements (stage, loto, tournoi) ;
- partenaires : la moitié sur la feuille domicile, l'autre moitié sur la feuille extérieur, comme avant.

## Vérifier

1. Connecte-toi au site avec un compte coach ou bureau.
2. Ouvre `https://asf-pierrelatte.fr/api/affiches.php?diag=1` : la ligne « Affiches « stade de nuit » » doit dire **ACTIVES**,
   avec « nouveau fond » pour domicile et extérieur, et les polices « présente ».
3. Ouvre l'onglet Affiches de l'espace club : les aperçus montrent directement les nouvelles affiches.

## Revenir en arrière

Remets les anciens `fond-domicile.jpg` et `fond-exterieur.jpg` : les anciennes affiches reviennent aussitôt
(le programme reconnaît les nouveaux fonds à leur taille, 1520 × 2180, et ne les confond pas avec les anciens).
Pour tout annuler, remets aussi l'ancien `affiches.php`.
