--!nocheck
-- Services Roblox simulés, joueurs/personnages, remotes, exécution des scripts, boucle de frames.
local roblox = require("@lune/roblox")
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local realtask = require("@lune/task")
local serde = require("@lune/serde")

local Engine = require("./engine")
local wrap, unwrap, isProxy = Engine.wrap, Engine.unwrap, Engine.isProxy
local stateOf, signalOf, record = Engine.stateOf, Engine.signalOf, Engine.record
local currentCtx, spawnIn = Engine.currentCtx, Engine.spawnIn
local Methods = Engine.Methods
local characterOwner = function(m) return Engine.characterOwner(m) end
local Signal = Engine.Signal
local Vector3, Vector2, CFrame, Color3 = roblox.Vector3, roblox.Vector2, roblox.CFrame, roblox.Color3
local Enum = roblox.Enum

local Services = {}
Engine.players = {} -- liste de Player (raw)

local function M(class)
	Methods[class] = Methods[class] or {}
	return Methods[class]
end

local function isServer()
	return currentCtx().kind == "server"
end

local function requireServer(name)
	if not isServer() then
		error(name .. " can only be called from the server", 3)
	end
end

local function requireClient(name)
	if isServer() then
		error(name .. " can only be called from a LocalScript", 3)
	end
end

-- Copie profonde façon réseau Roblox (tables copiées, Instances conservées, fonctions interdites)
local function netCopy(v, depth)
	depth = depth or 0
	if depth > 30 then
		error("Remote payload trop profond (référence cyclique ?)", 3)
	end
	local t = type(v)
	if t == "function" then
		error("Cannot send a function through a remote", 3)
	elseif t == "table" and not isProxy(v) then
		local out = {}
		local hasNumeric, hasString = false, false
		for k, item in v do
			if type(k) == "number" then
				hasNumeric = true
			else
				hasString = true
			end
			if type(k) ~= "number" and type(k) ~= "string" then
				error("Remote payload: clé de table invalide (" .. typeof(k) .. ")", 3)
			end
			out[k] = netCopy(item, depth + 1)
		end
		if hasNumeric and hasString then
			record("warn", currentCtx(), "Remote payload: table mixte (clés numériques + texte) — Roblox perd une partie des clés")
		end
		return out
	elseif t == "number" and v ~= v then
		return v
	end
	return v
end

local function netCopyArgs(...)
	local n = select("#", ...)
	local args = { ... }
	for i = 1, n do
		args[i] = netCopy(args[i])
	end
	return args, n
end

local function approxSize(v)
	local t = type(v)
	if t == "table" then
		local s = 2
		for k, item in v do
			s += approxSize(k) + approxSize(item)
		end
		return s
	elseif t == "string" then
		return #v + 2
	elseif t == "number" or t == "boolean" then
		return 8
	end
	return 16
end

--------------------------------------------------------------------------
-- Remotes
--------------------------------------------------------------------------
local function clientFilter(player)
	return function(conn)
		return conn.ctx.kind == "client" and (player == nil or conn.ctx.player == player)
	end
end

local function remoteStats(raw)
	local name = raw.Name
	Engine.stats.remotes[name] = (Engine.stats.remotes[name] or 0) + 1
end

-- File d'attente : un RemoteEvent garde les messages tant que personne n'écoute.
local function queueFor(raw, key)
	local s = stateOf(raw)
	s.queues = s.queues or {}
	s.queues[key] = s.queues[key] or {}
	return s.queues[key]
end

local function installQueueFlush(raw, sigName)
	local sig = signalOf(raw, sigName)
	if sig.onConnect then
		return sig
	end
	sig.onConnect = function(conn)
		local key = if conn.ctx.kind == "client" then conn.ctx.name else "SERVER"
		local q = queueFor(raw, key)
		if #q > 0 then
			local items = table.clone(q)
			table.clear(q)
			for _, item in items do
				spawnIn(conn.ctx, conn.fn, table.unpack(item.args, 1, item.n))
			end
		end
	end
	return sig
end

local function fireServer(self, ...)
	local raw = unwrap(self)
	local ctx = currentCtx()
	if ctx.kind ~= "client" then
		error("FireServer can only be called from the client", 2)
	end
	remoteStats(raw)
	local args, n = netCopyArgs(...)
	if raw:IsA("UnreliableRemoteEvent") and approxSize(args) > 900 then
		record("warn", ctx, "UnreliableRemoteEvent " .. raw.Name .. " payload > 900 octets (sera ignoré)")
	end
	local sig = installQueueFlush(raw, "OnServerEvent")
	local player = wrap(ctx.player)
	local fired = sig:FireFiltered(function(conn)
		return conn.ctx.kind == "server"
	end, player, table.unpack(args, 1, n))
	if fired == 0 and not raw:IsA("UnreliableRemoteEvent") then
		table.insert(queueFor(raw, "SERVER"), { args = { player, table.unpack(args, 1, n) }, n = n + 1 })
	end
end

local function fireClient(self, player, ...)
	requireServer("FireClient")
	local raw = unwrap(self)
	local rawPlayer = unwrap(player)
	if typeof(rawPlayer) ~= "Instance" or not rawPlayer:IsA("Player") then
		error("FireClient: argument 1 must be a Player", 2)
	end
	remoteStats(raw)
	local args, n = netCopyArgs(...)
	local sig = installQueueFlush(raw, "OnClientEvent")
	local clientCtx = Engine.clientOf(rawPlayer)
	if not clientCtx then
		return
	end
	local fired = sig:FireFiltered(function(conn)
		return conn.ctx == clientCtx
	end, table.unpack(args, 1, n))
	if fired == 0 and not raw:IsA("UnreliableRemoteEvent") then
		table.insert(queueFor(raw, clientCtx.name), { args = args, n = n })
	end
end

local function fireAllClients(self, ...)
	requireServer("FireAllClients")
	for _, player in Engine.players do
		fireClient(self, wrap(player), ...)
	end
end

for _, class in { "RemoteEvent", "UnreliableRemoteEvent" } do
	local m = M(class)
	m.FireServer = fireServer
	m.FireClient = fireClient
	m.FireAllClients = fireAllClients
end

