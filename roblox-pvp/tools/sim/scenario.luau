--!nocheck
-- Scénario de test : démarrage serveur, 2 joueurs, déploiement, combat, réapparition, boutique.
local roblox = require("@lune/roblox")
local process = require("@lune/process")
local realtask = require("@lune/task")
local Engine = require("./engine")
local Runner = require("./runner")
local Enum, Vector3, CFrame = roblox.Enum, roblox.Vector3, roblox.CFrame
local wrap, unwrap = Engine.wrap, Engine.unwrap

local placePath = process.args[1]
Engine.verbose = process.args[2] == "-v"
local function step(msg)
	print(string.format("\n>>> [%.1fs] %s", os.clock() - Engine.startClock, msg))
end
local function check(cond, msg)
	print((if cond then "  [OK] " else "  [ÉCHEC] ") .. msg)
	if not cond then
		Engine.record("error", { name = "SCENARIO" }, "ÉCHEC : " .. msg)
	end
	return cond
end

step("Chargement de " .. placePath)
Runner.load(placePath)
Runner.startFrames()
Runner.startServer()
realtask.wait(3)

local ws = Engine.workspaceRaw
local arena = ws:FindFirstChild("Arena")
check(arena ~= nil, "workspace.Arena généré")
if arena then
	local parts, spawns = 0, 0
	for _, d in arena:GetDescendants() do
		if d:IsA("BasePart") then parts += 1 end
		if d:IsA("SpawnLocation") then spawns += 1 end
	end
	print(string.format("  map : %d pièces, %d spawns, Leaderboard=%s, BulletPassthrough=%s, CameraPoints=%s", parts, spawns,
		tostring(arena:FindFirstChild("Leaderboard") ~= nil), tostring(arena:FindFirstChild("BulletPassthrough") ~= nil), tostring(arena:FindFirstChild("CameraPoints") ~= nil)))
end
local players = Engine.gameRaw:GetService("Players")
print("  CharacterAutoLoads =", players.CharacterAutoLoads)
check(Engine.gameRaw:GetService("ReplicatedStorage"):FindFirstChild("Remotes") ~= nil, "Remotes créés")

local function deploy(ctx)
	local deadline = os.clock() + 8
	while os.clock() < deadline and not ctx.player.Character do
		local button = Runner.findButton(ctx, "JOUER")
		if button then
			Runner.click(ctx, button)
			realtask.wait(1)
		else
			realtask.wait(0.3)
		end
	end
	return ctx.player.Character ~= nil
end

step("Connexion de Alice")
local A = Runner.addPlayer("Alice")
realtask.wait(3)
print("  GUI Alice : " .. Runner.guiSummary(A))
check(deploy(A), "Alice apparaît (menu JOUER ou auto)")
step("Connexion de Bob")
local B = Runner.addPlayer("Bob")
realtask.wait(2)
check(deploy(B), "Bob apparaît")
realtask.wait(2)
print("  GUI Alice : " .. Runner.guiSummary(A))

local function tools(ctx)
	local list = {}
	local char = ctx.player.Character
	local bp = ctx.player:FindFirstChildOfClass("Backpack")
	for _, c in { char, bp } do
		if c then
			for _, t in c:GetChildren() do
				if t:IsA("Tool") then
					table.insert(list, t.Name .. "[" .. tostring(t:GetAttribute("WeaponId")) .. ",ammo=" .. tostring(t:GetAttribute("Ammo")) .. (if t.Parent == char then ",EN MAIN" else "") .. "]")
				end
			end
		end
	end
	return list
