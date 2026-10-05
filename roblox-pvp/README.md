# ⚔️ ARENA CLASH — jeu PvP Roblox clé en main

Arène PvP au sabre, en mode « tous contre tous » : tu lances le jeu et c'est jouable, la carte, les armes et l'interface sont générées par le code (aucun modèle à importer).

## Ce qu'il y a dedans

| Système | Détail |
|---|---|
| **Combat validé par le serveur** | Le client dit seulement « je frappe ». Le serveur vérifie le cooldown et calcule lui-même la hitbox, ce qui bloque les exploits de dégâts et de portée les plus courants. |
| **Ressenti du combat** | Coups critiques, recul, chiffres de dégâts, flash rouge quand tu es touché, traînées sur les lames, sons, dash (Q / bouton mobile / L1 manette) |
| **Kills et séries** | Kill feed, séries annoncées à tout le serveur (3, 5, 10, 15, 25), **prime** sur les joueurs en série, assistances payées, +30 PV à chaque kill |
| **Progression** | Pièces, XP et niveaux (avec des pièces bonus à chaque niveau), meilleure série, kills et morts sauvegardés |
| **Boutique** | 6 épées, de l'Épée en bois à la Faux du Néant. Les DPS restent proches : on achète du style, pas une victoire assurée |
| **Rétention** | Récompense quotidienne qui augmente sur 7 jours consécutifs, classement **Top Kills global** affiché dans l'arène |
| **Monétisation** | Gamepass VIP (pièces x2), badges (premier kill, série de 10, niveau 10) |
| **Protection au spawn** | ForceField de 3 s, retiré dès que le joueur attaque (pas d'abus) |
| **Sauvegarde fiable** | 3 essais en cas d'échec, sauvegarde auto toutes les 2 min, sauvegarde à la fermeture du serveur. Si le chargement échoue en ligne, le joueur est expulsé pour ne pas écraser ses données |
| **Carte** | Arène néon de 200×200 avec couvertures symétriques, plateforme centrale et rampes, 8 spawns, éclairage soigné (Atmosphere, Bloom…) |

## Installation (avec Rojo, recommandé)

1. Installe [Rojo](https://rojo.space) (plugin Studio + CLI, ou via l'extension VS Code).
2. Dans ce dossier : `rojo serve`
3. Dans Roblox Studio : ouvre un **Baseplate** vide, puis clique sur Rojo → **Connect**.
4. **Accueil → Paramètres du jeu → Sécurité → active « Autoriser l'accès Studio aux services API »** (sinon rien n'est sauvegardé en test).
5. Lance **Play**. Pour tester le PvP en local : **Test → Clients et serveurs → 2 joueurs**.

## Installation sans Rojo

Recrée cette structure dans Studio en copiant le contenu des fichiers :

```
ReplicatedStorage
└─ Shared (Folder)
   ├─ Config    (ModuleScript)  ← src/shared/Config.luau
   ├─ Remotes   (ModuleScript)
   └─ Weapons   (ModuleScript)
ServerScriptService
└─ Server (Folder)
   ├─ Main (Script)             ← src/server/Main.server.luau
   └─ Services (Folder)  → DataService, CombatService, ShopService, LeaderboardService, MapService (ModuleScripts)
StarterPlayer > StarterPlayerScripts
└─ Client (Folder)
   ├─ Main (LocalScript)        ← src/client/Main.client.luau
   └─ Controllers (Folder) → Ui, HudController, ShopController, CombatController (ModuleScripts)
```

## Personnaliser

- **Tout l'équilibrage** se trouve dans `src/shared/Config.luau` : pièces, XP, crit, dash, récompenses quotidiennes, couleurs, sons.
- **Armes** : ajoute une entrée dans `src/shared/Weapons.luau` et elle apparaît automatiquement en boutique.
- **VIP / badges** : crée le gamepass et les badges sur le Creator Hub, puis colle leurs IDs dans `Config.VipGamepassId` et `Config.Badges`.
- **Ta propre carte** : construis un dossier `Arena` dans Workspace avec des `SpawnLocation` et une part nommée `Leaderboard`. La génération automatique ne se lance alors pas.

## Attirer des joueurs : la checklist

Le code fait la moitié du travail. Le reste se joue sur la page du jeu :

1. **Icône et miniatures** : ce sont elles qui déterminent si les gens cliquent. Mets une action en gros plan avec des couleurs vives et peu de texte. Prépare 2 ou 3 miniatures et teste-les (le Creator Hub propose des tests A/B de miniatures).
2. **Un nom court + un mot-clé** que les joueurs tapent vraiment, par exemple « Arena Clash ⚔️ Sword PvP ».
3. **Une description** qui liste les points forts (séries, boutique, classement, récompense quotidienne) et le calendrier des mises à jour.
4. **Des mises à jour régulières**, par exemple une nouvelle épée chaque semaine. Ajoute le numéro de mise à jour dans le titre (« [UPD 3] »).
5. **Des groupes et serveurs Discord** : crée un groupe Roblox, mets-y un code promo (une épée gratuite par exemple) et annonce les mises à jour.
6. **Des publicités sponsorisées** pour un petit budget au lancement : les premiers joueurs déclenchent la recommandation de Roblox.
7. **La rétention avant tout** : l'algorithme de Roblox met en avant les jeux où les joueurs restent et reviennent. C'est le rôle de la récompense quotidienne, des séries et du classement.

## Idées pour la suite

Codes promo, modes en équipes ou « Roi de la colline » sur la plateforme centrale, skins d'effets de kill, saisons de classement, PNJ d'entraînement, file de matchs 1v1.
