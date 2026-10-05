-- Armes à feu côté serveur : distribution des Tools (GunBuilder), munitions / rechargement,
-- validation anti-triche de chaque tir, réplication des effets de tir et de l'inclinaison de visée.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Remotes = require(Shared.Remotes)
local Weapons = require(Shared.Weapons)
local Ballistics = require(Shared.Ballistics)
local GunBuilder = require(Shared:WaitForChild("GunBuilder"))
local DataService = require(script.Parent.DataService)
local SpawnService = require(script.Parent.SpawnService)
local CombatService = require(script.Parent.CombatService)

local WeaponService = {}

local SLOTS = { "Primary", "Secondary" }
local DEFAULT_BY_SLOT = { Primary = Weapons.DefaultPrimary, Secondary = Weapons.DefaultSecondary }
local MAX_COORD = 1e5
local RANGE_MARGIN = 5 -- marge (studs) sur la portée annoncée
local LOS_MARGIN = 1.5 -- un obstacle à moins de 1,5 stud de la cible ne bloque pas
local LOS_PARAMS_LIFETIME = 0.1 -- les paramètres de raycast « décor seul » sont reconstruits au plus 10 fois/s
local AIM_PITCH_LIMIT = 1.3
local AIM_PITCH_MAX_PER_SECOND = 20
local WEAPON_CHECK_DELAY = 1

local fireStates = {} -- [Player] = { [weaponId] = { Last, Times, Index, Limit } }
local aimStates = {} -- [Player] = { WindowStart, Count }
local toolStates = setmetatable({}, { __mode = "k" }) -- [Tool] = { ReloadToken }

local losParams: RaycastParams? = nil
local losParamsTime = -math.huge

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

local function getWeaponOf(tool: Instance?)
	if not tool or not tool:IsA("Tool") then
		return nil
	end
	local weaponId = tool:GetAttribute("WeaponId")
	if type(weaponId) ~= "string" then
		return nil
	end
	return Weapons.ById[weaponId]
end

-- Arme en main d'un joueur vivant : (tool, weapon, character, humanoid) ou nil.
local function getEquippedGun(player: Player)
	local humanoid, character = SpawnService.GetAliveHumanoid(player)
	if not humanoid or not character then
		return nil
	end
	local tool = character:FindFirstChildOfClass("Tool")
	local weapon = getWeaponOf(tool)
	if not tool or not weapon then
		return nil
	end
	return tool, weapon, character, humanoid
end

-- Tool d'un slot (en main ou dans le Backpack).
local function findGun(player: Player, slot: string): Tool?
	local containers = { player.Character, player:FindFirstChildOfClass("Backpack") }
	for index = 1, 2 do
		local container = containers[index]
		if container then
			for _, child in container:GetChildren() do
				local weapon = getWeaponOf(child)
				if weapon and weapon.Slot == slot then
					return child :: Tool
				end
			end
		end
	end
	return nil
end

local function removeGuns(player: Player)
	local containers = { player.Character, player:FindFirstChildOfClass("Backpack") }
	for index = 1, 2 do
		local container = containers[index]
		if container then
			for _, child in container:GetChildren() do
				if child:IsA("Tool") and child:GetAttribute("WeaponId") ~= nil then
					child:Destroy()
				end
			end
		end
	end
end

local function removeForceFields(character: Model)
	local forceField = character:FindFirstChildOfClass("ForceField")
	while forceField do
		forceField:Destroy()
		forceField = character:FindFirstChildOfClass("ForceField")
	end
end

local function getLosParams(): RaycastParams
	local now = os.clock()
	if not losParams or now - losParamsTime > LOS_PARAMS_LIFETIME then
		losParams = Ballistics.GetRaycastParams(Ballistics.GetCharacters())
		losParamsTime = now
	end
	return losParams :: RaycastParams
end

--------------------------------------------------------------------------
-- Rechargement
--------------------------------------------------------------------------
local function cancelReload(tool: Tool)
	local state = toolStates[tool]
	if state then
		state.ReloadToken += 1
	end
	if tool:GetAttribute("Reloading") == true then
		tool:SetAttribute("Reloading", false)
	end
end

local function trackTool(tool: Tool)
	local state = { ReloadToken = 0 }
	toolStates[tool] = state

	-- Rangé dans le Backpack, lâché ou détruit : le rechargement est annulé.
	tool:GetPropertyChangedSignal("Parent"):Connect(function()
		local parent = tool.Parent
		if not parent or not parent:FindFirstChildOfClass("Humanoid") then
			cancelReload(tool)
		end
	end)
	tool.Destroying:Connect(function()
		state.ReloadToken += 1
		toolStates[tool] = nil
	end)
