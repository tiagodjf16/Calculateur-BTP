-- Combat 100 % validé côté serveur : le client dit seulement « je frappe »,
-- le serveur vérifie le cooldown et calcule lui-même la hitbox.
local BadgeService = game:GetService("BadgeService")
local Debris = game:GetService("Debris")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Remotes = require(Shared.Remotes)
local Weapons = require(Shared.Weapons)
local DataService = require(script.Parent.DataService)

local CombatService = {}

local lastSwing = {} -- [Player] = os.clock()
local streaks = {} -- [Player] = number
local hitLog = setmetatable({}, { __mode = "k" }) -- [Humanoid] = { last, lastTime, weaponName, contributors }

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

local function setStreak(player: Player, value: number)
	streaks[player] = value
	DataService.SetStat(player, "Série", value)
end

local function makeSound(id: string, parent: Instance, volume: number): Sound
	local sound = Instance.new("Sound")
	sound.SoundId = id
	sound.Volume = volume
	sound.RollOffMaxDistance = 80
	sound.Parent = parent
	return sound
end

local function weldTo(base: BasePart, part: BasePart)
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = base
	weld.Part1 = part
	weld.Parent = part
end

local function prepPart(part: BasePart)
	part.CanCollide = false
	part.CanTouch = false
	part.CanQuery = false
	part.Massless = true
	part.CastShadow = false
end

-- Construit l'épée entièrement en code : aucun modèle à importer.
local function buildTool(weapon)
	local tool = Instance.new("Tool")
	tool.Name = weapon.Name
	tool.CanBeDropped = false
	tool.ToolTip = string.format("%d dégâts • %.2fs", weapon.Damage, weapon.Cooldown)
	tool.Grip = CFrame.new()
	tool:SetAttribute("WeaponId", weapon.Id)

	local handle = Instance.new("Part")
	handle.Name = "Handle"
	handle.Size = Vector3.new(0.3, 1, 0.3)
	handle.Color = Color3.fromRGB(40, 32, 28)
	handle.Material = Enum.Material.Fabric
	handle.CFrame = CFrame.new()
	prepPart(handle)
	handle.Parent = tool

	local guard = Instance.new("Part")
	guard.Name = "Guard"
	guard.Size = Vector3.new(0.4, 0.2, 1.3)
	guard.Color = if weapon.Glow then Color3.fromRGB(30, 30, 35) else Color3.fromRGB(90, 80, 60)
	guard.Material = Enum.Material.Metal
	guard.CFrame = CFrame.new(0, 0.6, 0)
	prepPart(guard)
	guard.Parent = tool
	weldTo(handle, guard)

	local blade = Instance.new("Part")
	blade.Name = "Blade"
	blade.Size = Vector3.new(0.15, weapon.Length, 0.5)
	blade.Color = weapon.Color
	blade.Material = weapon.Material
	blade.CFrame = CFrame.new(0, 0.7 + weapon.Length / 2, 0)
	prepPart(blade)
	blade.Parent = tool
	weldTo(handle, blade)

	if weapon.Glow then
		local light = Instance.new("PointLight")
		light.Color = weapon.Color
		light.Brightness = 2
		light.Range = 8
		light.Parent = blade
	end

	local bottom = Instance.new("Attachment")
	bottom.Position = Vector3.new(0, -weapon.Length / 2, 0)
	bottom.Parent = blade
	local tip = Instance.new("Attachment")
	tip.Position = Vector3.new(0, weapon.Length / 2, 0)
	tip.Parent = blade

	local trail = Instance.new("Trail")
	trail.Attachment0 = bottom
	trail.Attachment1 = tip
	trail.Lifetime = 0.18
	trail.MinLength = 0.05
	trail.Color = ColorSequence.new(weapon.TrailColor or weapon.Color)
	trail.Transparency = NumberSequence.new(0.35, 1)
	trail.LightEmission = if weapon.Glow then 1 else 0.3
	trail.Parent = blade

	makeSound(Config.Sounds.Slash, handle, 0.6).Name = "SlashSound"
	local unsheath = makeSound(Config.Sounds.Unsheath, handle, 0.5)
	tool.Equipped:Connect(function()
		unsheath:Play()
	end)

	return tool
