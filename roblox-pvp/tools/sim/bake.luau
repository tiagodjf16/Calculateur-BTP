--!nocheck
-- Ajoute à un .rbxlx un aperçu visible dans l'éditeur Studio : la map pré-générée + un panneau
-- « Clique sur Play ». Le tout est rangé dans workspace.ApercuEditeur, que Main.server supprime au lancement.
-- Usage : lune run bake.luau <entrée.rbxlx> <sortie.rbxlx>
local roblox = require("@lune/roblox")
local fs = require("@lune/fs")
local process = require("@lune/process")
local realtask = require("@lune/task")
local Engine = require("./engine")
local Runner = require("./runner")
local wrap, unwrap = Engine.wrap, Engine.unwrap
local Vector3, CFrame, Color3, UDim2 = roblox.Vector3, roblox.CFrame, roblox.Color3, roblox.UDim2

local input, output = process.args[1], process.args[2]
local game = Runner.load(input)
local ws = game:GetService("Workspace")

-- Génère la map dans le simulateur
local mapModule
for _, d in game:GetService("ServerScriptService"):GetDescendants() do
	if d.Name == "MapService" and d.ClassName == "ModuleScript" then
		mapModule = d
	end
end
local ok, err = Runner.inCtx(Engine.serverCtx, function()
	local MapService = Runner.require(Engine.serverCtx, wrap(mapModule))
	MapService.Build()
end)
if not ok then
	print("Génération de la map échouée : " .. tostring(err))
	process.exit(1)
end
realtask.wait(0.5)

local arena = ws:FindFirstChild("Arena")
local preview = roblox.Instance.new("Model")
preview.Name = "ApercuEditeur"
if arena then
	arena.Name = "MapApercu"
	-- les SpawnLocation de l'aperçu ne doivent jamais servir : on les neutralise
	for _, d in arena:GetDescendants() do
		if d:IsA("SpawnLocation") then
			d.Enabled = false
		end
	end
	arena.Parent = preview
end

-- Panneau géant au-dessus du centre
local sign = roblox.Instance.new("Part")
sign.Name = "PanneauPlay"
sign.Anchored = true
sign.CanCollide = false
sign.Size = Vector3.new(60, 22, 1)
sign.CFrame = CFrame.new(0, 45, 0)
sign.Color = Color3.fromRGB(12, 14, 22)
sign.Material = roblox.Enum.Material.SmoothPlastic
sign.Parent = preview
for _, face in { roblox.Enum.NormalId.Front, roblox.Enum.NormalId.Back } do
	local gui = roblox.Instance.new("SurfaceGui")
	gui.Face = face
	gui.SizingMode = roblox.Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 20
	gui.LightInfluence = 0
	gui.Parent = sign
	local title = roblox.Instance.new("TextLabel")
	title.Size = UDim2.fromScale(1, 0.55)
	title.BackgroundTransparency = 1
	title.TextScaled = true
	title.FontFace = roblox.Font.new("rbxasset://fonts/families/Oswald.json", roblox.Enum.FontWeight.Bold)
	title.TextColor3 = Color3.fromRGB(0, 200, 255)
	title.Text = "▶ CLIQUE SUR PLAY (F5)"
	title.Parent = gui
	local sub = roblox.Instance.new("TextLabel")
	sub.Position = UDim2.fromScale(0, 0.58)
	sub.Size = UDim2.fromScale(1, 0.35)
	sub.BackgroundTransparency = 1
	sub.TextScaled = true
	sub.FontFace = roblox.Font.new("rbxasset://fonts/families/GothamSSm.json", roblox.Enum.FontWeight.Bold)
	sub.TextColor3 = Color3.fromRGB(240, 240, 250)
	sub.Text = "Ceci est un aperçu : le jeu génère la vraie map au lancement"
	sub.Parent = gui
end

-- Caméra de l'éditeur pointée sur le panneau
local camera = ws:FindFirstChildOfClass("Camera") or roblox.Instance.new("Camera")
camera.Name = "Camera"
camera.CFrame = CFrame.lookAt(Vector3.new(0, 60, 110), Vector3.new(0, 30, 0))
camera.Parent = ws
pcall(function()
	ws.CurrentCamera = camera
end)

preview.Parent = ws
-- retire les caméras ajoutées par le simulateur
for _, c in ws:GetChildren() do
	if c:IsA("Camera") and c ~= camera then
		c.Parent = nil
	end
end

-- Lune enregistre la propriété héritée .Font dans FontFace : on corrige avant la sérialisation
for _, d in game:GetDescendants() do
	if d:IsA("TextLabel") or d:IsA("TextButton") or d:IsA("TextBox") then
		local okFace, face = pcall(function()
			return d.FontFace
		end)
		if okFace and typeof(face) == "Font" then
			d.FontFace = face -- réécrit la valeur calculée pour remplacer l'ancien enum stocké
		else
			d.FontFace = roblox.Font.new("rbxasset://fonts/families/GothamSSm.json", roblox.Enum.FontWeight.Heavy)
		end
	end
end

fs.writeFile(output, roblox.serializePlace(game, true))
print("Aperçu éditeur ajouté -> " .. output)
process.exit(0)