M("RemoteFunction").InvokeServer = function(self, ...)
	local raw = unwrap(self)
	local ctx = currentCtx()
	if ctx.kind ~= "client" then
		error("InvokeServer can only be called from the client", 2)
	end
	remoteStats(raw)
	local args, n = netCopyArgs(...)
	local started = os.clock()
	while not stateOf(raw).callbacks.OnServerInvoke do
		if os.clock() - started > 12 then
			record("error", ctx, "INFINITE YIELD: " .. raw.Name .. ":InvokeServer() — OnServerInvoke jamais défini\n" .. debug.traceback("", 2))
			coroutine.yield()
		end
		realtask.wait(0.05)
	end
	local callback = stateOf(raw).callbacks.OnServerInvoke
	local results
	local done = false
	local thread = coroutine.create(function()
		local res = table.pack(xpcall(callback, function(e)
			return tostring(e) .. "\n" .. debug.traceback("", 2)
		end, wrap(ctx.player), table.unpack(args, 1, n)))
		results = res
		done = true
	end)
	Engine.setThreadCtx(thread, Engine.serverCtx)
	coroutine.resume(thread)
	while not done do
		realtask.wait(0.01)
	end
	if not results[1] then
		record("error", Engine.serverCtx, "OnServerInvoke(" .. raw.Name .. ") a levé une erreur : " .. tostring(results[2]))
		error("Server-side error in " .. raw.Name, 2)
	end
	local out = {}
	for i = 2, results.n do
		out[i - 1] = netCopy(results[i])
	end
	return table.unpack(out, 1, results.n - 1)
end

M("RemoteFunction").InvokeClient = function(self, player, ...)
	requireServer("InvokeClient")
	error("InvokeClient non simulé (à éviter côté serveur)", 2)
end

M("BindableEvent").Fire = function(self, ...)
	local args, n = netCopyArgs(...)
	signalOf(unwrap(self), "Event"):Fire(table.unpack(args, 1, n))
end

M("BindableFunction").Invoke = function(self, ...)
	local cb = stateOf(unwrap(self)).callbacks.OnInvoke
	if not cb then
		error("OnInvoke non défini", 2)
	end
	return cb(...)
end

--------------------------------------------------------------------------
-- DataModel / services de base
--------------------------------------------------------------------------
local dm = M("DataModel")
function dm.BindToClose(_, fn)
	table.insert(Engine.bindToClose, fn)
end
function dm.IsLoaded()
	return true
end
Engine.bindToClose = {}

Engine.GetOverrides.PlaceId = function(raw)
	if raw:IsA("DataModel") then
		return true, 0
	end
	return false
end
Engine.GetOverrides.GameId = Engine.GetOverrides.PlaceId
Engine.GetOverrides.CreatorId = Engine.GetOverrides.PlaceId
Engine.GetOverrides.JobId = function(raw)
	if raw:IsA("DataModel") then
		return true, "sim-job"
	end
	return false
end
Engine.GetOverrides.PrivateServerId = function(raw)
	if raw:IsA("DataModel") then
		return true, ""
	end
	return false
end

-- RunService
local rs = M("RunService")
function rs.IsServer()
	return isServer()
end
function rs.IsClient()
	return not isServer()
end
function rs.IsStudio()
	return true
end
function rs.IsRunning()
	return true
end
function rs.IsRunMode()
	return false
end
function rs.IsEdit()
	return false
end
function rs.BindToRenderStep(_, name, priority, fn)
	requireClient("BindToRenderStep")
	if type(name) ~= "string" or type(priority) ~= "number" or type(fn) ~= "function" then
		error("BindToRenderStep: arguments invalides (name, priority, function)", 2)
	end
	local ctx = currentCtx()
	ctx.renderBinds[name] = { priority = priority, fn = fn }
end
function rs.UnbindFromRenderStep(_, name)
	local ctx = currentCtx()
	if ctx.renderBinds then
		ctx.renderBinds[name] = nil
	end
end

-- Debris
M("Debris").AddItem = function(_, inst, lifetime)
	if not isProxy(inst) then
		error("Debris:AddItem attend une Instance", 2)
	end
	Engine.libs.Task.delay(lifetime or 10, function()
		Engine.destroy(unwrap(inst))
	end)
end

-- TweenService
local ts = M("TweenService")
function ts.Create(_, inst, info, goals)
	if not isProxy(inst) then
		error("TweenService:Create : argument 1 doit être une Instance", 2)
	end
	if type(info) ~= "table" or not info.__TweenInfo then
		error("TweenService:Create : argument 2 doit être un TweenInfo", 2)
	end
	if type(goals) ~= "table" then
		error("TweenService:Create : argument 3 doit être une table", 2)
	end
	for key, value in goals do
		local okGet, current = pcall(function()
			return inst[key]
		end)
		if not okGet then
			error("TweenService:Create : propriété invalide '" .. tostring(key) .. "' sur " .. unwrap(inst).ClassName, 2)
		end
		if typeof(current) ~= typeof(value) and not (type(current) == "number" and type(value) == "number") then
			error(string.format("TweenService:Create : type invalide pour %s (%s attendu, %s reçu)", key, typeof(current), typeof(value)), 2)
		end
	end
	local tween = { PlaybackState = Enum.PlaybackState.Begin, Instance = inst, TweenInfo = info }
	tween.Completed = Signal.new("Completed")
	local token = 0
	function tween.Play(self)
		token += 1
		local my = token
		self.PlaybackState = Enum.PlaybackState.Playing
		local duration = (info.Time or 0) + (info.DelayTime or 0)
		Engine.libs.Task.delay(math.min(duration, 3), function()
			if my ~= token or Engine.stateOf(unwrap(inst)).destroyed then
				return
			end
			for key, value in goals do
				inst[key] = value
			end
			if info.RepeatCount and info.RepeatCount < 0 then
				return
			end
			self.PlaybackState = Enum.PlaybackState.Completed
			self.Completed:Fire(Enum.PlaybackState.Completed)
		end)
	end
	function tween.Cancel(self)
		token += 1
		self.PlaybackState = Enum.PlaybackState.Cancelled
		self.Completed:Fire(Enum.PlaybackState.Cancelled)
	end
	function tween.Pause(self)
		token += 1
		self.PlaybackState = Enum.PlaybackState.Paused
	end
	function tween.Destroy() end
	return tween
end
function ts.GetValue(_, alpha)
	return alpha
end

-- CollectionService
local cs = M("CollectionService")
function cs.AddTag(_, inst, tag)
	local raw = unwrap(inst)
	if not raw:HasTag(tag) then
		raw:AddTag(tag)
		local sig = Engine.stateOf(Engine.serviceRaw("CollectionService")).signals["Added:" .. tag]
		if sig then
			sig:Fire(inst)
		end
	end
end
function cs.RemoveTag(_, inst, tag)
	local raw = unwrap(inst)
	if raw:HasTag(tag) then
		raw:RemoveTag(tag)
		local sig = Engine.stateOf(Engine.serviceRaw("CollectionService")).signals["Removed:" .. tag]
		if sig then
			sig:Fire(inst)
		end
	end
end
function cs.HasTag(_, inst, tag)
	return unwrap(inst):HasTag(tag)
