--!nocheck
-- Chargement de la place, exécution des scripts (serveur / clients), boucle de frames, entrées, rapport.
local roblox = require("@lune/roblox")
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local realtask = require("@lune/task")

local Engine = require("./engine")
require("./services")

local wrap, unwrap, isProxy = Engine.wrap, Engine.unwrap, Engine.isProxy
local stateOf, signalOf, record = Engine.stateOf, Engine.signalOf, Engine.record
local currentCtx, spawnIn = Engine.currentCtx, Engine.spawnIn
local Enum = roblox.Enum
local Vector3, CFrame = roblox.Vector3, roblox.CFrame

local Runner = {}

local function simTypeof(v)
	if isProxy(v) then
		return "Instance"
	end
	if type(v) == "table" then
		if v.__RaycastParams then
			return "RaycastParams"
		elseif v.__OverlapParams then
			return "OverlapParams"
		elseif v.__TweenInfo then
			return "TweenInfo"
		elseif getmetatable(v) == Engine.Signal then
			return "RBXScriptSignal"
		elseif v.Disconnect and v.Connected ~= nil then
			return "RBXScriptConnection"
		end
	end
	return typeof(v)
end
Runner.typeof = simTypeof

local userSettings = {
	GetService = function(_, name)
		return {
			MouseSensitivity = 1,
			RotationType = Enum.RotationType.MovementRelative,
			SavedQualityLevel = Enum.SavedQualitySetting.Automatic,
			ComputerMovementMode = Enum.ComputerMovementMode.Default,
			GamepadCameraSensitivity = 1,
		}
	end,
}

local function makeEnv(ctx, scriptRaw)
	local env = {}
	env.script = wrap(scriptRaw)
	env.game = wrap(Engine.gameRaw)
	env.Game = env.game
	env.workspace = wrap(Engine.workspaceRaw)
	env.Workspace = env.workspace
	env.require = function(m)
		return Runner.require(ctx, m)
	end
	env.task = Engine.libs.Task
	env.Instance = Engine.libs.Instance
	env.typeof = simTypeof
	for _, name in {
		"Vector3", "Vector2", "CFrame", "Color3", "ColorSequence", "ColorSequenceKeypoint", "NumberSequence",
		"NumberSequenceKeypoint", "NumberRange", "UDim", "UDim2", "Rect", "BrickColor", "Ray", "Region3",
		"Font", "PhysicalProperties", "Faces", "Axes", "Vector3int16", "Vector2int16", "Region3int16", "Enum",
	} do
		env[name] = roblox[name]
	end
	env.RaycastParams = Engine.libs.RaycastParams
	env.OverlapParams = Engine.libs.OverlapParams
	env.TweenInfo = Engine.libs.TweenInfo
	env.Random = Engine.libs.Random
	env.DateTime = Engine.libs.DateTime
	env.print = function(...)
		if Engine.verbose then
			print("[" .. ctx.name .. "]", ...)
		end
	end
	env.warn = function(...)
		local parts = {}
		for i = 1, select("#", ...) do
			parts[i] = tostring((select(i, ...)))
		end
		record("warn", ctx, table.concat(parts, " "))
	end
	env.tick = os.clock
	env.time = function()
		return os.clock() - Engine.startClock
	end
	env.elapsedTime = env.time
	env.wait = function(t)
		record("warn", ctx, "wait() est déprécié : utiliser task.wait()")
		return realtask.wait(t)
	end
	env.spawn = function(f)
		record("warn", ctx, "spawn() est déprécié : utiliser task.spawn()")
		return Engine.libs.Task.spawn(f)
	end
	env.delay = function(t, f)
		record("warn", ctx, "delay() est déprécié : utiliser task.delay()")
		return Engine.libs.Task.delay(t, f)
	end
	env.shared = ctx.shared
	env._G = ctx.G or {}
	ctx.G = env._G
	env.settings = function()
		return {}
	end
	env.UserSettings = function()
		return userSettings
	end
	env.version = function()
		return "0.650.0"
	end
	return setmetatable(env, { __index = _G })
end

local function loadChunk(ctx, scriptRaw)
	local source = scriptRaw.Source
	local name = scriptRaw:GetFullName()
	local env = makeEnv(ctx, scriptRaw)
	local ok, fn = pcall(luau.load, source, { debugName = name, environment = env })
	if not ok then
		record("error", ctx, "Erreur de compilation " .. name .. " : " .. tostring(fn))
		return nil
	end
	return fn
end

