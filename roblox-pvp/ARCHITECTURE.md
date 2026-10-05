# Arena Clash — architecture (contrat entre modules)

Shooter FFA Roblox, 100 % généré par code (aucun asset importé), projet Rojo.
Ce document est **le contrat** : chaque module doit respecter exactement les noms, payloads et responsabilités ci-dessous.

## Arborescence et propriétaires

```
src/shared/            (ReplicatedStorage.Shared)
  Config.luau          réglages (ÉCRIT, ne pas renommer de clés)
  Weapons.luau         stats des 8 armes (ÉCRIT)
  Camos.luau           camouflages débloquables (ÉCRIT)
  Remotes.luau         tous les remotes (ÉCRIT)
  Ballistics.luau      dispersion, dégâts, raycast params, tête (ÉCRIT)
  GunBuilder.luau      modèles 3D procéduraux des armes + Tool        [agent gun-models]
src/server/            (ServerScriptService.Server)
  Main.server.luau     point d'entrée                                  [agent server]
  Services/DataService.luau      données + leaderstats                 [agent server]
  Services/SpawnService.luau     choix du spawn + déploiement          [agent server]
  Services/WeaponService.luau    armes, munitions, validation des tirs [agent server]
  Services/CombatService.luau    dégâts, morts, scores, séries, primes, récompenses [agent server]
  Services/ShopService.luau      achats, loadout, camos, quotidien, paramètres [agent server]
  Services/LeaderboardService.luau  top kills global (EXISTANT, garder)
  Services/MapService.luau       génération de la map                  [workflow map]
src/client/            (StarterPlayerScripts.Client)
  Main.client.luau               point d'entrée, machine d'états       [agent ui-menu]
  Controllers/ClientState.luau   état partagé + bus d'événements (ÉCRIT)
  Controllers/Ui.luau            helpers UI (ÉCRIT)
  Controllers/Sfx.luau           sons (ÉCRIT)
  Controllers/GunController.luau     entrées, caméra épaule, visée, recul, tir, rechargement, dash, sprint, ciblage orbital [agent gun-client]
  Controllers/EffectsController.luau traceurs, flash, impacts, douilles, sons d'armes des autres, dissolution à la mort, chiffres de dégâts, killcam, radar, frappe orbitale, prime, pitch de visée + IK main gauche, camos animés [agent effects]
  Controllers/HudController.luau     HUD complet                       [agent hud]
  Controllers/MenuController.luau    menu d'accueil cinématique        [agent ui-menu]
  Controllers/ShopController.luau    Arsenal (armes + camos, aperçu 3D) [agent ui-menu]
  Controllers/SettingsController.luau paramètres                       [agent ui-menu]
```
Fichiers à supprimer : `Controllers/CombatController.luau` (épées), anciennes logiques d'épée.

Contraintes globales : Luau, commentaires en français, pas d'asset id (sauf `Config.Sounds`, qui peut être vide : toujours passer par `Sfx` qui ignore les ids vides), pas de `wait()` déprécié (utiliser `task.*`), pas de `spawn`/`delay`. Tout doit compiler avec `luau-compile`. Les noms d'instances / attributs ci-dessous sont **exacts**.

## Conventions de monde

- `workspace.Arena` : la map. `Arena.BulletPassthrough` (Folder) : murs invisibles et décor à ignorer par les balles. `Arena.CameraPoints` (Folder) : Parts "1".."6" (poses caméra du menu). `Arena.Leaderboard` (Part). Attributs `Arena:GetAttribute("MapName")`, `"MapTagline"`. Les SpawnLocation sont n'importe où dans `Arena` (descendants).
- `workspace.FX` : effets créés par le **serveur** (frappe orbitale…), créé par CombatService si absent.
- `workspace.ClientFX` : effets **locaux** de chaque client (traceurs, impacts, douilles, chiffres de dégâts). Créé par EffectsController (client) si absent. Toutes les pièces d'effet : `Anchored`, `CanCollide=false`, `CanQuery=false`, `CanTouch=false`, `CastShadow=false`.
- Les balles ignorent : `BulletPassthrough`, `FX`, `ClientFX` → toujours utiliser `Ballistics.GetRaycastParams(extra)`.

