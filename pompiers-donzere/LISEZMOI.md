# Sapeurs-Pompiers — Donzère

Jeu de secours d'urgence aux personnes dans le vrai Donzère (Drôme), jouable dans un navigateur (three.js).

- **Ville réelle** : emprises et hauteurs des bâtiments, routes, végétation et relief issus de l'IGN (BD TOPO®, BD ORTHO®).
- **Véhicule** : VSAV. Le jeu charge `modeles_prives/vsav_bspp_web.glb` s'il existe, sinon `modeles/vsav.glb`.
- **Interventions** : catalogue de cas (arrêt cardiaque, hémorragie, traumatismes, malaises, accidents de la route…), matériel du VSAV,
  bilan, gestes, brancardage, transport. Simulation ludique : elle ne remplace pas une formation aux premiers secours.

## Lancer le jeu

Servir ce dossier avec n'importe quel serveur web statique puis ouvrir `index.html`.
Ajouter `#leger` à l'adresse pour la version allégée (téléphones).

## Outils (dossier `outils/`)

| Script | Rôle |
| --- | --- |
| `bake.py` | Télécharge les données IGN de la zone et produit `data/donzere.json` + les photos aériennes |
| `monde.py`, `facades.py` | Construit les bâtiments dans Blender (module `bpy`) → `modeles/batiments_brut.glb` |
| `ciel.py`, `textures.py`, `cc0.py` | Ciel HDRI et textures de matériaux (Poly Haven, CC0) |
| `atelier.py`, `vsav.py` | Atelier de modélisation Blender (coques, roues réalistes, livrées) |
| `gta/convertir.py`, `gta/rsc.py` | Convertit un véhicule de mod GTA V (`.yft` + `.ytd`) en GLB |
| `optimiser.mjs` | Allège un GLB pour le web (Meshopt, WebP) |
| `essai.cjs` | Essai automatique du jeu dans Chromium (Playwright) |

## Crédits et licences

- Données géographiques : © IGN — BD TOPO® et BD ORTHO®, Licence Ouverte Etalab 2.0. Relief : Terrain Tiles (AWS Open Data).
- Ciel et textures de matériaux : Poly Haven (CC0).
- Moteur : three.js (MIT). Polices des outils : Roboto Condensed (Apache 2.0), Barlow Condensed (OFL).
- Les modèles de véhicules issus de mods tiers (dossier `modeles_prives/`, non versionné) restent la propriété de leurs auteurs
  et ne doivent pas être redistribués sans leur accord.