end
function cs.GetTags(_, inst)
	return unwrap(inst):GetTags()
end
function cs.GetTagged(_, tag)
	local out = {}
	for _, d in Engine.gameRaw:GetDescendants() do
		if d:HasTag(tag) and not Engine.stateOf(d).destroyed then
			table.insert(out, wrap(d))
		end
	end
	return out
end
function cs.GetInstanceAddedSignal(_, tag)
	return signalOf(Engine.serviceRaw("CollectionService"), "Added:" .. tag)
end
function cs.GetInstanceRemovedSignal(_, tag)
	return signalOf(Engine.serviceRaw("CollectionService"), "Removed:" .. tag)
end
M("Instance").AddTag = function(self, tag)
	cs.AddTag(nil, self, tag)
end
M("Instance").RemoveTag = function(self, tag)
	cs.RemoveTag(nil, self, tag)
end

-- DataStoreService (mode « place non publiée » par défaut)
Engine.dataStoreMode = "unpublished"
local memoryStores = {}
local function makeStore(name, ordered)
	memoryStores[name] = memoryStores[name] or {}
	local data = memoryStores[name]
	local store = {}
	function store.GetAsync(_, key)
		realtask.wait(0.02)
		return data[key]
	end
	function store.SetAsync(_, key, value)
		netCopy(value)
		data[key] = value
	end
	function store.UpdateAsync(_, key, fn)
		local new = fn(data[key])
		if new ~= nil then
			netCopy(new)
			data[key] = new
		end
		return new
	end
	function store.IncrementAsync(_, key, delta)
		data[key] = (data[key] or 0) + (delta or 1)
		return data[key]
	end
	function store.RemoveAsync(_, key)
		local old = data[key]
		data[key] = nil
		return old
	end
	if ordered then
		function store.GetSortedAsync(_, ascending, pageSize)
			local entries = {}
			for k, v in data do
				table.insert(entries, { key = k, value = v })
			end
			table.sort(entries, function(a, b)
				if ascending then
					return a.value < b.value
				end
				return a.value > b.value
			end)
			local page = {}
			for i = 1, math.min(pageSize or 50, #entries) do
				page[i] = entries[i]
			end
			return {
				IsFinished = true,
				GetCurrentPage = function()
					return page
				end,
				AdvanceToNextPageAsync = function() end,
			}
		end
	end
	return store
end
local dss = M("DataStoreService")
function dss.GetDataStore(_, name)
	requireServer("GetDataStore")
	if Engine.dataStoreMode == "unpublished" then
		error("You must publish this place to the web to access DataStore.", 2)
	end
	return makeStore(name, false)
end
function dss.GetOrderedDataStore(_, name)
	requireServer("GetOrderedDataStore")
	if Engine.dataStoreMode == "unpublished" then
		error("You must publish this place to the web to access DataStore.", 2)
	end
	return makeStore("ordered:" .. name, true)
end
function dss.GetRequestBudgetForRequestType()
	return 100
end

-- MarketplaceService / BadgeService
local mps = M("MarketplaceService")
function mps.UserOwnsGamePassAsync(_, userId, passId)
	if type(userId) ~= "number" or type(passId) ~= "number" then
		error("UserOwnsGamePassAsync: arguments invalides", 2)
	end
	return false
end
function mps.PromptGamePassPurchase() end
function mps.PromptProductPurchase() end
function mps.GetProductInfo()
	return { Name = "Produit", PriceInRobux = 100 }
end
local bs = M("BadgeService")
function bs.UserHasBadgeAsync()
	return false
end
function bs.AwardBadge()
	return true
end
function bs.GetBadgeInfoAsync()
	return { IsEnabled = true }
end

-- HttpService / TextService / GuiService / StarterGui / SoundService
local hs = M("HttpService")
function hs.JSONEncode(_, v)
	return serde.encode("json", v)
end
function hs.JSONDecode(_, s)
	return serde.decode("json", s)
end
local guidCounter = 0
function hs.GenerateGUID(_, braces)
	guidCounter += 1
	local g = string.format("00000000-0000-0000-0000-%012d", guidCounter)
	return if braces == false then g else "{" .. g .. "}"
end
M("TextService").GetTextSize = function(_, text, size, font, frame)
	return Vector2.new(#tostring(text) * (size or 14) * 0.55, size or 14)
end
local gs = M("GuiService")
function gs.GetGuiInset()
	return Vector2.new(0, 58), Vector2.zero
end
function gs.IsTenFootInterface()
	return false
end
Engine.GetOverrides.TopbarInset = function(raw)
	if raw:IsA("GuiService") then
		return true, roblox.Rect.new(0, 0, 1366, 58)
	end
	return false
end
local sg = M("StarterGui")
function sg.SetCoreGuiEnabled(_, coreType, enabled)
	requireClient("SetCoreGuiEnabled")
	if typeof(coreType) ~= "EnumItem" or type(enabled) ~= "boolean" then
		error("SetCoreGuiEnabled: arguments invalides", 2)
	end
end
function sg.GetCoreGuiEnabled()
	return true
end
function sg.SetCore(_, name)
	requireClient("SetCore")
end
function sg.GetCore()
	return nil
end
M("SoundService").PlayLocalSound = function(_, sound)
	if not isProxy(sound) or not unwrap(sound):IsA("Sound") then
		error("PlayLocalSound attend un Sound", 2)
	end
end
local snd = M("Sound")
function snd.Play() end
function snd.Stop() end
function snd.Pause() end
function snd.Resume() end
M("ParticleEmitter").Emit = function(_, n)
	if n ~= nil and type(n) ~= "number" then
		error("ParticleEmitter:Emit attend un nombre", 2)
	end
end
M("ParticleEmitter").Clear = function() end
M("Explosion")

-- Animator
local function makeTrack()
	local track = { IsPlaying = false, Looped = false, Speed = 1, TimePosition = 0, Length = 1 }
	track.Stopped = Signal.new("Stopped")
	track.KeyframeReached = Signal.new("KeyframeReached")
	track.Ended = Signal.new("Ended")
	function track.Play(self)
		self.IsPlaying = true
	end
	function track.Stop(self)
		self.IsPlaying = false
		self.Stopped:Fire()
	end
	function track.AdjustSpeed() end
	function track.AdjustWeight() end
	function track.GetMarkerReachedSignal()
		return Signal.new("Marker")
	end
	function track.Destroy() end
	return track
end
M("Animator").LoadAnimation = function()
	return makeTrack()
end
M("Animator").GetPlayingAnimationTracks = function()
	return {}
end

--------------------------------------------------------------------------
-- Workspace / Terrain / pièces / modèles
--------------------------------------------------------------------------
local ws = M("Workspace")
function ws.Raycast(_, origin, direction, params)
	Engine.stats.raycasts += 1
	return Engine.raycast(origin, direction, params)
end
function ws.Blockcast(_, cf, size, direction, params)
	Engine.stats.raycasts += 1
	return Engine.raycast(cf.Position, direction, params)
end
function ws.Spherecast(_, pos, radius, direction, params)
	Engine.stats.raycasts += 1
	return Engine.raycast(pos, direction, params)
end
function ws.Shapecast(_, part, direction, params)
	return Engine.raycast(unwrap(part).CFrame.Position, direction, params)
end
function ws.GetPartBoundsInBox(_, cf, size, params)
	if typeof(cf) ~= "CFrame" or typeof(size) ~= "Vector3" then
		error("GetPartBoundsInBox(CFrame, Vector3, OverlapParams?)", 2)
	end
	return Engine.partsInBox(cf, size, params)
end
function ws.GetPartBoundsInRadius(_, pos, radius, params)
	if typeof(pos) ~= "Vector3" or type(radius) ~= "number" then
		error("GetPartBoundsInRadius(Vector3, number, OverlapParams?)", 2)
	end
	return Engine.partsInRadius(pos, radius, params)
end
function ws.GetPartsInPart(_, part, params)
	local raw = unwrap(part)
	return Engine.partsInBox(raw.CFrame, raw.Size, params)
end
function ws.GetServerTimeNow()
	return os.clock()
end
function ws.BulkMoveTo(_, parts, cframes)
	for i, part in parts do
		unwrap(part).CFrame = cframes[i]
	end
end
function ws.FindPartOnRay()
	record("warn", currentCtx(), "FindPartOnRay est déprécié")
	return nil
end

Engine.GetOverrides.CurrentCamera = function(raw)
	if raw:IsA("Workspace") then
		local ctx = currentCtx()
		if ctx.kind == "client" then
			return true, wrap(ctx.camera)
		end
		return true, wrap(Engine.serverCamera)
	end
	return false
end
Engine.SetOverrides.CurrentCamera = function(raw, _, value)
	if raw:IsA("Workspace") then
		return true
	end
	return false
end
Engine.GetOverrides.DistributedGameTime = function(raw)
	if raw:IsA("Workspace") then
		return true, os.clock() - Engine.startClock
	end
	return false
end

local terrain = M("Terrain")
local function checkTerrainMaterial(material, fname)
	if typeof(material) ~= "EnumItem" or not tostring(material):find("Enum.Material") then
		error(fname .. " : matériau invalide (" .. tostring(material) .. ")", 3)
	end
	Engine.stats.terrain += 1
end
function terrain.FillBlock(_, cf, size, material)
	if typeof(cf) ~= "CFrame" or typeof(size) ~= "Vector3" then
		error("FillBlock(CFrame, Vector3, Material) : arguments invalides", 2)
	end
	checkTerrainMaterial(material, "FillBlock")
end
function terrain.FillBall(_, center, radius, material)
	if typeof(center) ~= "Vector3" or type(radius) ~= "number" then
		error("FillBall(Vector3, number, Material) : arguments invalides", 2)
	end
	checkTerrainMaterial(material, "FillBall")
end
function terrain.FillCylinder(_, cf, height, radius, material)
	if typeof(cf) ~= "CFrame" or type(height) ~= "number" or type(radius) ~= "number" then
		error("FillCylinder(CFrame, number, number, Material) : arguments invalides", 2)
	end
	checkTerrainMaterial(material, "FillCylinder")
end
function terrain.FillWedge(_, cf, size, material)
	if typeof(cf) ~= "CFrame" or typeof(size) ~= "Vector3" then
		error("FillWedge(CFrame, Vector3, Material) : arguments invalides", 2)
	end
	checkTerrainMaterial(material, "FillWedge")
end
function terrain.FillRegion(_, region, resolution, material)
	checkTerrainMaterial(material, "FillRegion")
end
function terrain.Clear() end
function terrain.ReplaceMaterial() end
function terrain.SetMaterialColor() end

local bp = M("BasePart")
function bp.GetMass()
	return 1
end
function bp.GetPivot(self)
	return unwrap(self).CFrame
end
function bp.PivotTo(self, cf)
	if typeof(cf) ~= "CFrame" then
		error("PivotTo attend un CFrame", 2)
	end
	unwrap(self).CFrame = cf
end
function bp.ApplyImpulse(_, v)
	if typeof(v) ~= "Vector3" then
		error("ApplyImpulse attend un Vector3", 2)
	end
end
function bp.ApplyAngularImpulse() end
function bp.SetNetworkOwner(_, player)
	requireServer("SetNetworkOwner")
end
function bp.SetNetworkOwnershipAuto()
	requireServer("SetNetworkOwnershipAuto")
end
function bp.GetNetworkOwner()
	return nil
end
function bp.CanSetNetworkOwnership()
	return true
end
function bp.GetTouchingParts()
	return {}
end
function bp.GetConnectedParts(self)
	return { self }
end
function bp.GetRootPart(self)
	return self
end
function bp.GetVelocityAtPosition()
	return Vector3.zero
end

local model = M("Model")
local function modelParts(raw)
	local list = {}
	for _, d in raw:GetDescendants() do
		if d:IsA("BasePart") then
			table.insert(list, d)
		end
	end
	return list
end
function model.GetPivot(self)
	local raw = unwrap(self)
	if raw.PrimaryPart then
		return raw.PrimaryPart.CFrame
	end
	local parts = modelParts(raw)
	if #parts == 0 then
		return CFrame.new()
	end
	local sum = Vector3.zero
	for _, p in parts do
		sum += p.CFrame.Position
	end
	return CFrame.new(sum / #parts)
end
function model.PivotTo(self, cf)
	if typeof(cf) ~= "CFrame" then
		error("PivotTo attend un CFrame", 2)
	end
	local raw = unwrap(self)
	local pivot = model.GetPivot(self)
	for _, p in modelParts(raw) do
		p.CFrame = cf * pivot:ToObjectSpace(p.CFrame)
	end
end
model.SetPrimaryPartCFrame = model.PivotTo
function model.GetBoundingBox(self)
	local parts = modelParts(unwrap(self))
	if #parts == 0 then
		return CFrame.new(), Vector3.zero
	end
	local minV = Vector3.new(math.huge, math.huge, math.huge)
	local maxV = -minV
	for _, p in parts do
		local h = p.Size / 2
		for _, sx in { -1, 1 } do
			for _, sy in { -1, 1 } do
				for _, sz in { -1, 1 } do
					local w = p.CFrame:PointToWorldSpace(Vector3.new(h.X * sx, h.Y * sy, h.Z * sz))
					minV = minV:Min(w)
					maxV = maxV:Max(w)
				end
			end
		end
	end
	return CFrame.new((minV + maxV) / 2), maxV - minV
end
function model.GetExtentsSize(self)
	local _, size = model.GetBoundingBox(self)
	return size
end
function model.MoveTo(self, pos)
	model.PivotTo(self, CFrame.new(pos))
end
function model.GetScale()
	return 1
end
function model.ScaleTo() end
function model.TranslateBy(self, delta)
	model.PivotTo(self, model.GetPivot(self) + delta)
end

-- Caméra
local cam = M("Camera")
local function cameraRay(self, x, y, depth)
	local raw = unwrap(self)
	local cf = raw.CFrame
	local fov = math.rad(raw.FieldOfView)
	local h = math.tan(fov / 2)
	local aspect = Engine.VIEWPORT.X / Engine.VIEWPORT.Y
	local nx = (x / Engine.VIEWPORT.X) * 2 - 1
	local ny = 1 - (y / Engine.VIEWPORT.Y) * 2
	local dirLocal = Vector3.new(nx * h * aspect, ny * h, -1).Unit
	local dir = cf:VectorToWorldSpace(dirLocal)
	return roblox.Ray.new(cf.Position, dir * (depth or 1))
end
function cam.ViewportPointToRay(self, x, y, depth)
	if type(x) ~= "number" or type(y) ~= "number" then
		error("ViewportPointToRay(number, number)", 2)
	end
	return cameraRay(self, x, y, depth)
end
function cam.ScreenPointToRay(self, x, y, depth)
	return cameraRay(self, x, y + 58, depth)
end
local function project(self, pos)
	local raw = unwrap(self)
	local localPos = raw.CFrame:PointToObjectSpace(pos)
	local depth = -localPos.Z
	local h = math.tan(math.rad(raw.FieldOfView) / 2)
	local aspect = Engine.VIEWPORT.X / Engine.VIEWPORT.Y
	if depth <= 0 then
		return Vector3.new(0, 0, depth), false
	end
	local nx = localPos.X / (depth * h * aspect)
	local ny = localPos.Y / (depth * h)
	local x = (nx + 1) / 2 * Engine.VIEWPORT.X
	local y = (1 - ny) / 2 * Engine.VIEWPORT.Y
	return Vector3.new(x, y, depth), math.abs(nx) <= 1 and math.abs(ny) <= 1
end
function cam.WorldToViewportPoint(self, pos)
	if typeof(pos) ~= "Vector3" then
		error("WorldToViewportPoint attend un Vector3", 2)
	end
	return project(self, pos)
end
function cam.WorldToScreenPoint(self, pos)
	local v, on = project(self, pos)
	return Vector3.new(v.X, v.Y - 58, v.Z), on
end
function cam.GetPartsObscuringTarget()
	return {}
end
function cam.ZoomToExtents() end
Engine.GetOverrides.ViewportSize = function(raw)
	if raw:IsA("Camera") then
		return true, Engine.VIEWPORT
	end
	return false
end
Engine.VIEWPORT = Vector2.new(1366, 768)

-- GUI : tailles absolues approximatives
local function absSize(raw)
	if raw:IsA("ScreenGui") or raw:IsA("PlayerGui") then
		return Engine.VIEWPORT
	end
	if raw:IsA("SurfaceGui") then
		return Vector2.new(800, 600)
	end
	if raw:IsA("BillboardGui") then
		local s = raw.Size
		return Vector2.new(s.X.Offset, s.Y.Offset)
	end
	if not raw:IsA("GuiObject") then
		return Engine.VIEWPORT
	end
	local parent = raw.Parent
	local ps = if parent then absSize(parent) else Engine.VIEWPORT
	local s = raw.Size
	return Vector2.new(ps.X * s.X.Scale + s.X.Offset, ps.Y * s.Y.Scale + s.Y.Offset)
end
local function absPos(raw)
	if not raw:IsA("GuiObject") then
		return Vector2.zero
	end
	local parent = raw.Parent
	local pp = if parent then absPos(parent) else Vector2.zero
	local ps = if parent then absSize(parent) else Engine.VIEWPORT
	local p = raw.Position
	local size = absSize(raw)
	local ap = raw.AnchorPoint
	return pp + Vector2.new(ps.X * p.X.Scale + p.X.Offset - size.X * ap.X, ps.Y * p.Y.Scale + p.Y.Offset - size.Y * ap.Y)
end
Engine.GetOverrides.AbsoluteSize = function(raw)
	if raw:IsA("GuiBase2d") then
		return true, absSize(raw)
	end
	return false
end
Engine.GetOverrides.AbsolutePosition = function(raw)
	if raw:IsA("GuiBase2d") then
		return true, absPos(raw)
	end
	return false
end
Engine.GetOverrides.AbsoluteCanvasSize = Engine.GetOverrides.AbsoluteSize
Engine.GetOverrides.AbsoluteWindowSize = Engine.GetOverrides.AbsoluteSize
Engine.GetOverrides.AbsoluteRotation = function(raw)
	if raw:IsA("GuiObject") then
		return true, 0
	end
	return false
end
Engine.GetOverrides.TextBounds = function(raw)
	if raw:IsA("TextLabel") or raw:IsA("TextButton") or raw:IsA("TextBox") then
		return true, Vector2.new(#raw.Text * 8, raw.TextSize)
	end
	return false
end
local guiObj = M("GuiObject")
function guiObj.TweenPosition()
	return true
end
function guiObj.TweenSize()
	return true
end
function guiObj.TweenSizeAndPosition()
	return true
end
M("ScrollingFrame").ScrollToTop = function() end
M("TextBox").CaptureFocus = function() end
M("TextBox").ReleaseFocus = function() end
M("TextBox").IsFocused = function()
	return false
end
M("GuiButton")
M("ViewportFrame")
M("Highlight")

-- Mouse
function Engine.makeMouse()
	local mouse = {
		Hit = CFrame.new(),
		Target = nil,
		X = Engine.VIEWPORT.X / 2,
		Y = Engine.VIEWPORT.Y / 2,
		Icon = "",
		TargetFilter = nil,
		UnitRay = roblox.Ray.new(Vector3.zero, Vector3.new(0, 0, -1)),
		ViewSizeX = Engine.VIEWPORT.X,
		ViewSizeY = Engine.VIEWPORT.Y,
	}
	for _, name in { "Button1Down", "Button1Up", "Button2Down", "Button2Up", "Move", "WheelForward", "WheelBackward", "Idle", "KeyDown", "KeyUp" } do
		mouse[name] = Signal.new(name)
	end
	return mouse
end

--------------------------------------------------------------------------
-- UserInputService / ContextActionService (par client)
--------------------------------------------------------------------------
local uisProps = {
	TouchEnabled = false,
	KeyboardEnabled = true,
	MouseEnabled = true,
	GamepadEnabled = false,
	AccelerometerEnabled = false,
	GyroscopeEnabled = false,
	VREnabled = false,
	MouseIconEnabled = true,
	MouseDeltaSensitivity = 1,
	MouseBehavior = Enum.MouseBehavior.Default,
	ModalEnabled = false,
	OnScreenKeyboardVisible = false,
	PreferredInput = nil,
}
for key, default in uisProps do
	local prevGet = Engine.GetOverrides[key]
	Engine.GetOverrides[key] = function(raw, p)
		if raw:IsA("UserInputService") then
			local ctx = currentCtx()
			ctx.uis = ctx.uis or {}
			local v = ctx.uis[key]
			if v == nil then
				v = (ctx.uisDefaults and ctx.uisDefaults[key])
				if v == nil then
					v = default
				end
			end
			return true, v
		end
		if prevGet then
			return prevGet(raw, p)
		end
		return false
	end
	local prevSet = Engine.SetOverrides[key]
	Engine.SetOverrides[key] = function(raw, p, value)
		if raw:IsA("UserInputService") then
			local ctx = currentCtx()
			if ctx.kind ~= "client" then
				error("UserInputService." .. key .. " ne peut être modifié que côté client", 3)
			end
			if typeof(default) ~= "nil" and typeof(value) ~= typeof(default) then
				error("UserInputService." .. key .. " : type invalide " .. typeof(value), 3)
			end
			ctx.uis = ctx.uis or {}
			ctx.uis[key] = value
			return true
		end
		if prevSet then
			return prevSet(raw, p, value)
		end
		return false
	end
end

local uis = M("UserInputService")
function uis.GetMouseLocation()
	return Engine.VIEWPORT / 2
end
function uis.GetMouseDelta()
	return Vector2.zero
end
function uis.IsKeyDown(_, key)
	local ctx = currentCtx()
	return ctx.keysDown ~= nil and ctx.keysDown[key] == true
end
function uis.IsMouseButtonPressed(_, button)
	local ctx = currentCtx()
	return ctx.keysDown ~= nil and ctx.keysDown[button] == true
end
function uis.GetKeysPressed()
	return {}
end
function uis.GetLastInputType()
	return Enum.UserInputType.MouseMovement
end
function uis.GetFocusedTextBox()
	return nil
end
function uis.GetGamepadConnected()
	return false
end
function uis.GetConnectedGamepads()
	return {}
end
function uis.GetNavigationGamepads()
	return {}
end
function uis.GetStringForKeyCode(_, key)
	return tostring(key):gsub("Enum.KeyCode.", "")
end
function uis.GetImageForKeyCode()
	return ""
end

-- Les événements UIS sont propres à chaque client : on filtre par contexte au déclenchement.
local cas = M("ContextActionService")
local function bindAction(ctx, name, fn, touch, priority, inputs)
	if type(name) ~= "string" or type(fn) ~= "function" then
		error("BindAction(name: string, fn: function, createTouchButton: boolean, ...inputs)", 3)
	end
	for _, input in inputs do
		if typeof(input) ~= "EnumItem" then
			error("BindAction : entrée invalide " .. tostring(input), 3)
		end
	end
	ctx.actions[name] = { fn = fn, inputs = inputs, priority = priority or 2000, touch = touch }
end
function cas.BindAction(_, name, fn, touch, ...)
	requireClient("BindAction")
	bindAction(currentCtx(), name, fn, touch, nil, { ... })
end
function cas.BindActionAtPriority(_, name, fn, touch, priority, ...)
	requireClient("BindActionAtPriority")
	bindAction(currentCtx(), name, fn, touch, priority, { ... })
end
function cas.UnbindAction(_, name)
	local ctx = currentCtx()
	if ctx.actions then
		ctx.actions[name] = nil
	end
end
function cas.UnbindAllActions()
	currentCtx().actions = {}
end
function cas.SetTitle() end
function cas.SetImage() end
function cas.SetDescription() end
function cas.SetPosition(_, name, pos)
	if typeof(pos) ~= "UDim2" then
		error("SetPosition attend un UDim2", 2)
	end
end
function cas.GetButton()
	return nil
end
function cas.GetBoundActionInfo(_, name)
	local a = currentCtx().actions[name]
	return a and { priority = a.priority } or {}
end
function cas.GetAllBoundActionInfo()
	local out = {}
	for name, a in currentCtx().actions do
		out[name] = { priority = a.priority }
	end
	return out
end

--------------------------------------------------------------------------
-- Players / Player / Humanoid / personnages
--------------------------------------------------------------------------
local players = M("Players")
function players.GetPlayers()
	local out = {}
	for _, p in Engine.players do
		table.insert(out, wrap(p))
	end
	return out
end
function players.GetPlayerFromCharacter(_, character)
	if character == nil then
		return nil
	end
	local raw = unwrap(character)
	for _, p in Engine.players do
		if p.Character == raw then
			return wrap(p)
		end
	end
	return nil
end
function players.GetPlayerByUserId(_, id)
	for _, p in Engine.players do
		if p.UserId == id then
			return wrap(p)
		end
	end
	return nil
end
function players.GetNameFromUserIdAsync(_, id)
	if type(id) ~= "number" then
		error("GetNameFromUserIdAsync attend un nombre", 2)
	end
	return "Joueur" .. id
end
function players.GetUserIdFromNameAsync()
	return 1
end
function players.GetUserThumbnailAsync(_, id, thumbType, size)
	if type(id) ~= "number" or typeof(thumbType) ~= "EnumItem" or typeof(size) ~= "EnumItem" then
		error("GetUserThumbnailAsync(userId, ThumbnailType, ThumbnailSize)", 2)
	end
	return "rbxthumb://type=AvatarHeadShot&id=" .. id .. "&w=150&h=150", true
end
function players.GetHumanoidDescriptionFromUserId()
	return wrap(roblox.Instance.new("HumanoidDescription"))
end
function players.CreateHumanoidModelFromUserId()
	return Engine.buildCharacter("Avatar", CFrame.new())
end
function players.GetFriendsAsync()
	return { GetCurrentPage = function()
		return {}
	end, IsFinished = true }
end
Engine.GetOverrides.LocalPlayer = function(raw)
	if raw:IsA("Players") then
		local ctx = currentCtx()
		if ctx.kind == "client" then
			return true, wrap(ctx.player)
		end
		return true, nil
	end
	return false
end

local playerM = M("Player")
function playerM.LoadCharacter(self)
	requireServer("LoadCharacter")
	Engine.loadCharacter(unwrap(self))
end
playerM.LoadCharacterAsync = playerM.LoadCharacter
function playerM.Kick(self, msg)
	local raw = unwrap(self)
	record("warn", currentCtx(), "KICK " .. raw.Name .. " : " .. tostring(msg))
	Engine.removePlayer(raw)
end
function playerM.GetMouse(self)
	local ctx = currentCtx()
	ctx.mouse = ctx.mouse or Engine.makeMouse()
	return ctx.mouse
end
function playerM.IsInGroup()
	return false
end
function playerM.GetRankInGroup()
	return 0
end
function playerM.GetRoleInGroup()
	return "Guest"
end
function playerM.HasAppearanceLoaded()
	return true
end
function playerM.ClearCharacterAppearance() end
function playerM.DistanceFromCharacter(self, pos)
	local c = unwrap(self).Character
	local root = c and c:FindFirstChild("HumanoidRootPart")
	return if root then (root.CFrame.Position - pos).Magnitude else 0
end
function playerM.GetFriendsOnline()
	return {}
end
function playerM.IsFriendsWith()
	return false
end
function playerM.GetNetworkPing()
	return 0.05
end

local hum = M("Humanoid")
function hum.TakeDamage(self, amount)
	if type(amount) ~= "number" then
		error("TakeDamage attend un nombre", 2)
	end
	local raw = unwrap(self)
	local character = raw.Parent
	if character and character:FindFirstChildOfClass("ForceField") then
		return
	end
	self.Health = raw.Health - amount
end
function hum.EquipTool(self, tool)
	local raw = unwrap(self)
	local rawTool = unwrap(tool)
	if typeof(rawTool) ~= "Instance" or not rawTool:IsA("Tool") then
		error("EquipTool attend un Tool", 2)
	end
	local character = raw.Parent
	if not character then
		return
	end
	if rawTool.Parent == character then
		return
	end
	local owner = characterOwner(character)
	for _, child in character:GetChildren() do
		if child:IsA("Tool") then
			local backpack = owner and owner:FindFirstChildOfClass("Backpack")
			wrap(child).Parent = backpack and wrap(backpack) or nil
		end
	end
	tool.Parent = wrap(character)
end
function hum.UnequipTools(self)
	local raw = unwrap(self)
	local character = raw.Parent
	if not character then
		return
	end
	local owner = characterOwner(character)
	local backpack = owner and owner:FindFirstChildOfClass("Backpack")
	for _, child in character:GetChildren() do
		if child:IsA("Tool") then
			wrap(child).Parent = backpack and wrap(backpack) or nil
		end
	end
end
function hum.GetState(self)
	local s = stateOf(unwrap(self))
	return s.humState or (if s.dead then Enum.HumanoidStateType.Dead else Enum.HumanoidStateType.Running)
end
function hum.ChangeState(self, st)
	if typeof(st) ~= "EnumItem" then
		error("ChangeState attend un HumanoidStateType", 2)
	end
	stateOf(unwrap(self)).humState = st
end
function hum.SetStateEnabled(_, st, enabled)
	if typeof(st) ~= "EnumItem" or type(enabled) ~= "boolean" then
		error("SetStateEnabled(HumanoidStateType, boolean)", 2)
	end
end
function hum.GetStateEnabled()
	return true
end
function hum.MoveTo() end
function hum.Move() end
function hum.LoadAnimation()
	record("warn", currentCtx(), "Humanoid:LoadAnimation est déprécié (utiliser Animator)")
	return makeTrack()
end
function hum.GetPlayingAnimationTracks()
	return {}
end
function hum.ApplyDescription() end
function hum.GetAppliedDescription()
	return wrap(roblox.Instance.new("HumanoidDescription"))
end
function hum.BuildRigFromAttachments() end
function hum.GetLimb()
	return Enum.Limb.Unknown
end
function hum.GetBodyPartR15()
	return Enum.BodyPartR15.Unknown
end
function hum.GetAccessories(self)
	local out = {}
	local character = unwrap(self).Parent
	if character then
		for _, c in character:GetChildren() do
			if c:IsA("Accessory") then
				table.insert(out, wrap(c))
			end
		end
	end
	return out
end
function hum.RemoveAccessories() end
function hum.AddAccessory(self, acc)
	acc.Parent = wrap(unwrap(self).Parent)
end

M("Tool").Activate = function(self)
	Engine.signalOf(unwrap(self), "Activated"):Fire()
end
M("Tool").Deactivate = function(self)
	Engine.signalOf(unwrap(self), "Deactivated"):Fire()
end

-- Construction d'un rig R15 complet (pièces, Motor6D, attachments)
local R15 = {
	{ "HumanoidRootPart", Vector3.new(2, 2, 1), CFrame.new(0, 0, 0) },
	{ "LowerTorso", Vector3.new(2, 0.4, 1), CFrame.new(0, -0.2, 0) },
	{ "UpperTorso", Vector3.new(2, 1.6, 1), CFrame.new(0, 0.8, 0) },
	{ "Head", Vector3.new(1.2, 1.2, 1.2), CFrame.new(0, 2.2, 0) },
	{ "LeftUpperArm", Vector3.new(1, 1.2, 1), CFrame.new(-1.5, 1, 0) },
	{ "LeftLowerArm", Vector3.new(1, 1, 1), CFrame.new(-1.5, 0, 0) },
	{ "LeftHand", Vector3.new(1, 0.4, 1), CFrame.new(-1.5, -0.7, 0) },
	{ "RightUpperArm", Vector3.new(1, 1.2, 1), CFrame.new(1.5, 1, 0) },
	{ "RightLowerArm", Vector3.new(1, 1, 1), CFrame.new(1.5, 0, 0) },
	{ "RightHand", Vector3.new(1, 0.4, 1), CFrame.new(1.5, -0.7, 0) },
	{ "LeftUpperLeg", Vector3.new(1, 1.2, 1), CFrame.new(-0.5, -1, 0) },
	{ "LeftLowerLeg", Vector3.new(1, 1.2, 1), CFrame.new(-0.5, -2, 0) },
	{ "LeftFoot", Vector3.new(1, 0.4, 1), CFrame.new(-0.5, -2.8, 0) },
	{ "RightUpperLeg", Vector3.new(1, 1.2, 1), CFrame.new(0.5, -1, 0) },
	{ "RightLowerLeg", Vector3.new(1, 1.2, 1), CFrame.new(0.5, -2, 0) },
	{ "RightFoot", Vector3.new(1, 0.4, 1), CFrame.new(0.5, -2.8, 0) },
}
local JOINTS = {
	{ "Root", "LowerTorso", "HumanoidRootPart" },
	{ "Waist", "UpperTorso", "LowerTorso" },
	{ "Neck", "Head", "UpperTorso" },
	{ "LeftShoulder", "LeftUpperArm", "UpperTorso" },
	{ "LeftElbow", "LeftLowerArm", "LeftUpperArm" },
	{ "LeftWrist", "LeftHand", "LeftLowerArm" },
	{ "RightShoulder", "RightUpperArm", "UpperTorso" },
	{ "RightElbow", "RightLowerArm", "RightUpperArm" },
	{ "RightWrist", "RightHand", "RightLowerArm" },
	{ "LeftHip", "LeftUpperLeg", "LowerTorso" },
	{ "LeftKnee", "LeftLowerLeg", "LeftUpperLeg" },
	{ "LeftAnkle", "LeftFoot", "LeftLowerLeg" },
	{ "RightHip", "RightUpperLeg", "LowerTorso" },
	{ "RightKnee", "RightLowerLeg", "RightUpperLeg" },
	{ "RightAnkle", "RightFoot", "RightLowerLeg" },
}

function Engine.buildCharacter(name, rootCFrame)
	local character = roblox.Instance.new("Model")
	character.Name = name
	local parts = {}
	for _, def in R15 do
		local part = roblox.Instance.new("Part")
		part.Name = def[1]
		part.Size = def[2]
		part.CFrame = rootCFrame * def[3]
		part.Anchored = false
		part.CanCollide = def[1] ~= "HumanoidRootPart"
		part.Transparency = if def[1] == "HumanoidRootPart" then 1 else 0
		part.Parent = character
		parts[def[1]] = part
	end
	for _, j in JOINTS do
		local motor = roblox.Instance.new("Motor6D")
		motor.Name = j[1]
		motor.Part0 = parts[j[3]]
		motor.Part1 = parts[j[2]]
		motor.C0 = parts[j[3]].CFrame:ToObjectSpace(parts[j[2]].CFrame)
		motor.C1 = CFrame.new()
		motor.Parent = parts[j[2]]
	end
	local function attach(partName, attName, cf)
		local a = roblox.Instance.new("Attachment")
		a.Name = attName
		a.CFrame = cf
		a.Parent = parts[partName]
	end
	attach("RightHand", "RightGripAttachment", CFrame.new(0, -0.15, 0) * CFrame.Angles(-math.pi / 2, 0, 0))
	attach("LeftHand", "LeftGripAttachment", CFrame.new(0, -0.15, 0) * CFrame.Angles(-math.pi / 2, 0, 0))
	attach("Head", "HatAttachment", CFrame.new(0, 0.6, 0))
	attach("Head", "FaceFrontAttachment", CFrame.new(0, 0, -0.6))
	attach("HumanoidRootPart", "RootAttachment", CFrame.new())
	attach("UpperTorso", "BodyFrontAttachment", CFrame.new(0, 0, -0.5))
	attach("LeftUpperArm", "LeftShoulderRigAttachment", CFrame.new(0, 0.4, 0))
	attach("LeftHand", "LeftWristRigAttachment", CFrame.new(0, 0.1, 0))
	local humanoid = roblox.Instance.new("Humanoid")
	humanoid.MaxHealth = 100
	humanoid.Health = 100
	humanoid.WalkSpeed = 16
	humanoid.RigType = Enum.HumanoidRigType.R15
	humanoid.Parent = character
	local animator = roblox.Instance.new("Animator")
	animator.Parent = humanoid
	character.PrimaryPart = parts.HumanoidRootPart
	return wrap(character)
end

local playerContexts = {} -- debugId -> ctx
function Engine._registerClient(raw, ctx)
	playerContexts[raw:GetDebugId()] = ctx
end
function Engine.clientOf(rawPlayer)
	return playerContexts[rawPlayer:GetDebugId()]
end

function Engine.onHumanoidDied(rawHumanoid)
	-- rien de plus : Roblox ne fait pas réapparaître si CharacterAutoLoads = false
end

function Engine.loadCharacter(rawPlayer)
	if not table.find(Engine.players, rawPlayer) then
		error("LoadCharacter sur un joueur parti", 3)
	end
	local playerP = wrap(rawPlayer)
	local old = rawPlayer.Character
	if old then
		signalOf(rawPlayer, "CharacterRemoving"):Fire(wrap(old))
		Engine.destroy(old)
	end
	-- Backpack recréé à chaque apparition
	local oldBackpack = rawPlayer:FindFirstChildOfClass("Backpack")
	if oldBackpack then
		Engine.destroy(oldBackpack)
	end
	local backpack = roblox.Instance.new("Backpack")
	wrap(backpack).Parent = playerP
	-- PlayerGui : les ScreenGui avec ResetOnSpawn = true sont détruits
	local playerGui = rawPlayer:FindFirstChildOfClass("PlayerGui")
	if playerGui then
		for _, gui in playerGui:GetChildren() do
			if gui:IsA("LayerCollector") and gui.ResetOnSpawn ~= false then
				Engine.resetGuis = (Engine.resetGuis or 0) + 1
				record("warn", Engine.serverCtx, "ResetOnSpawn : ScreenGui '" .. gui.Name .. "' détruit à l'apparition de " .. rawPlayer.Name)
				Engine.destroy(gui)
			end
		end
	end
	-- point d'apparition
	local spawnCf = CFrame.new(0, 5, 0)
	local location = rawPlayer.RespawnLocation
	local spawns = {}
	for _, d in Engine.workspaceRaw:GetDescendants() do
		if d:IsA("SpawnLocation") and d.Enabled then
			table.insert(spawns, d)
		end
	end
	if not location and #spawns > 0 then
		location = spawns[math.random(1, #spawns)]
	end
	local duration = 0
	if location then
		spawnCf = location.CFrame * CFrame.new(0, location.Size.Y / 2 + 3, 0)
		duration = location.Duration
	end
	local character = Engine.buildCharacter(rawPlayer.Name, spawnCf)
	rawPlayer.Character = unwrap(character)
	character.Parent = wrap(Engine.workspaceRaw)
	if duration > 0 then
		local ff = roblox.Instance.new("ForceField")
		wrap(ff).Parent = character
		Engine.libs.Task.delay(duration, function()
			Engine.destroy(ff)
		end)
	end
	Engine.firePropertyChanged(rawPlayer, "Character")
	signalOf(rawPlayer, "CharacterAdded"):Fire(character)
	Engine.libs.Task.delay(0.1, function()
		signalOf(rawPlayer, "CharacterAppearanceLoaded"):Fire(character)
	end)
	Engine.stats.spawns = (Engine.stats.spawns or 0) + 1
	return character
end

function Engine.serviceRaw(name)
	return Engine.gameRaw:GetService(name)
end

function Engine.setThreadCtx(thread, ctx)
	Engine._threadCtxSetter(thread, ctx)
end

return Services