## Armes (Tool)

Créées **par le serveur** via `GunBuilder.BuildTool(weaponId, camoId)` et placées dans le `Backpack` (principale + secondaire).

`GunBuilder` (shared) API :
- `GunBuilder.BuildModel(weaponId: string, camoId: string?): Model` — modèle détaillé (15-40 pièces), `PrimaryPart = Handle`. Repère : origine = poignée (main droite), **-Z = vers l'avant (canon)**, **+Y = haut**. Toutes les pièces : `Anchored=false`, `CanCollide=false`, `CanTouch=false`, `CanQuery=false`, `Massless=true`, soudées au Handle par `WeldConstraint`. Contient des Attachments nommés : `Muzzle` (bout du canon, axe -Z sortant), `Eject` (fenêtre d'éjection, côté droit), `LeftGrip` (où se pose la main gauche ; garde-main / poignée avant ; pour un pistolet : sous/devant la poignée). Les pièces « corps » ont l'attribut `Camo = true`. Sniper : une lunette visible.
- `GunBuilder.BuildTool(weaponId: string, camoId: string?): Tool` — Tool `Name = weapon.Name`, `CanBeDropped=false`, `RequiresHandle=true`, `Grip = CFrame.new()` (le repère du Handle = repère de la main : -Z avant, +Y haut), `ToolTip` = catégorie. Pièces du modèle mises **directement** dans le Tool (Handle enfant direct). Attributs : `WeaponId`, `CamoId`, `Ammo` (= MagSize), `Reloading` (= false).
- `GunBuilder.ApplyCamo(container: Instance, camoId: string?)` — recolore les pièces `Camo=true` (Color/Material/Reflectance de `Camos`), retire/ajoute le tag CollectionService `"AnimatedCamo"` si `Animated`. "Default" = couleurs d'origine (stocker la couleur/matériau d'origine en attributs `BaseColor`/`BaseMaterial` à la construction).
- Échelle réaliste par rapport à un personnage R15 (~5,5 studs) : pistolet ~1,1 studs de long, UZI ~1,6, fusil d'assaut ~3,2, pompe ~3,4, sniper ~4,6, M249 ~3,8.

Attributs de Tool lus par le client : `WeaponId`, `CamoId`, `Ammo`, `Reloading` (serveur = autorité).

## Remotes (payloads exacts)

Client → serveur :
| Remote | Arguments | Serveur |
|---|---|---|
| `Deploy` (Event) | () | si données chargées, pas de personnage vivant, pas déjà en spawn → `SpawnService.Spawn(player)` |
| `Fire` (Event) | `origin: Vector3, pellets: { {Direction: Vector3, Hit: BasePart?, Position: Vector3, Normal: Vector3} }` | validation (voir plus bas) |
| `Reload` (Event) | () | démarre le rechargement de l'arme en main |
| `UseReward` (Event) | `rewardId: string, target: Vector3?` | consomme une récompense de série |
| `AimPitch` (UnreliableEvent) | `pitch: number` (radians, -1.3..1.3) | `character:SetAttribute("AimPitch", clamp)` max 20/s |
| `GetData` (Function) | () | → snapshot ou nil |
| `BuyWeapon` (Function) | `weaponId` | → `(ok: boolean, message: string)` ; achète et équipe dans son slot |
| `SetLoadout` (Function) | `weaponId` | → `(ok, message)` ; met l'arme possédée dans son slot (`weapon.Slot`), redonne les armes si vivant |
| `EquipCamo` (Function) | `weaponId, camoId` | → `(ok, message)` ; nécessite `WeaponKills[weaponId] >= camo.Kills` |
| `ClaimDaily` (Function) | () | → `(true, reward, streak)` ou `(false, secondsRemaining)` |
| `SaveSettings` (Function) | `settings` | → ok ; nettoie/clampe chaque champ de `Config.DefaultSettings` |

