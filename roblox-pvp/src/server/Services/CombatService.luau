-- Dégâts, morts, crédit des kills, assistances, score/XP/pièces, médailles, séries, primes,
-- récompenses de série (Radar, Frappe orbitale), régénération, killcam, kill feed et badges.
local BadgeService = game:GetService("BadgeService")
local Debris = game:GetService("Debris")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Remotes = require(Shared.Remotes)
local Weapons = require(Shared.Weapons)
local Camos = require(Shared.Camos)
local Ballistics = require(Shared.Ballistics)
local DataService = require(script.Parent.DataService)
local SpawnService = require(script.Parent.SpawnService)

local CombatService = {}

local ORBITAL_ID = "Orbital"
local RADAR_ID = "Radar"
local REGEN_TICK = 0.1
local MAX_DAMAGE = 10000
local MAX_COORD = 1e5
local USE_REWARD_COOLDOWN = 0.5
local STREAK_ENDED_MIN = 3 -- série minimale de la victime pour « SÉRIE STOPPÉE »

local streaks = {} -- [Player] = série actuelle
local rewards = {} -- [Player] = { [rewardId] = true }
local multiKills = {} -- [Player] = { Time: number, Count: number }
local lastKillerOf = {} -- [Player] = Player : dernier joueur à l'avoir tué (vengeance)
local lastRewardUse = {} -- [Player] = os.clock()
local hitLogs = setmetatable({}, { __mode = "k" }) -- [Humanoid] = journal des attaquants
local lastDamage = setmetatable({}, { __mode = "k" }) -- [Humanoid] = os.clock() du dernier dégât
local firstBloodDone = false -- premier kill depuis le démarrage du serveur

local killstreaksById = {}
for _, definition in Config.Killstreaks do
	killstreaksById[definition.Id] = definition
end

-- Nom de multi-kill le plus élevé défini (utilisé au-delà de la liste).
local maxMultiKill = 0
for count in Config.MultiKillNames do
	if count > maxMultiKill then
		maxMultiKill = count
	end
end

--------------------------------------------------------------------------
-- Utilitaires
--------------------------------------------------------------------------
local function isFiniteNumber(value: any): boolean
	return type(value) == "number" and value == value and value > -math.huge and value < math.huge
end

local function isValidVector(value: any): boolean
	return typeof(value) == "Vector3"
		and isFiniteNumber(value.X)
		and isFiniteNumber(value.Y)
		and isFiniteNumber(value.Z)
		and math.abs(value.X) < MAX_COORD
		and math.abs(value.Y) < MAX_COORD
		and math.abs(value.Z) < MAX_COORD
end

local function inGame(player: Player?): boolean
	return player ~= nil and player.Parent == Players
end

local function getFxFolder(): Folder
	local folder = workspace:FindFirstChild("FX")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "FX"
		folder.Parent = workspace
	end
	return folder
end

local function removeForceFields(character: Model)
	local forceField = character:FindFirstChildOfClass("ForceField")
	while forceField do
		forceField:Destroy()
		forceField = character:FindFirstChildOfClass("ForceField")
	end
end

local function awardBadge(player: Player, badgeId: number?)
	if not badgeId or badgeId == 0 then
		return
	end
	task.spawn(function()
		pcall(function()
			if not BadgeService:UserHasBadgeAsync(player.UserId, badgeId) then
				BadgeService:AwardBadge(player.UserId, badgeId)
			end
		end)
	end)
end

local function multiKillName(count: number): string
	return Config.MultiKillNames[count] or Config.MultiKillNames[maxMultiKill] or "MULTI-KILL"
end

local function setStreak(player: Player, value: number)
	streaks[player] = value
	if not inGame(player) then
		return
	end
	player:SetAttribute("Streak", value)
	player:SetAttribute("Bounty", value >= Config.Bounty.MinStreak)
	DataService.SetStat(player, "Série", value)
end

local function sendRewards(player: Player)
	if not inGame(player) then
		return
	end
	Remotes.RewardsChanged:FireClient(player, table.clone(rewards[player] or {}), streaks[player] or 0)
end

