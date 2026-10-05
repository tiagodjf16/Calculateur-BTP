-- Boutique d'armes + récompense quotidienne (tout est vérifié côté serveur).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Remotes = require(Shared.Remotes)
local Weapons = require(Shared.Weapons)
local DataService = require(script.Parent.DataService)
local CombatService = require(script.Parent.CombatService)

local ShopService = {}

local function buy(player: Player, weaponId: any)
	local weapon = type(weaponId) == "string" and Weapons.ById[weaponId]
	if not weapon then
		return false, "Arme inconnue"
	end
	local data = DataService.Get(player)
	if not data then
		return false, "Données pas encore chargées"
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
		d.Equipped = weapon.Id
	end)
	CombatService.GiveWeapon(player)
	return true, weapon.Name .. " achetée !"
end

local function equip(player: Player, weaponId: any)
	local weapon = type(weaponId) == "string" and Weapons.ById[weaponId]
	local data = DataService.Get(player)
	if not weapon or not data or not data.Owned[weapon.Id] then
		return false, "Impossible d'équiper cette arme"
	end
	DataService.Update(player, function(d)
		d.Equipped = weapon.Id
	end)
	CombatService.GiveWeapon(player)
	return true, weapon.Name .. " équipée"
end

local function claimDaily(player: Player)
	local data = DataService.Get(player)
	if not data then
		return false, 0
	end
	local now = os.time()
	local elapsed = now - data.LastDaily
	if elapsed < Config.DailyRewardCooldown then
		return false, Config.DailyRewardCooldown - elapsed
	end

	local streak = if elapsed > Config.DailyStreakReset then 0 else data.DailyStreak
	local reward = Config.DailyRewards[(streak % #Config.DailyRewards) + 1]
	if player:GetAttribute("VIP") then
		reward *= Config.VipCoinMultiplier
	end

	DataService.Update(player, function(d)
		d.LastDaily = now
		d.DailyStreak = streak + 1
		d.Coins += reward
	end)
	return true, reward, streak + 1
end

function ShopService.Init()
	Remotes.BuyWeapon.OnServerInvoke = buy
	Remotes.EquipWeapon.OnServerInvoke = equip
	Remotes.ClaimDaily.OnServerInvoke = claimDaily
end

return ShopService