end

function CombatService.GiveWeapon(player: Player)
	local data = DataService.Get(player)
	local backpack = player:FindFirstChildOfClass("Backpack")
	if not data or not backpack then
		return
	end

	local weapon = Weapons.ById[data.Equipped]
	if not weapon or not data.Owned[weapon.Id] then
		weapon = Weapons.Default
	end

	local character = player.Character
	for _, container in { backpack, character } do
		if container then
			for _, item in container:GetChildren() do
				if item:IsA("Tool") and item:GetAttribute("WeaponId") then
					item:Destroy()
				end
			end
		end
	end

	local tool = buildTool(weapon)
	tool.Parent = backpack

	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if humanoid and humanoid.Health > 0 then
		humanoid:EquipTool(tool)
	end
end

local function damage(attacker: Player, victimHumanoid: Humanoid, weapon, fromPosition: Vector3)
	local victimCharacter = victimHumanoid.Parent
	if victimCharacter == attacker.Character or victimCharacter:FindFirstChildOfClass("ForceField") then
		return
	end

	local crit = math.random() < Config.CritChance
	local amount = math.floor(weapon.Damage * (if crit then Config.CritMultiplier else 1) + 0.5)

	-- On enregistre l'attaquant AVANT les dégâts : Died peut se déclencher immédiatement.
	local now = os.clock()
	local entry = hitLog[victimHumanoid]
	if not entry then
		entry = { contributors = {} }
		hitLog[victimHumanoid] = entry
	end
	entry.last = attacker
	entry.lastTime = now
	entry.weaponName = weapon.Name
	entry.contributors[attacker] = now

	victimHumanoid:TakeDamage(amount)

	local victimRoot = victimCharacter:FindFirstChild("HumanoidRootPart")
	if victimRoot then
		Remotes.HitConfirm:FireClient(attacker, victimRoot.Position + Vector3.new(0, 2.5, 0), amount, crit)
		local victimPlayer = Players:GetPlayerFromCharacter(victimCharacter)
		local direction = (victimRoot.Position - fromPosition) * Vector3.new(1, 0, 1)
		if victimPlayer and direction.Magnitude > 0.01 then
			Remotes.Knockback:FireClient(victimPlayer, direction.Unit)
		end
	end
end

local function onSwing(player: Player)
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not humanoid or humanoid.Health <= 0 or not root then
		return
	end

	local tool = character:FindFirstChildOfClass("Tool")
	local weapon = tool and Weapons.ById[tool:GetAttribute("WeaponId")]
	if not weapon then
		return
	end

	-- Petite tolérance pour la latence réseau.
	local now = os.clock()
	if now - (lastSwing[player] or 0) < weapon.Cooldown * 0.85 then
		return
	end
	lastSwing[player] = now

	-- Attaquer retire la protection de spawn (anti-abus).
	local forceField = character:FindFirstChildOfClass("ForceField")
	if forceField then
		forceField:Destroy()
	end

	-- Animation de coup (gérée par le script Animate par défaut).
	local anim = Instance.new("StringValue")
	anim.Name = "toolanim"
	anim.Value = "Slash"
	anim.Parent = tool
	Debris:AddItem(anim, 1)

	local handle = tool:FindFirstChild("Handle")
	local slash = handle and handle:FindFirstChild("SlashSound")
	if slash then
		slash:Play()
	end

	local boxCFrame = root.CFrame * CFrame.new(0, 0, -weapon.Range / 2)
	local boxSize = Vector3.new(6, 7, weapon.Range + 1)
	local params = OverlapParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { character }

	local hit = {}
	local count = 0
	for _, part in workspace:GetPartBoundsInBox(boxCFrame, boxSize, params) do
		local model = part:FindFirstAncestorOfClass("Model")
		local victim = model and model:FindFirstChildOfClass("Humanoid")
		if victim and victim.Health > 0 and not hit[victim] then
			hit[victim] = true
			damage(player, victim, weapon, root.Position)
			count += 1
			if count >= Config.MaxTargetsPerSwing then
				break
			end
		end
	end
end