function Runner.require(ctx, module)
	local raw = unwrap(module)
	if typeof(raw) ~= "Instance" then
		error("Attempted to call require with invalid argument(s).", 2)
	end
	if not raw:IsA("ModuleScript") then
		error("require: " .. raw:GetFullName() .. " n'est pas un ModuleScript", 2)
	end
	local id = raw:GetDebugId()
	local cache = ctx.moduleCache
	local entry = cache[id]
	if entry then
		if entry.loading then
			error("Requested module was required recursively: " .. raw:GetFullName(), 2)
		end
		return entry.value
	end
	entry = { loading = true }
	cache[id] = entry
	local fn = loadChunk(ctx, raw)
	if not fn then
		cache[id] = nil
		error("Requested module experienced an error while loading: " .. raw:GetFullName(), 2)
	end
	local results = table.pack(xpcall(fn, function(e)
		return tostring(e) .. "\n" .. debug.traceback("", 2)
	end))
	if not results[1] then
		cache[id] = nil
		error("Requested module experienced an error while loading (" .. raw:GetFullName() .. ") : " .. tostring(results[2]), 2)
	end
	if results.n ~= 2 then
		cache[id] = nil
		error("Module code did not return exactly one value: " .. raw:GetFullName(), 2)
	end
	entry.loading = false
	entry.value = results[2]
	return entry.value
end

function Runner.runScript(ctx, scriptRaw)
	local fn = loadChunk(ctx, scriptRaw)
	if fn then
		spawnIn(ctx, fn)
	end
end

function Runner.load(placePath)
	local game = roblox.deserializePlace(fs.readFile(placePath))
	Engine.gameRaw = game
	Engine.workspaceRaw = game:GetService("Workspace")
	-- services toujours présents
	for _, name in {
		"Players", "Lighting", "ReplicatedStorage", "ServerScriptService", "ServerStorage", "StarterGui",
		"StarterPack", "StarterPlayer", "SoundService", "RunService", "UserInputService", "TweenService",
		"Debris", "CollectionService", "ContextActionService", "MarketplaceService", "BadgeService",
		"DataStoreService", "HttpService", "TextService", "GuiService", "Teams", "Chat", "TextChatService",
	} do
		pcall(function()
			game:GetService(name)
		end)
	end
	local cam = roblox.Instance.new("Camera")
	cam.Name = "ServerCamera"
	Engine.serverCamera = cam
	local players = game:GetService("Players")
	if pcall(function()
		return players.CharacterAutoLoads
	end) == false then
		players.CharacterAutoLoads = true
	end
	return game
end

function Runner.startServer()
	local sss = Engine.gameRaw:GetService("ServerScriptService")
	for _, d in sss:GetDescendants() do
		if d.ClassName == "Script" then
			local okDisabled, disabled = pcall(function()
				return d.Disabled
			end)
			if not (okDisabled and disabled) then
				Runner.runScript(Engine.serverCtx, d)
			end
		end
	end
end

-- Boucle de frames (60 Hz)
local running = true
function Runner.startFrames()
	local rsRaw = Engine.gameRaw:GetService("RunService")
	local rsState = stateOf(rsRaw)
	-- RenderStepped côté serveur = erreur
	local rendered = signalOf(rsRaw, "RenderStepped")
	rendered.onConnect = function(conn)
		if conn.ctx.kind == "server" then
			record("error", conn.ctx, "RenderStepped event can only be used from local scripts")
		end
	end
	realtask.spawn(function()
		local last = os.clock()
		while running do
			realtask.wait(1 / 60)
			local now = os.clock()
			local dt = now - last
			last = now
			local stepped = rsState.signals.Stepped
			if stepped then
				stepped:Fire(now - Engine.startClock, dt)
			end
			for _, name in { "PreSimulation", "PostSimulation", "Heartbeat" } do
				local sig = rsState.signals[name]
				if sig then
					sig:Fire(dt)
				end
			end
			for _, ctx in Engine.clients do
				if ctx.alive then
					local binds = {}
					for name, b in ctx.renderBinds do
						table.insert(binds, b)
					end
					table.sort(binds, function(a, b)
						return a.priority < b.priority
					end)
					for _, b in binds do
						spawnIn(ctx, b.fn, dt)
					end
					local pre = rsState.signals.PreRender
					if pre then
						pre:FireFiltered(function(conn)
							return conn.ctx == ctx
						end, dt)
					end
					local rs = rsState.signals.RenderStepped
					if rs then
						rs:FireFiltered(function(conn)
							return conn.ctx == ctx
						end, dt)
					end
				end
			end
		end
	end)
end

function Runner.stop()
	running = false
end

