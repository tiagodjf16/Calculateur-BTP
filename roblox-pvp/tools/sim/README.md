# Simulateur headless

Exécute les vrais scripts du jeu hors de Roblox avec [Lune](https://github.com/lune-org/lune) : serveur et plusieurs clients dans le même DataModel. Le simulateur ajoute les événements, les remotes, les personnages R15, les raycasts et les entrées clavier/souris, et détecte les erreurs d'exécution (propriétés invalides, nil, attentes infinies…).

```sh
rojo build -o build.rbxlx
lune run tools/sim/scenario.luau build.rbxlx        # scénario : 2 joueurs, déploiement, combat, kill, réapparition, boutique
lune run tools/sim/bake.luau build.rbxlx out.rbxlx  # ajoute l'aperçu visible dans l'éditeur (map + panneau Play)
```

Il ne simule pas la physique ni le rendu : un test réussi dans le simulateur ne remplace pas un test dans Studio.
