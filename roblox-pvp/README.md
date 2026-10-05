# 🔫 ARENA CLASH — FPS/TPS PvP Roblox clé en main

Shooter en tous contre tous, vue à l'épaule, **100 % généré par le code** : map, armes 3D, effets et interface. Aucun modèle à importer.

## Essayer en 2 minutes

1. Installe **Roblox Studio** depuis https://create.roblox.com (bouton « Start Creating ») et connecte-toi.
2. Télécharge **`ArenaClash.rbxlx`** et ouvre-le dans Studio (double-clic, ou *File → Open from File*).
3. Clique sur **Play** (F5), puis **JOUER** dans le menu.
4. Pour te battre contre toi-même : onglet **Test** → *Clients and Servers* → **2 Players** → **Start**.

> En test local, la progression n'est pas sauvegardée et le classement mondial reste vide : c'est normal. Pour que ça marche, publie le jeu (*File → Publish to Roblox*), puis active *Game Settings → Security → Enable Studio Access to API Services*.

## Commandes

| Action | PC | Manette | Mobile |
|---|---|---|---|
| Tirer | Clic gauche | R2 | bouton 🔫 |
| Viser / lunette | Clic droit (maintenu) | L2 | bouton 🎯 |
| Recharger | R | X | bouton ↻ |
| Changer d'arme | 1 / 2 / molette | Y | bouton ⇄ |
| Sprint | Shift (maintenu) | L3 | bouton 🏃 |
| Dash | Q | B | bouton 💨 |
| Radar (série de 4) | 3 | ← | bouton |
| Frappe orbitale (série de 8) | 4, puis clic sur la cible | → | bouton |
| Arsenal | B | — | bouton |
| Tableau des scores | Tab | — | — |

## Contenu

- **8 armes réelles** modélisées en 3D par le code : M1911, Magnum .357, UZI, fusil à pompe, AK-47, M4A1, Sniper .50 (avec lunette), M249. Chacune a ses propres dégâts, cadence, portée, recul et dispersion.
- **Gunplay** : vue à l'épaule, visée, recul de la caméra, dispersion qui grandit en tirant, tirs à la tête, baisse des dégâts avec la distance, rechargement, sprint et dash.
- **Tirs validés par le serveur** : cadence, munitions, origine du tir, cohérence de l'impact et vérification qu'aucun mur ne se trouve entre le tireur et la cible.
- **Effets** : traceurs, flash de bouche, douilles éjectées, impacts et trous de balles, dissolution néon à la mort, killcam sur ton tueur, chiffres de dégâts et éclairage *Future* avec de vraies ombres.
- **Séries** : Radar (ennemis visibles à travers les murs) et **Frappe orbitale** (un rayon tombe du ciel). Le joueur en grosse série devient une **cible** marquée d'une couronne.
- **Score à la CoD** : « +100 ÉLIMINATION », « TIR À LA TÊTE », médailles (DOUBLE KILL, VENGEANCE, PREMIER SANG…).
- **Progression** : niveaux, pièces, Arsenal avec aperçu 3D des armes, **camouflages** débloqués en faisant des kills avec chaque arme (Carbone, Arctique, Cramoisi, Or, Diamant, Nébuleuse animée).
- **Rétention** : récompense quotidienne sur 7 jours, classement mondial, gamepass VIP (pièces x2) et badges.
- **Menu d'accueil cinématique** : la caméra survole la map, et la map est conçue pour être unique.

## Développer avec Rojo

1. Installe [Rojo](https://rojo.space), puis lance `rojo serve` dans ce dossier.
2. Dans Studio, ouvre un Baseplate vide et connecte-toi avec le plugin Rojo.
3. Pour régénérer le fichier à ouvrir directement : `rojo build -o ArenaClash.rbxlx`.

`ARCHITECTURE.md` décrit comment les modules communiquent entre eux.

## Personnaliser

- **Équilibrage** : `src/shared/Config.luau` (XP, pièces, santé, séries, caméra…) et `src/shared/Weapons.luau` (stats des armes).
- **Sons** : `Config.Sounds`. Colle des `rbxassetid://` d'audios **publics** (Creator Store → Audio, de préférence ceux publiés par *Roblox*). Un champ vide = son désactivé.
- **VIP / badges** : crée-les sur le Creator Hub puis colle leurs IDs dans `Config.VipGamepassId` et `Config.Badges`.
- **Ta propre map** : construis un dossier `Arena` dans Workspace (avec des `SpawnLocation`, une part `Leaderboard` et un dossier `CameraPoints`). La génération automatique ne se lance alors pas.

## Attirer des joueurs

1. **Icône et miniatures** : prends des captures du menu cinématique et de la frappe orbitale. Utilise des couleurs vives et peu de texte, puis fais des tests A/B de miniatures sur le Creator Hub.
2. **Titre** : un nom court + un mot-clé, par exemple « Arena Clash 🔫 FPS PvP ». Ajoute « [UPD 1] » à chaque mise à jour.
3. **Mises à jour régulières** : une nouvelle arme ou un nouveau camouflage chaque semaine.
4. **Groupe Roblox et Discord** : annonce les mises à jour et propose une récompense aux membres.
5. **Publicités sponsorisées** au lancement : les premiers joueurs déclenchent la recommandation de Roblox.
6. **Rétention** : l'algorithme met en avant les jeux où les joueurs restent et reviennent. Les camouflages, la récompense quotidienne et les séries servent à ça.
