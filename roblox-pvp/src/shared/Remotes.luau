-- Crée (serveur) ou récupère (client) tous les remotes. Voir ARCHITECTURE.md pour les payloads.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local EVENTS = {
	-- client -> serveur
	"Deploy", -- () : quitter le menu et apparaître
	"Fire", -- (origin: Vector3, pellets: { {Direction, Hit, Position, Normal} })
	"Reload", -- ()
	"UseReward", -- (rewardId: string, target: Vector3?)
	-- serveur -> client(s)
	"ShotFx", -- (shooter: Player, weaponId: string, origin: Vector3, impacts: { {Position, Normal, Character} })
	"HitConfirm", -- (position: Vector3, damage: number, headshot: boolean, killed: boolean)
	"DamageTaken", -- (fromPosition: Vector3, damage: number)
	"KillFeed", -- (killerName: string?, victimName: string, weaponId: string?, headshot: boolean)
	"Score", -- (label: string, xp: number)
	"Medal", -- (title: string, subtitle: string?)
	"Announce", -- (text: string, color: Color3?)
	"Toast", -- (text: string)
	"Killcam", -- (killer: Player?, weaponId: string?, killerHealth: number?, respawnTime: number)
	"RewardsChanged", -- (available: { [rewardId]: true }, streak: number)
	"RewardFx", -- (rewardId: string, owner: Player, position: Vector3?, duration: number)
	"DataChanged", -- (snapshot)
}

local UNRELIABLE_EVENTS = {
	"AimPitch", -- client -> serveur (pitch: number, radians)
}

local FUNCTIONS = {
	"GetData", -- () -> snapshot?
	"BuyWeapon", -- (weaponId) -> (ok, message)
	"SetLoadout", -- (weaponId) -> (ok, message)
	"EquipCamo", -- (weaponId, camoId) -> (ok, message)
	"ClaimDaily", -- () -> (ok, rewardOrRemainingSeconds, streak?)
	"SaveSettings", -- (settings) -> ok
}

local Remotes = {}

local function setup(folder: Instance, names: { string }, className: string)
	for _, name in names do
		local remote
		if RunService:IsServer() then
			remote = folder:FindFirstChild(name) or Instance.new(className)
			remote.Name = name
			remote.Parent = folder
		else
			remote = folder:WaitForChild(name)
		end
		Remotes[name] = remote
	end
end

local folder
if RunService:IsServer() then
	folder = ReplicatedStorage:FindFirstChild("Remotes")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "Remotes"
		folder.Parent = ReplicatedStorage
	end
else
	folder = ReplicatedStorage:WaitForChild("Remotes")
end

setup(folder, EVENTS, "RemoteEvent")
setup(folder, UNRELIABLE_EVENTS, "UnreliableRemoteEvent")
setup(folder, FUNCTIONS, "RemoteFunction")

return Remotes
