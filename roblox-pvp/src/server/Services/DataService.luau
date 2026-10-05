-- Chargement / sauvegarde des données joueurs + leaderstats + VIP.
-- Toutes les données reçues (DataStore ou client) sont nettoyées avant usage.
local DataStoreService = game:GetService("DataStoreService")
local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Remotes = require(Shared.Remotes)
local Weapons = require(Shared.Weapons)
local Camos = require(Shared.Camos)

local DataService = {}

local STARTING_COINS = 0
local SAVE_WAIT_LIMIT = 30 -- secondes max d'attente d'une sauvegarde déjà en cours
local SHUTDOWN_WAIT_LIMIT = 25

-- Bornes des paramètres numériques (voir Config.DefaultSettings).
local SETTING_RANGES = {
	Sensitivity = { 0.2, 3 },
	AdsSensitivity = { 0.2, 1.5 },
	Fov = { 60, 100 },
}

local COUNTER_KEYS = { "Coins", "Kills", "Deaths", "Headshots", "Xp", "BestStreak", "LastDaily", "DailyStreak" }
local SLOTS = { "Primary", "Secondary" }

local profiles = {} -- [Player] = données
local noSave = {} -- [Player] = true : progression temporaire (Studio sans accès API)
local loading = {} -- [Player] = true pendant le chargement
local syncQueued = {} -- [Player] = true : synchro différée en attente
local saving = {} -- [userId] = true pendant une écriture
local savedKills = {} -- [userId] = dernier total de kills écrit dans le classement
local pendingSaves = 0
local loadedCallbacks = {}

--------------------------------------------------------------------------
-- Utilitaires
--------------------------------------------------------------------------
local function isFiniteNumber(value: any): boolean
	return type(value) == "number" and value == value and value > -math.huge and value < math.huge
end

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

-- En Studio on n'insiste pas : une place non publiée n'a jamais accès aux DataStores.
local MAX_ATTEMPTS = if RunService:IsStudio() then 1 else 3

local function withRetries(callback)
	local lastError
	for attempt = 1, MAX_ATTEMPTS do
		local ok, result = pcall(callback)
		if ok then
			return true, result
		end
		lastError = result
		if attempt < MAX_ATTEMPTS then
			task.wait(attempt * 2)
		end
	end
	return false, lastError
end

local function keyFor(userId: number): string
	return "Player_" .. userId
end

--------------------------------------------------------------------------
-- Données par défaut + nettoyage
--------------------------------------------------------------------------
local function defaultData()
	return {
		Coins = STARTING_COINS,
		Kills = 0,
		Deaths = 0,
		Headshots = 0,
		Xp = 0,
		Level = 1,
		BestStreak = 0,
		Owned = { [Weapons.DefaultPrimary] = true, [Weapons.DefaultSecondary] = true },
		Loadout = { Primary = Weapons.DefaultPrimary, Secondary = Weapons.DefaultSecondary },
		WeaponKills = {},
		Camos = {},
		LastDaily = 0,
		DailyStreak = 0,
		Settings = table.clone(Config.DefaultSettings),
	}
end

-- Nettoie une table de paramètres (venant du client ou du DataStore) :
-- seules les clés de Config.DefaultSettings sont gardées, avec le bon type et bornées.
function DataService.SanitizeSettings(raw: any)
	local source = if type(raw) == "table" then raw else {}
	local clean = {}
	for key, default in Config.DefaultSettings do
		local value = source[key]
		if type(default) == "number" then
			if isFiniteNumber(value) then
				local range = SETTING_RANGES[key]
				if range then
					value = math.clamp(value, range[1], range[2])
				else
					value = math.clamp(value, -1e6, 1e6)
				end
				clean[key] = math.floor(value * 1000 + 0.5) / 1000
			else
				clean[key] = default
			end
		elseif type(value) == type(default) then
			if type(value) == "string" then
				clean[key] = string.sub(value, 1, 64)
			else
				clean[key] = value
			end
		else
			clean[key] = default
		end
	end
	return clean
end

local function sanitizeData(raw: any)
	local data = defaultData()
	if type(raw) ~= "table" then
		return data
	end

	for _, key in COUNTER_KEYS do
		local value = raw[key]
		if isFiniteNumber(value) then
			data[key] = math.max(0, math.floor(value))
		end
	end
	if isFiniteNumber(raw.Level) then
		data.Level = math.max(1, math.floor(raw.Level))
	end

	if type(raw.Owned) == "table" then
		for weaponId, owned in raw.Owned do
			if owned == true and type(weaponId) == "string" and Weapons.ById[weaponId] then
				data.Owned[weaponId] = true
			end
		end
	end

	if type(raw.WeaponKills) == "table" then
		for weaponId, kills in raw.WeaponKills do
			if type(weaponId) == "string" and Weapons.ById[weaponId] and isFiniteNumber(kills) then
				data.WeaponKills[weaponId] = math.max(0, math.floor(kills))
			end
		end
	end

	if type(raw.Camos) == "table" then
		for weaponId, camoId in raw.Camos do
			if
				type(weaponId) == "string"
				and Weapons.ById[weaponId]
				and type(camoId) == "string"
				and Camos.IsUnlocked(camoId, data.WeaponKills[weaponId] or 0)
			then
				data.Camos[weaponId] = camoId
			end
		end
	end

	if type(raw.Loadout) == "table" then
		for _, slot in SLOTS do
			local weaponId = raw.Loadout[slot]
			local weapon = if type(weaponId) == "string" then Weapons.ById[weaponId] else nil
			if weapon and weapon.Slot == slot and data.Owned[weaponId] then
				data.Loadout[slot] = weaponId
			end
		end
	end

	data.Settings = DataService.SanitizeSettings(raw.Settings)
	return data
