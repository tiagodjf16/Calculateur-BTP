-- Apparition des joueurs : déploiement depuis le menu (remote Deploy), choix du spawn le plus sûr,
-- réapparition automatique après la mort, protection de spawn. Ne fait jamais apparaître deux fois.
local Debris = game:GetService("Debris")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Remotes = require(Shared.Remotes)
local DataService = require(script.Parent.DataService)

local SpawnService = {}

local BEST_CHOICES = 3 -- on tire au hasard parmi les 3 spawns les plus éloignés des ennemis
local RECENT_SPAWN_TIME = 2 -- un spawn utilisé il y a moins de 2 s compte comme « occupé »
local SPAWN_CACHE_TIME = 10
local DEPLOY_COOLDOWN = 1
local RETRY_DELAY = 1.5

local spawning = {} -- [Player] = true pendant LoadCharacter
local respawnTokens = {} -- [Player] = number : invalide une réapparition programmée
local respawnPending = {} -- [Player] = true : réapparition automatique programmée
local pendingDeploy = {} -- [Player] = true : Deploy reçu avant la fin du chargement des données
local lastDeploy = {} -- [Player] = os.clock()
local handledCharacters = setmetatable({}, { __mode = "k" }) -- [Model] = true : mort/retrait déjà traité
local recentSpawns = {} -- { { Position: Vector3, Time: number } }
local spawnedCallbacks = {}

local spawnCache = {}
local spawnCacheTime = -math.huge

--------------------------------------------------------------------------
-- Utilitaires
--------------------------------------------------------------------------
-- Retourne (Humanoid, personnage) si le joueur a un personnage vivant dans le monde.
function SpawnService.GetAliveHumanoid(player: Player): (Humanoid?, Model?)
	local character = player.Character
	if not character or not character.Parent then
		return nil, nil
	end
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if humanoid and humanoid.Health > 0 then
		return humanoid, character
	end
	return nil, nil
end

function SpawnService.IsAlive(player: Player): boolean
	return (SpawnService.GetAliveHumanoid(player)) ~= nil
end

function SpawnService.IsSpawning(player: Player): boolean
	return spawning[player] == true
end

-- callback(player, character, humanoid) appelé à chaque apparition (après configuration du Humanoid).
function SpawnService.OnSpawned(callback: (Player, Model, Humanoid) -> ())
	table.insert(spawnedCallbacks, callback)
end

-- Toutes les SpawnLocation actives de l'arène (mises en cache).
function SpawnService.GetSpawns(): { SpawnLocation }
	local now = os.clock()
	local valid = #spawnCache > 0 and now - spawnCacheTime < SPAWN_CACHE_TIME
	if valid then
		for _, location in spawnCache do
			if not location.Parent or not location.Enabled then
				valid = false
				break
			end
		end
	end
	if valid then
		return spawnCache
	end

	local list = {}
	local arena = workspace:FindFirstChild("Arena")
	if arena then
		for _, descendant in arena:GetDescendants() do
			if descendant:IsA("SpawnLocation") and descendant.Enabled then
				table.insert(list, descendant)
			end
		end
	end
	spawnCache = list
	spawnCacheTime = now
	return list
end

