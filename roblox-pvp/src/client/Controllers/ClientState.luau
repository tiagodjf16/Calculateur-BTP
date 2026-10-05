-- État partagé entre les contrôleurs client + petit bus d'événements.
-- Lire :  ClientState.Mode, ClientState.Data...
-- Écrire : ClientState.Set("Mode", "Playing")  -> émet "Changed:Mode" (nouvelle valeur, ancienne valeur)
-- Écouter : ClientState.On("Changed:Mode", function(value, old) end)
-- Événements libres : ClientState.Emit("Shot", weapon) / ClientState.On("Shot", fn)
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared").Config)

local ClientState = {
	Mode = "Menu", -- "Menu" (avant de jouer) | "Playing" (en vie) | "Dead" (killcam)
	UiOpen = false, -- un panneau (Arsenal, Paramètres) est ouvert par-dessus le jeu
	Data = nil, -- dernier snapshot reçu du serveur (voir ARCHITECTURE.md)
	Settings = table.clone(Config.DefaultSettings),
	Weapon = nil, -- définition (Weapons.ById[...]) de l'arme en main, ou nil
	Tool = nil, -- Tool en main
	Ammo = 0,
	Reloading = false,
	Ads = false,
	Sprinting = false,
	Spread = 0, -- dispersion actuelle en degrés (pour le réticule)
	Rewards = {}, -- { [rewardId] = true } récompenses de série disponibles
	Streak = 0,
	Targeting = nil, -- rewardId en cours de ciblage (ex. "Orbital"), sinon nil
}

local listeners: { [string]: { (...any) -> () } } = {}

function ClientState.On(name: string, callback: (...any) -> ())
	local list = listeners[name]
	if not list then
		list = {}
		listeners[name] = list
	end
	table.insert(list, callback)
	return {
		Disconnect = function()
			local index = table.find(list, callback)
			if index then
				table.remove(list, index)
			end
		end,
	}
end

function ClientState.Emit(name: string, ...)
	local list = listeners[name]
	if not list then
		return
	end
	for _, callback in table.clone(list) do
		task.spawn(callback, ...)
	end
end

function ClientState.Set(key: string, value: any)
	local old = ClientState[key]
	if old == value and type(value) ~= "table" then
		return
	end
	ClientState[key] = value
	ClientState.Emit("Changed:" .. key, value, old)
end

return ClientState