end

-- Temps restant avant la récompense quotidienne + série effective (remise à 0 si trop attendu).
function DataService.GetDailyState(data): (number, number)
	if data.LastDaily <= 0 then
		return 0, 0
	end
	local elapsed = os.time() - data.LastDaily
	local remaining = math.max(0, Config.DailyRewardCooldown - elapsed)
	local streak = if elapsed > Config.DailyStreakReset then 0 else data.DailyStreak
	return remaining, streak
end

--------------------------------------------------------------------------
-- Leaderstats / VIP
--------------------------------------------------------------------------
local function buildLeaderstats(player: Player, data)
	local old = player:FindFirstChild("leaderstats")
	if old then
		old:Destroy()
	end

	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"

	local kills = Instance.new("IntValue")
	kills.Name = "Kills"
	kills.Value = data.Kills
	kills.Parent = leaderstats

	local streak = Instance.new("IntValue")
	streak.Name = "Série"
	streak.Value = player:GetAttribute("Streak") or 0
	streak.Parent = leaderstats

	local level = Instance.new("IntValue")
	level.Name = "Niveau"
	level.Value = data.Level
	level.Parent = leaderstats

	leaderstats.Parent = player
end

local function refreshVip(player: Player)
	local vip = false
	if Config.VipGamepassId ~= 0 then
		local ok, owns = pcall(function()
			return MarketplaceService:UserOwnsGamePassAsync(player.UserId, Config.VipGamepassId)
		end)
		vip = ok and owns == true
	end
	if player.Parent ~= Players then
		return
	end
	if player:GetAttribute("VIP") ~= vip then
		player:SetAttribute("VIP", vip)
		DataService.QueueSync(player)
	end
end

--------------------------------------------------------------------------
-- API publique
--------------------------------------------------------------------------
function DataService.Get(player: Player)
	return profiles[player]
end

function DataService.IsLoaded(player: Player): boolean
	return profiles[player] ~= nil
end

-- callback(player) appelé quand les données d'un joueur sont prêtes.
function DataService.OnLoaded(callback: (Player) -> ())
	table.insert(loadedCallbacks, callback)
end

function DataService.SetStat(player: Player, name: string, value: number)
	local leaderstats = player:FindFirstChild("leaderstats")
	local stat = leaderstats and leaderstats:FindFirstChild(name)
	if stat and stat:IsA("IntValue") then
		stat.Value = value
	end
end

function DataService.GetCoinMultiplier(player: Player): number
	return if player:GetAttribute("VIP") == true then Config.VipCoinMultiplier else 1
end

function DataService.Snapshot(player: Player)
	local data = profiles[player]
	if not data then
		return nil
	end
	local dailyIn, dailyStreak = DataService.GetDailyState(data)
	return {
		Coins = data.Coins,
		Kills = data.Kills,
		Deaths = data.Deaths,
		Headshots = data.Headshots,
		Xp = data.Xp,
		XpNeeded = Config.XpForLevel(data.Level),
		Level = data.Level,
		BestStreak = data.BestStreak,
		Owned = table.clone(data.Owned),
		Loadout = { Primary = data.Loadout.Primary, Secondary = data.Loadout.Secondary },
		WeaponKills = table.clone(data.WeaponKills),
		Camos = table.clone(data.Camos),
		DailyIn = dailyIn,
		DailyStreak = dailyStreak,
		Vip = player:GetAttribute("VIP") == true,
		Settings = table.clone(data.Settings),
	}
end

-- Envoie immédiatement le snapshot au client + met à jour les leaderstats.
function DataService.Sync(player: Player)
	syncQueued[player] = nil
	local data = profiles[player]
	if not data or player.Parent ~= Players then
		return
	end
	DataService.SetStat(player, "Kills", data.Kills)
	DataService.SetStat(player, "Niveau", data.Level)
	Remotes.DataChanged:FireClient(player, DataService.Snapshot(player))
end

-- Regroupe plusieurs modifications de la même frame en un seul DataChanged.
function DataService.QueueSync(player: Player)
	if syncQueued[player] then
		return
	end
	syncQueued[player] = true
	task.defer(function()
		if syncQueued[player] then
			DataService.Sync(player)
		end
	end)
end