end

function WeaponService.StartReload(player: Player): boolean
	local tool, weapon, character, humanoid = getEquippedGun(player)
	if not tool then
		return false
	end
	local state = toolStates[tool]
	if not state or tool:GetAttribute("Reloading") == true then
		return false
	end
	local ammo = tool:GetAttribute("Ammo")
	if type(ammo) == "number" and ammo >= weapon.MagSize then
		return false
	end

	state.ReloadToken += 1
	local token = state.ReloadToken
	tool:SetAttribute("Reloading", true)

	task.delay(weapon.ReloadTime, function()
		if state.ReloadToken ~= token then
			return
		end
		local stillHeld = tool.Parent == character
			and player.Parent == Players
			and player.Character == character
			and humanoid.Health > 0
		if stillHeld then
			tool:SetAttribute("Ammo", weapon.MagSize)
		end
		if tool.Parent then
			tool:SetAttribute("Reloading", false)
		end
	end)
	return true
end

--------------------------------------------------------------------------
-- Distribution des armes
--------------------------------------------------------------------------
local function buildGun(data, slot: string): Tool?
	local weaponId = data.Loadout[slot]
	local weapon = if type(weaponId) == "string" then Weapons.ById[weaponId] else nil
	if not weapon or weapon.Slot ~= slot or not data.Owned[weaponId] then
		weaponId = DEFAULT_BY_SLOT[slot]
		weapon = Weapons.ById[weaponId]
	end
	if not weapon then
		return nil
	end
	local camoId = data.Camos[weaponId] or "Default"

	local ok, result = pcall(GunBuilder.BuildTool, weaponId, camoId)
	if not ok or typeof(result) ~= "Instance" or not result:IsA("Tool") then
		warn("[WeaponService] GunBuilder.BuildTool a échoué (" .. tostring(weaponId) .. ") : " .. tostring(result))
		return nil
	end
	local tool = result :: Tool
	tool.CanBeDropped = false
	tool:SetAttribute("WeaponId", weaponId)
	tool:SetAttribute("CamoId", camoId)
	tool:SetAttribute("Ammo", weapon.MagSize)
	tool:SetAttribute("Reloading", false)
	trackTool(tool)
	return tool
end

-- Donne principale + secondaire (camos équipés) et garde en main le même slot qu'avant (principale par défaut).
function WeaponService.GiveWeapons(player: Player)
	local data = DataService.Get(player)
	local humanoid, character = SpawnService.GetAliveHumanoid(player)
	local backpack = player:FindFirstChildOfClass("Backpack")
	if not data or not humanoid or not character or not backpack then
		return
	end

	local equippedSlot = "Primary"
	local current = getWeaponOf(character:FindFirstChildOfClass("Tool"))
	if current then
		equippedSlot = current.Slot
	end

	removeGuns(player)
	local tools = {}
	for _, slot in SLOTS do
		local tool = buildGun(data, slot)
		if tool then
			tool.Parent = backpack
			tools[slot] = tool
		end
	end

	local toEquip = tools[equippedSlot] or tools.Primary or tools.Secondary
	if toEquip and humanoid.Health > 0 then
		humanoid:EquipTool(toEquip)
	end
end

-- Remplace uniquement l'arme d'un slot (changement de loadout / achat) ; l'autre garde ses munitions.
function WeaponService.RefreshSlot(player: Player, slot: string)
	local data = DataService.Get(player)
	local humanoid, character = SpawnService.GetAliveHumanoid(player)
	local backpack = player:FindFirstChildOfClass("Backpack")
	if not data or not humanoid or not character or not backpack then
		return
	end
	local old = findGun(player, slot)
	local wasEquipped = old ~= nil and old.Parent == character
	local tool = buildGun(data, slot)
	if not tool then
		return
	end
	if old then
		old:Destroy()
	end
	tool.Parent = backpack
	if wasEquipped or not character:FindFirstChildOfClass("Tool") then
		humanoid:EquipTool(tool)
	end
end

