--!nocheck
-- Mini moteur Roblox « headless » au-dessus de Lune : exécute les vrais scripts du jeu
-- (serveur + plusieurs clients dans le même DataModel) pour détecter les erreurs d'exécution.
-- Les instances sont de vraies instances Lune (noms/types de propriétés validés),
-- enveloppées dans des proxys qui ajoutent événements, méthodes manquantes et synchronisations.
local roblox = require("@lune/roblox")
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local realtask = require("@lune/task")
local serde = require("@lune/serde")

local Engine = {}
Engine.errors = {}
Engine.warnings = {}
Engine.log = {}
Engine.verbose = false
Engine.startClock = os.clock()

local db = roblox.getReflectionDatabase()
local RInstance = roblox.Instance
local Vector3, Vector2, CFrame, Color3 = roblox.Vector3, roblox.Vector2, roblox.CFrame, roblox.Color3
local Enum = roblox.Enum

local VIEWPORT = Vector2.new(1366, 768)

--------------------------------------------------------------------------
-- Contexte d'exécution (serveur / client X) suivi par thread
--------------------------------------------------------------------------
local threadCtx = setmetatable({}, { __mode = "k" })
Engine.serverCtx = { kind = "server", name = "SERVER", moduleCache = {}, shared = {} }
Engine.clients = {}

local function currentCtx()
	return threadCtx[coroutine.running()] or Engine.serverCtx
end
Engine.currentCtx = currentCtx

local function ctxName(ctx)
	return ctx and ctx.name or "?"
end

local function record(kind, ctx, message)
	local list = if kind == "error" then Engine.errors else Engine.warnings
	table.insert(list, { ctx = ctxName(ctx), message = tostring(message), t = os.clock() - Engine.startClock })
	if Engine.verbose or kind == "error" then
		print(string.format("[%s][%s] %s", kind:upper(), ctxName(ctx), tostring(message)))
	end
end
Engine.record = record

local function traceback(err)
	return tostring(err) .. "\n" .. debug.traceback("", 2)
end

-- Lance fn dans un nouveau thread avec le contexte donné ; capture les erreurs comme Roblox.
local function spawnIn(ctx, fn, ...)
	local thread = coroutine.create(function(...)
		local ok, err = xpcall(fn, traceback, ...)
		if not ok then
			record("error", ctx, err)
		end
	end)
	threadCtx[thread] = ctx
	realtask.spawn(thread, ...)
	return thread
end
Engine.spawnIn = spawnIn

local function makeThread(ctx, fn)
	local thread = coroutine.create(function(...)
		local ok, err = xpcall(fn, traceback, ...)
		if not ok then
			record("error", ctx, err)
		end
	end)
	threadCtx[thread] = ctx
	return thread
end

local Task = {}
function Task.spawn(f, ...)
	if type(f) == "thread" then
		return realtask.spawn(f, ...)
	end
	return spawnIn(currentCtx(), f, ...)
end
function Task.defer(f, ...)
	if type(f) == "thread" then
		return realtask.defer(f, ...)
	end
	local thread = makeThread(currentCtx(), f)
	realtask.defer(thread, ...)
	return thread
end
function Task.delay(t, f, ...)
	if type(f) == "thread" then
		return realtask.delay(t or 0, f, ...)
	end
	local thread = makeThread(currentCtx(), f)
	realtask.delay(t or 0, thread, ...)
	return thread
end
function Task.wait(t)
	return realtask.wait(t)
end
function Task.cancel(thread)
	pcall(realtask.cancel, thread)
end
function Task.synchronize() end
function Task.desynchronize() end

--------------------------------------------------------------------------
-- Signaux
--------------------------------------------------------------------------
local Signal = {}
Signal.__index = Signal

function Signal.new(name)
	return setmetatable({ conns = {}, waiting = {}, name = name }, Signal)
end

function Signal:Connect(fn)
	if type(fn) ~= "function" then
		error("Attempt to connect failed: Passed value is not a function", 2)
	end
	local conn = { fn = fn, ctx = currentCtx(), Connected = true }
	function conn.Disconnect()
		conn.Connected = false
	end
	conn.disconnect = conn.Disconnect
	table.insert(self.conns, conn)
	if self.onConnect then
		self.onConnect(conn)
	end
	return conn
end
Signal.connect = Signal.Connect
Signal.ConnectParallel = Signal.Connect

function Signal:Once(fn)
	local conn
	conn = self:Connect(function(...)
		if conn.Connected then
			conn.Disconnect()
			fn(...)
		end
	end)
	return conn
end

function Signal:Wait()
	local thread = coroutine.running()
	table.insert(self.waiting, thread)
	return coroutine.yield()