-- Modifie les données via une fonction puis synchronise le client (différé, ou immédiat si demandé).
function DataService.Update(player: Player, mutator: (any) -> (), immediate: boolean?): boolean
	local data = profiles[player]
	if not data then
		return false
	end
	mutator(data)
	if immediate then
		DataService.Sync(player)
	else
		DataService.QueueSync(player)
	end
	return true
end

-- Ajoute de l'XP et gère les montées de niveau.
-- Retourne (niveaux gagnés, niveau actuel, pièces de bonus de niveau).
function DataService.AddXp(player: Player, amount: number): (number, number, number)
	local data = profiles[player]
	if not data then
		return 0, 1, 0
	end
	if not isFiniteNumber(amount) or amount <= 0 then
		return 0, data.Level, 0
	end
	data.Xp += math.floor(amount)
	local gained, bonus = 0, 0
	while data.Xp >= Config.XpForLevel(data.Level) and gained < 100 do
		data.Xp -= Config.XpForLevel(data.Level)
		data.Level += 1
		local coins = Config.LevelUpCoins * data.Level
		data.Coins += coins
		bonus += coins
		gained += 1
	end
	DataService.QueueSync(player)
	return gained, data.Level, bonus
end

--------------------------------------------------------------------------
-- Chargement / sauvegarde
--------------------------------------------------------------------------
function DataService.Load(player: Player)
	if profiles[player] then
		return profiles[player]
	end
	if loading[player] then
		return nil
	end
	loading[player] = true

	local raw = nil
	local temporary = false
	if store then
		local ok, result = withRetries(function()
			return store:GetAsync(keyFor(player.UserId))
		end)
		if ok then
			raw = result
		elseif RunService:IsStudio() then
			warn("[DataService] Pas de sauvegarde en Studio (place non publiée ou accès API désactivé) : progression temporaire.")
			temporary = true
		else
			loading[player] = nil
			if player.Parent == Players then
				player:Kick("Impossible de charger tes données. Réessaie dans un instant !")
			end
			return nil
		end
	else
		warn("[DataService] Aucun DataStore : progression temporaire pour " .. player.Name)
		temporary = true
	end

	loading[player] = nil
	if player.Parent ~= Players then
		return nil
	end

	local data = sanitizeData(raw)
	profiles[player] = data
	if temporary then
		noSave[player] = true
	end
	savedKills[player.UserId] = data.Kills

	if player:GetAttribute("VIP") == nil then
		player:SetAttribute("VIP", false)
	end
	buildLeaderstats(player, data)
	player:SetAttribute("Loaded", true)
	DataService.Sync(player)
	task.spawn(refreshVip, player)

	for _, callback in loadedCallbacks do
		task.spawn(callback, player)
	end
	return data
end

-- Écrit les données (sérialisé par joueur : une seule écriture à la fois).
local function writeData(userId: number, name: string, data)
	if not store then
		return
	end
	pendingSaves += 1

	local waited = 0
	while saving[userId] and waited < SAVE_WAIT_LIMIT do
		waited += task.wait(0.25)
	end
	saving[userId] = true

	local ok, err = withRetries(function()
		store:UpdateAsync(keyFor(userId), function()
			return data
		end)
	end)
	if not ok then
		warn("[DataService] Sauvegarde échouée pour " .. name .. " : " .. tostring(err))
	end

	if killsStore and savedKills[userId] ~= data.Kills then
		local okKills = pcall(function()
			killsStore:SetAsync(tostring(userId), data.Kills)
		end)
		if okKills then
			savedKills[userId] = data.Kills
		end
	end

	saving[userId] = nil
	pendingSaves -= 1
end

function DataService.Save(player: Player)
	local data = profiles[player]
	if not data or noSave[player] then
		return
	end
	writeData(player.UserId, player.Name, data)
end

function DataService.Init()
	Remotes.GetData.OnServerInvoke = function(player)
		return DataService.Snapshot(player)
	end

	MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, gamePassId, purchased)
		if purchased and Config.VipGamepassId ~= 0 and gamePassId == Config.VipGamepassId then
			player:SetAttribute("VIP", true)
			DataService.QueueSync(player)
		end
	end)

	local function onPlayerAdded(player: Player)
		player:SetAttribute("Loaded", false)
		DataService.Load(player)
	end
	Players.PlayerAdded:Connect(onPlayerAdded)
	for _, player in Players:GetPlayers() do
		task.spawn(onPlayerAdded, player)
	end

	Players.PlayerRemoving:Connect(function(player)
		local data = profiles[player]
		local skip = noSave[player]
		profiles[player] = nil
		noSave[player] = nil
		loading[player] = nil
		syncQueued[player] = nil
		if data and not skip then
			writeData(player.UserId, player.Name, data)
		end
		savedKills[player.UserId] = nil
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
		for _, player in Players:GetPlayers() do
			task.spawn(DataService.Save, player)
		end
		-- laisse aux sauvegardes (y compris celles des joueurs déjà partis) le temps de finir
		task.wait()
		local started = os.clock()
		while pendingSaves > 0 and os.clock() - started < SHUTDOWN_WAIT_LIMIT do
			task.wait(0.1)
		end
	end)
end

return DataService
