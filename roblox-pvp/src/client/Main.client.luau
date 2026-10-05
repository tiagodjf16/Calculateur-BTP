-- Point d'entrée client.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage:WaitForChild("Shared").Remotes)

local Controllers = script.Parent:WaitForChild("Controllers")
local Hud = require(Controllers.HudController)
local Shop = require(Controllers.ShopController)
local Combat = require(Controllers.CombatController)

Shop.Init(function(message, color)
	Hud.Announce(message, color)
end)
Hud.Init({ OnShop = Shop.Toggle })
Combat.Init(Hud)

local function onData(data)
	Hud.OnData(data)
	Shop.OnData(data)
end

Remotes.DataChanged.OnClientEvent:Connect(onData)
task.spawn(function()
	onData(Remotes.GetData:InvokeServer())
end)