local function onDeath(victim: Player, humanoid: Humanoid)
	local entry = hitLog[humanoid]
	hitLog[humanoid] = nil

	local victimStreak = streaks[victim] or 0
	setStreak(victim, 0)
	DataService.Update(victim, function(data)
		data.Deaths += 1
	end)

	local now = os.clock()
	local killer = entry and entry.last
	if killer and (killer == victim or not killer.Parent or now - entry.lastTime > Config.KillCreditWindow) then
		killer = nil
	end

	if not killer then
		Remotes.KillFeed:FireAllClients(nil, victim.DisplayName, nil)
		return
	end

	local newStreak = (streaks[killer] or 0) + 1
	setStreak(killer, newStreak)

	local multiplier = if killer:GetAttribute("VIP") then Config.VipCoinMultiplier else 1
	local reward = (Config.CoinsPerKill + victimStreak * Config.StreakBountyPerKill) * multiplier
	local totalKills = 0
	DataService.Update(killer, function(data)
		data.Kills += 1
		data.Coins += reward
		data.BestStreak = math.max(data.BestStreak, newStreak)
		totalKills = data.Kills
	end)
	local levels = DataService.AddXp(killer, Config.XpPerKill)

	local killerHumanoid = killer.Character and killer.Character:FindFirstChildOfClass("Humanoid")
	if killerHumanoid and killerHumanoid.Health > 0 then
		killerHumanoid.Health = math.min(killerHumanoid.MaxHealth, killerHumanoid.Health + Config.HealOnKill)
	end

	Remotes.Toast:FireClient(killer, string.format("+%d 💰  Élimination de %s", reward, victim.DisplayName))
	Remotes.Announce:FireClient(victim, "💀 Éliminé par " .. killer.DisplayName, Config.Colors.Bad)
	Remotes.KillFeed:FireAllClients(killer.DisplayName, victim.DisplayName, entry.weaponName)

	if levels > 0 then
		local data = DataService.Get(killer)
		Remotes.Announce:FireClient(killer, "⭐ NIVEAU " .. data.Level .. " !", Config.Colors.Gold)
		if data.Level >= 10 then
			awardBadge(killer, Config.Badges.Level10)
		end
	end

	local message = Config.StreakMessages[newStreak]
	if message then
		Remotes.Announce:FireAllClients(string.format(message, killer.DisplayName), Config.Colors.Accent2)
	end
	if victimStreak >= 3 then
		Remotes.Announce:FireAllClients(
			string.format("%s a stoppé la série de %d de %s !", killer.DisplayName, victimStreak, victim.DisplayName),
			Config.Colors.Gold
		)
	end

	for helper, hitTime in entry.contributors do
		if helper ~= killer and helper ~= victim and helper.Parent and now - hitTime <= Config.AssistWindow then
			local helperReward = Config.AssistCoins * (if helper:GetAttribute("VIP") then Config.VipCoinMultiplier else 1)
			DataService.Update(helper, function(data)
				data.Coins += helperReward
			end)
			Remotes.Toast:FireClient(helper, string.format("+%d 💰  Assistance", helperReward))
		end
	end

	if totalKills == 1 then
		awardBadge(killer, Config.Badges.FirstKill)
	end
	if newStreak >= 10 then
		awardBadge(killer, Config.Badges.Streak10)
	end
end

local function onCharacterAdded(player: Player, character: Model)
	local humanoid = character:WaitForChild("Humanoid") :: Humanoid
	humanoid.Died:Once(function()
		onDeath(player, humanoid)
		task.delay(Config.RespawnTime, function()
			if player.Parent then
				player:LoadCharacter()
			end
		end)
	end)

	player:WaitForChild("Backpack", 5)
	CombatService.GiveWeapon(player)
end

function CombatService.SetupPlayer(player: Player)
	setStreak(player, 0)
	player.CharacterAdded:Connect(function(character)
		onCharacterAdded(player, character)
	end)
	player:LoadCharacter()
end

function CombatService.Init()
	Remotes.Swing.OnServerEvent:Connect(onSwing)
	Players.PlayerRemoving:Connect(function(player)
		lastSwing[player] = nil
		streaks[player] = nil
	end)
end

return CombatService
