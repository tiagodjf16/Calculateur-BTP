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

---

## Stories des compos : la story des convoqués et la story de la composition

### Ce qu'il faut envoyer sur l'hébergeur

| Fichier | Où le mettre |
|---|---|
| `serveur/api/affiches.php` | dans `api/` du site (remplace l'ancien : il contient tout, affiches des compos comprises) |
| `serveur/img/fond-tableau.jpg` | dans `img/` du site (fond du style « Tableau tactique » ; sans lui, ce style garde un simple tableau vert) |
| `index.html` | à la racine du site (le module `espace-club/stories-compo.js` y est déjà intégré) |

Rien d'autre ne change : les affiches du week-end, du foot animation, des vétérans et des événements restent identiques.

### Ce qui est publié, et quand

Tout part **en story uniquement**, sur Facebook et sur Instagram. Rien n'est publié dans le fil de la page.

| Story | Quand elle part | Ce qu'on y voit |
|---|---|---|
| **Les convoqués** | Dès que le coach clique **« Valider et prévenir »** sur sa compo (ou **« Publier »** sur la carte d'un brouillon). | L'équipe, l'adversaire, la date, l'heure, le rendez-vous et la liste des joueurs convoqués. |
| **La composition** | **30 minutes avant le coup d'envoi** (tu peux choisir 15 min, 45 min, 1 h ou 1 h 30). | Le onze sur le terrain, le capitaine et les remplaçants. |

Bon à savoir :

- Chaque story ne part **qu'une seule fois par compo**. Si le coach modifie sa compo et la valide de nouveau, il n'y a pas de deuxième story des convoqués. La story de la composition reprend, elle, la dernière version de la compo.
- **Le soir**, après 21 h 30, la story des convoqués attend le lendemain à 8 h, pour être vue par plus de monde.
- Pas de story pour un **brouillon**, pour un **match passé**, ni pour un match **déjà commencé**.
- Pas de story de composition si la compo n'a **pas d'heure de coup d'envoi** ou si **aucun joueur n'est placé** sur le terrain. La story des convoqués part quand même.
- **Jeunes (U6 à U18)** : par défaut, les affiches mettent seulement l'initiale du nom (« Lucas M. »). Pour les adultes, elles mettent le nom complet (« Lucas MARTIN »).
- Si Facebook ou Instagram a une panne, le site réessaie tout seul, 3 fois au plus. Il ne republie jamais sur le réseau où la story est déjà partie.
- Les compos déjà publiées **avant** la mise en route ne reçoivent pas de story des convoqués : ça évite une rafale de stories le premier jour. Leur story de composition part bien avant le match.

### Choisir le style et les réglages

Va dans l'espace club, puis **Communication › Affiches**, et ouvre le bloc **« 📲 Stories des compos »**. Seul le bureau voit ce bloc. Chaque changement est enregistré tout de suite.

1. **Ce qui part en story** : l'interrupteur général, la story des convoqués, la story de la composition, et combien de temps avant le match.
2. **Style des affiches** : il y en a 3 (*Stade de nuit*, *Tableau tactique*, *Bleu club*). Chaque style montre ses deux affiches en exemple. Touche un style pour le choisir : il est entouré en vert et marqué « ✓ Choisi ». Pour voir un style en grand avant de le choisir, touche **« 🔍 Voir en grand »**.
3. **Noms des joueurs** :
   - *Auto* : initiales pour les jeunes, nom complet pour les adultes ;
   - *Nom complet* : « Lucas MARTIN » ;
   - *Prénom + initiale* : « Lucas M. ».
4. **Pas de story pour ces équipes** : coche une équipe pour ne jamais publier ses stories. Ses compos restent visibles sur le site.

Dans l'onglet **Compos**, chaque compo publiée à venir montre une ligne d'état, par exemple : « 📲 Story convoqués : publiée ✓ · Story compo : prévue à 14h30 ». Le bouton **« 👁 Voir les stories »** montre les deux affiches. Il permet aussi de les publier tout de suite, ou de les télécharger.

### Publier pile 30 minutes avant : ajouter le cron des 5 minutes (o2switch)

Aujourd'hui, le site passe une fois par heure (cron horaire). Avec seulement ce passage, la story de la composition part **dans l'heure qui précède** le match, donc entre 1 h 30 et 30 min avant. Pour qu'elle parte **pile 30 minutes avant**, ajoute une tâche qui tourne toutes les 5 minutes :

1. Connecte-toi au **cPanel d'o2switch**.
2. Ouvre la rubrique **« Tâches Cron »**.
3. Dans **« Réglage commun »**, choisis **« Une fois toutes les cinq minutes (*/5 * * * *) »**.
4. Dans **« Commande »**, colle cette ligne :

   ```
   /usr/local/bin/php /home/TON_COMPTE/public_html/api/affiches.php compos > /dev/null 2>&1
   ```

   Remplace `TON_COMPTE` par ton identifiant o2switch. La ligne exacte, déjà complétée avec le bon chemin, est affichée dans le bloc « 📲 Stories des compos », avec un bouton **« 📋 Copier »**.
5. Clique **« Ajouter une nouvelle tâche Cron »**.

Si la commande `/usr/local/bin/php` ne marche pas, essaie simplement `php` à la place. Le reste de la ligne ne change pas.

**Autre possibilité, par une adresse web** (par exemple si l'hébergeur préfère appeler une adresse) : il faut appeler toutes les 5 minutes

```
https://asf-pierrelatte.fr/api/affiches.php?cron_compos=1&cle=TA_CLE
```

`TA_CLE` est la clé d'écriture du site (`CLE_ECRITURE`, la même que pour `sync.php`). Dans le cPanel, ça donne par exemple :

```
wget -q -O /dev/null "https://asf-pierrelatte.fr/api/affiches.php?cron_compos=1&cle=TA_CLE"
```

### Vérifier que tout marche

1. **Le cron** : dans le bloc « 📲 Stories des compos », la pastille doit afficher **« ⏱️ Cron 5 min : actif »**, avec la phrase « Le cron des 5 minutes tourne (dernier passage …) ». Tu peux aussi ouvrir `/api/affiches.php?diag=1`, qui montre la ligne « Stories des compos … cron des 5 minutes : dernier passage le … (actif) ».
2. **Les affiches** : touche « 🔍 Voir en grand » sur chaque style. Si une vignette affiche « Aperçu indisponible », ce style n'est pas encore installé sur le serveur.
3. **Une vraie compo** : quand un coach valide sa compo, il voit le message « 📲 Story des convoqués publiée sur Facebook et Instagram ». Dans l'onglet Compos, la ligne de la compo indique « Story convoqués : publiée ✓ ».
4. **L'historique** : les stories apparaissent dans l'historique des affiches (« Convocation · Seniors 1 », « Composition · Seniors 1 ») avec leur état, par exemple « Facebook : publié · Instagram : publié ».
5. **Un souci ?** La ligne d'état de la compo donne la raison. Par exemple : « pas de story · équipe exclue », « heure du coup d'envoi inconnue », « Facebook : pas relié ». Si Facebook n'est pas relié ou est en pause, va dans *Réglages Facebook et Instagram*.

Pour tout arrêter d'un coup, coupe l'interrupteur **« Stories des compos »**.

## Toujours servir la dernière version des pages

Le service worker du site (`sw.js`) ne garde rien en cache : il ne sert qu'aux notifications. Quand un téléphone affiche
encore l'ancienne page, c'est le cache du navigateur. Pour qu'il revérifie à chaque visite (sans tout retélécharger :
le serveur répond « rien n'a changé » quand c'est le cas), ajouter en haut du fichier `.htaccess` à la racine du site :

```
<IfModule mod_headers.c>
  <FilesMatch "\.html?$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  <Files "sw.js">
    Header set Cache-Control "no-cache"
  </Files>
</IfModule>
```

En plus, l'espace club et le site affichent « ✨ Nouvelle version du site disponible — Recharger » quand une nouvelle
version de `index.html` est en ligne.

## Espace joueur réservé aux licenciés, et qui donne l'accès dirigeant

- Chaque compte a un **numéro de licence** (colonne `licence` de la table `comptes`, ajoutée toute seule par `session.php`).
  S'il est vide, le serveur prend celui de la fiche du joueur dans les effectifs (import Footclubs) et le garde dans le compte.
- Un compte **joueur sans numéro de licence** ne peut pas se connecter (« l'espace joueur est réservé aux licenciés ») et
  n'a accès à aucune donnée ; il n'apparaît pas non plus dans la messagerie. Les coachs et le bureau n'ont pas besoin de
  licence pour l'espace dirigeants.
- **Donner l'accès dirigeant** (changer le rôle d'un compte, créer un coach ou un dirigeant, changer un « rôle choisi » dans
  `site/permissions`) : seulement l'administrateur principal et les comptes au rôle **« Joueur, coach et bureau »**.
- Le reste (créer les accès des joueurs, donner un code, voir les identifiants, cocher les onglets et les équipes) : en plus,
  les membres du bureau qui ont l'onglet « Accès et rôles » (un compte du bureau sans liste d'onglets les a tous).

Fichiers à envoyer dans `api/` : `session.php`, `auth.php`, `db.php`, `messagerie.php`. `session.php` n'est pas dans ce
dépôt (il contient le code commun des joueurs) : prends celui qui t'a été envoyé à part.
