# Sapeurs-Pompiers — Donzère

Jeu de secours d'urgence aux personnes dans le vrai Donzère (Drôme), jouable dans un navigateur (three.js).

- **Ville réelle** : emprises et hauteurs des bâtiments, routes, végétation et relief issus de l'IGN (BD TOPO®, BD ORTHO®).
- **Véhicule** : VSAV. Le jeu charge `modeles_prives/vsav_bspp_web.glb` (ou `vsav_bspp_leger.glb` sur téléphone) s'il existe, sinon `modeles/vsav.glb`.
- **Interventions** : catalogue de cas (arrêt cardiaque, hémorragie, traumatismes, malaises, accidents de la route…), matériel du VSAV,
  bilan, gestes, brancardage, transport. Simulation ludique : elle ne remplace pas une formation aux premiers secours.

## Lancer le jeu

Servir ce dossier avec n'importe quel serveur web statique puis ouvrir `index.html`.

## Ordinateur et téléphone

Le même jeu s'adapte à l'appareil, et suit la dernière commande utilisée :

- **Ordinateur** : clavier et souris (la liste des touches est affichée en jeu).
- **Téléphone, tablette** : volant (glissière en bas à gauche), pédales (en bas à droite : avancer ; frein, ou marche arrière
  à l'arrêt), boutons Moteur, Ceinture, Frein P, Caméra, Gyro, 2 tons, Klaxon, et menu **Plus** (clignotants, détresse, feux,
  balisage, replacer, qualité, aide). L'écran se joue debout ou couché ; la tablette de bilan et l'écran de fin s'utilisent au doigt.

Sur écran tactile, le jeu charge la **version allégée** : modèles `*_leger.glb` (textures deux à quatre fois plus petites,
véhicule simplifié), photo aérienne unique, ombres courtes. `#leger` ou `#complet` dans l'adresse force l'une ou l'autre.
La finesse de l'image s'ajuste seule à la fluidité (menu Plus → Qualité, ou touche `O`, pour choisir).

## Outils (dossier `outils/`)

| Script | Rôle |
| --- | --- |
| `bake.py` | Télécharge les données IGN de la zone et produit `data/donzere.json` + les photos aériennes |
| `monde.py`, `facades.py` | Construit les bâtiments dans Blender (module `bpy`) → `modeles/batiments_brut.glb` |
| `commerces.py`, `devantures.py` | Commerces réels (annuaire Sirene) et leurs devantures |
| `ciel.py`, `sol.py`, `arbres.py`, `textures.py`, `cc0.py` | Ciel HDRI, matières du sol, arbres et textures (Poly Haven, CC0) |
| `atelier.py`, `vsav.py` | Atelier de modélisation Blender (coques, roues réalistes, livrées) |
| `gta/convertir.py`, `gta/rsc.py` | Convertit un véhicule de mod GTA V (`.yft` + `.ytd`) en GLB |
| `optimiser.mjs` | Allège un GLB pour le web (Meshopt, WebP) |
| `leger.mjs` | Variante « téléphone » d'un GLB : textures plafonnées, maillages simplifiés |
| `publier.py` | Prépare `publication/` pour un hébergement qui ne sert que les types de fichiers courants |
| `essai.cjs`, `essais/*.cjs` | Essais automatiques dans Chromium (Playwright) : clavier, et écran tactile avec `APPAREIL="iPhone 14"` |

## Crédits et licences

- Données géographiques : © IGN — BD TOPO® et BD ORTHO®, Licence Ouverte Etalab 2.0. Relief : Terrain Tiles (AWS Open Data).
- Commerces et services : base Sirene de l'INSEE via l'API Recherche d'entreprises (Licence Ouverte). Les noms de personnes ne sont pas repris.
- Ciel, textures de matériaux et arbres : Poly Haven (CC0).
- Moteur : three.js (MIT). Polices des outils : Roboto Condensed (Apache 2.0), Barlow Condensed (OFL).
- Les modèles de véhicules issus de mods tiers (dossier `modeles_prives/`, non versionné) restent la propriété de leurs auteurs
  et ne doivent pas être redistribués sans leur accord.