-- Applique un camo aux armes déjà en possession du joueur (sans les reconstruire).
function WeaponService.ApplyCamo(player: Player, weaponId: string, camoId: string)
	local containers = { player.Character, player:FindFirstChildOfClass("Backpack") }
	for index = 1, 2 do
		local container = containers[index]
		if container then
			for _, child in container:GetChildren() do
				if child:IsA("Tool") and child:GetAttribute("WeaponId") == weaponId then
					local ok, err = pcall(GunBuilder.ApplyCamo, child, camoId)
					if not ok then
						warn("[WeaponService] GunBuilder.ApplyCamo a échoué : " .. tostring(err))
					end
					child:SetAttribute("CamoId", camoId)
				end
			end
		end
	end
end

-- Complète les slots manquants (si le Backpack a été recréé juste après l'apparition).
local function ensureWeapons(player: Player)
	local data = DataService.Get(player)
	local humanoid, character = SpawnService.GetAliveHumanoid(player)
	local backpack = player:FindFirstChildOfClass("Backpack")
	if not data or not humanoid or not character or not backpack then
		return
	end
	for _, slot in SLOTS do
		if not findGun(player, slot) then
			local tool = buildGun(data, slot)
			if tool then
				tool.Parent = backpack
				if slot == "Primary" and not character:FindFirstChildOfClass("Tool") then
					humanoid:EquipTool(tool)
				end
			end
		end
	end
end

local function onSpawned(player: Player, character: Model, humanoid: Humanoid)
	-- le Backpack est recréé à chaque apparition : on laisse passer une frame
	task.wait()
	if player.Character ~= character or humanoid.Health <= 0 then
		return
	end
	player:WaitForChild("Backpack", 5)
	if player.Character ~= character or humanoid.Health <= 0 then
		return
	end
	WeaponService.GiveWeapons(player)

	task.delay(WEAPON_CHECK_DELAY, function()
		if player.Parent == Players and player.Character == character and humanoid.Health > 0 then
			ensureWeapons(player)
		end
	end)
end

--------------------------------------------------------------------------
-- Validation des tirs
--------------------------------------------------------------------------
local function getFireState(player: Player, weapon)
	local states = fireStates[player]
	if not states then
		states = {}
		fireStates[player] = states
	end
	local state = states[weapon.Id]
	if not state then
		local limit = math.ceil(1 / weapon.FireDelay) + 2
		state = { Last = -math.huge, Times = table.create(limit, -math.huge), Index = 1, Limit = limit }
		states[weapon.Id] = state
	end
	return state
end

-- Cadence minimale + seau : au plus `Limit` tirs sur une fenêtre glissante d'1 s.
local function canFire(state, weapon, now: number): boolean
	if now - state.Last < weapon.FireDelay * Config.Validation.FireDelayTolerance then
		return false
	end
	-- Times[Index] = le plus ancien des `Limit` derniers tirs
	return now - state.Times[state.Index] >= 1
end

local function commitShot(state, now: number)
	state.Last = now
	state.Times[state.Index] = now
	state.Index = state.Index % state.Limit + 1
end

-- Vérifie un impact sur un personnage (portée, cohérence de position, axe du tir, ligne de vue).
local function validateHit(weapon, hitPart: BasePart, origin: Vector3, direction: Vector3, position: Vector3, distance: number): boolean
	local validation = Config.Validation
	if distance > weapon.Range + RANGE_MARGIN then
		return false
	end
	if (hitPart.Position - position).Magnitude > hitPart.Size.Magnitude / 2 + validation.HitTolerance then
		return false
	end
	local offset = position - origin
	if distance > 0.05 and (offset / distance):Dot(direction) < validation.MinDirectionDot then
		return false
	end
	local result = workspace:Raycast(origin, offset, getLosParams())
	if result and (result.Position - origin).Magnitude < distance - LOS_MARGIN then
		return false
	end
	return true
end

local function onFire(player: Player, origin: any, pellets: any)
	-- 1. types / état
	if not isValidVector(origin) or type(pellets) ~= "table" then
		return
	end
	local tool, weapon, character = getEquippedGun(player)
	if not tool or not weapon or not character then
		return
	end
	local count = #pellets
	if count < 1 or count > weapon.Pellets then
		return
	end
	for index = 1, count do
		local pellet = pellets[index]
		if type(pellet) ~= "table" or not isValidVector(pellet.Direction) or not isValidVector(pellet.Position) then
			return
		end
		if pellet.Direction.Magnitude < 1e-3 then
			return
		end
	end
	if tool:GetAttribute("Reloading") == true then
		return
	end
	local ammo = tool:GetAttribute("Ammo")
	if type(ammo) ~= "number" or ammo <= 0 then
		return
	end
	local head = character:FindFirstChild("Head")
	if not head or not head:IsA("BasePart") then
		return
	end

	-- 2. cadence
	local now = os.clock()
	local state = getFireState(player, weapon)
	if not canFire(state, weapon, now) then
		return
	end

	-- 3. origine plausible
	if (origin - head.Position).Magnitude > Config.Validation.MaxOriginOffset then
		return
	end

	-- 4. munitions + fin de la protection de spawn
	commitShot(state, now)
	tool:SetAttribute("Ammo", ammo - 1)
	removeForceFields(character)

	-- 5. plombs
	local hits = nil -- [Humanoid] = { Damage, Headshot, Distance, Position }
	local impacts = table.create(count)
	for index = 1, count do
		local pellet = pellets[index]
		local direction = pellet.Direction.Unit
		local position = pellet.Position
		local distance = (position - origin).Magnitude

		local normal = Vector3.zero
		if isValidVector(pellet.Normal) and pellet.Normal.Magnitude > 1e-3 then
			normal = pellet.Normal.Unit
		end

		local isCharacter = false
		local hitPart = pellet.Hit
		if typeof(hitPart) == "Instance" and hitPart:IsA("BasePart") and hitPart:IsDescendantOf(workspace) then
			local victim, model = Ballistics.GetHumanoid(hitPart)
			if victim and model and model ~= character then
				isCharacter = true
				if victim.Health > 0 and validateHit(weapon, hitPart, origin, direction, position, distance) then
					local headshot = Ballistics.IsHeadshot(hitPart)
					local damage = Ballistics.DamageAt(weapon, distance, headshot)
					hits = hits or {}
					local entry = hits[victim]
					if entry then
						entry.Damage += damage
						entry.Headshot = entry.Headshot or headshot
						entry.Distance = math.min(entry.Distance, distance)
					else
						hits[victim] = { Damage = damage, Headshot = headshot, Distance = distance, Position = position }
					end
				end
			end
		end

		-- impact affiché chez les autres, limité à la portée de l'arme
		local shown = position
		if distance > weapon.Range then
			shown = origin + direction * weapon.Range
			normal = Vector3.zero
			isCharacter = false
		end
		impacts[index] = { Position = shown, Normal = normal, Character = isCharacter }
	end

	-- dégâts (un seul appel par cible : les plombs d'un fusil à pompe sont additionnés)
	if hits then
		for victim, entry in hits do
			CombatService.ApplyDamage(player, victim, entry.Damage, {
				WeaponId = weapon.Id,
				Headshot = entry.Headshot,
				Distance = entry.Distance,
				Position = entry.Position,
				Origin = origin,
			})
		end
	end

	-- 6. effets chez tous les autres joueurs
	for _, other in Players:GetPlayers() do
		if other ~= player then
			Remotes.ShotFx:FireClient(other, player, weapon.Id, origin, impacts)
		end
	end
end

--------------------------------------------------------------------------
-- Inclinaison de visée (UnreliableRemoteEvent)
--------------------------------------------------------------------------
local function onAimPitch(player: Player, pitch: any)
	if not isFiniteNumber(pitch) then
		return
	end
	local now = os.clock()
	local state = aimStates[player]
	if not state then
		state = { WindowStart = now, Count = 0 }
		aimStates[player] = state
	end
	if now - state.WindowStart >= 1 then
		state.WindowStart = now
		state.Count = 0
	end
	if state.Count >= AIM_PITCH_MAX_PER_SECOND then
		return
	end
	state.Count += 1

	local character = player.Character
	if not character or not character.Parent then
		return
	end
	local value = math.floor(math.clamp(pitch, -AIM_PITCH_LIMIT, AIM_PITCH_LIMIT) * 100 + 0.5) / 100
	if character:GetAttribute("AimPitch") ~= value then
		character:SetAttribute("AimPitch", value)
	end
end

--------------------------------------------------------------------------
-- Initialisation
--------------------------------------------------------------------------
function WeaponService.Init()
	SpawnService.OnSpawned(onSpawned)

	Remotes.Fire.OnServerEvent:Connect(onFire)
	Remotes.Reload.OnServerEvent:Connect(function(player)
		WeaponService.StartReload(player)
	end)
	Remotes.AimPitch.OnServerEvent:Connect(onAimPitch)

	Players.PlayerRemoving:Connect(function(player)
		fireStates[player] = nil
		aimStates[player] = nil
	end)
end

return WeaponService
