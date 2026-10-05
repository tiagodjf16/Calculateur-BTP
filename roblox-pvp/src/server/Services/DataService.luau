-- Chargement / sauvegarde des données joueurs + leaderstats + VIP.
local DataStoreService = game:GetService("DataStoreService")
local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Remotes = require(Shared.Remotes)

local DataService = {}

local profiles = {} -- [Player] = data
local noSave = {} -- [Player] = true quand le chargement a échoué en Studio

local function getStore(name: string, ordered: boolean)
	local ok, store = pcall(function()
		if ordered then
			return DataStoreService:GetOrderedDataStore(name)
		end
		return DataStoreService:GetDataStore(name)
	end)
	if not ok then
		warn("[DataService] DataStore indisponible (" .. name .. ") : " .. tostring(store))
		return nil
	end
	return store
end

local store = getStore(Config.DataStoreName, false)
local killsStore = getStore(Config.LeaderboardStoreName, true)

local function defaultData()
	return {
		Coins = Config.StartingCoins,
		Kills = 0,
		Deaths = 0,
		Xp = 0,
		Level = 1,
		BestStreak = 0,
		Owned = { Wooden = true },
		Equipped = "Wooden",
		LastDaily = 0,
		DailyStreak = 0,
	}
end

local function reconcile(data)
	for key, value in defaultData() do
		if data[key] == nil then
			data[key] = value
		end
	end
	return data
end

local function withRetries(callback)
	local lastError
	for attempt = 1, 3 do
		local ok, result = pcall(callback)
		if ok then
			return true, result
		end
		lastError = result
		task.wait(attempt * 2)
	end
	return false, lastError
end

local function keyFor(player: Player): string
	return "Player_" .. player.UserId
end

local function buildLeaderstats(player: Player, data)
	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"

	local kills = Instance.new("IntValue")
	kills.Name = "Kills"
	kills.Value = data.Kills
	kills.Parent = leaderstats

	local streak = Instance.new("IntValue")
	streak.Name = "Série"
	streak.Value = 0
	streak.Parent = leaderstats

	local level = Instance.new("IntValue")
	level.Name = "Niveau"
	level.Value = data.Level
	level.Parent = leaderstats

	leaderstats.Parent = player
end

local function refreshVip(player: Player)
	if Config.VipGamepassId == 0 then
		player:SetAttribute("VIP", false)
		return
	end
	local ok, owns = pcall(function()
		return MarketplaceService:UserOwnsGamePassAsync(player.UserId, Config.VipGamepassId)
	end)
	player:SetAttribute("VIP", ok and owns == true)
end

function DataService.Get(player: Player)
	return profiles[player]
end

function DataService.SetStat(player: Player, name: string, value: number)
	local leaderstats = player:FindFirstChild("leaderstats")
	local stat = leaderstats and leaderstats:FindFirstChild(name)
	if stat then
		stat.Value = value
	end
end

function DataService.Snapshot(player: Player)
	local data = profiles[player]
	if not data then
		return nil
	end
	local elapsed = os.time() - data.LastDaily
	return {
		Coins = data.Coins,
		Kills = data.Kills,
		Deaths = data.Deaths,
		Xp = data.Xp,
		XpNeeded = Config.XpForLevel(data.Level),
		Level = data.Level,
		BestStreak = data.BestStreak,
		Owned = table.clone(data.Owned),
		Equipped = data.Equipped,
		DailyIn = math.max(0, Config.DailyRewardCooldown - elapsed),
		DailyStreak = data.DailyStreak,
		Vip = player:GetAttribute("VIP") == true,
	}
end

function DataService.Sync(player: Player)
	local data = profiles[player]
	if not data then
		return
	end
	DataService.SetStat(player, "Kills", data.Kills)
	DataService.SetStat(player, "Niveau", data.Level)
	Remotes.DataChanged:FireClient(player, DataService.Snapshot(player))
end

-- Modifie les données via une fonction puis synchronise le client.
function DataService.Update(player: Player, mutator: (any) -> ()): boolean
	local data = profiles[player]
	if not data then
		return false
	end
	mutator(data)
	DataService.Sync(player)
	return true
end

-- Ajoute de l'XP et gère les montées de niveau. Retourne le nombre de niveaux gagnés.
function DataService.AddXp(player: Player, amount: number): number
	local gained = 0
	DataService.Update(player, function(data)
		data.Xp += amount
		while data.Xp >= Config.XpForLevel(data.Level) do
			data.Xp -= Config.XpForLevel(data.Level)
			data.Level += 1
			data.Coins += Config.LevelUpCoins * data.Level
			gained += 1
		end
	end)
	return gained
end

function DataService.Load(player: Player)
	local raw
	if store then
		local ok, result = withRetries(function()
			return store:GetAsync(keyFor(player))
		end)
		if not ok then
			if RunService:IsStudio() then
				warn("[DataService] Chargement impossible en Studio (active l'accès API). Données temporaires utilisées.")
				noSave[player] = true
			else
				player:Kick("Impossible de charger tes données. Réessaie dans un instant !")
				return nil
			end
		else
			raw = result
		end
	end

	if not player:IsDescendantOf(Players) then
		return nil
	end

	local data = reconcile(if type(raw) == "table" then raw else defaultData())
	refreshVip(player)
	profiles[player] = data
	buildLeaderstats(player, data)
	DataService.Sync(player)
	return data
end

function DataService.Save(player: Player)
	local data = profiles[player]
	if not data or not store or noSave[player] then
		return
	end
	local ok, err = withRetries(function()
		store:UpdateAsync(keyFor(player), function()
			return data
		end)
	end)
	if not ok then
		warn("[DataService] Sauvegarde échouée pour " .. player.Name .. " : " .. tostring(err))
	end
	if killsStore then
		pcall(function()
			killsStore:SetAsync(tostring(player.UserId), data.Kills)
		end)
	end
end

function DataService.Init()
	Remotes.GetData.OnServerInvoke = function(player)
		return DataService.Snapshot(player)
	end

	MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, gamePassId, purchased)
		if purchased and gamePassId == Config.VipGamepassId then
			player:SetAttribute("VIP", true)
			DataService.Sync(player)
		end
	end)

	Players.PlayerRemoving:Connect(function(player)
		DataService.Save(player)
		profiles[player] = nil
		noSave[player] = nil
	end)

	task.spawn(function()
		while true do
			task.wait(Config.AutosaveInterval)
			for _, player in Players:GetPlayers() do
				task.spawn(DataService.Save, player)
			end
		end
	end)

	game:BindToClose(function()
		local pending = 0
		for _, player in Players:GetPlayers() do
			pending += 1
			task.spawn(function()
				DataService.Save(player)
				pending -= 1
			end)
		end
		local started = os.clock()
		while pending > 0 and os.clock() - started < 25 do
			task.wait(0.1)
		end
	end)
end

return DataService