end
local ta = tools(A)
print("  armes Alice : " .. table.concat(ta, " "))
check(#ta >= 2, "Alice a 2 armes")

-- Placement face à face, en hauteur pour éviter le décor
local function place(ctx, pos, lookAt)
	local char = ctx.player.Character
	if char then
		wrap(char):PivotTo(CFrame.lookAt(pos, lookAt))
	end
end
local pa, pb = Vector3.new(0, 120, 30), Vector3.new(0, 120, 0)
place(A, pa, pb)
place(B, pb, pa)
-- retirer la protection de spawn de Bob
realtask.wait(3)
for _, ff in B.player.Character:GetChildren() do
	if ff:IsA("ForceField") then Engine.destroy(ff) end
end
A.camera.CFrame = CFrame.lookAt(pa + Vector3.new(0, 1.5, 0), pb + Vector3.new(0, 2.2, 0))

local fireAction
for name, a in A.actions do
	for _, i in a.inputs do
		if i == Enum.UserInputType.MouseButton1 then fireAction = name end
	end
end
local actionNames = {}
for name in A.actions do table.insert(actionNames, name) end
table.sort(actionNames)
print("  actions Alice : " .. table.concat(actionNames, ", "))
check(fireAction ~= nil, "action de tir liée au clic gauche")

step("Alice tire sur Bob")
local bobChar = B.player.Character
local bobHum = bobChar and bobChar:FindFirstChildOfClass("Humanoid")
local died = false
for burst = 1, 12 do
	if not bobHum or bobHum.Health <= 0 or B.player.Character ~= bobChar then died = true break end
	A.camera.CFrame = CFrame.lookAt(pa + Vector3.new(0, 1.5, 0), pb + Vector3.new(0, 2.2, 0))
	Runner.press(A, Enum.UserInputType.MouseButton1, 0.6)
	realtask.wait(0.3)
	print(string.format("  rafale %d : PV Bob = %s, armes Alice : %s", burst, tostring(bobHum and bobHum.Health), table.concat(tools(A), " ")))
	if burst == 6 then Runner.press(A, Enum.KeyCode.R, 0.1) realtask.wait(2.5) end
end
died = died or (bobHum and bobHum.Health <= 0)
check(died, "Bob est éliminé")
realtask.wait(6)
check(B.player.Character ~= nil and B.player.Character ~= bobChar, "Bob réapparaît")

local DataService = Runner.serverModule("DataService")
if DataService then
	local ok, data = Runner.inCtx(Engine.serverCtx, function() return DataService.Get(wrap(A.player)) end)
	if ok and data then
		print(string.format("  données Alice : Kills=%s Coins=%s Xp=%s Level=%s", tostring(data.Kills), tostring(data.Coins), tostring(data.Xp), tostring(data.Level)))
		check((data.Kills or 0) >= 1, "kill comptabilisé")
		Runner.inCtx(Engine.serverCtx, function() data.Coins += 50000 end)
	end
end

step("Boutique / remotes depuis le client d'Alice")
local remotesFolder = Engine.gameRaw:GetService("ReplicatedStorage"):FindFirstChild("Remotes")
local function invoke(name, ...)
	local r = remotesFolder:FindFirstChild(name)
	return Runner.inCtx(A, function(...) return wrap(r):InvokeServer(...) end, ...)
end
print("  BuyWeapon AK47 ->", invoke("BuyWeapon", "AK47"))
print("  BuyWeapon AK47 (2e fois) ->", invoke("BuyWeapon", "AK47"))
print("  BuyWeapon nil ->", invoke("BuyWeapon", nil))
print("  SetLoadout Magnum (non possédée) ->", invoke("SetLoadout", "Magnum"))
print("  EquipCamo AK47 Gold ->", invoke("EquipCamo", "AK47", "Gold"))
print("  ClaimDaily ->", invoke("ClaimDaily"))
print("  ClaimDaily (2e) ->", invoke("ClaimDaily"))
print("  SaveSettings ->", invoke("SaveSettings", { Sensitivity = 99, Fov = 0/0 }))
realtask.wait(1)
print("  armes Alice : " .. table.concat(tools(A), " "))

step("Entrées diverses (changement d'arme, sprint, dash, radar)")
for _, input in { Enum.KeyCode.Two, Enum.KeyCode.One, Enum.KeyCode.LeftShift, Enum.KeyCode.Q, Enum.KeyCode.Three, Enum.KeyCode.Four, Enum.KeyCode.B, Enum.KeyCode.Tab, Enum.UserInputType.MouseButton2 } do
	Runner.press(A, input, 0.3)
	realtask.wait(0.3)
end
Runner.press(A, Enum.KeyCode.Escape, 0.1)
realtask.wait(1)

step("Bob quitte, fermeture du serveur")
Runner.removePlayer(B.player)
realtask.wait(1)
for _, fn in Engine.bindToClose do
	Runner.inCtx(Engine.serverCtx, fn)
end
Runner.stop()
Runner.report()
process.exit(if #Engine.errors > 0 then 1 else 0)