end
Signal.wait = Signal.Wait

-- filter(conn) -> bool : pour les remotes (FireClient ne touche que le bon client)
function Signal:Fire(...)
	return self:FireFiltered(nil, ...)
end

function Signal:FireFiltered(filter, ...)
	local fired = 0
	for _, conn in table.clone(self.conns) do
		if conn.Connected and (filter == nil or filter(conn)) then
			fired += 1
			spawnIn(conn.ctx, conn.fn, ...)
		end
	end
	if filter == nil then
		local waiting = self.waiting
		self.waiting = {}
		for _, thread in waiting do
			realtask.spawn(thread, ...)
		end
	end
	return fired
end

function Signal:HasConnections()
	for _, conn in self.conns do
		if conn.Connected then
			return true
		end
	end
	return #self.waiting > 0
end

Engine.Signal = Signal

--------------------------------------------------------------------------
-- Proxys d'instances
--------------------------------------------------------------------------
local proxies = {} -- debugId -> proxy
local rawOf = setmetatable({}, { __mode = "k" }) -- proxy -> raw
local states = {} -- debugId -> état simulé

local ProxyMT = {}

local function isProxy(v)
	return type(v) == "table" and rawOf[v] ~= nil
end
Engine.isProxy = isProxy

local function idOf(raw)
	return raw:GetDebugId()
end

local function wrap(v)
	if typeof(v) == "Instance" then
		local id = idOf(v)
		local p = proxies[id]
		if not p then
			p = setmetatable({}, ProxyMT)
			rawOf[p] = v
			proxies[id] = p
		end
		return p
	end
	return v
end
Engine.wrap = wrap

local function unwrap(v)
	if type(v) == "table" then
		local r = rawOf[v]
		if r then
			return r
		end
	end
	return v
end
Engine.unwrap = unwrap

local function stateOf(raw)
	local id = idOf(raw)
	local s = states[id]
	if not s then
		s = { signals = {}, props = {}, callbacks = {} }
		states[id] = s
	end
	return s
end
Engine.stateOf = stateOf

local function signalOf(raw, name)
	local s = stateOf(raw)
	local sig = s.signals[name]
	if not sig then
		sig = Signal.new(name)
		s.signals[name] = sig
	end
	return sig
end
Engine.signalOf = signalOf

local function existingSignal(raw, name)
	local s = states[idOf(raw)]
	return s and s.signals[name]
end

local function fireIf(raw, name, ...)
	local sig = existingSignal(raw, name)
	if sig then
		sig:Fire(...)
	end
end