Serveur → client :
| Remote | Arguments | Destinataires |
|---|---|---|
| `ShotFx` | `shooter: Player, weaponId: string, origin: Vector3, impacts: { {Position: Vector3, Normal: Vector3, Character: boolean} }` | tous sauf le tireur |
| `HitConfirm` | `position: Vector3, damage: number, headshot: boolean, killed: boolean` | attaquant |
| `DamageTaken` | `fromPosition: Vector3, damage: number` | victime |
| `KillFeed` | `killerName: string?, victimName: string, weaponId: string?, headshot: boolean` | tous (`weaponId` peut valoir `"Orbital"`) — noms = `DisplayName` |
| `Score` | `label: string, xp: number` | joueur (une fois par événement de score, ex. ÉLIMINATION puis TIR À LA TÊTE) |
| `Medal` | `title: string, subtitle: string?` | joueur (DOUBLE KILL, VENGEANCE, PREMIER SANG…) |
| `Announce` | `text: string, color: Color3?` | un ou tous |
| `Toast` | `text: string` | joueur (« +25 💰 ») |
| `Killcam` | `killer: Player?, weaponId: string?, killerHealth: number?, respawnTime: number` | victime, juste après la mort |
| `RewardsChanged` | `available: { [rewardId]: true }, streak: number` | joueur, à chaque changement |
| `RewardFx` | `rewardId: string, owner: Player, position: Vector3?, duration: number` | Radar : propriétaire seulement (`duration` = Config) ; Orbital : tous (`position` = cible, `duration` = délai avant impact) |
| `DataChanged` | snapshot | joueur |

### Snapshot (DataChanged / GetData)
```lua
{
  Coins, Kills, Deaths, Headshots, Xp, XpNeeded, Level, BestStreak,
  Owned = { [weaponId] = true },
  Loadout = { Primary = weaponId, Secondary = weaponId },
  WeaponKills = { [weaponId] = number },
  Camos = { [weaponId] = camoId },
  DailyIn = number,      -- secondes avant de pouvoir réclamer (0 = dispo)
  DailyStreak = number,
  Vip = boolean,
  Settings = { Sensitivity, AdsSensitivity, Fov, DamageNumbers, CameraShake },
}
```
Données sauvegardées : mêmes champs (sans XpNeeded/DailyIn/Vip) + `LastDaily`. Par défaut : `Owned = {M1911=true, UZI=true}`, `Loadout = {Primary="UZI", Secondary="M1911"}`.

### Attributs
- Player : `VIP` (bool), `Bounty` (bool, série ≥ `Config.Bounty.MinStreak`), `Streak` (number), `Loaded` (bool, données chargées).
- Character : `AimPitch` (number).
- Tool : `WeaponId`, `CamoId`, `Ammo`, `Reloading`.
- leaderstats : `Kills`, `Série`, `Niveau` (IntValue).

## Serveur