-- Choisit le spawn qui maximise la distance à l'ennemi vivant le plus proche.
local function chooseSpawn(player: Player): SpawnLocation?
	local spawns = SpawnService.GetSpawns()
	if #spawns == 0 then
		return nil
	end

	local threats = {}
	for _, other in Players:GetPlayers() do
		if other ~= player then
			local humanoid, character = SpawnService.GetAliveHumanoid(other)
			local root = character and character:FindFirstChild("HumanoidRootPart")
			if humanoid and root and root:IsA("BasePart") then
				table.insert(threats, root.Position)
			end
		end
	end
	local now = os.clock()
	for index = #recentSpawns, 1, -1 do
		local entry = recentSpawns[index]
		if now - entry.Time > RECENT_SPAWN_TIME then
			table.remove(recentSpawns, index)
		else
			table.insert(threats, entry.Position)
		end
	end

	if #threats == 0 then
		return spawns[math.random(1, #spawns)]
	end

	local scored = table.create(#spawns)
	for _, location in spawns do
		local nearest = math.huge
		local position = location.Position
		for _, threat in threats do
			local distance = (threat - position).Magnitude
			if distance < nearest then
				nearest = distance
			end
		end
		table.insert(scored, { Spawn = location, Score = nearest })
	end
	table.sort(scored, function(a, b)
		return a.Score > b.Score
	end)
	return scored[math.random(1, math.min(BEST_CHOICES, #scored))].Spawn
end

-- Supprime le script de régénération par défaut de Roblox (CombatService gère la régénération).
local function removeDefaultHealthScript(character: Model)
	local health = character:FindFirstChild("Health")
	if health and health.ClassName == "Script" then
		health:Destroy()
	end
	local connection = character.ChildAdded:Connect(function(child)
		if child.Name == "Health" and child.ClassName == "Script" then
			task.defer(function()
				if child.Parent then
					child:Destroy()
				end
			end)
		end
	end)
	task.delay(3, function()
		connection:Disconnect()
	end)
end

-- Vérifie la position (repli si RespawnLocation a été ignoré) et la protection de spawn.
local function placeAndProtect(character: Model, location: SpawnLocation?)
	local root = character:FindFirstChild("HumanoidRootPart")
	if location and location.Parent and root and root:IsA("BasePart") then
		local top = location.Position + Vector3.new(0, location.Size.Y / 2, 0)
		local flat = (root.Position - top) * Vector3.new(1, 0, 1)
		local limit = math.max(location.Size.X, location.Size.Z) / 2 + 6
		if flat.Magnitude > limit or math.abs(root.Position.Y - top.Y) > 12 then
			local look = location.CFrame.LookVector * Vector3.new(1, 0, 1)
			if look.Magnitude < 0.01 then
				look = Vector3.new(0, 0, -1)
			end
			local position = top + Vector3.new(0, 3.5, 0)
			character:PivotTo(CFrame.lookAt(position, position + look.Unit))
		end
	end

	-- Le moteur crée normalement le ForceField (SpawnLocation.Duration) ; sinon on le crée nous-mêmes.
	if not character:FindFirstChildOfClass("ForceField") then
		local duration = if location then location.Duration else Config.SpawnProtection
		if duration > 0 then
			local forceField = Instance.new("ForceField")
			forceField.Name = "SpawnProtection"
			forceField.Visible = true
			forceField.Parent = character
			Debris:AddItem(forceField, duration)
		end
	end
end

local function scheduleRespawn(player: Player, delay: number)
	local token = (respawnTokens[player] or 0) + 1
	respawnTokens[player] = token
	respawnPending[player] = true
	task.delay(delay, function()
		if respawnTokens[player] ~= token then
			return
		end
		respawnPending[player] = nil
		if player.Parent == Players then
			SpawnService.Spawn(player)
		end
	end)
end

--------------------------------------------------------------------------
-- Apparition
--------------------------------------------------------------------------
-- Fait apparaître le joueur. Retourne true si un personnage a été créé.
function SpawnService.Spawn(player: Player): boolean
	if spawning[player] or player.Parent ~= Players then
		return false
	end
	if not DataService.Get(player) then
		return false
	end
	if SpawnService.IsAlive(player) then
		return false
	end

	spawning[player] = true
	pendingDeploy[player] = nil
	-- annule toute réapparition automatique déjà programmée
	respawnTokens[player] = (respawnTokens[player] or 0) + 1
	respawnPending[player] = nil

	local location = chooseSpawn(player)
	if location then
		table.insert(recentSpawns, { Position = location.Position, Time = os.clock() })
	end
	player.RespawnLocation = location

	-- l'ancien personnage (mort) ne doit pas déclencher de nouvelle réapparition
	local oldCharacter = player.Character
	if oldCharacter then
		handledCharacters[oldCharacter] = true
	end

	local ok, err = pcall(function()
		player:LoadCharacter()
	end)
	spawning[player] = nil

	if player.Parent ~= Players then
		return false
	end
	if not ok then
		warn("[SpawnService] LoadCharacter a échoué pour " .. player.Name .. " : " .. tostring(err))
		scheduleRespawn(player, RETRY_DELAY)
		return false
	end

	local character = player.Character
	if character then
		placeAndProtect(character, location)
	end
	return true
end

local function onCharacterAdded(player: Player, character: Model)
	local humanoid = character:WaitForChild("Humanoid", 10)
	if not humanoid or not humanoid:IsA("Humanoid") then
		return
	end
	if player.Character ~= character or player.Parent ~= Players then
		return
	end

	humanoid.MaxHealth = Config.MaxHealth
	humanoid.Health = Config.MaxHealth
	humanoid.WalkSpeed = Config.Movement.WalkSpeed
	removeDefaultHealthScript(character)

	humanoid.Died:Once(function()
		if handledCharacters[character] then
			return
		end
		handledCharacters[character] = true
		if player.Parent == Players then
			scheduleRespawn(player, Config.RespawnTime)
		end
	end)

	for _, callback in spawnedCallbacks do
		task.spawn(callback, player, character, humanoid)
	end
end

-- Personnage retiré sans mourir (chute hors de la map, script tiers…) : on le fait réapparaître.
local function onCharacterRemoving(player: Player, character: Model)
	if handledCharacters[character] or spawning[player] then
		return
	end
	handledCharacters[character] = true
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if humanoid and humanoid.Health > 0 and player.Parent == Players then
		scheduleRespawn(player, Config.RespawnTime)
	end
end

local function onDeploy(player: Player)
	if spawning[player] or respawnPending[player] then
		return
	end
	if SpawnService.IsAlive(player) then
		return
	end
	local now = os.clock()
	if now - (lastDeploy[player] or -math.huge) < DEPLOY_COOLDOWN then
		return
	end
	lastDeploy[player] = now

	if not DataService.Get(player) then
		-- données pas encore prêtes : on déploiera dès le chargement terminé
		pendingDeploy[player] = true
		return
	end
	SpawnService.Spawn(player)
end

local function onPlayerAdded(player: Player)
	player.CharacterAdded:Connect(function(character)
		onCharacterAdded(player, character)
	end)
	player.CharacterRemoving:Connect(function(character)
		onCharacterRemoving(player, character)
	end)

	-- Personnage créé avant le démarrage des scripts (Studio) : le joueur doit passer par le menu.
	local existing = player.Character
	if existing then
		handledCharacters[existing] = true
		player.Character = nil
		existing:Destroy()
	end
end

function SpawnService.Init()
	Remotes.Deploy.OnServerEvent:Connect(onDeploy)

	DataService.OnLoaded(function(player)
		if pendingDeploy[player] then
			pendingDeploy[player] = nil
			SpawnService.Spawn(player)
		end
	end)

	Players.PlayerAdded:Connect(onPlayerAdded)
	for _, player in Players:GetPlayers() do
		task.spawn(onPlayerAdded, player)
	end

	Players.PlayerRemoving:Connect(function(player)
		spawning[player] = nil
		respawnTokens[player] = nil
		respawnPending[player] = nil
		pendingDeploy[player] = nil
		lastDeploy[player] = nil
	end)
end

return SpawnService
