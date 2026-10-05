-- Point d'entrée serveur.
local Players = game:GetService("Players")

local Services = script.Parent:WaitForChild("Services")
local MapService = require(Services.MapService)
local DataService = require(Services.DataService)
local CombatService = require(Services.CombatService)
local ShopService = require(Services.ShopService)
local LeaderboardService = require(Services.LeaderboardService)

-- On contrôle nous-mêmes le spawn : l'arme est donnée une fois les données chargées.
Players.CharacterAutoLoads = false

MapService.Build()
DataService.Init()
CombatService.Init()
ShopService.Init()
LeaderboardService.Init()

local function onPlayerAdded(player: Player)
	local data = DataService.Load(player)
	if data then
		CombatService.SetupPlayer(player)
	end
end

Players.PlayerAdded:Connect(onPlayerAdded)
for _, player in Players:GetPlayers() do
	task.spawn(onPlayerAdded, player)
end