- `CharacterAutoLoads = false`. Le joueur n'apparaît qu'après `Deploy` (menu), puis réapparaît automatiquement `Config.RespawnTime` s après sa mort.
- **SpawnService** : choisit parmi les SpawnLocation de `Arena` celle qui maximise la distance au plus proche ennemi vivant (au hasard parmi les 3 meilleures), `player.RespawnLocation = spawn`, `player:LoadCharacter()`. Configure le Humanoid : `MaxHealth = Health = Config.MaxHealth`. Ne double-spawn jamais.
- **WeaponService** : à chaque apparition, donne principale + secondaire (`GunBuilder.BuildTool` avec le camo équipé), équipe la principale. Munitions/rechargement en attributs. **Validation de `Fire`** :
  1. types valides ; `#pellets` entre 1 et `weapon.Pellets` ; personnage vivant ; Tool équipé avec `WeaponId` ; pas `Reloading` ; `Ammo > 0`.
  2. cadence : `now - lastShot >= FireDelay * Config.Validation.FireDelayTolerance` + seau de jetons (pas plus de `ceil(1/FireDelay)+2` tirs sur 1 s).
  3. `(origin - head.Position).Magnitude <= Config.Validation.MaxOriginOffset`.
  4. `Ammo -= 1`. Retirer le ForceField du tireur.
  5. Pour chaque plomb : `Direction` normalisée ; si `Hit` est une BasePart d'un personnage (Ballistics.GetHumanoid) autre que soi, vivant : distance ≤ `Range + 5` ; `(Hit.Position - Position).Magnitude <= Hit.Size.Magnitude/2 + HitTolerance` ; `(Position-origin).Unit:Dot(Direction) >= MinDirectionDot` ; ligne de vue : raycast serveur origin→Position avec `Ballistics.GetRaycastParams(Ballistics.GetCharacters())`, bloqué si obstacle à plus de 1,5 stud avant la cible. Si valide : `CombatService.ApplyDamage(attacker, humanoid, Ballistics.DamageAt(weapon, dist, Ballistics.IsHeadshot(Hit)), {WeaponId, Headshot, Distance})`.
  6. `ShotFx` à tous sauf le tireur (impacts limités à Range).
