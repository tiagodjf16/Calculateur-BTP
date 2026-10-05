-- Crée (serveur) ou récupère (client) tous les RemoteEvents / RemoteFunctions.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local EVENTS = {
	"Swing", -- client -> serveur : coup d'épée
	"HitConfirm", -- serveur -> attaquant : position, dégâts, critique
	"Knockback", -- serveur -> victime : direction du recul
	"KillFeed", -- serveur -> tous
	"Announce", -- serveur -> client(s) : gros message central
	"Toast", -- serveur -> client : petit message (+pièces…)
	"DataChanged", -- serveur -> client : snapshot des données
}

local FUNCTIONS = {
	"GetData",
	"BuyWeapon",
	"EquipWeapon",
	"ClaimDaily",
}

local Remotes = {}

if RunService:IsServer() then
	local folder = ReplicatedStorage:FindFirstChild("Remotes")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "Remotes"
		folder.Parent = ReplicatedStorage
	end
	for _, name in EVENTS do
		local remote = folder:FindFirstChild(name) or Instance.new("RemoteEvent")
		remote.Name = name
		remote.Parent = folder
		Remotes[name] = remote
	end
	for _, name in FUNCTIONS do
		local remote = folder:FindFirstChild(name) or Instance.new("RemoteFunction")
		remote.Name = name
		remote.Parent = folder
		Remotes[name] = remote
	end
else
	local folder = ReplicatedStorage:WaitForChild("Remotes")
	for _, name in EVENTS do
		Remotes[name] = folder:WaitForChild(name)
	end
	for _, name in FUNCTIONS do
		Remotes[name] = folder:WaitForChild(name)
	end
end

return Remotes
