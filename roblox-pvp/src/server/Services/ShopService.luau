-- Arsenal (achat d'armes, loadout, camouflages), récompense quotidienne et paramètres joueur.
-- Tout est vérifié côté serveur : le client ne fait que demander.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Remotes = require(Shared.Remotes)
local Weapons = require(Shared.Weapons)
local Camos = require(Shared.Camos)
local DataService = require(script.Parent.DataService)
local WeaponService = require(script.Parent.WeaponService)

local ShopService = {}

local THROTTLE = 0.2 -- secondes minimum entre deux demandes du même type
local NOT_LOADED = "Données en cours de chargement…"

local lastCalls = {} -- [Player] = { [nom] = os.clock() }

local function throttled(player: Player, name: string): boolean
	local calls = lastCalls[player]
	if not calls then
		calls = {}
		lastCalls[player] = calls
	end
	local now = os.clock()
	if now - (calls[name] or -math.huge) < THROTTLE then
		return true
	end
	calls[name] = now
	return false
end

local function getWeapon(weaponId: any)
	if type(weaponId) ~= "string" then
		return nil
	end
	return Weapons.ById[weaponId]
end

-- Sauvegarde en arrière-plan après un achat / une récompense (évite de perdre des pièces dépensées).
local function saveSoon(player: Player)
	task.spawn(DataService.Save, player)
end

--------------------------------------------------------------------------
-- Remotes
--------------------------------------------------------------------------
local function buyWeapon(player: Player, weaponId: any): (boolean, string)
	if throttled(player, "Buy") then
		return false, "Doucement !"
	end
	local weapon = getWeapon(weaponId)
	if not weapon then
		return false, "Arme inconnue"
	end
	local data = DataService.Get(player)
	if not data then
		return false, NOT_LOADED
	end
	if data.Owned[weapon.Id] then
		return false, "Tu possèdes déjà cette arme"
	end
	if data.Coins < weapon.Price then
		return false, string.format("Il te manque %d 💰", weapon.Price - data.Coins)
	end

	DataService.Update(player, function(d)
		d.Coins -= weapon.Price
		d.Owned[weapon.Id] = true
		d.Loadout[weapon.Slot] = weapon.Id
	end, true)
	WeaponService.RefreshSlot(player, weapon.Slot)
	saveSoon(player)
	return true, weapon.Name .. " achetée et équipée !"
end

local function setLoadout(player: Player, weaponId: any): (boolean, string)
	if throttled(player, "Loadout") then
		return false, "Doucement !"
	end
	local weapon = getWeapon(weaponId)
	if not weapon then
		return false, "Arme inconnue"
	end
	local data = DataService.Get(player)
	if not data then
		return false, NOT_LOADED
	end
	if not data.Owned[weapon.Id] then
		return false, "Tu ne possèdes pas cette arme"
	end
	if data.Loadout[weapon.Slot] == weapon.Id then
		return true, weapon.Name .. " déjà équipée"
	end

	DataService.Update(player, function(d)
		d.Loadout[weapon.Slot] = weapon.Id
	end, true)
	WeaponService.RefreshSlot(player, weapon.Slot)
	return true, weapon.Name .. " équipée"
end

local function equipCamo(player: Player, weaponId: any, camoId: any): (boolean, string)
	if throttled(player, "Camo") then
		return false, "Doucement !"
	end
	local weapon = getWeapon(weaponId)
	local camo = if type(camoId) == "string" then Camos.ById[camoId] else nil
	if not weapon or not camo then
		return false, "Camouflage inconnu"
	end
	local data = DataService.Get(player)
	if not data then
		return false, NOT_LOADED
	end
	if not data.Owned[weapon.Id] then
		return false, "Achète d'abord cette arme"
	end
	local kills = data.WeaponKills[weapon.Id] or 0
	if kills < camo.Kills then
		return false, string.format("Encore %d éliminations avec %s", camo.Kills - kills, weapon.Name)
	end
	if (data.Camos[weapon.Id] or "Default") == camo.Id then
		return true, "Camouflage déjà équipé"
	end

	DataService.Update(player, function(d)
		d.Camos[weapon.Id] = camo.Id
	end, true)
	WeaponService.ApplyCamo(player, weapon.Id, camo.Id)
	return true, string.format("Camouflage %s équipé sur %s", camo.Name, weapon.Name)
end

-- Retourne (true, récompense, série) ou (false, secondes restantes).
local function claimDaily(player: Player): (boolean, number, number?)
	local data = DataService.Get(player)
	if not data then
		return false, 0
	end
	if throttled(player, "Daily") then
		local remaining = DataService.GetDailyState(data)
		return false, remaining
	end

	local remaining, streak = DataService.GetDailyState(data)
	if remaining > 0 then
		return false, remaining
	end

	local reward = Config.DailyRewards[(streak % #Config.DailyRewards) + 1]
	reward = math.floor(reward * DataService.GetCoinMultiplier(player) + 0.5)
	local newStreak = streak + 1

	DataService.Update(player, function(d)
		d.LastDaily = os.time()
		d.DailyStreak = newStreak
		d.Coins += reward
	end, true)
	saveSoon(player)
	return true, reward, newStreak
end

-- Nettoie et enregistre les paramètres (sauvegardés avec les données). Pas de DataChanged :
-- le client a déjà les valeurs et une synchro pourrait écraser un réglage en cours.
local function saveSettings(player: Player, settings: any): boolean
	if type(settings) ~= "table" then
		return false
	end
	local data = DataService.Get(player)
	if not data then
		return false
	end
	data.Settings = DataService.SanitizeSettings(settings)
	return true
end

function ShopService.Init()
	Remotes.BuyWeapon.OnServerInvoke = buyWeapon
	Remotes.SetLoadout.OnServerInvoke = setLoadout
	Remotes.EquipCamo.OnServerInvoke = equipCamo
	Remotes.ClaimDaily.OnServerInvoke = claimDaily
	Remotes.SaveSettings.OnServerInvoke = saveSettings

	Players.PlayerRemoving:Connect(function(player)
		lastCalls[player] = nil
	end)
end

return ShopService
