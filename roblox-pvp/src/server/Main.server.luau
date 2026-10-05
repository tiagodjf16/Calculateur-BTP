-- Point d'entrée serveur : génère la map puis démarre les services dans l'ordre.
local Players = game:GetService("Players")

-- On contrôle nous-mêmes l'apparition : le joueur apparaît après « JOUER » dans le menu (remote Deploy).
Players.CharacterAutoLoads = false

local Services = script.Parent:WaitForChild("Services")
local MapService = require(Services.MapService)
local DataService = require(Services.DataService)
local SpawnService = require(Services.SpawnService)
local WeaponService = require(Services.WeaponService)
local CombatService = require(Services.CombatService)
local ShopService = require(Services.ShopService)
local LeaderboardService = require(Services.LeaderboardService)

local ok, err = pcall(MapService.Build)
if not ok then
	warn("[Main] Génération de la map échouée : " .. tostring(err))
end

DataService.Init()
SpawnService.Init()
WeaponService.Init()
CombatService.Init()
ShopService.Init()
LeaderboardService.Init()
