-- Génère une arène prête à jouer + un éclairage soigné.
-- Si tu construis ta propre map, nomme son dossier "Arena" dans Workspace :
-- la génération est alors ignorée (pense à y mettre des SpawnLocation et une part "Leaderboard").
local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)

local MapService = {}

local HALF = 100 -- l'arène fait 200 x 200 studs
local WALL_HEIGHT = 30

local arena: Folder

local function part(props): BasePart
	local p = Instance.new(props.ClassName or "Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for key, value in props do
		if key ~= "ClassName" then
			p[key] = value
		end
	end
	p.Parent = p.Parent or arena
	return p
end

local function setupLighting()
	Lighting.ClockTime = 15.5
	Lighting.Brightness = 2.5
	Lighting.Ambient = Color3.fromRGB(60, 62, 80)
	Lighting.OutdoorAmbient = Color3.fromRGB(110, 110, 130)
	Lighting.EnvironmentDiffuseScale = 1
	Lighting.EnvironmentSpecularScale = 1
	Lighting.GlobalShadows = true

	local function ensure(className: string, props)
		local effect = Lighting:FindFirstChildOfClass(className) or Instance.new(className)
		for key, value in props do
			effect[key] = value
		end
		effect.Parent = Lighting
	end

	ensure("Atmosphere", {
		Density = 0.3,
		Offset = 0.2,
		Color = Color3.fromRGB(200, 190, 230),
		Decay = Color3.fromRGB(90, 80, 130),
		Glare = 0.3,
		Haze = 1.2,
	})
	ensure("BloomEffect", { Intensity = 0.6, Size = 24, Threshold = 1.4 })
	ensure("ColorCorrectionEffect", { Saturation = 0.15, Contrast = 0.08, Brightness = 0.02 })
	ensure("SunRaysEffect", { Intensity = 0.06, Spread = 0.6 })
end

local function buildFloorAndWalls()
	part({
		Name = "Floor",
		Size = Vector3.new(HALF * 2, 2, HALF * 2),
		CFrame = CFrame.new(0, -1, 0),
		Color = Color3.fromRGB(42, 46, 58),
		Material = Enum.Material.Slate,
	})

	-- Lignes néon au sol (style e-sport)
	for _, offset in { -50, 0, 50 } do
		part({
			Name = "FloorLine",
			Size = Vector3.new(HALF * 2, 0.1, 0.4),
			CFrame = CFrame.new(0, 0.05, offset),
			Color = Config.Colors.Accent,
			Material = Enum.Material.Neon,
			CanCollide = false,
			Transparency = 0.4,
		})
		part({
			Name = "FloorLine",
			Size = Vector3.new(0.4, 0.1, HALF * 2),
			CFrame = CFrame.new(offset, 0.05, 0),
			Color = Config.Colors.Accent2,
			Material = Enum.Material.Neon,
			CanCollide = false,
			Transparency = 0.4,
		})
	end

	local walls = {
		{ CFrame.new(0, WALL_HEIGHT / 2, HALF + 1), Vector3.new(HALF * 2 + 4, WALL_HEIGHT, 2), Config.Colors.Accent },
		{ CFrame.new(0, WALL_HEIGHT / 2, -HALF - 1), Vector3.new(HALF * 2 + 4, WALL_HEIGHT, 2), Config.Colors.Accent2 },
		{ CFrame.new(HALF + 1, WALL_HEIGHT / 2, 0), Vector3.new(2, WALL_HEIGHT, HALF * 2 + 4), Config.Colors.Accent },
		{ CFrame.new(-HALF - 1, WALL_HEIGHT / 2, 0), Vector3.new(2, WALL_HEIGHT, HALF * 2 + 4), Config.Colors.Accent2 },
	}
	for _, wall in walls do
		local cf, size, color = wall[1], wall[2], wall[3]
		part({
			Name = "Wall",
			Size = size,
			CFrame = cf,
			Color = Color3.fromRGB(28, 30, 40),
			Material = Enum.Material.Concrete,
		})
		-- Bandeau lumineux en bas du mur
		part({
			Name = "WallTrim",
			Size = Vector3.new(size.X + 0.2, 0.6, size.Z + 0.2),
			CFrame = CFrame.new(cf.Position.X, 1.2, cf.Position.Z),
			Color = color,
			Material = Enum.Material.Neon,
			CanCollide = false,
		})
	end

	-- Plafond invisible pour éviter de sortir de l'arène
	part({
		Name = "Ceiling",
		Size = Vector3.new(HALF * 2, 1, HALF * 2),
		CFrame = CFrame.new(0, WALL_HEIGHT + 0.5, 0),
		Transparency = 1,
		CastShadow = false,
	})
end

local function buildCovers()
	local layout = {
		-- position (quadrant +,+), taille
		{ Vector3.new(50, 0, 50), Vector3.new(14, 7, 3) },
		{ Vector3.new(55, 0, 20), Vector3.new(3, 7, 12) },
		{ Vector3.new(22, 0, 65), Vector3.new(12, 7, 3) },
		{ Vector3.new(72, 0, 72), Vector3.new(6, 14, 6) },
		{ Vector3.new(35, 0, 35), Vector3.new(4, 4, 4) },
	}
	for _, sx in { 1, -1 } do
		for _, sz in { 1, -1 } do
			for _, entry in layout do
				local pos, size = entry[1], entry[2]
				local block = part({
					Name = "Cover",
					Size = size,
					CFrame = CFrame.new(pos.X * sx, size.Y / 2, pos.Z * sz),
					Color = Color3.fromRGB(70, 76, 96),
					Material = Enum.Material.Concrete,
				})
				part({
					Name = "CoverTrim",
					Size = Vector3.new(size.X + 0.2, 0.3, size.Z + 0.2),
					CFrame = block.CFrame * CFrame.new(0, size.Y / 2, 0),
					Color = if sx == sz then Config.Colors.Accent else Config.Colors.Accent2,
					Material = Enum.Material.Neon,
					CanCollide = false,
				})
			end
		end
	end
end

local function buildCenter()
	local height = 6
	local platform = part({
		Name = "CenterPlatform",
		Size = Vector3.new(36, height, 36),
		CFrame = CFrame.new(0, height / 2, 0),
		Color = Color3.fromRGB(55, 60, 78),
		Material = Enum.Material.DiamondPlate,
	})
	part({
		Name = "CenterRing",
		Size = Vector3.new(37, 0.4, 37),
		CFrame = platform.CFrame * CFrame.new(0, height / 2 - 0.1, 0),
		Color = Config.Colors.Gold,
		Material = Enum.Material.Neon,
		CanCollide = false,
		Transparency = 0.2,
	})

	-- Rampes : la face haute d'un WedgePart est côté +Z, on l'oriente vers la plateforme.
	for _, dir in { Vector3.xAxis, -Vector3.xAxis, Vector3.zAxis, -Vector3.zAxis } do
		local pos = Vector3.new(0, height / 2, 0) + dir * (18 + 7)
		part({
			ClassName = "WedgePart",
			Name = "Ramp",
			Size = Vector3.new(10, height, 14),
			CFrame = CFrame.lookAt(pos, pos + dir),
			Color = Color3.fromRGB(55, 60, 78),
			Material = Enum.Material.DiamondPlate,
		})
	end
end

local function buildSpawns()
	local count = 8
	local radius = 85
	for i = 0, count - 1 do
		local angle = (i / count) * math.pi * 2
		local pos = Vector3.new(math.cos(angle) * radius, 0.5, math.sin(angle) * radius)
		local spawn = part({
			ClassName = "SpawnLocation",
			Name = "Spawn",
			Size = Vector3.new(8, 1, 8),
			CFrame = CFrame.lookAt(pos, Vector3.new(0, 0.5, 0)),
			Color = Config.Colors.Accent,
			Material = Enum.Material.Neon,
			Transparency = 0.3,
		}) :: SpawnLocation
		spawn.Neutral = true
		spawn.AllowTeamChangeOnTouch = false
		spawn.Duration = Config.SpawnProtection
	end
end

local function buildSigns()
	part({
		Name = "Leaderboard",
		Size = Vector3.new(34, 20, 1),
		CFrame = CFrame.new(0, 14, HALF - 0.6), -- face avant (-Z) tournée vers le centre
		Color = Color3.fromRGB(14, 16, 24),
		Material = Enum.Material.SmoothPlastic,
	})

	local banner = part({
		Name = "Banner",
		Size = Vector3.new(60, 10, 1),
		CFrame = CFrame.new(0, 18, -HALF + 0.6),
		Color = Color3.fromRGB(14, 16, 24),
		Material = Enum.Material.SmoothPlastic,
	})
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Back -- face +Z, tournée vers le centre
	gui.LightInfluence = 0
	gui.Brightness = 2
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 20
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.GothamBlack
	label.TextScaled = true
	label.TextColor3 = Color3.new(1, 1, 1)
	label.Text = Config.GameName
	label.Parent = gui
	local gradient = Instance.new("UIGradient")
	gradient.Color = ColorSequence.new(Config.Colors.Accent, Config.Colors.Accent2)
	gradient.Parent = label
	gui.Parent = banner
end

function MapService.Build()
	setupLighting()

	if workspace:FindFirstChild("Arena") then
		return
	end

	-- Nettoie le template par défaut de Roblox Studio
	for _, child in workspace:GetChildren() do
		if child.Name == "Baseplate" or child:IsA("SpawnLocation") then
			child:Destroy()
		end
	end

	arena = Instance.new("Folder")
	arena.Name = "Arena"
	buildFloorAndWalls()
	buildCovers()
	buildCenter()
	buildSpawns()
	buildSigns()
	arena.Parent = workspace
end

return MapService