- **CombatService** : `ApplyDamage` (ignore ForceField, journal des attaquants, `HitConfirm`, `DamageTaken`), régénération (`RegenDelay`, `RegenPerSecond`), mort → crédit du kill (fenêtre), assistances, `Score` par événement (Config.ScoreEvents), pièces (x VIP), XP/niveaux, `WeaponKills[weaponId] += 1` (sauf Orbital), Headshots, médailles (multi-kill, vengeance, premier sang, longue distance, prime), séries + `Announce` (`Config.StreakMessages`), récompenses de série (`Config.Killstreaks`, gagnées en atteignant `Kills` dans la série, conservées jusqu'à utilisation, perdues en quittant), `Bounty`, soin au kill, `Killcam` à la victime, `KillFeed`, badges. **Radar** : `RewardFx` au propriétaire. **Orbital** : valide la cible (≤ `MaxDistance`), `RewardFx` à tous, après `Delay` s dégâts `Damage` à tous les humanoïdes dans `Radius` sauf propriétaire (kill crédité, weaponId `"Orbital"`), effet `Explosion` (BlastPressure 0, DestroyJointRadiusPercent 0).
- **DataService** : comme l'existant (sessions, retries, BindToClose, Studio sans API → données temporaires sans attente) + nouveaux champs.
- **ShopService** : remotes Buy/SetLoadout/EquipCamo/ClaimDaily/SaveSettings.

## Client

### Machine d'états (Main.client)
- Au démarrage : `Mode = "Menu"`. `StarterGui:SetCoreGuiEnabled` : Backpack=false, Health=false, PlayerList=false (le HUD a son propre tableau des scores sur Tab). Le chat reste.
- `LocalPlayer.CharacterAdded` → `Mode = "Playing"`. Humanoid.Died → `Mode = "Dead"`.
- `DataChanged`/`GetData` → `ClientState.Set("Data", snapshot)` et `ClientState.Set("Settings", snapshot.Settings)`.
- `RewardsChanged` → `ClientState.Set("Rewards", available)` + `Set("Streak", streak)`.
- Ordre d'init : Effects, Gun, Hud, Shop, Settings, Menu.

### Propriétaires de la caméra
- `Menu` : MenuController (`CameraType = Scriptable`, survol des `CameraPoints`, sinon orbite autour du centre).
- `Playing` : GunController (`CameraType = Custom`, épaule : `Humanoid.CameraOffset`, `MouseBehavior = LockCenter` chaque frame si `not UiOpen`, personnage tourné vers la caméra (AutoRotate=false), FOV, visée, recul (rotation incrémentale de `camera.CFrame` à `RenderPriority.Camera.Value + 1`), tremblements).
- `Dead` : EffectsController (killcam, `Scriptable`).
Quand `UiOpen` ou Mode ≠ Playing : souris libérée (`MouseBehavior.Default`, `MouseIconEnabled = true`) et aucun tir.

### Événements ClientState (noms exacts)
- États (`Changed:<clé>`) : Mode, UiOpen, Data, Settings, Weapon, Tool, Ammo, Reloading, Ads, Sprinting, Spread, Rewards, Streak, Targeting.
- `"Shot"` (weapon) — GunController après chaque tir local (HUD : recul du réticule).
- `"ReloadStarted"` (duration), `"ReloadFinished"` ().
- `"DashUsed"` (cooldown).
- `"OpenArsenal"` (), `"OpenSettings"` (), `"CloseOverlays"` () — navigation UI.
- `"CameraShake"` (intensity: number 0..1) — n'importe qui l'émet, GunController l'applique (si Settings.CameraShake).

### Entrées (GunController, ContextActionService avec boutons tactiles)
Tir : MouseButton1 / ButtonR2 / bouton « 🔫 ». Visée : MouseButton2 (maintien) / ButtonL2 / bouton « 🎯 » (bascule). Recharger : R / ButtonX / « ↻ ». Armes : One/Two, molette, ButtonY / bouton « ⇄ ». Sprint : LeftShift (maintien) / ButtonL3 / « 🏃 » (bascule). Dash : Q / ButtonB / « 💨 ». Récompenses : Three (Radar), Four (Orbital) / DPadLeft, DPadRight / boutons tactiles visibles seulement si disponibles. Ciblage Orbital : marqueur au sol au point visé, clic gauche confirme, clic droit / Échap annule.
Arsenal : touche B (ShopController). Tableau des scores : Tab (HudController).

### Disposition HUD (pour éviter les chevauchements)
- Haut centre : barre niveau/XP + pièces ; dessous : série.
- Haut droite : kill feed. (PlayerList désactivée.)
- Gauche milieu : boutons Arsenal / Paramètres / Récompense quotidienne.
- Centre : réticule dynamique, hitmarker, indicateurs de direction des dégâts (anneau ~130 px).
- 25-35 % hauteur : annonces et médailles. ~62 % : popups de score.
- Bas gauche : santé + récompenses de série. Bas droite : munitions + armes (sur tactile : en haut à droite sous le kill feed, laisser le bas droit libre pour les boutons).
- Bas centre : killcam (carte du tueur), barre de rechargement, dash.
- ScreenGui DisplayOrder : HUD 1, Menu 10, Arsenal/Paramètres 20.

### Rendu pour les autres joueurs (EffectsController)
- `ShotFx` → traceur depuis l'Attachment `Muzzle` de l'arme du tireur (sinon `origin`), flash, son (Config.Sounds.Weapons[weapon.Sound]), impacts.
- Pour **tous** les personnages R15 tenant une arme avec `LeftGrip` : `IKControl` (Transform, ChainRoot `LeftUpperArm`, EndEffector `LeftHand`, Target `LeftGrip`). Inclinaison du buste : `Waist.C0` et `Neck.C0` (garder les C0 d'origine) selon `AimPitch` (soi : pitch caméra direct).
- Mort de n'importe quel personnage : dissolution néon + particules.
- `Bounty` : couronne/marqueur Billboard au-dessus de la tête, visible à travers les murs.
- Camos animés : tag `"AnimatedCamo"` → défilement de teinte.
- `HitConfirm` → chiffres de dégâts 3D (si Settings.DamageNumbers). `Killcam` → caméra sur le tueur.
- `RewardFx` Radar → `Highlight` rouge sur tous les autres personnages pendant `duration`. Orbital → colonne d'avertissement + cercle au sol pendant `duration`, puis rayon géant, onde de choc, particules, `CameraShake` selon distance.