local function wrapList(list)
	local out = table.create(#list)
	for i, v in list do
		out[i] = wrap(v)
	end
	return out
end

local function unwrapArgs(...)
	local n = select("#", ...)
	local args = { ... }
	for i = 1, n do
		args[i] = unwrap(args[i])
	end
	return table.unpack(args, 1, n)
end

local function wrapResults(...)
	local n = select("#", ...)
	local res = { ... }
	for i = 1, n do
		local v = res[i]
		if type(v) == "table" and not isProxy(v) then
			local isList = true
			for k, item in v do
				if typeof(item) ~= "Instance" then
					isList = false
					break
				end
			end
			if isList then
				res[i] = wrapList(v)
			end
		else
			res[i] = wrap(v)
		end
	end
	return table.unpack(res, 1, n)
end

-- Valeur par défaut (zéro typé) d'après la base de réflexion, quand Lune n'en a pas.
local function findPropertyDef(className, prop)
	local cls = db:GetClass(className)
	while cls do
		local def = cls.Properties[prop]
		if def then
			return def
		end
		if not cls.Superclass then
			return nil
		end
		cls = db:GetClass(cls.Superclass)
	end
	return nil
end

local ZERO = {
	Bool = false,
	Float32 = 0,
	Float64 = 0,
	Int32 = 0,
	Int64 = 0,
	String = "",
	Content = "",
	Vector3 = Vector3.zero,
	Vector2 = Vector2.zero,
	CFrame = CFrame.new(),
	Color3 = Color3.new(1, 1, 1),
	UDim = roblox.UDim.new(),
	UDim2 = roblox.UDim2.new(),
	NumberRange = roblox.NumberRange.new(0),
	Rect = roblox.Rect.new(0, 0, 0, 0),
}

local SPECIAL_DEFAULTS = {
	Health = 100,
	MaxHealth = 100,
	WalkSpeed = 16,
	JumpPower = 50,
	JumpHeight = 7.2,
	HipHeight = 2,
	AutoRotate = true,
	AbsoluteSize = Vector2.new(200, 50),
	AbsolutePosition = Vector2.zero,
	ViewportSize = VIEWPORT,
	TextBounds = Vector2.new(60, 18),
	TextFits = true,
	IsLoaded = true,
	TimeLength = 1,
	Mass = 1,
	AssemblyMass = 1,
	FloorMaterial = roblox.Enum.Material.Plastic,
	MoveDirection = roblox.Vector3.zero,
}

local function defaultFor(raw, key)
	if SPECIAL_DEFAULTS[key] ~= nil then
		return true, SPECIAL_DEFAULTS[key]
	end
	local def = findPropertyDef(raw.ClassName, key)
	if not def then
		return false, nil
	end
	local dt = def.Datatype
	if ZERO[dt] ~= nil then
		return true, ZERO[dt]
	end
	if type(dt) == "string" and dt:sub(1, 5) == "Enum." then
		local enumName = dt:sub(6)
		local ok, items = pcall(function()
			return Enum[enumName]:GetEnumItems()
		end)
		if ok and items and items[1] then
			return true, items[1]
		end
	end
	if dt == "Ref" then
		return true, nil
	end
	return false, nil
end

-- Overrides de propriétés : get(raw, proxy) -> (handled, value) ; set(raw, proxy, value) -> handled
local GetOverrides = {}
local SetOverrides = {}
Engine.GetOverrides = GetOverrides
Engine.SetOverrides = SetOverrides

-- Méthodes simulées par classe : Methods[ClassName][name] = function(proxy, ...)
local Methods = {}
Engine.Methods = Methods

local EVENT_NAMES = {}
Engine.EVENT_NAMES = EVENT_NAMES
for _, name in {
	"Changed", "ChildAdded", "ChildRemoved", "DescendantAdded", "DescendantRemoving", "AncestryChanged",
	"Destroying", "AttributeChanged", "Touched", "TouchEnded", "PlayerAdded", "PlayerRemoving",
	"CharacterAdded", "CharacterRemoving", "CharacterAppearanceLoaded", "Died", "HealthChanged",
	"StateChanged", "Running", "Jumping", "FreeFalling", "MoveToFinished", "OnServerEvent", "OnClientEvent",
	"Event", "Equipped", "Unequipped", "Activated", "Deactivated", "Heartbeat", "RenderStepped", "Stepped",
	"PreSimulation", "PostSimulation", "PreRender", "PreAnimation", "InputBegan", "InputEnded", "InputChanged",
	"TouchStarted", "TouchEnded", "TouchMoved", "TouchTap", "TouchPinch", "TouchSwipe", "TouchLongPress",
	"MouseEnter", "MouseLeave", "MouseMoved", "MouseButton1Click", "MouseButton1Down", "MouseButton1Up",
	"MouseButton2Click", "MouseButton2Down", "MouseButton2Up", "MouseWheelForward", "MouseWheelBackward",
	"FocusLost", "Focused", "PromptGamePassPurchaseFinished", "PromptProductPurchaseFinished",
	"PromptPurchaseFinished", "LastInputTypeChanged", "WindowFocused", "WindowFocusReleased", "Played",
	"Ended", "Loaded", "Stopped", "DidLoop", "Hit", "GamepadConnected", "GamepadDisconnected",
	"JumpRequest", "Idled", "Chatted", "ReturnedToStart", "SelectionGained", "SelectionLost",
	"MenuOpened", "MenuClosed", "TextChanged", "ReturnPressedFromOnScreenKeyboard", "InputBegin",
	"KeyframeReached", "Completed", "AnimationPlayed", "Seated", "Climbing", "GettingUp", "Swimming",
	"Strafing", "FallingDown", "PlatformStanding", "Ragdoll", "Triggered", "TriggerEnded",
	"PromptShown", "PromptHidden", "CameraTypeChanged", "Close", "ServerInvoke",
} do
	EVENT_NAMES[name] = true
end

local function findMethod(raw, key)
	local class = raw.ClassName
	local cls = db:GetClass(class)
	local name = class
	while name do
		local m = Methods[name]
		if m and m[key] then
			return m[key]
		end
		local c = db:GetClass(name)
		name = c and c.Superclass
	end
	return nil
end

local nativeWrappers = {}
local function nativeMethod(key)
	local w = nativeWrappers[key]
	if not w then
		w = function(self, ...)
			local raw = unwrap(self)
			local fn = raw[key]
			return wrapResults(fn(raw, unwrapArgs(...)))
		end
		nativeWrappers[key] = w
	end
	return w
end

ProxyMT.__index = function(p, key)
	local raw = rawOf[p]
	local go = GetOverrides[key]
	if go then
		local handled, value = go(raw, p)
		if handled then
			return value
		end
	end
	local m = findMethod(raw, key)
	if m then
		return m
	end
	if EVENT_NAMES[key] then
		local okNative, nativeValue = pcall(function()
			return raw[key]
		end)
		if not okNative or type(nativeValue) ~= "function" then
			return signalOf(raw, key)
		end
	end
	local ok, value = pcall(function()
		return raw[key]
	end)
	if ok then
		if type(value) == "function" then
			return nativeMethod(key)
		end
		return wrap(value)
	end
	local msg = tostring(value)
	if msg:find("missing default value") or msg:find("malformed property info") then
		local s = stateOf(raw)
		if s.props[key] ~= nil then
			return s.props[key]
		end
		local has, d = defaultFor(raw, key)
		if has then
			return d
		end
	end
	error(msg:gsub("%s*%[Stack Begin%].*", ""), 2)
end

local PROPERTY_SIGNAL_PREFIX = "Prop:"

local function firePropertyChanged(raw, key)
	local s = states[idOf(raw)]
	if not s then
		return
	end
	local ps = s.signals[PROPERTY_SIGNAL_PREFIX .. key]
	if ps then
		ps:Fire()
	end
	local ch = s.signals.Changed
	if ch then
		ch:Fire(key)
	end
end
Engine.firePropertyChanged = firePropertyChanged

ProxyMT.__newindex = function(p, key, value)
	local raw = rawOf[p]
	local so = SetOverrides[key]
	if so and so(raw, p, value) then
		firePropertyChanged(raw, key)
		return
	end
	local ok, err = pcall(function()
		raw[key] = unwrap(value)
	end)
	if not ok then
		error(tostring(err):gsub("%s*%[Stack Begin%].*", ""), 2)
	end
	firePropertyChanged(raw, key)
end

ProxyMT.__tostring = function(p)
	return rawOf[p].Name
end

ProxyMT.__eq = function(a, b)
	return rawequal(a, b)
end

--------------------------------------------------------------------------
-- Overrides de propriétés
--------------------------------------------------------------------------
local function isA(raw, class)
	return raw:IsA(class)
end

local function rotationOf(cf)
	return cf - cf.Position
end

GetOverrides.Position = function(raw)
	if isA(raw, "BasePart") then
		return true, raw.CFrame.Position
	elseif isA(raw, "Attachment") then
		return true, raw.CFrame.Position
	end
	return false
end
SetOverrides.Position = function(raw, _, value)
	if typeof(value) == "Vector3" and (isA(raw, "BasePart") or isA(raw, "Attachment")) then
		raw.CFrame = CFrame.new(value) * rotationOf(raw.CFrame)
		return true
	end
	return false
end

local function orientationDeg(cf)
	local x, y, z = cf:ToOrientation()
	return Vector3.new(math.deg(x), math.deg(y), math.deg(z))
end

GetOverrides.Orientation = function(raw)
	if isA(raw, "BasePart") or isA(raw, "Attachment") then
		return true, orientationDeg(raw.CFrame)
	end
	return false
end
SetOverrides.Orientation = function(raw, _, value)
	if typeof(value) == "Vector3" and (isA(raw, "BasePart") or isA(raw, "Attachment")) then
		raw.CFrame = CFrame.new(raw.CFrame.Position)
			* CFrame.fromOrientation(math.rad(value.X), math.rad(value.Y), math.rad(value.Z))
		return true
	end
	return false
end
GetOverrides.Rotation = function(raw)
	if isA(raw, "BasePart") then
		return true, orientationDeg(raw.CFrame)
	end
	return false
end

local function parentCFrame(raw)
	local parent = raw.Parent
	if parent and parent:IsA("BasePart") then
		return parent.CFrame
	end
	return CFrame.new()
end

GetOverrides.WorldPosition = function(raw)
	if isA(raw, "Attachment") then
		return true, (parentCFrame(raw) * raw.CFrame).Position
	end
	return false
end
GetOverrides.WorldCFrame = function(raw)
	if isA(raw, "Attachment") then
		return true, parentCFrame(raw) * raw.CFrame
	end
	return false
end
SetOverrides.WorldPosition = function(raw, _, value)
	if isA(raw, "Attachment") and typeof(value) == "Vector3" then
		local local_ = parentCFrame(raw):PointToObjectSpace(value)
		raw.CFrame = CFrame.new(local_) * rotationOf(raw.CFrame)
		return true
	end
	return false
end
SetOverrides.WorldCFrame = function(raw, _, value)
	if isA(raw, "Attachment") and typeof(value) == "CFrame" then
		raw.CFrame = parentCFrame(raw):ToObjectSpace(value)
		return true
	end
	return false
end
GetOverrides.WorldAxis = function(raw)
	if isA(raw, "Attachment") then
		return true, (parentCFrame(raw) * raw.CFrame).RightVector
	end
	return false
end

-- Vitesses (pas de physique) : stockées
for _, key in { "AssemblyLinearVelocity", "AssemblyAngularVelocity", "Velocity", "RotVelocity" } do
	GetOverrides[key] = function(raw)
		if isA(raw, "BasePart") then
			return true, stateOf(raw).props[key] or Vector3.zero
		end
		return false
	end
	SetOverrides[key] = function(raw, _, value)
		if isA(raw, "BasePart") then
			if typeof(value) ~= "Vector3" then
				error("Unable to assign property " .. key .. ". Vector3 expected", 3)
			end
			stateOf(raw).props[key] = value
			return true
		end
		return false
	end
end

-- Humanoid.Health : morts et HealthChanged
SetOverrides.Health = function(raw, _, value)
	if not isA(raw, "Humanoid") then
		return false
	end
	if type(value) ~= "number" then
		error("Unable to assign property Health. Number expected", 3)
	end
	local s = stateOf(raw)
	local max = raw.MaxHealth
	local new = math.clamp(value, 0, max)
	raw.Health = new
	fireIf(raw, "HealthChanged", new)
	if new <= 0 and not s.dead then
		s.dead = true
		fireIf(raw, "Died")
		Engine.onHumanoidDied(raw)
	end
	return true
end

-- Callbacks des remotes / bindables
for _, key in { "OnServerInvoke", "OnClientInvoke", "OnInvoke" } do
	GetOverrides[key] = function(raw)
		return true, stateOf(raw).callbacks[key]
	end
	SetOverrides[key] = function(raw, _, value)
		local s = stateOf(raw)
		if key == "OnClientInvoke" then
			s.clientCallbacks = s.clientCallbacks or {}
			s.clientCallbacks[currentCtx()] = value
		end
		s.callbacks[key] = value
		return true
	end
end

-- Parent : événements ChildAdded / ChildRemoved / DescendantAdded / AncestryChanged + équipement des Tools
local function fireDescendantEvents(raw, newParent, oldParent)
	local subtree
	local function getSubtree()
		if not subtree then
			subtree = { raw }
			for _, d in raw:GetDescendants() do
				table.insert(subtree, d)
			end
		end
		return subtree
	end
	-- DescendantRemoving sur les anciens ancêtres
	local a = oldParent
	while a do
		local sig = existingSignal(a, "DescendantRemoving")
		if sig then
			for _, d in getSubtree() do
				sig:Fire(wrap(d))
			end
		end
		a = a.Parent
	end
	a = newParent
	while a do
		local sig = existingSignal(a, "DescendantAdded")
		if sig then
			for _, d in getSubtree() do
				sig:Fire(wrap(d))
			end
		end
		a = a.Parent
	end
	-- AncestryChanged sur le sous-arbre (seulement si écouté)
	for _, d in getSubtree() do
		local sig = existingSignal(d, "AncestryChanged")
		if sig then
			sig:Fire(wrap(raw), wrap(newParent))
		end
	end
end

Engine._threadCtxSetter = function(thread, ctx)
	threadCtx[thread] = ctx
end

local function characterOwner(model)
	if not model or not model:IsA("Model") then
		return nil
	end
	for _, player in Engine.players do
		if player.Character == model then
			return player
		end
	end
	return nil
end

Engine.characterOwner = characterOwner

SetOverrides.Parent = function(raw, p, value)
	local newParent = unwrap(value)
	if newParent ~= nil and typeof(newParent) ~= "Instance" then
		error("Unable to assign property Parent. Instance expected, got " .. typeof(value), 3)
	end
	local s = stateOf(raw)
	if s.destroyed then
		error("The Parent property of " .. raw.Name .. " is locked, current parent: NULL, new parent " .. (newParent and newParent.Name or "NULL"), 3)
	end
	local oldParent = raw.Parent
	if oldParent == newParent then
		return true
	end
	raw.Parent = newParent
	if oldParent then
		fireIf(oldParent, "ChildRemoved", p)
	end
	if newParent then
		fireIf(newParent, "ChildAdded", p)
	end
	fireDescendantEvents(raw, newParent, oldParent)
	-- Tools : Equipped / Unequipped
	if raw:IsA("Tool") then
		local wasHeld = oldParent and oldParent:IsA("Model") and oldParent:FindFirstChildOfClass("Humanoid")
		local isHeld = newParent and newParent:IsA("Model") and newParent:FindFirstChildOfClass("Humanoid")
		if wasHeld and not isHeld then
			fireIf(raw, "Unequipped")
		end
		if isHeld and not wasHeld then
			fireIf(raw, "Equipped", Engine.makeMouse())
		end
	end
	return true
end

--------------------------------------------------------------------------
-- Méthodes génériques
--------------------------------------------------------------------------
Methods.Instance = {}

function Methods.Instance.WaitForChild(self, name, timeout)
	local raw = unwrap(self)
	if type(name) ~= "string" then
		error("Argument 1 missing or nil", 2)
	end
	local found = raw:FindFirstChild(name)
	if found then
		return wrap(found)
	end
	local started = os.clock()
	local warned = false
	local limit = timeout or Engine.waitForChildLimit or 8
	while os.clock() - started < limit do
		realtask.wait(0.03)
		found = raw:FindFirstChild(name)
		if found then
			return wrap(found)
		end
		if not timeout and not warned and os.clock() - started > 5 then
			warned = true
			record("warn", currentCtx(), "Infinite yield possible on '" .. raw:GetFullName() .. ":WaitForChild(\"" .. name .. "\")'")
		end
	end
	if not timeout then
		record("error", currentCtx(), "INFINITE YIELD (sim stopped waiting) on " .. raw:GetFullName() .. ":WaitForChild(\"" .. name .. "\")\n" .. debug.traceback("", 2))
		-- bloque ce thread pour toujours (comme Roblox)
		coroutine.yield()
	end
	return nil
end

function Methods.Instance.GetPropertyChangedSignal(self, prop)
	local raw = unwrap(self)
	local okProp = pcall(function()
		return self[prop]
	end)
	if not okProp then
		error(prop .. " is not a valid property name.", 2)
	end
	return signalOf(raw, PROPERTY_SIGNAL_PREFIX .. prop)
end

function Methods.Instance.GetAttributeChangedSignal(self, name)
	return signalOf(unwrap(self), "Attr:" .. tostring(name))
end

function Methods.Instance.SetAttribute(self, name, value)
	local raw = unwrap(self)
	if type(name) ~= "string" then
		error("Argument 1 missing or nil", 2)
	end
	local t = typeof(value)
	if isProxy(value) then
		error("Instance is not a supported attribute type", 2)
	end
	if value ~= nil and not ({ string = true, boolean = true, number = true, Vector3 = true, Vector2 = true, CFrame = true, Color3 = true, UDim = true, UDim2 = true, BrickColor = true, NumberRange = true, NumberSequence = true, ColorSequence = true, Rect = true, Font = true, EnumItem = true })[t] then
		error(t .. " is not a supported attribute type", 2)
	end
	local old = raw:GetAttribute(name)
	raw:SetAttribute(name, value)
	if old ~= value then
		fireIf(raw, "Attr:" .. name)
		fireIf(raw, "AttributeChanged", name)
	end
end

local function destroy(raw)
	local s = stateOf(raw)
	if s.destroyed then
		return
	end
	for _, child in raw:GetChildren() do
		destroy(child)
	end
	fireIf(raw, "Destroying")
	local parent = raw.Parent
	if parent then
		local p = wrap(raw)
		SetOverrides.Parent(raw, p, nil)
	end
	s.destroyed = true
	-- on ne détruit pas nativement (Lune verrouille l'instance) : on la détache seulement
end
Engine.destroy = destroy

function Methods.Instance.Destroy(self)
	destroy(unwrap(self))
end
Methods.Instance.Remove = Methods.Instance.Destroy

function Methods.Instance.ClearAllChildren(self)
	for _, child in unwrap(self):GetChildren() do
		destroy(child)
	end
end

function Methods.Instance.Clone(self)
	local raw = unwrap(self)
	if raw.Archivable == false then
		return nil
	end
	return wrap(raw:Clone())
end

function Methods.Instance.GetActor()
	return nil
end

function Methods.Instance.IsPropertyModified()
	return false
end

function Methods.Instance.GetStyled(self, prop)
	return self[prop]
end

function Methods.Instance.FindFirstChildWhichIsA(self, class, recursive)
	local raw = unwrap(self)
	local list = if recursive then raw:GetDescendants() else raw:GetChildren()
	for _, c in list do
		if c:IsA(class) then
			return wrap(c)
		end
	end
	return nil
end

function Methods.Instance.FindFirstDescendant(self, name)
	for _, d in unwrap(self):GetDescendants() do
		if d.Name == name then
			return wrap(d)
		end
	end
	return nil
end

--------------------------------------------------------------------------
-- Géométrie : raycasts et requêtes spatiales (boîtes orientées)
--------------------------------------------------------------------------
local function isExcluded(raw, params)
	if not params then
		return false
	end
	local list = params.FilterDescendantsInstances or {}
	local inList = false
	for _, inst in list do
		local r = unwrap(inst)
		if typeof(r) == "Instance" and (r == raw or raw:IsDescendantOf(r)) then
			inList = true
			break
		end
	end
	if params.FilterType == Enum.RaycastFilterType.Include then
		return not inList
	end
	return inList
end

local function allParts()
	local list = {}
	for _, d in Engine.workspaceRaw:GetDescendants() do
		if d:IsA("BasePart") and not stateOf(d).destroyed then
			table.insert(list, d)
		end
	end
	return list
end

-- Intersection rayon / boîte orientée (méthode des slabs)
local function rayBox(origin, dir, cf, size)
	local o = cf:PointToObjectSpace(origin)
	local d = cf:VectorToObjectSpace(dir)
	local half = size / 2
	local tmin, tmax = 0, 1
	local normalAxis, normalSign = nil, 0
	for _, axis in { "X", "Y", "Z" } do
		local oa, da, h = o[axis], d[axis], half[axis]
		if math.abs(da) < 1e-9 then
			if oa < -h or oa > h then
				return nil
			end
		else
			local t1 = (-h - oa) / da
			local t2 = (h - oa) / da
			local sign = -1
			if t1 > t2 then
				t1, t2 = t2, t1
				sign = 1
			end
			if t1 > tmin then
				tmin = t1
				normalAxis = axis
				normalSign = sign
			end
			if t2 < tmax then
				tmax = t2
			end
			if tmin > tmax then
				return nil
			end
		end
	end
	if not normalAxis then
		return nil -- l'origine est dans la boîte : Roblox ne détecte pas la sortie
	end
	local localNormal = Vector3.new(
		if normalAxis == "X" then normalSign else 0,
		if normalAxis == "Y" then normalSign else 0,
		if normalAxis == "Z" then normalSign else 0
	)
	return tmin, cf:VectorToWorldSpace(localNormal)
end

function Engine.raycast(origin, direction, params)
	if typeof(origin) ~= "Vector3" or typeof(direction) ~= "Vector3" then
		error("Raycast: origin et direction doivent être des Vector3", 3)
	end
	if params ~= nil and (type(params) ~= "table" or not params.__RaycastParams) then
		error("Raycast: paramètre 3 doit être un RaycastParams", 3)
	end
	if direction.Magnitude > 15000 then
		record("warn", currentCtx(), "Raycast direction > 15000 studs (tronqué par Roblox)")
	end
	local bestT, bestPart, bestNormal = math.huge, nil, nil
	for _, part in allParts() do
		local okQuery = part.CanQuery ~= false or part.CanCollide == true
		if okQuery and not isExcluded(part, params) then
			if not (params and params.RespectCanCollide and not part.CanCollide) then
				local t, n = rayBox(origin, direction, part.CFrame, part.Size)
				if t and t < bestT then
					bestT, bestPart, bestNormal = t, part, n
				end
			end
		end
	end
	if not bestPart then
		return nil
	end
	local position = origin + direction * bestT
	return {
		Instance = wrap(bestPart),
		Position = position,
		Normal = bestNormal,
		Distance = direction.Magnitude * bestT,
		Material = bestPart.Material,
	}
end

local function boxesOverlap(cfA, sizeA, cfB, sizeB)
	-- approximation : sphères englobantes + test des coins
	local ra = (sizeA / 2).Magnitude
	local rb = (sizeB / 2).Magnitude
	return (cfA.Position - cfB.Position).Magnitude <= ra + rb
end

function Engine.partsInBox(cf, size, params)
	local out = {}
	for _, part in allParts() do
		if part.CanQuery ~= false and not isExcluded(part, params) and boxesOverlap(cf, size, part.CFrame, part.Size) then
			table.insert(out, wrap(part))
		end
	end
	return out
end

function Engine.partsInRadius(pos, radius, params)
	local out = {}
	for _, part in allParts() do
		if part.CanQuery ~= false and not isExcluded(part, params) then
			if (part.CFrame.Position - pos).Magnitude <= radius + (part.Size / 2).Magnitude then
				table.insert(out, wrap(part))
			end
		end
	end
	return out
end

--------------------------------------------------------------------------
-- Types de données manquants dans Lune
--------------------------------------------------------------------------
local function makeParams(kind)
	return {
		new = function()
			local params = {
				FilterType = Enum.RaycastFilterType.Exclude,
				FilterDescendantsInstances = {},
				IgnoreWater = false,
				CollisionGroup = "Default",
				RespectCanCollide = false,
				BruteForceAllSlow = false,
				MaxParts = 0,
				["__" .. kind] = true,
				__RaycastParams = kind == "RaycastParams",
				__OverlapParams = kind == "OverlapParams",
			}
			function params.AddToFilter(self, inst)
				local list = self.FilterDescendantsInstances
				if type(inst) == "table" and not isProxy(inst) then
					for _, i in inst do
						table.insert(list, i)
					end
				else
					table.insert(list, inst)
				end
				self.FilterDescendantsInstances = list
			end
			return setmetatable(params, {
				__newindex = function(t, k, v)
					if k == "FilterDescendantsInstances" then
						if type(v) ~= "table" then
							error("FilterDescendantsInstances doit être une table", 2)
						end
						for _, i in v do
							if not isProxy(i) then
								error("FilterDescendantsInstances contient une valeur qui n'est pas une Instance (" .. typeof(i) .. ")", 2)
							end
						end
					elseif k == "FilterType" then
						if typeof(v) ~= "EnumItem" then
							error("FilterType doit être un EnumItem", 2)
						end
					end
					rawset(t, k, v)
				end,
			})
		end,
	}
end

local RaycastParams = makeParams("RaycastParams")
local OverlapParams = makeParams("OverlapParams")

local TweenInfo = {}
function TweenInfo.new(time, style, direction, repeatCount, reverses, delayTime)
	if time ~= nil and type(time) ~= "number" then
		error("TweenInfo.new: time doit être un nombre", 2)
	end
	if style ~= nil and typeof(style) ~= "EnumItem" then
		error("TweenInfo.new: EasingStyle invalide", 2)
	end
	if direction ~= nil and typeof(direction) ~= "EnumItem" then
		error("TweenInfo.new: EasingDirection invalide", 2)
	end
	return {
		Time = time or 1,
		EasingStyle = style or Enum.EasingStyle.Quad,
		EasingDirection = direction or Enum.EasingDirection.Out,
		RepeatCount = repeatCount or 0,
		Reverses = reverses or false,
		DelayTime = delayTime or 0,
		__TweenInfo = true,
	}
end

local RandomLib = {}
function RandomLib.new(seed)
	local state = seed or math.floor(os.clock() * 1e6) % 2147483647
	local function nextRaw()
		state = (state * 1103515245 + 12345) % 2147483648
		return state / 2147483648
	end
	local r = {}
	function r.NextNumber(_, min, max)
		local v = nextRaw()
		if min then
			return min + (max - min) * v
		end
		return v
	end
	function r.NextInteger(_, min, max)
		if type(min) ~= "number" or type(max) ~= "number" then
			error("Random:NextInteger : arguments invalides", 2)
		end
		return math.floor(min + (max - min + 1) * nextRaw())
	end
	function r.NextUnitVector()
		local v = Vector3.new(nextRaw() - 0.5, nextRaw() - 0.5, nextRaw() - 0.5)
		return if v.Magnitude > 0 then v.Unit else Vector3.xAxis
	end
	function r.Shuffle(_, t)
		for i = #t, 2, -1 do
			local j = math.floor(nextRaw() * i) + 1
			t[i], t[j] = t[j], t[i]
		end
	end
	function r.Clone()
		return RandomLib.new(state)
	end
	return r
end

local DateTimeLib = {}
function DateTimeLib.now()
	local now = os.time()
	return {
		UnixTimestamp = now,
		UnixTimestampMillis = now * 1000,
		ToIsoDate = function()
			return "2026-10-05T00:00:00Z"
		end,
		FormatLocalTime = function()
			return ""
		end,
		ToLocalTime = function()
			return { Year = 2026, Month = 10, Day = 5, Hour = 12, Minute = 0, Second = 0 }
		end,
	}
end
DateTimeLib.fromUnixTimestamp = function(t)
	return { UnixTimestamp = t }
end

-- Nombre de sons / effets créés (statistiques)
Engine.stats = { instances = 0, raycasts = 0, remotes = {}, terrain = 0 }

local InstanceLib = {}
function InstanceLib.new(className, parent)
	if type(className) ~= "string" then
		error("Instance.new: className doit être une chaîne", 2)
	end
	local ok, raw = pcall(RInstance.new, className)
	if not ok then
		error("Unable to create an Instance of type \"" .. className .. "\"", 2)
	end
	Engine.stats.instances += 1
	local p = wrap(raw)
	if className == "Humanoid" then
		raw.MaxHealth = 100
		raw.Health = 100
	end
	if parent ~= nil then
		p.Parent = parent
	end
	return p
end
function InstanceLib.fromExisting(inst)
	return wrap(unwrap(inst):Clone())
end

Engine.libs = {
	RaycastParams = RaycastParams,
	OverlapParams = OverlapParams,
	TweenInfo = TweenInfo,
	Random = RandomLib,
	DateTime = DateTimeLib,
	Instance = InstanceLib,
	Task = Task,
}

return Engine