local function announceLevel(player: Player, level: number, bonus: number)
	Remotes.Announce:FireClient(player, string.format("⭐ NIVEAU %d !", level), Config.Colors.Gold)
	if bonus > 0 then
		Remotes.Toast:FireClient(player, string.format("+%d 💰  bonus de niveau", bonus))
	end
	if level >= 10 then
		awardBadge(player, Config.Badges.Level10)
	end
end

--------------------------------------------------------------------------
-- Dégâts
--------------------------------------------------------------------------
-- Inflige des dégâts validés. info = { WeaponId, Headshot, Distance, Position (point d'impact), Origin (provenance) }.
-- Retourne (dégâts infligés, tué ?). Ignoré si la cible a un ForceField.
function CombatService.ApplyDamage(attacker: Player?, humanoid: Humanoid, damage: number, info: any?): (number, boolean)
	if typeof(humanoid) ~= "Instance" or not humanoid:IsA("Humanoid") or humanoid.Health <= 0 then
		return 0, false
	end
	if not isFiniteNumber(damage) or damage <= 0 then
		return 0, false
	end
	damage = math.min(damage, MAX_DAMAGE)

	local character = humanoid.Parent
	if not character or not character:IsA("Model") then
		return 0, false
	end
	if attacker and attacker.Character == character then
		return 0, false
	end
	if character:FindFirstChildOfClass("ForceField") then
		return 0, false
	end

	local details = if type(info) == "table" then info else {}
	local weaponId = if type(details.WeaponId) == "string" then details.WeaponId else nil
	local headshot = details.Headshot == true
	local distance = if isFiniteNumber(details.Distance) then details.Distance else 0

	-- On enregistre l'attaquant AVANT les dégâts : Died peut se déclencher tout de suite.
	local now = os.clock()
	if attacker then
		local log = hitLogs[humanoid]
		if not log then
			log = { Contributors = {} }
			hitLogs[humanoid] = log
		end
		log.Attacker = attacker
		log.Time = now
		log.WeaponId = weaponId
		log.Headshot = headshot
		log.Distance = distance
		log.Contributors[attacker] = now
	end
	lastDamage[humanoid] = now

	humanoid:TakeDamage(damage)
	local killed = humanoid.Health <= 0
	local shown = math.floor(damage + 0.5)

	local root = character:FindFirstChild("HumanoidRootPart")
	local head = character:FindFirstChild("Head")
	local hitPosition = if typeof(details.Position) == "Vector3"
		then details.Position
		elseif head and head:IsA("BasePart") then head.Position
		elseif root and root:IsA("BasePart") then root.Position
		else nil

	if attacker and inGame(attacker) and hitPosition then
		Remotes.HitConfirm:FireClient(attacker, hitPosition, shown, headshot, killed)
	end

	local victim = Players:GetPlayerFromCharacter(character)
	if victim then
		local from = if typeof(details.Origin) == "Vector3" then details.Origin else nil
		if not from and attacker then
			local attackerCharacter = attacker.Character
			local attackerRoot = attackerCharacter and attackerCharacter:FindFirstChild("HumanoidRootPart")
			if attackerRoot and attackerRoot:IsA("BasePart") then
				from = attackerRoot.Position
			end
		end
		Remotes.DamageTaken:FireClient(victim, from or hitPosition or Vector3.zero, shown)
	end

	return damage, killed
end

--------------------------------------------------------------------------
-- Récompenses d'un kill
--------------------------------------------------------------------------
local function rewardAssist(helper: Player)
	local event = Config.ScoreEvents.Assist
	if not event or not DataService.Get(helper) then
		return
	end
	local coins = math.floor(event.Coins * DataService.GetCoinMultiplier(helper) + 0.5)
	Remotes.Score:FireClient(helper, event.Label, event.Xp)
	DataService.Update(helper, function(data)
		data.Coins += coins
	end)
	local levels, level, bonus = DataService.AddXp(helper, event.Xp)
	if coins > 0 then
		Remotes.Toast:FireClient(helper, string.format("+%d 💰", coins))
	end
	if levels > 0 then
		announceLevel(helper, level, bonus)
	end
end

local function rewardKiller(killer: Player, victim: Player, victimStreak: number, weaponId: string?, headshot: boolean, distance: number, now: number)
	local newStreak = (streaks[killer] or 0) + 1
	setStreak(killer, newStreak)

	-- Événements de score, dans l'ordre d'affichage.
	local events = {}
	local medals = {}
	local function addEvent(key: string)
		local event = Config.ScoreEvents[key]
		if event then
			table.insert(events, event)
		end
	end
	local function addMedal(title: string, subtitle: string?)
		table.insert(medals, { Title = title, Subtitle = subtitle })
	end

	addEvent("Kill")
	if headshot then
		addEvent("Headshot")
	end

	local firstBlood = false
	if not firstBloodDone then
		firstBloodDone = true
		firstBlood = true
		addEvent("FirstBlood")
		addMedal("PREMIER SANG", "Première élimination de la partie")
	end

	if lastKillerOf[killer] == victim then
		lastKillerOf[killer] = nil
		addEvent("Revenge")
		addMedal("VENGEANCE", victim.DisplayName)
	end

	if weaponId ~= ORBITAL_ID and distance >= Config.LongshotDistance then
		addEvent("Longshot")
		addMedal("LONGUE DISTANCE", string.format("%d studs", math.floor(distance + 0.5)))
	end

	local chain = multiKills[killer]
	if chain and now - chain.Time <= Config.MultiKillWindow then
		chain.Count += 1
		chain.Time = now
	else
		chain = { Time = now, Count = 1 }
		multiKills[killer] = chain
	end
	if chain.Count >= 2 then
		addEvent("MultiKill")
		addMedal(multiKillName(chain.Count), nil)
	end

	local bountyKill = victimStreak >= Config.Bounty.MinStreak
	if bountyKill then
		addEvent("BountyKill")
		addMedal("CIBLE ABATTUE", string.format("%s (série de %d)", victim.DisplayName, victimStreak))
	elseif victimStreak >= STREAK_ENDED_MIN then
		addEvent("StreakEnded")
		addMedal("SÉRIE STOPPÉE", string.format("Série de %d de %s", victimStreak, victim.DisplayName))
	end

	lastKillerOf[victim] = killer

	-- Score + total XP / pièces
	local xp, coins = 0, 0
	for _, event in events do
		Remotes.Score:FireClient(killer, event.Label, event.Xp)
		xp += event.Xp
		coins += event.Coins
	end
	coins += victimStreak * Config.StreakBountyPerKill
	coins = math.floor(coins * DataService.GetCoinMultiplier(killer) + 0.5)

	for _, medal in medals do
		Remotes.Medal:FireClient(killer, medal.Title, medal.Subtitle)
	end

	-- Données : kills, pièces, série record, stats d'arme
	local totalKills = 0
	local unlockedCamo = nil
	DataService.Update(killer, function(data)
		data.Kills += 1
		data.Coins += coins
		data.BestStreak = math.max(data.BestStreak, newStreak)
		if headshot then
			data.Headshots += 1
		end
		if weaponId and weaponId ~= ORBITAL_ID and Weapons.ById[weaponId] then
			local kills = (data.WeaponKills[weaponId] or 0) + 1
			data.WeaponKills[weaponId] = kills
			for _, camo in Camos.List do
				if camo.Kills > 0 and camo.Kills == kills then
					unlockedCamo = camo
				end
			end
		end
		totalKills = data.Kills
	end)
	local levels, level, bonus = DataService.AddXp(killer, xp)

	if coins > 0 then
		Remotes.Toast:FireClient(killer, string.format("+%d 💰", coins))
	end
	if unlockedCamo and weaponId then
		local weapon = Weapons.ById[weaponId]
		Remotes.Medal:FireClient(killer, "CAMO DÉBLOQUÉ", string.format("%s • %s", unlockedCamo.Name, weapon.Name))
	end
	if levels > 0 then
		announceLevel(killer, level, bonus)
	end

	-- Soin au kill
	local killerHumanoid = SpawnService.GetAliveHumanoid(killer)
	if killerHumanoid then
		killerHumanoid.Health = math.min(killerHumanoid.MaxHealth, killerHumanoid.Health + Config.HealOnKill)
	end

	-- Annonces globales
	if firstBlood then
		Remotes.Announce:FireAllClients(string.format("🩸 %s signe le PREMIER SANG !", killer.DisplayName), Config.Colors.Bad)
	end
	if bountyKill then
		Remotes.Announce:FireAllClients(
			string.format("🎯 %s a abattu la cible %s !", killer.DisplayName, victim.DisplayName),
			Config.Colors.Gold
		)
	end
	local message = Config.StreakMessages[newStreak]
	if message then
		Remotes.Announce:FireAllClients(string.format(message, killer.DisplayName), Config.Colors.Accent2)
	end

	-- Récompenses de série (gagnées en atteignant exactement le nombre de kills requis)
	for _, definition in Config.Killstreaks do
		if newStreak == definition.Kills then
			local available = rewards[killer]
			if not available then
				available = {}
				rewards[killer] = available
			end
			available[definition.Id] = true
			Remotes.Medal:FireClient(killer, definition.Name .. " PRÊT", definition.Description)
		end
	end
	sendRewards(killer)

	-- Badges
	if totalKills == 1 then
		awardBadge(killer, Config.Badges.FirstKill)
	end
	if newStreak >= 10 then
		awardBadge(killer, Config.Badges.Streak10)
	end
end

--------------------------------------------------------------------------
-- Mort
--------------------------------------------------------------------------
local function processDeath(victim: Player, humanoid: Humanoid)
	local log = hitLogs[humanoid]
	hitLogs[humanoid] = nil
	lastDamage[humanoid] = nil
	if not inGame(victim) then
		-- personnage détruit parce que le joueur quitte : pas une vraie mort
		return
	end
	local now = os.clock()

	local victimStreak = streaks[victim] or 0
	setStreak(victim, 0)
	multiKills[victim] = nil
	sendRewards(victim)
	DataService.Update(victim, function(data)
		data.Deaths += 1
	end)

	local killer = log and log.Attacker
	if killer and (killer == victim or not inGame(killer) or now - log.Time > Config.KillCreditWindow) then
		killer = nil
	end
	local weaponId = if killer and log then log.WeaponId else nil
	local headshot = killer ~= nil and log ~= nil and log.Headshot == true
	local distance = if killer and log then log.Distance or 0 else 0

	Remotes.KillFeed:FireAllClients(if killer then killer.DisplayName else nil, victim.DisplayName, weaponId, headshot)

	-- Killcam : santé du tueur au moment du kill (avant le soin)
	local killerHealth = nil
	if killer then
		local killerHumanoid = SpawnService.GetAliveHumanoid(killer)
		killerHealth = if killerHumanoid then math.ceil(killerHumanoid.Health) else 0
	end
	if inGame(victim) then
		Remotes.Killcam:FireClient(victim, killer, weaponId, killerHealth, Config.RespawnTime)
	end

	if killer then
		rewardKiller(killer, victim, victimStreak, weaponId, headshot, distance, now)
	end

	-- Assistances
	if log then
		for helper, hitTime in log.Contributors do
			if helper ~= killer and helper ~= victim and inGame(helper) and now - hitTime <= Config.AssistWindow then
				rewardAssist(helper)
			end
		end
	end
end

--------------------------------------------------------------------------
-- Récompenses de série
--------------------------------------------------------------------------
local function strikeOrbital(owner: Player, definition, target: Vector3)
	local credit = if inGame(owner) then owner else nil

	local explosion = Instance.new("Explosion")
	explosion.Position = target
	explosion.BlastRadius = definition.Radius
	explosion.BlastPressure = 0
	explosion.DestroyJointRadiusPercent = 0
	explosion.ExplosionType = Enum.ExplosionType.NoCraters
	explosion.Parent = getFxFolder()
	Debris:AddItem(explosion, 3)

	local params = OverlapParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = Ballistics.GetIgnoreList()

	local ownerCharacter = owner.Character
	local hit = {}
	for _, part in workspace:GetPartBoundsInRadius(target, definition.Radius, params) do
		local humanoid, model = Ballistics.GetHumanoid(part)
		if humanoid and model and not hit[humanoid] and model ~= ownerCharacter and humanoid.Health > 0 then
			hit[humanoid] = true
			local root = model:FindFirstChild("HumanoidRootPart")
			local position = if root and root:IsA("BasePart") then root.Position else part.Position
			CombatService.ApplyDamage(credit, humanoid, definition.Damage, {
				WeaponId = ORBITAL_ID,
				Headshot = false,
				Distance = 0,
				Position = position + Vector3.new(0, 2, 0),
				Origin = target,
			})
		end
	end
end

local function onUseReward(player: Player, rewardId: any, target: any)
	if type(rewardId) ~= "string" then
		return
	end
	local definition = killstreaksById[rewardId]
	local available = rewards[player]
	if not definition or not available or not available[rewardId] then
		return
	end
	local now = os.clock()
	if now - (lastRewardUse[player] or -math.huge) < USE_REWARD_COOLDOWN then
		return
	end
	local humanoid, character = SpawnService.GetAliveHumanoid(player)
	if not humanoid or not character then
		return
	end

	if rewardId == RADAR_ID then
		available[rewardId] = nil
		lastRewardUse[player] = now
		removeForceFields(character)
		Remotes.RewardFx:FireClient(player, RADAR_ID, player, nil, definition.Duration)
		sendRewards(player)
	elseif rewardId == ORBITAL_ID then
		if not isValidVector(target) then
			return
		end
		local root = character:FindFirstChild("HumanoidRootPart")
		if not root or not root:IsA("BasePart") then
			return
		end
		if (target - root.Position).Magnitude > definition.MaxDistance then
			return
		end
		available[rewardId] = nil
		lastRewardUse[player] = now
		removeForceFields(character)
		sendRewards(player)

		Remotes.RewardFx:FireAllClients(ORBITAL_ID, player, target, definition.Delay)
		Remotes.Announce:FireAllClients(
			string.format("☄️ %s a déclenché une FRAPPE ORBITALE !", player.DisplayName),
			Config.Colors.Bad
		)
		awardBadge(player, Config.Badges.Orbital)

		-- Si le propriétaire quitte pendant le délai, la frappe tombe quand même (sans crédit).
		task.delay(definition.Delay, strikeOrbital, player, definition, target)
	end
end

-- Récompenses de série disponibles d'un joueur (copie).
function CombatService.GetRewards(player: Player): { [string]: boolean }
	return table.clone(rewards[player] or {})
end

function CombatService.GetStreak(player: Player): number
	return streaks[player] or 0
end

--------------------------------------------------------------------------
-- Régénération
--------------------------------------------------------------------------
local function regenLoop()
	while true do
		local dt = task.wait(REGEN_TICK)
		local now = os.clock()
		for _, player in Players:GetPlayers() do
			local character = player.Character
			local humanoid = character and character:FindFirstChildOfClass("Humanoid")
			if humanoid and humanoid.Health > 0 and humanoid.Health < humanoid.MaxHealth then
				local last = lastDamage[humanoid]
				if not last or now - last >= Config.RegenDelay then
					humanoid.Health = math.min(humanoid.MaxHealth, humanoid.Health + Config.RegenPerSecond * dt)
				end
			end
		end
	end
end

--------------------------------------------------------------------------
-- Initialisation
--------------------------------------------------------------------------
local function onPlayerAdded(player: Player)
	rewards[player] = rewards[player] or {}
	setStreak(player, streaks[player] or 0)
	player:SetAttribute("Bounty", false)
end

function CombatService.Init()
	getFxFolder()

	SpawnService.OnSpawned(function(player, _character, humanoid)
		lastDamage[humanoid] = nil
		hitLogs[humanoid] = nil
		humanoid.Died:Once(function()
			processDeath(player, humanoid)
		end)
	end)

	Remotes.UseReward.OnServerEvent:Connect(onUseReward)

	Players.PlayerAdded:Connect(onPlayerAdded)
	for _, player in Players:GetPlayers() do
		task.spawn(onPlayerAdded, player)
	end

	Players.PlayerRemoving:Connect(function(player)
		streaks[player] = nil
		rewards[player] = nil -- les récompenses non utilisées sont perdues en quittant
		multiKills[player] = nil
		lastRewardUse[player] = nil
		lastKillerOf[player] = nil
		for other, killer in lastKillerOf do
			if killer == player then
				lastKillerOf[other] = nil
			end
		end
	end)

	task.spawn(regenLoop)
end

return CombatService