-- Joueurs
local userIdCounter = 1000
function Runner.addPlayer(name, opts)
	opts = opts or {}
	userIdCounter += 1
	local playersRaw = Engine.gameRaw:GetService("Players")
	local raw = roblox.Instance.new("Player")
	raw.Name = name
	pcall(function()
		raw.UserId = userIdCounter
	end)
	pcall(function()
		raw.DisplayName = name
	end)
	local ctx = {
		kind = "client",
		name = "CLIENT:" .. name,
		player = raw,
		moduleCache = {},
		shared = {},
		renderBinds = {},
		actions = {},
		keysDown = {},
		alive = true,
		uisDefaults = if opts.touch then { TouchEnabled = true, KeyboardEnabled = false, MouseEnabled = false } else nil,
	}
	local camera = roblox.Instance.new("Camera")
	camera.Name = "Camera_" .. name
	camera.FieldOfView = 70
	camera.CFrame = CFrame.new(0, 20, 30) * CFrame.Angles(-0.4, 0, 0)
	camera.Parent = Engine.workspaceRaw
	ctx.camera = camera
	table.insert(Engine.clients, ctx)
	Engine._registerClient(raw, ctx)
	table.insert(Engine.players, raw)

	local function child(class, childName)
		local ok, inst = pcall(roblox.Instance.new, class)
		if not ok then
			inst = roblox.Instance.new("Folder")
		end
		inst.Name = childName or class
		inst.Parent = raw
		return inst
	end
	local playerGui = child("PlayerGui")
	child("Backpack")
	local playerScripts = child("PlayerScripts")
	local starterScripts = Engine.gameRaw:GetService("StarterPlayer"):FindFirstChild("StarterPlayerScripts")
	if starterScripts then
		for _, c in starterScripts:GetChildren() do
			c:Clone().Parent = playerScripts
		end
	end
	wrap(raw).Parent = wrap(playersRaw)
	signalOf(playersRaw, "PlayerAdded"):Fire(wrap(raw))
	local autoLoads = playersRaw.CharacterAutoLoads
	if autoLoads then
		spawnIn(Engine.serverCtx, function()
			Engine.loadCharacter(raw)
		end)
	end
	for _, d in playerScripts:GetDescendants() do
		if d.ClassName == "LocalScript" then
			Runner.runScript(ctx, d)
		end
	end
	return ctx
end

function Engine.removePlayer(raw)
	local idx = table.find(Engine.players, raw)
	if not idx then
		return
	end
	local playersRaw = Engine.gameRaw:GetService("Players")
	signalOf(playersRaw, "PlayerRemoving"):Fire(wrap(raw))
	realtask.wait(0.05)
	table.remove(Engine.players, idx)
	local ctx = Engine.clientOf(raw)
	if ctx then
		ctx.alive = false
	end
	if raw.Character then
		Engine.destroy(raw.Character)
	end
	Engine.destroy(raw)
end
Runner.removePlayer = Engine.removePlayer

-- Entrées simulées
local function makeInput(inputType, keyCode, state)
	return {
		UserInputType = inputType,
		KeyCode = keyCode or Enum.KeyCode.Unknown,
		UserInputState = state,
		Position = Vector3.new(683, 384, 0),
		Delta = Vector3.zero,
		IsModifierKeyDown = function()
			return false
		end,
	}
end

-- input = Enum.KeyCode.X ou Enum.UserInputType.MouseButton1
function Runner.input(ctx, input, state)
	local isKey = tostring(input):find("KeyCode") ~= nil
	local inputType = if isKey then Enum.UserInputType.Keyboard else input
	local keyCode = if isKey then input else Enum.KeyCode.Unknown
	local obj = makeInput(inputType, keyCode, state)
	if state == Enum.UserInputState.Begin then
		ctx.keysDown[input] = true
	elseif state == Enum.UserInputState.End then
		ctx.keysDown[input] = nil
	end
	-- ContextActionService d'abord
	local actions = {}
	for name, a in ctx.actions do
		for _, i in a.inputs do
			if i == input then
				table.insert(actions, { name = name, a = a })
			end
		end
	end
	table.sort(actions, function(x, y)
		return x.a.priority > y.a.priority
	end)
	local sunk = false
	for _, item in actions do
		local done = false
		local result
		spawnIn(ctx, function()
			result = item.a.fn(item.name, state, obj)
			done = true
		end)
		local started = os.clock()
		while not done and os.clock() - started < 1 do
			realtask.wait()
		end
		if result ~= Enum.ContextActionResult.Pass then
			sunk = true
			break
		end
	end
	local uisRaw = Engine.gameRaw:GetService("UserInputService")
	local eventName = if state == Enum.UserInputState.Begin then "InputBegan" elseif state == Enum.UserInputState.End then "InputEnded" else "InputChanged"
	local sig = stateOf(uisRaw).signals[eventName]
	if sig then
		sig:FireFiltered(function(conn)
			return conn.ctx == ctx
		end, obj, sunk)
	end
	return #actions
end

function Runner.press(ctx, input, holdTime)
	Runner.input(ctx, input, Enum.UserInputState.Begin)
	realtask.wait(holdTime or 0.1)
	Runner.input(ctx, input, Enum.UserInputState.End)
end

