# Affiches de la semaine · ASF Pierrelatte

Le kit qui fabrique les affiches « Résultats », « Rencontres », « Foot animation » et « Vétérans »,
en version domicile et extérieur, aux formats Facebook (1080 × 2160), Instagram (1080 × 1350) et Story (1080 × 1920).

## Ce qu'il y a dans le dossier

| Fichier | Rôle |
|---|---|
| `affiche.html` | **Tout le code de l'affiche** : la mise en page (CSS) et le programme qui dessine l'affiche à partir des données (JavaScript). |
| `fonds/` | Les 6 fonds du stade Gustave Jaume de nuit avec le ballon du club (3 formats × domicile / extérieur), déjà calculés. |
| `logos/` | Le blason du club, les logos des partenaires (`partenaires/01.png` à `20.png`, dans l'ordre du site) et des adversaires. |
| `donnees/` | Les données de chaque affiche d'exemple (`resultats-dom.js`, `rencontres-ext.js`…) et la liste des logos (`logos.js`). |
| `capturer.mjs` | Petit programme qui exporte les affiches en images PNG automatiquement. |

## Voir une affiche

Ouvre `affiche.html` dans Chrome ou Edge (double-clic) : la liste des exemples s'affiche, clique sur celui que tu veux.
Directement : `affiche.html?d=resultats-dom` (Facebook), `affiche.html?d=resultats-dom&f=insta`, `affiche.html?d=resultats-dom&f=story`.

Pour enregistrer l'image à la main : clic droit › « Inspecter », puis Ctrl+Maj+P › « Capture node screenshot » sur le bloc `.affiche`.
Plus simple : utilise `capturer.mjs` (ci-dessous).

## Faire une nouvelle affiche

Copie un fichier de `donnees/` (par exemple `resultats-dom.js` → `mes-resultats.js`), change les matchs, puis ouvre `affiche.html?d=mes-resultats`.

```js
window.AFFICHE = {
  "type": "resultats",           // resultats · rencontres · animation-rencontres · animation-resultats · veterans-rencontres · veterans-resultats
  "lieu": "dom",                 // dom (à domicile, doré, maison) ou ext (à l'extérieur, argent-bleu, avion)
  "format": "fb",                // fb · insta · story
  "date": "Samedi 26 et dimanche 27 septembre",
  "matchs": [
    { "cat": "U11", "niveau": "Brassage", "adv": "St Montan OL", "bp": 3, "bc": 0 },
    { "cat": "U18", "niveau": "District 1", "adv": "FC Péageois", "logo": "fc-peageois", "bp": 2, "bc": 1 }
  ]
};
```

Champs d'un match :

* **Résultats** : `cat` (U11, Seniors 1…), `niveau` (Brassage, D1 Unique…), `adv` (adversaire), `bp` (buts de Pierrelatte), `bc` (buts de l'adversaire), `logo` (facultatif).
* **Rencontres** : mêmes champs, avec `jour` (« Samedi ») et `heure` (« 15h00 ») à la place du score.
* **Foot animation · rencontres** : `cat`, `niveau`, `lieu` (« Plateau à Donzère · C.O. Donzérois »), `jour`, `heure`, `adversaires` : `[{ "nom": "Donzère", "logo": "co-donzerois" }, …]`.
* **Foot animation · résultats** : `cat`, `niveau`, `lieu`, `resultats` : `[{ "adv": "CO Donzérois", "logo": "co-donzerois", "bp": 3, "bc": 3 }, …]`.
* **Un seul match** (souvent les vétérans) : il s'affiche en grand. Ajoute `quand` (« Vendredi 9 octobre ») et `lieu` (« Stade Gustave Jaume, Pierrelatte »).
* **Aucun match** : `"matchs": []` → « Aucun match programmé ce week-end ».

Le `logo` est soit une clé de `donnees/logos.js` (`montelimar`, `co-donzerois`…), soit le chemin d'une image (`logos/adversaires/mon-club.png`).
Sans logo, l'affiche dessine un rond avec les initiales du club.

Facultatif : `titre`, `sousTitre`, `surTitre` (pour changer les titres), `saison`, `partenaires` (liste de chemins d'images, sinon :
partenaires 1 à 15 à domicile, 16 à 30 à l'extérieur, comme sur les affiches actuelles du club).

Rangement automatique : la liste grossit ou rétrécit selon le nombre de matchs (testé jusqu'à 9 sur Facebook),
les noms trop longs se resserrent puis passent sur deux lignes, jamais coupés. S'il y a vraiment trop de matchs,
`capturer.mjs` le signale : il faut alors faire deux affiches (comme les « partie 1 / partie 2 » actuelles).

## Exporter en PNG automatiquement

Sur un ordinateur avec Node.js :

```
npm install playwright
npx playwright install chromium
node capturer.mjs                     # toutes les affiches d'exemple, aux 3 formats, dans le dossier png/
node capturer.mjs resultats-dom insta # une seule
```

## Brancher sur le site du club

Sur le site en ligne, les affiches sont fabriquées par le serveur (`api/affiches.php`, chez o2switch), qui ne peut pas
ouvrir de page web pour en faire une image. La mise en page de ce kit y a donc été recopiée en PHP (dessin avec GD) :
tout est dans le dossier **`asf-pierrelatte/serveur/`** : il suffit de remplacer les deux fonds (`img/fond-domicile.jpg`, `img/fond-exterieur.jpg`) et `api/affiches.php` (voir `serveur/LISEZ-MOI.md`).
Les affiches restent publiées toutes seules sur Facebook et Instagram : les résultats le lundi à 9 h, les rencontres le mercredi à 9 h.