function Runner.click(ctx, button)
	local raw = unwrap(button)
	for _, name in { "MouseButton1Down", "MouseButton1Up", "MouseButton1Click", "Activated" } do
		local sig = stateOf(raw).signals[name]
		if sig then
			sig:FireFiltered(function(conn)
				return conn.ctx == ctx
			end, makeInput(Enum.UserInputType.MouseButton1, nil, Enum.UserInputState.End), 1)
		end
	end
end

-- Recherche d'un bouton par texte dans le PlayerGui d'un client
function Runner.findButton(ctx, pattern)
	local gui = ctx.player:FindFirstChildOfClass("PlayerGui")
	if not gui then
		return nil
	end
	for _, d in gui:GetDescendants() do
		if (d:IsA("TextButton")) and not stateOf(d).destroyed then
			local ok, text = pcall(function()
				return d.Text
			end)
			if ok and type(text) == "string" and text:upper():find(pattern:upper(), 1, true) then
				return wrap(d)
			end
		end
	end
	return nil
end

function Runner.guiSummary(ctx)
	local gui = ctx.player:FindFirstChildOfClass("PlayerGui")
	local out = {}
	if gui then
		for _, c in gui:GetChildren() do
			if not stateOf(c).destroyed then
				local count = #c:GetDescendants()
				local enabled = true
				pcall(function()
					enabled = c.Enabled
				end)
				table.insert(out, string.format("%s(%d%s)", c.Name, count, if enabled then "" else ",off"))
			end
		end
	end
	return table.concat(out, " ")
end

-- Exécute fn dans le contexte ctx (pour inspecter l'état serveur/client)
function Runner.inCtx(ctx, fn, ...)
	local results
	local done = false
	local args = table.pack(...)
	spawnIn(ctx, function()
		results = table.pack(pcall(fn, table.unpack(args, 1, args.n)))
		done = true
	end)
	local started = os.clock()
	while not done and os.clock() - started < 10 do
		realtask.wait(0.01)
	end
	if not done then
		return false, "timeout"
	end
	return table.unpack(results, 1, results.n)
end

-- Module serveur déjà chargé (cache) par nom
function Runner.serverModule(name)
	for _, d in Engine.gameRaw:GetDescendants() do
		if d.ClassName == "ModuleScript" and d.Name == name then
			local entry = Engine.serverCtx.moduleCache[d:GetDebugId()]
			if entry and entry.value then
				return entry.value
			end
		end
	end
	return nil
end

function Runner.clientModule(ctx, name)
	for id, entry in ctx.moduleCache do
		if entry.value and entry.name == name then
			return entry.value
		end
	end
	local ps = ctx.player:FindFirstChild("PlayerScripts")
	for _, d in Engine.gameRaw:GetDescendants() do
		if d.ClassName == "ModuleScript" and d.Name == name then
			local entry = ctx.moduleCache[d:GetDebugId()]
			if entry and entry.value then
				return entry.value
			end
		end
	end
	if ps then
		for _, d in ps:GetDescendants() do
			if d.ClassName == "ModuleScript" and d.Name == name then
				local entry = ctx.moduleCache[d:GetDebugId()]
				if entry and entry.value then
					return entry.value
				end
			end
		end
	end
	return nil
end

function Runner.report()
	print("\n================ RAPPORT DE SIMULATION ================")
	local function group(list)
		local seen, order = {}, {}
		for _, e in list do
			local key = e.ctx .. "|" .. (e.message:match("^[^\n]*") or e.message)
			if not seen[key] then
				seen[key] = { count = 0, sample = e }
				table.insert(order, key)
			end
			seen[key].count += 1
		end
		return seen, order
	end
	local errs, eorder = group(Engine.errors)
	print(string.format("ERREURS : %d (%d distinctes)", #Engine.errors, #eorder))
	for _, key in eorder do
		local g = errs[key]
		print(string.format("\n--- x%d [%s] t=%.1fs\n%s", g.count, g.sample.ctx, g.sample.t, g.sample.message))
	end
	local warns, worder = group(Engine.warnings)
	print(string.format("\nAVERTISSEMENTS : %d (%d distincts)", #Engine.warnings, #worder))
	for _, key in worder do
		local g = warns[key]
		print(string.format("  x%d [%s] %s", g.count, g.sample.ctx, (g.sample.message:match("^[^\n]*"))))
	end
	print("\nSTATS : instances créées=" .. Engine.stats.instances .. " raycasts=" .. Engine.stats.raycasts .. " terrain=" .. Engine.stats.terrain .. " spawns=" .. tostring(Engine.stats.spawns or 0))
	local remotes = {}
	for name, n in Engine.stats.remotes do
		table.insert(remotes, name .. "=" .. n)
	end
	table.sort(remotes)
	print("REMOTES : " .. table.concat(remotes, " "))
	print("========================================================")
end

return Runner
