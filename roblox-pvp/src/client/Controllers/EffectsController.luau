-- EffectsController : tout le rendu « effets » LOCAL du client (rien n'est répliqué).
--
--   • traceurs (rayons lumineux qui filent), flash de bouche, impacts (étincelles / poussière /
--     éclats / trous de balle), douilles éjectées
--   • tirs des AUTRES joueurs (Remotes.ShotFx) + leurs sons d'armes 3D
--   • dissolution néon à la mort de n'importe quel personnage
--   • chiffres de dégâts (Remotes.HitConfirm) + sons hitmarker / tête / élimination
--   • killcam (Remotes.Killcam) pendant Mode == "Dead"
--   • récompenses de série : Radar (Highlight à travers les murs) et Frappe orbitale
--   • marqueur de prime (attribut Player.Bounty)
--   • camos animés (tag CollectionService "AnimatedCamo")
--   • pose de visée de TOUS les personnages R15 armés : buste/tête inclinés selon AimPitch
--     + main gauche posée sur l'arme (IKControl vers l'Attachment "LeftGrip")
--
-- API (utilisée par GunController) :
--   Effects.Init()
--   Effects.Tracer(from: Vector3, to: Vector3, color: Color3?, weaponId: string?)
--   Effects.MuzzleFlash(muzzle: Attachment, color: Color3?)
--   Effects.Impact(position: Vector3, normal: Vector3, hitPart: BasePart?, isCharacter: boolean?)
--   Effects.Shell(eject: Attachment, weaponId: string?)
--   Effects.PlayWeaponSound(weaponId: string, at: (Instance | Vector3)?) -> Sound?
--
-- Toutes les pièces d'effet vivent dans workspace.ClientFX (Anchored, CanCollide/CanQuery/CanTouch/
-- CastShadow = false). Perf : pools (traceurs, flashs, douilles, éclats, trous de balle), UNE boucle
-- RenderStepped pour tout ce qui bouge, budget de particules par frame, émetteurs partagés.
local CollectionService = game:GetService("CollectionService")
local Debris = game:GetService("Debris")
local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Weapons = require(Shared:WaitForChild("Weapons"))
local Remotes = require(Shared:WaitForChild("Remotes"))
local Ballistics = require(Shared:WaitForChild("Ballistics"))

local Controllers = script.Parent
local ClientState = require(Controllers:WaitForChild("ClientState"))
local Ui = require(Controllers:WaitForChild("Ui"))
local Sfx = require(Controllers:WaitForChild("Sfx"))

local LocalPlayer = Players.LocalPlayer

local Effects = {}

--------------------------------------------------------------------------
-- Réglages
--------------------------------------------------------------------------
local TRACER_SPEED = 1400 -- studs/s (balle « visible »)
local TRACER_SPEED_SNIPER = 2600
local TRACER_STREAK = 18 -- longueur max de la traînée lumineuse
local MAX_TRACERS = 48
local MAX_TRACER_LIGHTS = 6 -- lumières dynamiques simultanées sur les traceurs (Future = coûteux)
local MAX_FLASHES = 10
local MAX_SHELLS = 32
local MAX_POPS = 16
local MAX_HOLES = 60
local HOLE_LIFE = 8
local HOLE_FADE = 1.6
local MAX_DAMAGE_NUMBERS = 10
local PARTICLE_BUDGET = 260 -- particules max émises par frame
local FX_MAX_DISTANCE = 650 -- au-delà, on ne dessine pas les impacts
local SHELL_MAX_DISTANCE = 90
local BODY_GRAVITY = Vector3.new(0, -80, 0) -- un peu plus fort que réel : douilles plus « nerveuses »
local AIM_PITCH_LIMIT = 1.3
local WAIST_SHARE = 0.55 -- part de l'inclinaison portée par la taille
local NECK_SHARE = 0.45 -- complément pour la tête (taille + cou = 100 %)
local SHOULDER_SHARE = 0.45 -- complément pour le bras droit (taille + épaule = 100 % : l'arme suit la visée)
local RADAR_MAX_HIGHLIGHTS = 28 -- Roblox n'affiche que 31 Highlight à la fois
local KILLCAM_RISE_TIME = 0.6
local CAMO_INTERVAL = 1 / 20
local CAMO_TAG = "AnimatedCamo"
local KILLCAM_BIND = "ArenaClashKillcam"
local POSE_BIND = "ArenaClashAimPose"
local SMOKE_TEXTURE = "rbxasset://textures/particles/smoke_main.dds" -- texture intégrée au moteur

local WHITE = Color3.new(1, 1, 1)
local DEFAULT_TRACER = Color3.fromRGB(255, 220, 150)
local HIT_POP_COLOR = Color3.fromRGB(255, 246, 225)

-- Taille du flash selon le type d'arme (clé = weapon.Sound)
local FLASH_SCALE = {
	Pistol = 0.8,
	Magnum = 1.15,
	SMG = 0.75,
	Shotgun = 1.45,
	Rifle = 1,
	Sniper = 1.6,
	LMG = 1.1,
}

-- Douilles selon le type d'arme. Pas d'entrée = pas de douille (le revolver garde les siennes).
-- Delay : éjection retardée (pompe / verrou).
local BRASS = Color3.fromRGB(214, 170, 78)
local SHELL_SPECS = {
	Pistol = { Length = 0.2, Diameter = 0.09, Color = BRASS, Material = Enum.Material.Metal },
	SMG = { Length = 0.2, Diameter = 0.09, Color = BRASS, Material = Enum.Material.Metal },
	Rifle = { Length = 0.32, Diameter = 0.1, Color = BRASS, Material = Enum.Material.Metal },
	LMG = { Length = 0.32, Diameter = 0.1, Color = BRASS, Material = Enum.Material.Metal },
	Sniper = { Length = 0.5, Diameter = 0.14, Color = BRASS, Material = Enum.Material.Metal, Delay = 0.55 },
	Shotgun = {
		Length = 0.42,
		Diameter = 0.17,
		Color = Color3.fromRGB(176, 28, 34),
		Material = Enum.Material.SmoothPlastic,
		Delay = 0.38,
	},
}

-- Sons d'armes : volume et portée d'écoute (clé = weapon.Sound)
local SOUND_PROFILES = {
	Pistol = { Volume = 0.6, Range = 450 },
	Magnum = { Volume = 0.85, Range = 600 },
	SMG = { Volume = 0.5, Range = 420 },
	Shotgun = { Volume = 0.9, Range = 550 },
	Rifle = { Volume = 0.65, Range = 650 },
	Sniper = { Volume = 1, Range = 1000 },
	LMG = { Volume = 0.7, Range = 650 },
}
local DEFAULT_SOUND_PROFILE = { Volume = 0.6, Range = 450 }

--------------------------------------------------------------------------
-- Utilitaires
--------------------------------------------------------------------------
local function isFiniteNumber(value: any): boolean
	return type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge
end

local function isFiniteVector(value: any): boolean
	return typeof(value) == "Vector3"
		and isFiniteNumber(value.X)
		and isFiniteNumber(value.Y)
		and isFiniteNumber(value.Z)
end

-- Affecte une propriété récente sans planter si le moteur ne la connaît pas.
local function trySet(instance: Instance, property: string, value: any)
	pcall(function()
		(instance :: any)[property] = value
	end)
end

local function random(min: number, max: number): number
	return min + math.random() * (max - min)
end

local function tween(
	instance: Instance,
	duration: number,
	goal: { [string]: any },
	style: Enum.EasingStyle?,
	direction: Enum.EasingDirection?,
	delayTime: number?
): Tween
	local info = TweenInfo.new(
		duration,
		style or Enum.EasingStyle.Quad,
		direction or Enum.EasingDirection.Out,
		0,
		false,
		delayTime or 0
	)
	local created = TweenService:Create(instance, info, goal)
	created:Play()
	return created
end

local function ns(points: { { number } }): NumberSequence
	local keypoints = table.create(#points)
	for index, point in points do
		keypoints[index] = NumberSequenceKeypoint.new(point[1], point[2])
	end
	return NumberSequence.new(keypoints)
end

local function upFor(direction: Vector3): Vector3
	if math.abs(direction.Y) > 0.98 then
		return Vector3.zAxis
	end
	return Vector3.yAxis
end

-- Repère dont l'avant (-Z, NormalId.Front) pointe dans « direction ».
local function frameFacing(position: Vector3, direction: Vector3): CFrame
	return CFrame.lookAt(position, position + direction, upFor(direction))
end

local function cameraPosition(): Vector3?
	local camera = workspace.CurrentCamera
	return if camera then camera.CFrame.Position else nil
end

local function distanceToCamera(position: Vector3): number
	local camPos = cameraPosition()
	return if camPos then (position - camPos).Magnitude else 0
end

-- Arme d'un Attachment / d'une pièce : remonte jusqu'au Tool (ou Model) qui porte WeaponId.
local function weaponFromInstance(instance: Instance?)
	local node = instance
	for _ = 1, 5 do
		if not node then
			return nil
		end
		local id = node:GetAttribute("WeaponId")
		if type(id) == "string" then
			return Weapons.ById[id]
		end
		node = node.Parent
	end
	return nil
end

local function findKillstreak(id: string)
	for _, definition in Config.Killstreaks do
		if definition.Id == id then
			return definition
		end
	end
	return nil
end

local function getAttachment(container: Instance?, name: string): Attachment?
	if not container then
		return nil
	end
	local found = container:FindFirstChild(name, true)
	if found and found:IsA("Attachment") then
		return found
	end
	return nil
end

-- Paramètres de raycast « décor seulement » (sans personnages ni effets), rafraîchis chaque seconde.
local worldParams: RaycastParams? = nil
local worldParamsTime = -math.huge
local function getWorldParams(): RaycastParams
	local now = os.clock()
	if not worldParams or now - worldParamsTime > 1 then
		worldParams = Ballistics.GetRaycastParams(Ballistics.GetCharacters())
		worldParamsTime = now
	end
	return worldParams :: RaycastParams
end

-- Rayon très court à travers la surface pour connaître la pièce / le matériau touchés.
local function probeSurface(position: Vector3, normal: Vector3): RaycastResult?
	return workspace:Raycast(position + normal * 0.5, normal * -1.2, getWorldParams())
end

local function surfaceColorOf(result: RaycastResult): Color3
	local instance = result.Instance
	if instance:IsA("Terrain") then
		local ok, color = pcall(function()
			return (instance :: Terrain):GetMaterialColor(result.Material)
		end)
		if ok and typeof(color) == "Color3" then
			return color
		end
		return Color3.fromRGB(120, 116, 104)
	end
	if instance:IsA("BasePart") then
		return instance.Color
	end
	return Color3.fromRGB(150, 150, 150)
end

--------------------------------------------------------------------------
-- État des pools (déclaré tôt : ensureHost peut tout réinitialiser)
--------------------------------------------------------------------------
type Tracer = {
	Tail: Attachment,
	Head: Attachment,
	Core: Beam,
	Glow: Beam,
	Light: PointLight,
	From: Vector3,
	Dir: Vector3,
	Length: number,
	Traveled: number,
	Streak: number,
	Speed: number,
	Lit: boolean,
}

type Flash = {
	Core: BasePart,
	Jet: BasePart,
	Blades: { BasePart },
	Offsets: { CFrame },
	CoreOffset: CFrame,
	JetOffset: CFrame,
	Roll: CFrame,
	Light: PointLight,
	Muzzle: Attachment?,
	Frames: number,
}

type Body = {
	Part: BasePart,
	Pos: Vector3,
	Vel: Vector3,
	Rot: CFrame,
	Spin: Vector3,
	Age: number,
	Life: number,
	FloorY: number,
	Radius: number,
	Bounce: number,
	Pooled: boolean,
}

type Pop = {
	Part: BasePart,
	Age: number,
	Life: number,
	From: number,
	To: number,
	Alpha: number,
}

type Hole = {
	Part: BasePart,
	Born: number,
	Active: boolean,
	Hot: boolean,
	Base: number,
	Color: Color3,
}

local fxFolder: Instance? = nil
local host: BasePart? = nil -- pièce invisible à l'origine : porte les Attachments des traceurs / émetteurs
local emitAttachment: Attachment? = nil
local emitters: { [string]: ParticleEmitter } = {}
local particleBudget = PARTICLE_BUDGET

local tracerPool: { Tracer } = {}
local activeTracers: { Tracer } = {}
local litTracers = 0

local flashPool: { Flash } = {}
local activeFlashes: { Flash } = {}

local bodies: { Body } = {}
local shellPool: { BasePart } = {}
local activeShells = 0

local popPool: { Pop } = {}
local activePops: { Pop } = {}

local holes: { Hole } = {}
local holeIndex = 0

local camoParts: { [BasePart]: number } = {} -- pièces taguées "AnimatedCamo" -> décalage de phase

--------------------------------------------------------------------------
-- Dossier ClientFX, fabrique de pièces, émetteurs partagés
--------------------------------------------------------------------------
local function getFolder(): Instance
	if fxFolder and fxFolder.Parent == workspace then
		return fxFolder
	end
	local folder = workspace:FindFirstChild("ClientFX")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "ClientFX"
		folder.Parent = workspace
	end
	fxFolder = folder
	return folder :: Instance
end

-- Pièce d'effet standard (non parentée).
local function newPart(
	shape: Enum.PartType,
	size: Vector3,
	color: Color3,
	material: Enum.Material?,
	transparency: number?
): Part
	local part = Instance.new("Part")
	part.Shape = shape
	part.Anchored = true
	part.CanCollide = false -- d'abord CanCollide, sinon CanQuery = false est ignoré
	part.CanQuery = false
	part.CanTouch = false
	part.CastShadow = false
	part.Locked = true
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Size = size
	part.Color = color
	part.Material = material or Enum.Material.Neon
	part.Transparency = transparency or 0
	return part
end

-- Modèles d'émetteurs (texture par défaut, sauf fumée/poussière : texture intégrée du moteur).
local EMITTER_BASE = {
	Sparks = {
		Lifetime = NumberRange.new(0.12, 0.3),
		Speed = NumberRange.new(16, 34),
		SpreadAngle = Vector2.new(38, 38),
		Size = ns({ { 0, 0.11 }, { 1, 0 } }),
		Acceleration = Vector3.new(0, -60, 0),
		Drag = 5,
		LightEmission = 1,
		Orientation = Enum.ParticleOrientation.VelocityParallel,
		ZOffset = 0.2,
		Squash = ns({ { 0, 1.8 }, { 1, 1.2 } }),
		Brightness = 4,
	},
	Dust = {
		Texture = SMOKE_TEXTURE,
		Lifetime = NumberRange.new(0.45, 0.9),
		Speed = NumberRange.new(2, 6),
		SpreadAngle = Vector2.new(28, 28),
		Size = ns({ { 0, 0.35 }, { 1, 1.7 } }),
		Transparency = ns({ { 0, 0.35 }, { 1, 1 } }),
		Acceleration = Vector3.new(0, 1.5, 0),
		Drag = 4,
		LightEmission = 0,
		LightInfluence = 1,
		Rotation = NumberRange.new(0, 360),
		RotSpeed = NumberRange.new(-50, 50),
	},
	Chips = {
		Lifetime = NumberRange.new(0.35, 0.65),
		Speed = NumberRange.new(10, 22),
		SpreadAngle = Vector2.new(35, 35),
		Size = ns({ { 0, 0.14 }, { 1, 0.07 } }),
		Acceleration = Vector3.new(0, -75, 0),
		Drag = 1.5,
		LightEmission = 0,
		LightInfluence = 1,
		Rotation = NumberRange.new(0, 360),
		RotSpeed = NumberRange.new(-400, 400),
	},
	HitSpark = {
		Lifetime = NumberRange.new(0.1, 0.22),
		Speed = NumberRange.new(10, 22),
		SpreadAngle = Vector2.new(180, 180),
		Size = ns({ { 0, 0.3 }, { 1, 0 } }),
		Drag = 8,
		LightEmission = 1,
		Orientation = Enum.ParticleOrientation.VelocityParallel,
		ZOffset = 0.5,
		Squash = ns({ { 0, 1.4 }, { 1, 1 } }),
		Brightness = 5,
	},
	Smoke = {
		Texture = SMOKE_TEXTURE,
		Lifetime = NumberRange.new(0.5, 1),
		Speed = NumberRange.new(1, 3),
		SpreadAngle = Vector2.new(12, 12),
		Size = ns({ { 0, 0.25 }, { 1, 1.3 } }),
		Transparency = ns({ { 0, 0.72 }, { 1, 1 } }),
		Acceleration = Vector3.new(0, 2.5, 0),
		Drag = 2,
		LightEmission = 0,
		LightInfluence = 1,
		Rotation = NumberRange.new(0, 360),
		RotSpeed = NumberRange.new(-30, 30),
	},
	Bits = {
		Lifetime = NumberRange.new(0.6, 1.2),
		Speed = NumberRange.new(2, 6),
		SpreadAngle = Vector2.new(180, 180),
		Size = ns({ { 0, 0.3 }, { 1, 0 } }),
		Acceleration = Vector3.new(0, 7, 0),
		Drag = 2,
		LightEmission = 1,
		Brightness = 3,
	},
	BigSparks = {
		Lifetime = NumberRange.new(0.6, 1.4),
		Speed = NumberRange.new(40, 95),
		SpreadAngle = Vector2.new(75, 75),
		Size = ns({ { 0, 0.5 }, { 1, 0 } }),
		Acceleration = Vector3.new(0, -50, 0),
		Drag = 1.5,
		LightEmission = 1,
		Orientation = Enum.ParticleOrientation.VelocityParallel,
		Squash = ns({ { 0, 2 }, { 1, 1 } }),
		Brightness = 6,
	},
	BigSmoke = {
		Texture = SMOKE_TEXTURE,
		Lifetime = NumberRange.new(1.6, 3),
		Speed = NumberRange.new(12, 30),
		SpreadAngle = Vector2.new(80, 80),
		Size = ns({ { 0, 5 }, { 1, 16 } }),
		Transparency = ns({ { 0, 0.25 }, { 1, 1 } }),
		Acceleration = Vector3.new(0, 4, 0),
		Drag = 2.5,
		LightEmission = 0,
		LightInfluence = 0.6,
		Rotation = NumberRange.new(0, 360),
		RotSpeed = NumberRange.new(-20, 20),
	},
}
local OPTIONAL_EMITTER_PROPERTIES = { Squash = true, Brightness = true }

-- Couleurs d'étincelles (un émetteur par couleur : changer la couleur d'un émetteur
-- recolorerait aussi ses particules encore vivantes).
local SPARK_COLORS = {
	Metal = ColorSequence.new(Color3.fromRGB(255, 246, 210), Color3.fromRGB(255, 140, 40)),
	Pale = ColorSequence.new(Color3.fromRGB(255, 244, 220), Color3.fromRGB(255, 200, 140)),
	Glass = ColorSequence.new(WHITE, Color3.fromRGB(140, 215, 255)),
	White = ColorSequence.new(WHITE, Color3.fromRGB(255, 225, 170)),
	Ember = ColorSequence.new(Color3.fromRGB(255, 235, 170), Color3.fromRGB(255, 120, 30)),
}

-- Rendu des impacts selon la famille de matériau.
local IMPACT_STYLES: { [string]: any } = {
	Metal = { Spark = "Metal", SparkCount = 10, Dust = Color3.fromRGB(150, 150, 156), DustCount = 1, Hot = true },
	Stone = {
		Spark = "Pale",
		SparkCount = 3,
		Dust = Color3.fromRGB(176, 170, 160),
		DustCount = 3,
		Chips = Color3.fromRGB(112, 108, 102),
		ChipCount = 6,
	},
	Wood = { Dust = Color3.fromRGB(196, 168, 126), DustCount = 2, Chips = Color3.fromRGB(122, 82, 46), ChipCount = 7 },
	Grass = { Dust = Color3.fromRGB(128, 116, 84), DustCount = 4, Chips = Color3.fromRGB(78, 110, 56), ChipCount = 5 },
	Sand = { Dust = Color3.fromRGB(218, 198, 152), DustCount = 5, Chips = Color3.fromRGB(192, 168, 122), ChipCount = 5 },
	Snow = { Dust = Color3.fromRGB(240, 245, 250), DustCount = 5, Chips = Color3.fromRGB(228, 236, 245), ChipCount = 4 },
	Glass = {
		Spark = "Glass",
		SparkCount = 7,
		Chips = Color3.fromRGB(196, 232, 250),
		ChipCount = 6,
		HoleColor = Color3.fromRGB(226, 240, 250),
		HoleTransparency = 0.35,
	},
	Energy = { Spark = "White", SparkCount = 10, NoHole = true },
	Plastic = {
		Spark = "White",
		SparkCount = 3,
		Dust = Color3.fromRGB(205, 205, 210),
		DustCount = 2,
		Chips = Color3.fromRGB(92, 92, 98),
		ChipCount = 4,
	},
}
for kind, style in IMPACT_STYLES do
	if style.Spark then
		style.SparkKey = "Sparks:" .. style.Spark
	end
	if style.Dust then
		style.DustKey = "Dust:" .. kind
	end
	if style.Chips then
		style.ChipKey = "Chips:" .. kind
	end
end

-- Matériau -> famille d'impact (pcall : certains matériaux récents peuvent ne pas exister).
local MATERIAL_KIND: { [Enum.Material]: string } = {}
local function classify(kind: string, names: { string })
	for _, name in names do
		local ok, material = pcall(function()
			return (Enum.Material :: any)[name]
		end)
		if ok and material then
			MATERIAL_KIND[material] = kind
		end
	end
end
classify("Metal", { "Metal", "DiamondPlate", "CorrodedMetal", "Foil" })
classify("Stone", {
	"Concrete",
	"Brick",
	"Slate",
	"Cobblestone",
	"Granite",
	"Marble",
	"Pebble",
	"Rock",
	"Basalt",
	"Asphalt",
	"Pavement",
	"Limestone",
	"Sandstone",
	"CrackedLava",
	"Salt",
	"Plaster",
	"CeramicTiles",
	"ClayRoofTiles",
	"RoofShingles",
})
classify("Wood", { "Wood", "WoodPlanks", "Cardboard" })
classify("Grass", { "Grass", "LeafyGrass", "Ground", "Mud" })
classify("Sand", { "Sand" })
classify("Snow", { "Snow" })
classify("Glass", { "Glass", "Ice", "Glacier" })
classify("Energy", { "Neon", "ForceField" })

local function makeEmitter(name: string, spec: { [string]: any }): ParticleEmitter
	local emitter = Instance.new("ParticleEmitter")
	emitter.Name = name
	emitter.Enabled = false
	emitter.Rate = 0
	emitter.LockedToPart = false
	emitter.LightInfluence = 0
	emitter.EmissionDirection = Enum.NormalId.Front
	for key, value in spec do
		if OPTIONAL_EMITTER_PROPERTIES[key] then
			trySet(emitter, key, value)
		else
			(emitter :: any)[key] = value
		end
	end
	return emitter
end

local function buildEmitters(parent: Attachment)
	local function add(key: string, base: string, color: ColorSequence)
		local emitter = makeEmitter(key, EMITTER_BASE[base])
		emitter.Color = color
		emitter.Parent = parent
		emitters[key] = emitter
	end
	for name, color in SPARK_COLORS do
		add("Sparks:" .. name, "Sparks", color)
	end
	for _, style in IMPACT_STYLES do
		if style.DustKey then
			add(style.DustKey, "Dust", ColorSequence.new(style.Dust))
		end
		if style.ChipKey then
			add(style.ChipKey, "Chips", ColorSequence.new(style.Chips))
		end
	end
	add(
		"HitSpark",
		"HitSpark",
		ColorSequence.new({
			ColorSequenceKeypoint.new(0, WHITE),
			ColorSequenceKeypoint.new(0.4, Color3.fromRGB(255, 232, 120)),
			ColorSequenceKeypoint.new(1, Color3.fromRGB(255, 70, 100)),
		})
	)
	add("Smoke", "Smoke", ColorSequence.new(Color3.fromRGB(205, 205, 210)))
	add("Bits:Accent", "Bits", ColorSequence.new(WHITE, Config.Colors.Accent))
	add("Bits:Gold", "Bits", ColorSequence.new(WHITE, Config.Colors.Gold))
	add("BigSparks", "BigSparks", ColorSequence.new(WHITE, Color3.fromRGB(110, 190, 255)))
	add("BigSmoke", "BigSmoke", ColorSequence.new(Color3.fromRGB(176, 188, 206), Color3.fromRGB(88, 94, 110)))
end

local function destroyIfAlive(instance: Instance?)
	if instance and instance.Parent then
		instance:Destroy()
	end
end

-- Vide tous les pools (utilisé si le dossier / la pièce hôte a été détruit).
local function resetPools()
	for _, flash in activeFlashes do
		table.insert(flashPool, flash)
	end
	for _, flash in flashPool do
		destroyIfAlive(flash.Core)
		destroyIfAlive(flash.Jet)
		for _, blade in flash.Blades do
			destroyIfAlive(blade)
		end
	end
	for _, body in bodies do
		destroyIfAlive(body.Part)
	end
	for _, part in shellPool do
		destroyIfAlive(part)
	end
	for _, pop in activePops do
		table.insert(popPool, pop)
	end
	for _, pop in popPool do
		destroyIfAlive(pop.Part)
	end
	for _, hole in holes do
		destroyIfAlive(hole.Part)
	end
	tracerPool, activeTracers, litTracers = {}, {}, 0
	flashPool, activeFlashes = {}, {}
	bodies, shellPool, activeShells = {}, {}, 0
	popPool, activePops = {}, {}
	holes, holeIndex = {}, 0
	emitters = {}
end

-- Garantit l'existence de workspace.ClientFX + pièce hôte + émetteurs partagés.
local function ensureHost()
	local folder = getFolder()
	if host and host.Parent == folder and emitAttachment and emitAttachment.Parent == host then
		return
	end
	resetPools()
	destroyIfAlive(host)
	local part = newPart(Enum.PartType.Block, Vector3.one, Color3.new(), Enum.Material.SmoothPlastic, 1)
	part.Name = "FxHost"
	part.CFrame = CFrame.new() -- repère identité : Attachment.Position = position monde
	part.Parent = folder
	host = part
	local attachment = Instance.new("Attachment")
	attachment.Name = "Emitter"
	attachment.Parent = part
	emitAttachment = attachment
	buildEmitters(attachment)
end

-- Émet « count » particules depuis « frame » (l'avant du repère = direction d'émission).
local function emit(frame: CFrame, emitter: ParticleEmitter?, count: number)
	local attachment = emitAttachment
	if not emitter or not attachment or particleBudget <= 0 then
		return
	end
	local amount = math.min(math.floor(count + 0.5), particleBudget)
	if amount <= 0 then
		return
	end
	particleBudget -= amount
	attachment.CFrame = frame
	emitter:Emit(amount)
end

-- Séquences de couleurs dérivées d'une teinte (cache : les Color3 de Weapons sont réutilisés).
local colorCache = setmetatable({}, { __mode = "k" })
local function colorSet(color: Color3)
	local set = colorCache[color]
	if not set then
		local hot = color:Lerp(WHITE, 0.65)
		set = {
			Core = ColorSequence.new(color, hot),
			Glow = ColorSequence.new(color),
			Hot = hot,
		}
		colorCache[color] = set
	end
	return set
end

--------------------------------------------------------------------------
-- Traceurs : un Beam fin et brillant qui file du canon à l'impact
--------------------------------------------------------------------------
local TRACER_CORE_TRANSPARENCY = ns({ { 0, 1 }, { 0.45, 0.35 }, { 1, 0 } })
local TRACER_GLOW_TRANSPARENCY = ns({ { 0, 1 }, { 1, 0.62 } })

local function createTracer(): Tracer
	local parent = host :: BasePart
	local tail = Instance.new("Attachment")
	tail.Name = "TracerTail"
	tail.Parent = parent
	local head = Instance.new("Attachment")
	head.Name = "TracerHead"
	head.Parent = parent

	local function beam(width0: number, width1: number, transparency: NumberSequence): Beam
		local created = Instance.new("Beam")
		created.Attachment0 = tail
		created.Attachment1 = head
		created.FaceCamera = true
		created.Segments = 1
		created.LightEmission = 1
		created.LightInfluence = 0
		created.Width0 = width0
		created.Width1 = width1
		created.Transparency = transparency
		created.Enabled = false
		trySet(created, "Brightness", 3)
		created.Parent = parent
		return created
	end

	local light = Instance.new("PointLight")
	light.Range = 7
	light.Brightness = 1.4
	light.Shadows = false
	light.Enabled = false
	light.Parent = head

	return {
		Tail = tail,
		Head = head,
		Core = beam(0.03, 0.12, TRACER_CORE_TRANSPARENCY),
		Glow = beam(0.06, 0.34, TRACER_GLOW_TRANSPARENCY),
		Light = light,
		From = Vector3.zero,
		Dir = Vector3.zAxis,
		Length = 0,
		Traveled = 0,
		Streak = 0,
		Speed = TRACER_SPEED,
		Lit = false,
	}
end

local function releaseTracer(index: number)
	local tracer = table.remove(activeTracers, index)
	if not tracer then
		return
	end
	tracer.Core.Enabled = false
	tracer.Glow.Enabled = false
	if tracer.Lit then
		tracer.Lit = false
		tracer.Light.Enabled = false
		litTracers -= 1
	end
	table.insert(tracerPool, tracer)
end

local function placeTracer(tracer: Tracer)
	local head = math.min(tracer.Traveled, tracer.Length)
	local tail = math.max(0, tracer.Traveled - tracer.Streak)
	tracer.Head.Position = tracer.From + tracer.Dir * head
	tracer.Tail.Position = tracer.From + tracer.Dir * tail
end

local function stepTracers(dt: number)
	for index = #activeTracers, 1, -1 do
		local tracer = activeTracers[index]
		tracer.Traveled += tracer.Speed * dt
		if tracer.Traveled - tracer.Streak >= tracer.Length then
			releaseTracer(index)
		else
			placeTracer(tracer)
		end
	end
end

-- Traînée de vapeur persistante (sniper).
local function spawnTrail(from: Vector3, to: Vector3, color: Color3)
	local length = (to - from).Magnitude
	if length < 2 then
		return
	end
	local folder = getFolder()
	local frame = CFrame.lookAt((from + to) / 2, to) * CFrame.Angles(0, math.pi / 2, 0) -- axe X du cylindre = trajectoire
	local core = newPart(Enum.PartType.Cylinder, Vector3.new(length, 0.1, 0.1), color, Enum.Material.Neon, 0.3)
	core.CFrame = frame
	core.Parent = folder
	tween(core, 0.8, { Transparency = 1, Size = Vector3.new(length, 0.02, 0.02) })
	Debris:AddItem(core, 0.9)
	local vapor = newPart(
		Enum.PartType.Cylinder,
		Vector3.new(length, 0.25, 0.25),
		Color3.fromRGB(220, 228, 240),
		Enum.Material.SmoothPlastic,
		0.75
	)
	vapor.CFrame = frame
	vapor.Parent = folder
	tween(vapor, 1.6, { Transparency = 1, Size = Vector3.new(length, 1.2, 1.2) }, Enum.EasingStyle.Sine)
	Debris:AddItem(vapor, 1.7)
end

function Effects.Tracer(from: Vector3, to: Vector3, color: Color3?, weaponId: string?)
	if not isFiniteVector(from) or not isFiniteVector(to) then
		return
	end
	local delta = to - from
	local length = delta.Magnitude
	if length < 1 then
		return
	end
	ensureHost()

	local tracer = table.remove(tracerPool)
	if not tracer then
		if #activeTracers < MAX_TRACERS then
			tracer = createTracer()
		else
			releaseTracer(1) -- recycle le plus ancien
			tracer = table.remove(tracerPool)
		end
	end
	if not tracer then
		return
	end

	local weapon = if type(weaponId) == "string" then Weapons.ById[weaponId] else nil
	if not weapon and type(ClientState.Weapon) == "table" then
		-- sans weaponId : tir local (GunController) -> arme en main
		weapon = ClientState.Weapon
	end
	local tint = if typeof(color) == "Color3" then color elseif weapon then weapon.TracerColor else DEFAULT_TRACER
	tint = tint or DEFAULT_TRACER
	local colors = colorSet(tint)

	tracer.From = from
	tracer.Dir = delta / length
	tracer.Length = length
	tracer.Speed = if weapon and weapon.Scope then TRACER_SPEED_SNIPER else TRACER_SPEED
	tracer.Streak = math.clamp(length * 0.4, 2.5, TRACER_STREAK)
	tracer.Traveled = math.min(length, 2 + tracer.Streak * 0.5)
	tracer.Core.Color = colors.Core
	tracer.Glow.Color = colors.Glow
	placeTracer(tracer)
	tracer.Core.Enabled = true
	tracer.Glow.Enabled = true
	if litTracers < MAX_TRACER_LIGHTS then
		tracer.Lit = true
		litTracers += 1
		tracer.Light.Color = tint
		tracer.Light.Enabled = true
	end
	table.insert(activeTracers, tracer)

	if weapon and weapon.Scope then
		spawnTrail(from, to, colors.Hot)
	end
end

--------------------------------------------------------------------------
-- Flash de bouche : étoile néon (3 lames + jet + cœur) + lumière, 2-3 frames
--------------------------------------------------------------------------
local function createFlash(): Flash
	local folder = getFolder()
	local core = newPart(Enum.PartType.Ball, Vector3.one * 0.3, WHITE, Enum.Material.Neon, 1)
	core.Name = "FlashCore"
	core.Parent = folder
	local jet = newPart(Enum.PartType.Cylinder, Vector3.new(0.6, 0.15, 0.15), WHITE, Enum.Material.Neon, 1)
	jet.Name = "FlashJet"
	jet.Parent = folder
	local blades = {}
	local offsets = {}
	for index = 1, 3 do
		local blade = newPart(Enum.PartType.Block, Vector3.new(0.03, 0.4, 0.5), WHITE, Enum.Material.Neon, 1)
		blade.Name = "FlashBlade"
		blade.Parent = folder
		blades[index] = blade
		offsets[index] = CFrame.new()
	end
	local light = Instance.new("PointLight")
	light.Shadows = false
	light.Enabled = false
	light.Parent = core
	return {
		Core = core,
		Jet = jet,
		Blades = blades,
		Offsets = offsets,
		CoreOffset = CFrame.new(),
		JetOffset = CFrame.new(),
		Roll = CFrame.new(),
		Light = light,
		Muzzle = nil,
		Frames = 0,
	}
end

local function hideFlash(flash: Flash)
	flash.Core.Transparency = 1
	flash.Jet.Transparency = 1
	for _, blade in flash.Blades do
		blade.Transparency = 1
	end
	flash.Light.Enabled = false
	flash.Muzzle = nil
end

-- Recale le flash sur le canon (l'arme bouge pendant les 2-3 frames).
local function placeFlash(flash: Flash): boolean
	local muzzle = flash.Muzzle
	if not muzzle or not muzzle.Parent then
		return false
	end
	local base = muzzle.WorldCFrame * flash.Roll
	flash.Core.CFrame = base * flash.CoreOffset
	flash.Jet.CFrame = base * flash.JetOffset
	for index, blade in flash.Blades do
		blade.CFrame = base * flash.Offsets[index]
	end
	return true
end

local function stepFlashes()
	for index = #activeFlashes, 1, -1 do
		local flash = activeFlashes[index]
		flash.Frames -= 1
		if flash.Frames <= 0 or not placeFlash(flash) then
			hideFlash(flash)
			table.remove(activeFlashes, index)
			table.insert(flashPool, flash)
		else
			-- frames suivantes : le flash s'éteint
			for _, blade in flash.Blades do
				blade.Transparency = 0.6
			end
			flash.Jet.Transparency = 0.55
			flash.Core.Transparency = 0.4
			flash.Light.Brightness *= 0.45
		end
	end
end

function Effects.MuzzleFlash(muzzle: Attachment?, color: Color3?)
	if typeof(muzzle) ~= "Instance" or not (muzzle :: Instance):IsA("Attachment") then
		return
	end
	local attachment = muzzle :: Attachment
	if not attachment:IsDescendantOf(workspace) then
		return
	end
	local distance = distanceToCamera(attachment.WorldPosition)
	if distance > 500 then
		return
	end
	ensureHost()

	local weapon = weaponFromInstance(attachment)
	local scale = if weapon then FLASH_SCALE[weapon.Sound] or 1 else 1
	local tint = if typeof(color) == "Color3" then color elseif weapon then weapon.TracerColor else DEFAULT_TRACER
	tint = tint or DEFAULT_TRACER
	local colors = colorSet(tint)

	local flash = table.remove(flashPool)
	if not flash then
		if #activeFlashes < MAX_FLASHES then
			flash = createFlash()
		else
			flash = table.remove(activeFlashes, 1)
			if flash then
				hideFlash(flash)
			end
		end
	end
	if not flash then
		return
	end

	local length = 0.5 * scale * random(0.8, 1.3)
	local width = 0.42 * scale * random(0.8, 1.2)
	flash.Roll = CFrame.Angles(0, 0, math.random() * math.pi * 2)
	flash.Core.Size = Vector3.one * (0.3 * scale * random(0.85, 1.15))
	flash.Core.Color = colors.Hot
	flash.Core.Transparency = 0.05
	flash.CoreOffset = CFrame.new(0, 0, -0.06 * scale)
	flash.Jet.Size = Vector3.new(length * 1.35, width * 0.3, width * 0.3)
	flash.Jet.Color = colors.Hot
	flash.Jet.Transparency = 0.2
	flash.JetOffset = CFrame.new(0, 0, -length * 0.65) * CFrame.Angles(0, math.pi / 2, 0)
	for index, blade in flash.Blades do
		blade.Size = Vector3.new(0.025, width, length)
		blade.Color = tint
		blade.Transparency = 0.15
		flash.Offsets[index] = CFrame.Angles(0, 0, (index - 1) * math.pi / 3) * CFrame.new(0, 0, -length * 0.5)
	end
	flash.Light.Color = tint
	flash.Light.Range = 8 + 5 * scale
	flash.Light.Brightness = 3.5
	flash.Light.Enabled = true
	flash.Muzzle = attachment
	flash.Frames = 3
	placeFlash(flash)
	table.insert(activeFlashes, flash)

	if distance < 160 then
		local frame = attachment.WorldCFrame
		emit(frame, emitters["Sparks:Ember"], 2)
		emit(frame, emitters.Smoke, 1)
	end
end

--------------------------------------------------------------------------
-- Corps balistiques (douilles, débris) : arc + rebond au sol + fondu
--------------------------------------------------------------------------
local function addBody(
	part: BasePart,
	position: Vector3,
	velocity: Vector3,
	rotation: CFrame,
	spin: Vector3,
	life: number,
	floorY: number,
	radius: number,
	bounce: number,
	pooled: boolean
)
	part.CFrame = rotation + position
	table.insert(bodies, {
		Part = part,
		Pos = position,
		Vel = velocity,
		Rot = rotation,
		Spin = spin,
		Age = 0,
		Life = life,
		FloorY = floorY,
		Radius = radius,
		Bounce = bounce,
		Pooled = pooled,
	})
end

local function finishBody(body: Body)
	if body.Pooled then
		activeShells -= 1
		body.Part.Transparency = 1
		if body.Part.Parent then
			table.insert(shellPool, body.Part)
		end
	else
		body.Part:Destroy()
	end
end

local function stepBodies(dt: number)
	local gravityStep = BODY_GRAVITY * dt
	for index = #bodies, 1, -1 do
		local body = bodies[index]
		body.Age += dt
		if body.Age >= body.Life or body.Part.Parent == nil then
			table.remove(bodies, index)
			finishBody(body)
		else
			local velocity = body.Vel + gravityStep
			local position = body.Pos + velocity * dt
			local floor = body.FloorY + body.Radius
			if position.Y < floor and velocity.Y < 0 then
				position = Vector3.new(position.X, floor, position.Z)
				local bounceY = -velocity.Y * body.Bounce
				if bounceY < 2 then
					bounceY = 0
				end
				velocity = Vector3.new(velocity.X * 0.45, bounceY, velocity.Z * 0.45)
				body.Spin *= 0.4
			end
			body.Vel = velocity
			body.Pos = position
			local spin = body.Spin
			body.Rot = body.Rot * CFrame.Angles(spin.X * dt, spin.Y * dt, spin.Z * dt)
			body.Part.CFrame = body.Rot + position
			local fadeStart = body.Life - 0.35
			if body.Age > fadeStart then
				body.Part.Transparency = math.min(1, (body.Age - fadeStart) / 0.35)
			end
		end
	end
end

local function spawnShell(eject: Attachment, spec)
	if not eject.Parent or not eject:IsDescendantOf(workspace) then
		return
	end
	if activeShells >= MAX_SHELLS then
		return
	end
	local frame = eject.WorldCFrame
	if distanceToCamera(frame.Position) > SHELL_MAX_DISTANCE then
		return
	end
	ensureHost()

	local part = table.remove(shellPool)
	if not part or not part.Parent then
		part = newPart(Enum.PartType.Cylinder, Vector3.new(0.2, 0.09, 0.09), BRASS, Enum.Material.Metal, 0)
		part.Name = "Shell"
		part.Parent = getFolder()
	end
	part.Size = Vector3.new(spec.Length, spec.Diameter, spec.Diameter)
	part.Color = spec.Color
	part.Material = spec.Material
	part.Reflectance = if spec.Material == Enum.Material.Metal then 0.25 else 0
	part.Transparency = 0

	-- vitesse héritée du porteur (douilles cohérentes en courant)
	local inherited = Vector3.zero
	local holder = eject.Parent
	if holder and holder:IsA("BasePart") then
		inherited = holder.AssemblyLinearVelocity * 0.9
	end
	local velocity = frame.RightVector * random(6, 9)
		+ frame.UpVector * random(4, 7)
		- frame.LookVector * random(0.5, 2)
		+ inherited
	local spin = Vector3.new(random(-25, 25), random(-30, 30), random(-25, 25))

	local floorY = -math.huge
	local ground = workspace:Raycast(frame.Position, Vector3.new(0, -14, 0), getWorldParams())
	if ground then
		floorY = ground.Position.Y
	end
	activeShells += 1
	-- axe X du cylindre aligné sur le canon
	addBody(
		part,
		frame.Position,
		velocity,
		frame.Rotation * CFrame.Angles(0, math.pi / 2, 0),
		spin,
		1.3,
		floorY,
		spec.Diameter * 0.5,
		0.35,
		true
	)
end

function Effects.Shell(eject: Attachment?, weaponId: string?)
	if typeof(eject) ~= "Instance" or not (eject :: Instance):IsA("Attachment") then
		return
	end
	local attachment = eject :: Attachment
	local weapon = if type(weaponId) == "string" then Weapons.ById[weaponId] else nil
	weapon = weapon or weaponFromInstance(attachment)
	local spec = weapon and SHELL_SPECS[weapon.Sound]
	if not spec then
		return
	end
	if spec.Delay then
		task.delay(spec.Delay, spawnShell, attachment, spec)
	else
		spawnShell(attachment, spec)
	end
end

--------------------------------------------------------------------------
-- « Pops » : petites sphères néon qui gonflent et s'éteignent (touche personnage, éclats)
--------------------------------------------------------------------------
local function spawnPop(position: Vector3, color: Color3, fromSize: number, toSize: number, life: number, alpha: number)
	local pop = table.remove(popPool)
	if pop and not pop.Part.Parent then
		pop = nil
	end
	if not pop then
		if #activePops >= MAX_POPS then
			return
		end
		local part = newPart(Enum.PartType.Ball, Vector3.one, color, Enum.Material.Neon, 1)
		part.Name = "Pop"
		part.Parent = getFolder()
		pop = { Part = part, Age = 0, Life = life, From = fromSize, To = toSize, Alpha = alpha }
	end
	local current = pop :: Pop
	current.Age = 0
	current.Life = math.max(life, 0.02)
	current.From = fromSize
	current.To = toSize
	current.Alpha = alpha
	current.Part.Color = color
	current.Part.Size = Vector3.one * fromSize
	current.Part.CFrame = CFrame.new(position)
	current.Part.Transparency = alpha
	table.insert(activePops, current)
end

local function stepPops(dt: number)
	for index = #activePops, 1, -1 do
		local pop = activePops[index]
		pop.Age += dt
		local k = pop.Age / pop.Life
		if k >= 1 or not pop.Part.Parent then
			pop.Part.Transparency = 1
			table.remove(activePops, index)
			if pop.Part.Parent then
				table.insert(popPool, pop)
			end
		else
			local eased = 1 - (1 - k) * (1 - k)
			pop.Part.Size = Vector3.one * (pop.From + (pop.To - pop.From) * eased)
			pop.Part.Transparency = pop.Alpha + (1 - pop.Alpha) * k
		end
	end
end

--------------------------------------------------------------------------
-- Trous de balle (pool circulaire, disparaissent après ~8 s)
--------------------------------------------------------------------------
local function spawnHole(position: Vector3, normal: Vector3, color: Color3, hot: boolean, baseTransparency: number)
	holeIndex = holeIndex % MAX_HOLES + 1
	local hole = holes[holeIndex]
	if hole and not hole.Part.Parent then
		hole = nil
	end
	if not hole then
		local part = newPart(Enum.PartType.Cylinder, Vector3.new(0.02, 0.2, 0.2), color, Enum.Material.SmoothPlastic, 1)
		part.Name = "BulletHole"
		part.Parent = getFolder()
		hole = { Part = part, Born = 0, Active = false, Hot = false, Base = 0, Color = color }
		holes[holeIndex] = hole
	end
	local current = hole :: Hole
	local part = current.Part
	local size = random(0.16, 0.24)
	part.Size = Vector3.new(0.02, size, size)
	-- axe X du cylindre (son épaisseur) aligné sur la normale
	part.CFrame = CFrame.lookAt(position + normal * 0.012, position + normal * 2, upFor(normal))
		* CFrame.Angles(0, math.pi / 2, 0)
	current.Hot = hot
	current.Color = color
	current.Base = baseTransparency
	current.Born = os.clock()
	current.Active = true
	if hot then
		-- métal : le trou rougeoie une fraction de seconde
		part.Material = Enum.Material.Neon
		part.Color = Color3.fromRGB(255, 150, 60)
		part.Transparency = 0
	else
		part.Material = Enum.Material.SmoothPlastic
		part.Color = color
		part.Transparency = baseTransparency
	end
end

local function stepHoles(now: number)
	for _, hole in holes do
		if hole.Active then
			local part = hole.Part
			local age = now - hole.Born
			if hole.Hot and age > 0.15 then
				hole.Hot = false
				part.Material = Enum.Material.SmoothPlastic
				part.Color = hole.Color
				part.Transparency = hole.Base
			end
			if age >= HOLE_LIFE then
				hole.Active = false
				part.Transparency = 1
			elseif age > HOLE_LIFE - HOLE_FADE then
				local k = (age - (HOLE_LIFE - HOLE_FADE)) / HOLE_FADE
				part.Transparency = hole.Base + (1 - hole.Base) * k
			end
		end
	end
end

--------------------------------------------------------------------------
-- Impacts
--------------------------------------------------------------------------
local function impactAt(
	position: Vector3,
	normal: Vector3,
	part: Instance?,
	material: Enum.Material,
	surfaceColor: Color3,
	isCharacter: boolean
)
	local distance = distanceToCamera(position)
	if distance > FX_MAX_DISTANCE then
		return
	end
	ensureHost()
	local frame = frameFacing(position, normal)
	local near = distance < 160

	if isCharacter then
		-- pas de sang : une étincelle vive et un petit éclat lumineux
		emit(frame, emitters.HitSpark, if near then 10 else 5)
		spawnPop(position, HIT_POP_COLOR, 0.3, 1.4, 0.14, 0)
		return
	end

	local style = IMPACT_STYLES[MATERIAL_KIND[material] or "Plastic"] or IMPACT_STYLES.Plastic
	local scale = if near then 1 else 0.4
	if style.SparkKey then
		emit(frame, emitters[style.SparkKey], style.SparkCount * scale)
	end
	if style.DustKey then
		emit(frame, emitters[style.DustKey], style.DustCount * scale)
	end
	if style.ChipKey then
		emit(frame, emitters[style.ChipKey], style.ChipCount * scale)
	end

	-- trou de balle seulement sur le décor fixe (sinon il flotterait dans le vide)
	if style.NoHole or not part or distance > 300 then
		return
	end
	local fixed = false
	if part:IsA("Terrain") then
		fixed = true
	elseif part:IsA("BasePart") then
		fixed = part.Anchored and part.Transparency < 0.5
	end
	if fixed then
		local holeColor = style.HoleColor or surfaceColor:Lerp(Color3.new(0.04, 0.04, 0.045), 0.85)
		spawnHole(position, normal, holeColor, style.Hot == true, style.HoleTransparency or 0.05)
	end
end

function Effects.Impact(position: Vector3, normal: Vector3, hitPart: BasePart?, isCharacter: boolean?)
	if not isFiniteVector(position) then
		return
	end
	local surfaceNormal = Vector3.yAxis
	if isFiniteVector(normal) and normal.Magnitude > 0.01 then
		surfaceNormal = normal.Unit
	end
	if isCharacter == true then
		impactAt(position, surfaceNormal, hitPart, Enum.Material.Plastic, WHITE, true)
		return
	end

	local part: Instance? = if typeof(hitPart) == "Instance" then hitPart else nil
	local material = Enum.Material.Plastic
	local color = Color3.fromRGB(150, 150, 150)
	if part and part:IsA("BasePart") and not part:IsA("Terrain") then
		material = part.Material
		color = part.Color
	else
		-- Terrain (matériau par voxel) ou pièce inconnue : petit rayon pour lire la surface
		local result = probeSurface(position, surfaceNormal)
		if result then
			part = result.Instance
			material = result.Material
			color = surfaceColorOf(result)
		end
	end
	impactAt(position, surfaceNormal, part, material, color, false)
end

--------------------------------------------------------------------------
-- Sons d'armes
--------------------------------------------------------------------------
function Effects.PlayWeaponSound(weaponId: string, at: (Instance | Vector3)?): Sound?
	local weapon = if type(weaponId) == "string" then Weapons.ById[weaponId] else nil
	if not weapon then
		return nil
	end
	local soundId = Config.Sounds.Weapons[weapon.Sound]
	local profile = SOUND_PROFILES[weapon.Sound] or DEFAULT_SOUND_PROFILE
	if typeof(at) == "Vector3" then
		if not isFiniteVector(at) or distanceToCamera(at) > profile.Range then
			return nil
		end
		return Sfx.PlayAt(soundId, at, profile.Volume, 0.06, profile.Range)
	elseif typeof(at) == "Instance" then
		local instance = at :: Instance
		if not instance:IsDescendantOf(workspace) then
			return nil
		end
		local position: Vector3? = nil
		if instance:IsA("Attachment") then
			position = instance.WorldPosition
		elseif instance:IsA("BasePart") then
			position = instance.Position
		end
		if not position or distanceToCamera(position) > profile.Range then
			return nil -- trop loin pour être entendu : pas de Sound créé
		end
		return Sfx.PlayAt(soundId, instance, profile.Volume, 0.06, profile.Range)
	end
	-- pas de position : son « interface » (tir local sans repère)
	return Sfx.Play2D(soundId, profile.Volume, 1)
end

--------------------------------------------------------------------------
-- Tirs des autres joueurs (Remotes.ShotFx)
--------------------------------------------------------------------------
local function onShotFx(shooter: any, weaponId: any, origin: any, impacts: any)
	if typeof(shooter) ~= "Instance" or not shooter:IsA("Player") or shooter == LocalPlayer then
		return
	end
	local weapon = if type(weaponId) == "string" then Weapons.ById[weaponId] else nil
	if not weapon or not isFiniteVector(origin) then
		return
	end

	local character = shooter.Character
	local tool = character and character:FindFirstChildOfClass("Tool")
	local muzzle = getAttachment(tool, "Muzzle")
	local start: Vector3 = origin
	if muzzle and (muzzle.WorldPosition - origin).Magnitude < 12 then
		start = muzzle.WorldPosition
	else
		muzzle = nil
	end
	local distance = distanceToCamera(start)

	Effects.PlayWeaponSound(weapon.Id, if muzzle then muzzle else start)
	if muzzle then
		Effects.MuzzleFlash(muzzle, weapon.TracerColor)
	end
	if tool and distance < SHELL_MAX_DISTANCE then
		local eject = getAttachment(tool, "Eject")
		if eject then
			Effects.Shell(eject, weapon.Id)
		end
	end

	if type(impacts) ~= "table" then
		return
	end
	local maxImpacts = math.max(1, weapon.Pellets or 1) + 2
	local count = 0
	for _, impact in impacts do
		count += 1
		if count > maxImpacts then
			break
		end
		if type(impact) == "table" and isFiniteVector(impact.Position) then
			local position: Vector3 = impact.Position
			Effects.Tracer(start, position, weapon.TracerColor, weapon.Id)
			local normal = impact.Normal
			local hasNormal = isFiniteVector(normal) and normal.Magnitude > 0.01
			if impact.Character == true then
				Effects.Impact(position, if hasNormal then normal else (start - position), nil, true)
			elseif hasNormal then
				-- tir manqué (normale nulle) = rien à afficher au bout ; sinon on lit la surface
				local unit = normal.Unit
				local result = probeSurface(position, unit)
				if result then
					impactAt(position, unit, result.Instance, result.Material, surfaceColorOf(result), false)
				end
			end
		end
	end
end

--------------------------------------------------------------------------
-- Chiffres de dégâts (Remotes.HitConfirm)
--------------------------------------------------------------------------
type DamageNumber = {
	Attachment: Attachment,
	Gui: BillboardGui,
	Label: TextLabel,
	Stroke: UIStroke,
	Scale: UIScale,
	Anchor: Vector3,
	Total: number,
	Headshot: boolean,
	Killed: boolean,
	Updated: number,
	Token: number,
	Fading: boolean,
	PopTween: Tween?,
}
local damageNumbers: { DamageNumber } = {}

local function destroyNumber(entry: DamageNumber)
	local index = table.find(damageNumbers, entry)
	if index then
		table.remove(damageNumbers, index)
	end
	entry.Token += 1
	if entry.PopTween then
		entry.PopTween:Cancel()
	end
	entry.Attachment:Destroy()
end

local function refreshNumber(entry: DamageNumber, strong: boolean)
	local label = entry.Label
	local color = Ui.Colors.Text
	local size = 30
	if entry.Headshot then
		color = Config.Colors.Gold
		size = 36
	end
	if entry.Killed then
		size += 6
		if not entry.Headshot then
			color = Config.Colors.Accent2
		end
	end
	label.TextColor3 = color
	label.TextSize = size
	label.Text = tostring(math.floor(entry.Total + 0.5)) .. (if entry.Killed then " 💀" else "")
	label.TextTransparency = 0
	entry.Stroke.Transparency = 0

	if entry.PopTween then
		entry.PopTween:Cancel()
	end
	entry.Scale.Scale = if strong then 1.9 else 1.45
	entry.PopTween = tween(entry.Scale, 0.25, { Scale = 1 }, Enum.EasingStyle.Back, Enum.EasingDirection.Out)
	entry.Updated = os.clock()
	entry.Token += 1
	local token = entry.Token
	task.delay(0.8, function()
		if entry.Token ~= token then
			return
		end
		if not entry.Attachment.Parent then
			destroyNumber(entry)
			return
		end
		entry.Fading = true
		tween(label, 0.35, { TextTransparency = 1 })
		tween(entry.Stroke, 0.35, { Transparency = 1 })
		task.delay(0.4, function()
			if entry.Token == token then
				destroyNumber(entry)
			end
		end)
	end)
end

local function showDamageNumber(position: Vector3, damage: number, headshot: boolean, killed: boolean)
	local now = os.clock()
	-- même cible touchée à l'instant : on cumule dans le même chiffre
	for _, entry in damageNumbers do
		if not entry.Fading and now - entry.Updated < 0.7 and (entry.Anchor - position).Magnitude < 6 then
			entry.Total += damage
			entry.Headshot = entry.Headshot or headshot
			entry.Killed = entry.Killed or killed
			entry.Anchor = position
			refreshNumber(entry, headshot or killed)
			return
		end
	end

	while #damageNumbers >= MAX_DAMAGE_NUMBERS do
		destroyNumber(damageNumbers[1])
	end
	ensureHost()

	local attachment = Instance.new("Attachment")
	attachment.Name = "DamageNumber"
	attachment.Position = position + Vector3.new(random(-0.8, 0.8), 1.2, random(-0.8, 0.8))
	attachment.Parent = host
	local gui = Ui.new("BillboardGui", {
		Name = "DamageNumberGui",
		Size = UDim2.fromOffset(220, 64),
		AlwaysOnTop = true,
		LightInfluence = 0,
		MaxDistance = 1200,
		StudsOffsetWorldSpace = Vector3.zero,
		ResetOnSpawn = false,
		Parent = attachment,
	})
	local label = Ui.label({
		Name = "Value",
		Size = UDim2.fromScale(1, 1),
		TextScaled = false,
		TextSize = 30,
		FontFace = Ui.Fonts.Title,
		Text = "",
		Parent = gui,
	})
	local stroke = Ui.new("UIStroke", {
		Color = Color3.new(0, 0, 0),
		Thickness = 2.2,
		Transparency = 0,
		Parent = label,
	})
	local scale = Ui.new("UIScale", { Parent = label })

	local entry: DamageNumber = {
		Attachment = attachment,
		Gui = gui,
		Label = label,
		Stroke = stroke,
		Scale = scale,
		Anchor = position,
		Total = damage,
		Headshot = headshot,
		Killed = killed,
		Updated = now,
		Token = 0,
		Fading = false,
		PopTween = nil,
	}
	table.insert(damageNumbers, entry)
	tween(gui, 1.1, { StudsOffsetWorldSpace = Vector3.new(0, 2.2, 0) }, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	refreshNumber(entry, headshot or killed)
end

local function onHitConfirm(position: any, damage: any, headshot: any, killed: any)
	if not isFiniteVector(position) or not isFiniteNumber(damage) then
		return
	end
	local isHeadshot = headshot == true
	local isKill = killed == true
	Sfx.Play2D(Config.Sounds.Hitmarker, 0.55, 1 + random(-0.04, 0.04))
	if isHeadshot then
		Sfx.Play2D(Config.Sounds.Headshot, 0.7)
	end
	if isKill then
		Sfx.Play2D(Config.Sounds.Kill, 0.8)
	end
	local settings = ClientState.Settings
	if type(settings) == "table" and settings.DamageNumbers == false then
		return
	end
	showDamageNumber(position, math.max(0, damage), isHeadshot, isKill)
end

--------------------------------------------------------------------------
-- Anneaux au sol (segments néon) : radar, frappe orbitale, ondes de choc
--------------------------------------------------------------------------
type Ring = { Parts: { BasePart }, Thickness: number, Height: number }

local function createRing(count: number, color: Color3, thickness: number, height: number, transparency: number): Ring
	local folder = getFolder()
	local parts = table.create(count)
	for index = 1, count do
		local part = newPart(Enum.PartType.Block, Vector3.new(thickness, height, 1), color, Enum.Material.Neon, transparency)
		part.Name = "RingSegment"
		part.Parent = folder
		parts[index] = part
	end
	return { Parts = parts, Thickness = thickness, Height = height }
end

local function setRing(ring: Ring, center: Vector3, radius: number, transparency: number?)
	local count = #ring.Parts
	local segment = math.max(0.05, (2 * math.pi * radius / count) * 1.06)
	local size = Vector3.new(ring.Thickness, ring.Height, segment)
	for index, part in ring.Parts do
		local angle = (index - 1) / count * 2 * math.pi
		part.Size = size
		-- X local = radial (épaisseur), Z local = tangente
		part.CFrame = CFrame.new(center.X + math.cos(angle) * radius, center.Y, center.Z + math.sin(angle) * radius)
			* CFrame.Angles(0, -angle, 0)
		if transparency then
			part.Transparency = transparency
		end
	end
end

local function setRingTransparency(ring: Ring, transparency: number)
	for _, part in ring.Parts do
		part.Transparency = transparency
	end
end

local function destroyRing(ring: Ring)
	for _, part in ring.Parts do
		part:Destroy()
	end
end

-- Anneau qui s'élargit en s'effaçant.
local function shockRing(center: Vector3, maxRadius: number, color: Color3, life: number, thickness: number)
	local ring = createRing(44, color, thickness, 0.45, 0)
	local start = os.clock()
	while true do
		local k = (os.clock() - start) / life
		if k >= 1 then
			break
		end
		local eased = 1 - (1 - k) ^ 3
		setRing(ring, center, 1 + eased * maxRadius, k)
		task.wait()
	end
	destroyRing(ring)
end

--------------------------------------------------------------------------
-- Highlights (radar, killcam)
--------------------------------------------------------------------------
local function makeHighlight(name: string, adornee: Instance, fill: Color3, outline: Color3, fillTransparency: number): Highlight
	local highlight = Instance.new("Highlight")
	highlight.Name = name
	highlight.DepthMode = Enum.HighlightDepthMode.AlwaysOnTop
	highlight.FillColor = fill
	highlight.OutlineColor = outline
	highlight.FillTransparency = 1
	highlight.OutlineTransparency = 1
	highlight.Adornee = adornee
	highlight.Parent = getFolder()
	tween(highlight, 0.35, { FillTransparency = fillTransparency, OutlineTransparency = 0 })
	return highlight
end

local function fadeHighlight(highlight: Highlight)
	if not highlight.Parent then
		return
	end
	tween(highlight, 0.3, { FillTransparency = 1, OutlineTransparency = 1 })
	Debris:AddItem(highlight, 0.35)
end

--------------------------------------------------------------------------
-- Radar : tous les autres joueurs visibles en rouge à travers les murs
--------------------------------------------------------------------------
local radar = {
	Until = 0,
	Running = false,
	Highlights = {} :: { [Player]: Highlight },
}

local function localRoot(): BasePart?
	local character = LocalPlayer.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		return root
	end
	return nil
end

local function refreshRadar()
	local root = localRoot()
	local origin = if root then root.Position else (cameraPosition() or Vector3.zero)
	local candidates = {}
	for _, player in Players:GetPlayers() do
		if player ~= LocalPlayer then
			local character = player.Character
			local humanoid = character and character:FindFirstChildOfClass("Humanoid")
			local theirRoot = character and character:FindFirstChild("HumanoidRootPart")
			if humanoid and humanoid.Health > 0 and theirRoot and theirRoot:IsA("BasePart") then
				table.insert(candidates, {
					Player = player,
					Character = character,
					Distance = (theirRoot.Position - origin).Magnitude,
				})
			end
		end
	end
	table.sort(candidates, function(a, b)
		return a.Distance < b.Distance
	end)

	local keep = {}
	for index, candidate in candidates do
		if index > RADAR_MAX_HIGHLIGHTS then
			break
		end
		keep[candidate.Player] = true
		local highlight = radar.Highlights[candidate.Player]
		if highlight and (highlight.Parent == nil or highlight.Adornee ~= candidate.Character) then
			-- réapparition : nouveau personnage
			highlight:Destroy()
			highlight = nil
		end
		if not highlight then
			radar.Highlights[candidate.Player] = makeHighlight(
				"RadarHighlight",
				candidate.Character,
				Config.Colors.Bad,
				Color3.fromRGB(255, 170, 170),
				0.55
			)
		end
	end
	for player, highlight in radar.Highlights do
		if not keep[player] then
			radar.Highlights[player] = nil
			fadeHighlight(highlight)
		end
	end
end

local function clearRadar()
	for player, highlight in radar.Highlights do
		radar.Highlights[player] = nil
		fadeHighlight(highlight)
	end
end

-- Onde de balayage cyan autour du joueur à l'activation.
local function radarWave()
	local root = localRoot()
	if not root then
		return
	end
	local center = root.Position - Vector3.new(0, 2.6, 0)
	local ring = createRing(48, Config.Colors.Accent, 0.6, 0.35, 0.1)
	local start = os.clock()
	local life = 1.4
	while true do
		local k = (os.clock() - start) / life
		if k >= 1 then
			break
		end
		local eased = 1 - (1 - k) ^ 3
		setRing(ring, center, 2 + eased * 160, 0.1 + 0.9 * k)
		task.wait()
	end
	destroyRing(ring)
end

local function startRadar(duration: number)
	radar.Until = math.max(radar.Until, os.clock() + math.clamp(duration, 0, 120))
	Sfx.Play2D(Config.Sounds.Radar, 0.7)
	task.spawn(radarWave)
	if radar.Running then
		return
	end
	radar.Running = true
	task.spawn(function()
		while os.clock() < radar.Until do
			refreshRadar()
			task.wait(0.25)
		end
		clearRadar()
		radar.Running = false
	end)
end

--------------------------------------------------------------------------
-- Frappe orbitale
--------------------------------------------------------------------------
local ORBITAL = findKillstreak("Orbital")
local CYLINDER_UP = CFrame.Angles(0, 0, math.pi / 2) -- axe X du cylindre -> vertical

local function orbitalImpact(ground: Vector3, radius: number, groundColor: Color3)
	local folder = getFolder()
	ensureHost()
	Sfx.PlayAt(Config.Sounds.Orbital, ground, 1.2, 0.03, 1500)

	-- colonne géante blanc-bleu venue du ciel
	local columnFrame = CFrame.new(ground + Vector3.new(0, 400, 0)) * CYLINDER_UP
	local core = newPart(Enum.PartType.Cylinder, Vector3.new(800, 2, 2), Color3.fromRGB(240, 250, 255), Enum.Material.Neon, 0)
	core.Name = "OrbitalCore"
	core.CFrame = columnFrame
	core.Parent = folder
	local glow = newPart(Enum.PartType.Cylinder, Vector3.new(800, 5, 5), Color3.fromRGB(90, 170, 255), Enum.Material.Neon, 0.5)
	glow.Name = "OrbitalGlow"
	glow.CFrame = columnFrame
	glow.Parent = folder
	tween(core, 0.12, { Size = Vector3.new(800, radius * 0.75, radius * 0.75) })
	tween(glow, 0.15, { Size = Vector3.new(800, radius * 1.6, radius * 1.6) })
	-- 2e phase lancée après coup (un tween différé sur la même propriété annulerait le premier)
	task.delay(0.18, function()
		if core.Parent then
			tween(core, 0.9, { Size = Vector3.new(800, 0.2, 0.2), Transparency = 1 }, Enum.EasingStyle.Quint, Enum.EasingDirection.In)
		end
		if glow.Parent then
			tween(glow, 1.1, { Size = Vector3.new(800, 0.5, 0.5), Transparency = 1 }, Enum.EasingStyle.Quint, Enum.EasingDirection.In)
		end
	end)
	Debris:AddItem(core, 1.4)
	Debris:AddItem(glow, 1.5)

	-- sphère d'énergie + éclair central
	local sphere = newPart(Enum.PartType.Ball, Vector3.one * 4, Color3.fromRGB(160, 215, 255), Enum.Material.ForceField, 0)
	sphere.CFrame = CFrame.new(ground)
	sphere.Parent = folder
	tween(sphere, 0.7, { Size = Vector3.one * radius * 2.6, Transparency = 1 }, Enum.EasingStyle.Quint, Enum.EasingDirection.Out)
	Debris:AddItem(sphere, 0.8)
	spawnPop(ground + Vector3.new(0, 1, 0), WHITE, 3, radius * 1.4, 0.35, 0)

	-- lumière éblouissante
	local lightPart = newPart(Enum.PartType.Block, Vector3.one * 0.2, WHITE, Enum.Material.SmoothPlastic, 1)
	lightPart.CFrame = CFrame.new(ground + Vector3.new(0, 5, 0))
	lightPart.Parent = folder
	local light = Instance.new("PointLight")
	light.Color = Color3.fromRGB(170, 215, 255)
	light.Range = 60
	light.Brightness = 14
	light.Shadows = false
	light.Parent = lightPart
	tween(light, 0.9, { Brightness = 0 })
	Debris:AddItem(lightPart, 1)

	-- particules
	local upFrame = frameFacing(ground + Vector3.new(0, 0.5, 0), Vector3.yAxis)
	emit(upFrame, emitters.BigSparks, 70)
	emit(upFrame, emitters.BigSmoke, 18)

	-- débris projetés (non poolés, détruits en fin de vie)
	local rockColor = groundColor:Lerp(Color3.fromRGB(26, 26, 30), 0.45)
	for _ = 1, 16 do
		local size = random(0.4, 1.3)
		local rock = newPart(
			Enum.PartType.Block,
			Vector3.new(size, size * random(0.6, 1), size * random(0.6, 1.2)),
			rockColor,
			Enum.Material.Slate,
			0
		)
		rock.Name = "Debris"
		rock.Parent = folder
		local angle = math.random() * math.pi * 2
		local velocity = Vector3.new(math.cos(angle), 0, math.sin(angle)) * random(14, 38)
			+ Vector3.new(0, random(28, 60), 0)
		addBody(
			rock,
			ground + Vector3.new(0, 1, 0),
			velocity,
			CFrame.Angles(random(0, 6.28), random(0, 6.28), random(0, 6.28)),
			Vector3.new(random(-8, 8), random(-8, 8), random(-8, 8)),
			random(1.8, 2.6),
			ground.Y,
			size * 0.4,
			0.3,
			false
		)
	end

	-- ondes de choc au sol
	task.spawn(shockRing, ground + Vector3.new(0, 0.3, 0), radius * 2.2, Color3.fromRGB(205, 235, 255), 0.7, 1.2)
	task.delay(0.12, shockRing, ground + Vector3.new(0, 0.25, 0), radius * 1.6, Config.Colors.Accent, 0.9, 0.8)

	-- brûlure au sol + braises
	local scorch = newPart(
		Enum.PartType.Cylinder,
		Vector3.new(0.06, radius * 1.7, radius * 1.7),
		Color3.fromRGB(16, 16, 20),
		Enum.Material.SmoothPlastic,
		0.1
	)
	scorch.Name = "Scorch"
	scorch.CFrame = CFrame.new(ground + Vector3.new(0, 0.04, 0)) * CYLINDER_UP
	scorch.Parent = folder
	tween(scorch, 2, { Transparency = 1 }, Enum.EasingStyle.Quad, Enum.EasingDirection.In, 6)
	Debris:AddItem(scorch, 8.2)
	local ember = newPart(
		Enum.PartType.Cylinder,
		Vector3.new(0.07, radius * 0.9, radius * 0.9),
		Color3.fromRGB(255, 120, 40),
		Enum.Material.Neon,
		0.2
	)
	ember.Name = "Embers"
	ember.CFrame = CFrame.new(ground + Vector3.new(0, 0.06, 0)) * CYLINDER_UP
	ember.Parent = folder
	tween(ember, 2.5, { Transparency = 1, Size = Vector3.new(0.07, radius * 0.4, radius * 0.4) }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
	Debris:AddItem(ember, 2.6)

	-- tremblement + flash d'écran selon la distance
	local root = localRoot()
	local listener = if root then root.Position else (cameraPosition() or ground)
	local distance = (listener - ground).Magnitude
	local intensity = math.clamp(1.15 - distance / (radius * 10), 0, 1)
	if intensity > 0.03 then
		ClientState.Emit("CameraShake", intensity)
		local flash = Instance.new("ColorCorrectionEffect")
		flash.Name = "OrbitalFlashCC"
		flash.Brightness = 0.35 * intensity
		flash.TintColor = Color3.fromRGB(215, 235, 255)
		flash.Parent = Lighting
		tween(flash, 0.6, { Brightness = 0, TintColor = WHITE })
		Debris:AddItem(flash, 0.7)
	end
end

local function orbitalStrike(target: Vector3, delayTime: number)
	local radius = if ORBITAL and type(ORBITAL.Radius) == "number" then ORBITAL.Radius else 22
	local duration = math.clamp(delayTime, 0, 10)

	-- recale sur le sol réel
	local ground = target
	local groundColor = Color3.fromRGB(70, 70, 75)
	local result = workspace:Raycast(target + Vector3.new(0, 6, 0), Vector3.new(0, -40, 0), getWorldParams())
	if result then
		ground = result.Position
		groundColor = surfaceColorOf(result)
	end
	local folder = getFolder()
	local red = Color3.fromRGB(255, 45, 60)
	local center = ground + Vector3.new(0, 0.12, 0)

	-- avertissement : anneau pulsant, anneau « compte à rebours » qui se resserre, disque qui se remplit,
	-- rayon de visée vertical, chevrons tournants, lumière rouge
	local outer = createRing(40, red, 0.5, 0.22, 0.2)
	setRing(outer, center, radius)
	local inner = createRing(40, Color3.fromRGB(255, 205, 205), 0.3, 0.2, 0.1)
	local disc = newPart(Enum.PartType.Cylinder, Vector3.new(0.1, 0.1, 0.1), red, Enum.Material.Neon, 0.82)
	disc.Name = "OrbitalFill"
	disc.CFrame = CFrame.new(center) * CYLINDER_UP
	disc.Parent = folder
	local beam = newPart(Enum.PartType.Cylinder, Vector3.new(500, 0.6, 0.6), red, Enum.Material.Neon, 0.25)
	beam.Name = "OrbitalBeam"
	beam.CFrame = CFrame.new(ground + Vector3.new(0, 250, 0)) * CYLINDER_UP
	beam.Parent = folder
	local marks = {}
	for index = 1, 4 do
		local mark = newPart(Enum.PartType.Block, Vector3.new(0.35, 0.22, radius * 0.25), WHITE, Enum.Material.Neon, 0.15)
		mark.Name = "OrbitalMark"
		mark.Parent = folder
		marks[index] = mark
	end
	local lightPart = newPart(Enum.PartType.Block, Vector3.one * 0.2, red, Enum.Material.SmoothPlastic, 1)
	lightPart.CFrame = CFrame.new(ground + Vector3.new(0, 3, 0))
	lightPart.Parent = folder
	local light = Instance.new("PointLight")
	light.Color = red
	light.Range = radius * 1.4
	light.Brightness = 2
	light.Shadows = false
	light.Parent = lightPart
	Sfx.PlayAt(Config.Sounds.OrbitalCharge, ground, 1, 0, 700)

	local start = os.clock()
	local phase = 0
	while true do
		local dt = task.wait()
		local t = os.clock() - start
		if t >= duration then
			break
		end
		local k = t / math.max(duration, 0.01)
		phase += dt * (2.5 + k * 12) * math.pi * 2 -- le pouls accélère jusqu'à l'impact
		local pulse = 0.5 + 0.5 * math.sin(phase)
		setRingTransparency(outer, 0.05 + 0.45 * (1 - pulse))
		setRing(inner, center, math.max(0.3, radius * (1 - k)), 0.1)
		local fill = math.max(0.1, radius * 2 * k)
		disc.Size = Vector3.new(0.1, fill, fill)
		disc.Transparency = 0.86 - 0.1 * pulse
		local width = 0.4 + 0.6 * pulse + k * 0.8
		beam.Size = Vector3.new(500, width, width)
		light.Brightness = 1 + 4 * pulse * (0.5 + k)
		local spinAngle = t * (1.5 + k * 4)
		local markRadius = radius * (0.55 - 0.3 * k)
		for index, mark in marks do
			local angle = spinAngle + (index - 1) * math.pi / 2
			mark.CFrame = CFrame.new(center + Vector3.new(math.cos(angle) * markRadius, 0.05, math.sin(angle) * markRadius))
				* CFrame.Angles(0, math.pi / 2 - angle, 0)
		end
	end

	destroyRing(outer)
	destroyRing(inner)
	disc:Destroy()
	beam:Destroy()
	for _, mark in marks do
		mark:Destroy()
	end
	lightPart:Destroy()
	orbitalImpact(ground, radius, groundColor)
end

local function onRewardFx(rewardId: any, owner: any, position: any, duration: any)
	local seconds = if isFiniteNumber(duration) then duration else 0
	if rewardId == "Radar" then
		if owner == nil or owner == LocalPlayer then
			local definition = findKillstreak("Radar")
			if seconds <= 0 and definition then
				seconds = definition.Duration or 10
			end
			startRadar(seconds)
		end
	elseif rewardId == "Orbital" then
		if isFiniteVector(position) then
			task.spawn(orbitalStrike, position, seconds)
		end
	end
end

--------------------------------------------------------------------------
-- Pose de visée (R15) : inclinaison buste / tête / bras + IK main gauche
--------------------------------------------------------------------------
type Pose = {
	Character: Model,
	Humanoid: Humanoid,
	IsLocal: boolean,
	Tool: Tool?,
	ReleaseAt: number,
	Waist: Motor6D,
	WaistC0: CFrame,
	Neck: Motor6D?,
	NeckC0: CFrame,
	Shoulder: Motor6D?,
	ShoulderC0: CFrame,
	Ik: IKControl?,
	IkWeight: number,
	Pole: Attachment?,
	Pitch: number,
	Applied: number,
}
local poses: { [Model]: Pose } = {}

local function removePose(character: Model)
	local pose = poses[character]
	if not pose then
		return
	end
	poses[character] = nil
	if pose.Ik then
		pose.Ik:Destroy()
	end
	if pose.Pole then
		pose.Pole:Destroy()
	end
	-- C0 d'origine restaurés
	if pose.Waist.Parent then
		pose.Waist.C0 = pose.WaistC0
	end
	if pose.Neck and pose.Neck.Parent then
		pose.Neck.C0 = pose.NeckC0
	end
	if pose.Shoulder and pose.Shoulder.Parent then
		pose.Shoulder.C0 = pose.ShoulderC0
	end
end

local function getMotor(parent: Instance?, name: string): Motor6D?
	local motor = parent and parent:FindFirstChild(name)
	if motor and motor:IsA("Motor6D") then
		return motor
	end
	return nil
end

local function onToolEquipped(player: Player, character: Model, humanoid: Humanoid, tool: Tool)
	if humanoid.RigType ~= Enum.HumanoidRigType.R15 then
		return -- R6 : pas de Waist / IK
	end
	-- les pièces de l'arme peuvent arriver un peu après le Tool : on attend LeftGrip (max ~1,5 s)
	local leftGrip: Attachment? = nil
	for _ = 1, 15 do
		if tool.Parent ~= character or humanoid.Health <= 0 then
			return
		end
		leftGrip = getAttachment(tool, "LeftGrip")
		if leftGrip then
			break
		end
		task.wait(0.1)
	end
	if tool.Parent ~= character or humanoid.Health <= 0 then
		return
	end
	if not leftGrip and tool:GetAttribute("WeaponId") == nil then
		return -- pas une arme du jeu
	end

	local upperTorso = character:FindFirstChild("UpperTorso")
	local waist = getMotor(upperTorso, "Waist")
	if not upperTorso or not waist then
		return
	end

	local pose = poses[character]
	if not pose then
		local neck = getMotor(character:FindFirstChild("Head"), "Neck")
		local shoulder = getMotor(character:FindFirstChild("RightUpperArm"), "RightShoulder")
		pose = {
			Character = character,
			Humanoid = humanoid,
			IsLocal = player == LocalPlayer,
			Tool = nil,
			ReleaseAt = 0,
			Waist = waist,
			WaistC0 = waist.C0,
			Neck = neck,
			NeckC0 = if neck then neck.C0 else CFrame.new(),
			Shoulder = shoulder,
			ShoulderC0 = if shoulder then shoulder.C0 else CFrame.new(),
			Ik = nil,
			IkWeight = 1,
			Pole = nil,
			Pitch = 0,
			Applied = math.huge,
		}
		poses[character] = pose
	end
	local current = pose :: Pose
	current.Tool = tool

	if current.Ik then
		current.Ik:Destroy()
		current.Ik = nil
	end
	local leftUpperArm = character:FindFirstChild("LeftUpperArm")
	local leftHand = character:FindFirstChild("LeftHand")
	if leftGrip and leftUpperArm and leftHand and leftUpperArm:IsA("BasePart") and leftHand:IsA("BasePart") then
		if not current.Pole or not current.Pole.Parent then
			-- coude gauche orienté vers le bas / l'extérieur
			local pole = Instance.new("Attachment")
			pole.Name = "AimElbowPole"
			pole.Position = Vector3.new(-1.1, -2, -0.4)
			pole.Parent = upperTorso
			current.Pole = pole
		end
		local ik = Instance.new("IKControl")
		ik.Name = "AimLeftHandIK"
		ik.Type = Enum.IKControlType.Transform
		ik.ChainRoot = leftUpperArm
		ik.EndEffector = leftHand
		ik.Target = leftGrip
		ik.Pole = current.Pole
		ik.Weight = 1
		current.IkWeight = 1
		ik.Priority = 1
		trySet(ik, "SmoothTime", 0.04)
		ik.Enabled = true
		ik.Parent = humanoid
		current.Ik = ik
	end
end

local function onToolRemoved(character: Model, tool: Tool)
	local pose = poses[character]
	if not pose or pose.Tool ~= tool then
		return
	end
	-- changement d'arme : on garde les C0 un court instant pour éviter un « clignotement » du buste
	pose.Tool = nil
	pose.ReleaseAt = os.clock() + 0.25
	if pose.Ik then
		pose.Ik.Enabled = false
	end
end

local function stepPoses(dt: number)
	if next(poses) == nil then
		return
	end
	local camera = workspace.CurrentCamera
	local alpha = 1 - math.exp(-dt * 12)
	local now = os.clock()
	for character, pose in poses do
		local tool = pose.Tool
		if not tool then
			if now >= pose.ReleaseAt then
				removePose(character)
			end
			continue
		end
		if tool.Parent ~= character or pose.Humanoid.Health <= 0 or not pose.Waist.Parent or not character.Parent then
			removePose(character)
			continue
		end
		local target = 0
		if pose.IsLocal and camera then
			-- soi : inclinaison caméra directe (aucun retard)
			target = math.asin(math.clamp(camera.CFrame.LookVector.Y, -1, 1))
		else
			local attribute = character:GetAttribute("AimPitch")
			if isFiniteNumber(attribute) then
				target = attribute
			end
		end
		target = math.clamp(target, -AIM_PITCH_LIMIT, AIM_PITCH_LIMIT)
		local pitch = if pose.IsLocal then target else pose.Pitch + (target - pose.Pitch) * alpha
		pose.Pitch = pitch
		if math.abs(pitch - pose.Applied) > 0.002 then
			pose.Applied = pitch
			pose.Waist.C0 = pose.WaistC0 * CFrame.Angles(pitch * WAIST_SHARE, 0, 0)
			local neck = pose.Neck
			if neck and neck.Parent then
				neck.C0 = pose.NeckC0 * CFrame.Angles(pitch * NECK_SHARE, 0, 0)
			end
			local shoulder = pose.Shoulder
			if shoulder and shoulder.Parent then
				shoulder.C0 = pose.ShoulderC0 * CFrame.Angles(pitch * SHOULDER_SHARE, 0, 0)
			end
		end
		-- rechargement : la main gauche quitte l'arme (geste de recharge) puis revient
		local ik = pose.Ik
		if ik then
			local goal = if tool:GetAttribute("Reloading") == true then 0 else 1
			if pose.IkWeight ~= goal then
				local weight = pose.IkWeight + (goal - pose.IkWeight) * math.min(1, dt * 10)
				if math.abs(goal - weight) < 0.01 then
					weight = goal
				end
				pose.IkWeight = weight
				ik.Weight = weight
			end
		end
	end
end

--------------------------------------------------------------------------
-- Prime : couronne lumineuse au-dessus de la tête (visible à travers les murs)
--------------------------------------------------------------------------
type BountyMarker = { Gui: BillboardGui, Head: BasePart, Tweens: { Tween } }
local bounties: { [Player]: BountyMarker } = {}

local function removeBounty(player: Player)
	local entry = bounties[player]
	if not entry then
		return
	end
	bounties[player] = nil
	for _, running in entry.Tweens do
		running:Cancel()
	end
	if entry.Gui.Parent then
		entry.Gui:Destroy()
	end
end

local function createBounty(player: Player, head: BasePart)
	local gold = Config.Colors.Gold
	local gui = Ui.new("BillboardGui", {
		Name = "BountyMarker",
		Size = UDim2.fromOffset(84, 96),
		StudsOffset = Vector3.new(0, 2.9, 0),
		AlwaysOnTop = true,
		LightInfluence = 0,
		MaxDistance = 2000,
		ResetOnSpawn = false,
		ClipsDescendants = false,
	})
	local glow = Ui.new("Frame", {
		Name = "Glow",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0, 34),
		Size = UDim2.fromOffset(58, 58),
		BackgroundColor3 = gold,
		BackgroundTransparency = 0.7,
		BorderSizePixel = 0,
		Parent = gui,
	}, {
		Ui.new("UICorner", { CornerRadius = UDim.new(1, 0) }),
		Ui.new("UIStroke", { Color = gold, Thickness = 3, Transparency = 0.1 }),
	})
	Ui.label({
		Name = "Crown",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0, 33),
		Size = UDim2.fromOffset(44, 44),
		Text = "👑",
		Parent = gui,
	})
	Ui.label({
		Name = "Tag",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 68),
		Size = UDim2.fromOffset(84, 22),
		Text = "PRIME",
		FontFace = Ui.Fonts.Title,
		TextColor3 = gold,
		Parent = gui,
	}, {
		Ui.new("UIStroke", { Color = Color3.new(0, 0, 0), Thickness = 1.5, Transparency = 0.2 }),
	})
	local scale = Ui.new("UIScale", { Parent = glow })
	gui.Parent = head

	local pulse = TweenInfo.new(0.7, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true)
	local bob = TweenInfo.new(1.1, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true)
	local tweens = {
		TweenService:Create(glow, pulse, { BackgroundTransparency = 0.9 }),
		TweenService:Create(scale, pulse, { Scale = 1.25 }),
		TweenService:Create(gui, bob, { StudsOffset = Vector3.new(0, 3.3, 0) }),
	}
	for _, created in tweens do
		created:Play()
	end
	local entry = { Gui = gui, Head = head, Tweens = tweens }
	bounties[player] = entry
	gui.Destroying:Connect(function()
		if bounties[player] == entry then
			bounties[player] = nil
			for _, running in tweens do
				running:Cancel()
			end
		end
	end)
end

local function refreshBounty(player: Player)
	local wanted = player ~= LocalPlayer and player.Parent ~= nil and player:GetAttribute("Bounty") == true
	local character = player.Character
	local head = character and character:FindFirstChild("Head")
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not head or not head:IsA("BasePart") or (humanoid and humanoid.Health <= 0) then
		wanted = false
	end
	local entry = bounties[player]
	if entry and (not wanted or entry.Head ~= head or not entry.Gui.Parent) then
		removeBounty(player)
		entry = nil
	end
	if wanted and not entry then
		createBounty(player, head :: BasePart)
	end
end

--------------------------------------------------------------------------
-- Dissolution néon à la mort
--------------------------------------------------------------------------
local dissolved = setmetatable({}, { __mode = "k" })
local DISSOLVE_SAMPLES = {
	"Head",
	"UpperTorso",
	"LowerTorso",
	"Torso",
	"LeftUpperArm",
	"RightUpperArm",
	"LeftUpperLeg",
	"RightUpperLeg",
	"Left Arm",
	"Right Arm",
	"Left Leg",
	"Right Leg",
}

local function dissolveCharacter(character: Model, player: Player?)
	if dissolved[character] then
		return
	end
	dissolved[character] = true
	removePose(character)
	if player then
		removeBounty(player)
	end

	local root = character:FindFirstChild("HumanoidRootPart")
	local anchor = if root and root:IsA("BasePart") then root else character:FindFirstChildWhichIsA("BasePart")
	if not anchor or distanceToCamera(anchor.Position) > 500 then
		return
	end
	ensureHost()
	local gold = player ~= nil and player:GetAttribute("Bounty") == true
	local accent = if gold then Config.Colors.Gold else Config.Colors.Accent
	local bits = emitters[if gold then "Bits:Gold" else "Bits:Accent"]

	local parts = {}
	local minY, maxY = math.huge, -math.huge
	for _, descendant in character:GetDescendants() do
		if descendant:IsA("BasePart") then
			if descendant.Transparency < 1 and descendant.Name ~= "HumanoidRootPart" then
				table.insert(parts, descendant)
				local y = descendant.Position.Y
				minY = math.min(minY, y)
				maxY = math.max(maxY, y)
			end
		elseif descendant:IsA("Decal") then
			tween(descendant, 0.25, { Transparency = 1 })
		elseif descendant:IsA("SurfaceAppearance") or descendant:IsA("Clothing") or descendant:IsA("ShirtGraphic") then
			descendant:Destroy() -- local : laisse apparaître le néon pur
		end
	end
	local height = math.max(maxY - minY, 1)
	for _, part in parts do
		camoParts[part] = nil -- l'arme qui se dissout ne doit plus changer de teinte
		if part:IsA("MeshPart") then
			trySet(part, "TextureID", "")
		end
		local level = (part.Position.Y - minY) / height
		part.Material = Enum.Material.Neon
		part.Color = WHITE
		tween(part, 0.18, { Color = accent })
		-- dissolution de bas en haut
		tween(part, 0.65, { Transparency = 1 }, Enum.EasingStyle.Quad, Enum.EasingDirection.In, 0.25 + level * 0.55)
	end

	local samples = {}
	for _, name in DISSOLVE_SAMPLES do
		local part = character:FindFirstChild(name)
		if part and part:IsA("BasePart") then
			table.insert(samples, part)
		end
	end
	local function burst(count: number)
		for _, part in samples do
			if part.Parent then
				emit(CFrame.new(part.Position), bits, count)
			end
		end
	end
	burst(6)
	task.delay(0.35, burst, 5)
	task.delay(0.7, burst, 4)
	task.delay(0.75, function()
		if anchor.Parent then
			spawnPop(anchor.Position, accent, 1, 7, 0.45, 0.25)
		end
	end)
end

--------------------------------------------------------------------------
-- Camos animés : défilement de teinte (cyan -> violet -> rose), 20 fois / s
--------------------------------------------------------------------------
local function addCamoPart(instance: Instance)
	if not instance:IsA("BasePart") then
		return
	end
	-- décalage de phase selon la position le long de l'arme : la couleur « coule » vers le canon
	local phase = 0
	local container = instance.Parent
	local handle = container and container:FindFirstChild("Handle")
	if handle and handle:IsA("BasePart") and handle ~= instance then
		phase = handle.CFrame:PointToObjectSpace(instance.Position).Z * 1.6
	end
	camoParts[instance] = phase
end

local function removeCamoPart(instance: Instance)
	if instance:IsA("BasePart") then
		camoParts[instance] = nil
	end
end

local function stepCamos(now: number)
	for part, phase in camoParts do
		if part.Parent and CollectionService:HasTag(part, CAMO_TAG) then
			local hue = 0.72 + 0.2 * math.sin(now * 1.3 + phase)
			part.Color = Color3.fromHSV(hue, 0.7, 1)
		end
	end
end

--------------------------------------------------------------------------
-- Killcam
--------------------------------------------------------------------------
local killcam = {
	Active = false,
	Killer = nil :: Player?,
	Start = 0,
	Yaw = 0,
	DeathPos = Vector3.zero,
	Highlight = nil :: Highlight?,
	FovTween = nil :: Tween?,
	Params = nil :: RaycastParams?,
	Pending = nil :: { Killer: Player?, Time: number }?,
}
local lastDeathPos: Vector3? = nil

-- Évite que la caméra traverse un mur : recule jusqu'à l'obstacle.
local function killcamClear(origin: Vector3, target: Vector3): Vector3
	local params = killcam.Params
	local delta = target - origin
	if not params or delta.Magnitude < 0.1 then
		return target
	end
	local result = workspace:Raycast(origin, delta, params)
	if result then
		return result.Position - delta.Unit * 0.8
	end
	return target
end

local function killcamStep(dt: number)
	local camera = workspace.CurrentCamera
	if not camera or not killcam.Active then
		return
	end
	if camera.CameraType ~= Enum.CameraType.Scriptable then
		camera.CameraType = Enum.CameraType.Scriptable
	end
	local t = os.clock() - killcam.Start
	local deathPos = killcam.DeathPos
	local killer = killcam.Killer
	local killerCharacter = if killer then killer.Character else nil
	local focusPart = killerCharacter
		and (killerCharacter:FindFirstChild("Head") or killerCharacter:FindFirstChild("HumanoidRootPart"))
	if focusPart and not focusPart:IsA("BasePart") then
		focusPart = nil
	end
	local highlight = killcam.Highlight
	if highlight and killerCharacter and highlight.Adornee ~= killerCharacter then
		highlight.Adornee = killerCharacter
	end

	local desired: CFrame
	local lookAt: Vector3
	if t < KILLCAM_RISE_TIME or not focusPart then
		-- l'« âme » s'élève au-dessus du corps en tournant lentement
		local angle = killcam.Yaw + t * 0.35
		local radius = 6 + math.min(t, 4) * 1.2
		local height = 4 + math.min(t, 4) * 0.8
		local position = deathPos + Vector3.new(math.cos(angle) * radius, height, math.sin(angle) * radius)
		lookAt = deathPos
		desired = CFrame.lookAt(killcamClear(deathPos + Vector3.new(0, 1, 0), position), lookAt)
	else
		-- cadre le tueur depuis le côté de la victime, légèrement de trois quarts
		local focus = (focusPart :: BasePart).Position
		local flat = Vector3.new(focus.X - deathPos.X, 0, focus.Z - deathPos.Z)
		local direction: Vector3
		if flat.Magnitude > 0.5 then
			direction = flat.Unit
		else
			local look = camera.CFrame.LookVector
			local flatLook = Vector3.new(look.X, 0, look.Z)
			direction = if flatLook.Magnitude > 0.01 then flatLook.Unit else Vector3.zAxis
		end
		local side = direction:Cross(Vector3.yAxis)
		local back = math.clamp(flat.Magnitude * 0.45, 4.5, 9)
		local position = focus - direction * back + Vector3.new(0, 1.4, 0) + side * 2.4
		lookAt = focus - Vector3.new(0, 0.4, 0)
		desired = CFrame.lookAt(killcamClear(focus, position), lookAt)
	end

	local speed = if t < 1.8 then 2.4 else 5
	local alpha = 1 - math.exp(-dt * speed)
	camera.CFrame = camera.CFrame:Lerp(desired, alpha)
	camera.Focus = CFrame.new(lookAt)
end

local function stopKillcam(restoreCamera: boolean)
	killcam.Pending = nil
	if not killcam.Active then
		return
	end
	killcam.Active = false
	pcall(function()
		RunService:UnbindFromRenderStep(KILLCAM_BIND)
	end)
	if killcam.FovTween then
		killcam.FovTween:Cancel()
		killcam.FovTween = nil
	end
	local cc = Lighting:FindFirstChild("KillcamCC")
	if cc and cc:IsA("ColorCorrectionEffect") then
		cc.Name = "KillcamCC_Fade" -- une nouvelle killcam ne doit pas récupérer celui-ci
		tween(cc, 0.35, { Saturation = 0, Contrast = 0, TintColor = WHITE })
		Debris:AddItem(cc, 0.4)
	end
	if killcam.Highlight then
		fadeHighlight(killcam.Highlight)
		killcam.Highlight = nil
	end
	killcam.Killer = nil
	killcam.Params = nil

	local camera = workspace.CurrentCamera
	if restoreCamera and camera then
		-- GunController reprend ensuite la main (caméra épaule, FOV des paramètres)
		local settings = ClientState.Settings
		local fov = if type(settings) == "table" and isFiniteNumber(settings.Fov) then settings.Fov else Config.Camera.BaseFov
		camera.CameraType = Enum.CameraType.Custom
		camera.FieldOfView = math.clamp(fov, 40, 110)
		local character = LocalPlayer.Character
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		if humanoid then
			camera.CameraSubject = humanoid
		end
	end
end

local function startKillcam(killer: Player?)
	local camera = workspace.CurrentCamera
	if not camera then
		return
	end
	if killcam.Active then
		stopKillcam(false)
	end
	killcam.Pending = nil
	killcam.Active = true
	killcam.Killer = killer
	killcam.Start = os.clock()
	local deathPos = lastDeathPos or camera.Focus.Position
	killcam.DeathPos = deathPos
	local offset = camera.CFrame.Position - deathPos
	killcam.Yaw = math.atan2(offset.Z, offset.X)
	killcam.Params = Ballistics.GetRaycastParams(Ballistics.GetCharacters())
	camera.CameraType = Enum.CameraType.Scriptable

	-- léger désaturé, teinte froide-rouge
	local existing = Lighting:FindFirstChild("KillcamCC")
	local cc: ColorCorrectionEffect
	if existing and existing:IsA("ColorCorrectionEffect") then
		cc = existing
	else
		cc = Instance.new("ColorCorrectionEffect")
		cc.Name = "KillcamCC"
		cc.Parent = Lighting
	end
	cc.Enabled = true
	cc.Brightness = 0
	cc.Saturation = 0
	cc.Contrast = 0
	cc.TintColor = WHITE
	tween(cc, 0.8, { Saturation = -0.55, Contrast = 0.12, TintColor = Color3.fromRGB(255, 226, 226) })

	local killerCharacter = if killer then killer.Character else nil
	if killerCharacter then
		killcam.Highlight = makeHighlight("KillcamHighlight", killerCharacter, Config.Colors.Bad, Config.Colors.Bad, 0.82)
	end
	killcam.FovTween = tween(camera, 1.4, { FieldOfView = 52 }, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut)
	RunService:BindToRenderStep(KILLCAM_BIND, Enum.RenderPriority.Camera.Value + 10, killcamStep)
end

local function onKillcam(killer: any)
	local validKiller: Player? = nil
	if typeof(killer) == "Instance" and killer:IsA("Player") and killer ~= LocalPlayer then
		validKiller = killer
	end
	if ClientState.Mode == "Dead" then
		startKillcam(validKiller)
	else
		-- le remote peut arriver juste avant Humanoid.Died côté client
		killcam.Pending = { Killer = validKiller, Time = os.clock() }
	end
end

local function onModeChanged(mode: any)
	if mode == "Dead" then
		local character = LocalPlayer.Character
		local root = character and (character:FindFirstChild("HumanoidRootPart") or character:FindFirstChild("Head"))
		if root and root:IsA("BasePart") then
			lastDeathPos = root.Position
		end
		local pending = killcam.Pending
		if pending and os.clock() - pending.Time < 2 then
			startKillcam(pending.Killer)
		end
	else
		stopKillcam(mode == "Playing")
	end
end

--------------------------------------------------------------------------
-- Suivi des joueurs / personnages
--------------------------------------------------------------------------
local watched: { [Player]: { RBXScriptConnection } } = {}

local function onCharacter(player: Player, character: Model)
	local humanoid = character:WaitForChild("Humanoid", 10)
	if not humanoid or not humanoid:IsA("Humanoid") or character.Parent == nil then
		return
	end
	if player.Character ~= character then
		return
	end

	-- mort -> dissolution (Died + filet de sécurité sur la santé répliquée)
	local function onDeath()
		dissolveCharacter(character, player)
	end
	humanoid.Died:Connect(onDeath)
	humanoid.HealthChanged:Connect(function(health)
		if health <= 0 then
			onDeath()
		end
	end)

	-- armes en main -> pose de visée
	character.ChildAdded:Connect(function(child)
		if child:IsA("Tool") then
			task.spawn(onToolEquipped, player, character, humanoid, child)
		end
	end)
	character.ChildRemoved:Connect(function(child)
		if child:IsA("Tool") then
			onToolRemoved(character, child)
		end
	end)
	character.AncestryChanged:Connect(function()
		if not character:IsDescendantOf(workspace) then
			removePose(character)
		end
	end)
	for _, child in character:GetChildren() do
		if child:IsA("Tool") then
			task.spawn(onToolEquipped, player, character, humanoid, child)
		end
	end

	-- prime : attendre la tête puis afficher si besoin
	character:WaitForChild("Head", 5)
	if player.Character == character then
		refreshBounty(player)
	end
end

local function watchPlayer(player: Player)
	if watched[player] then
		return
	end
	local connections = {}
	watched[player] = connections
	table.insert(
		connections,
		player.CharacterAdded:Connect(function(character)
			onCharacter(player, character)
		end)
	)
	table.insert(
		connections,
		player:GetAttributeChangedSignal("Bounty"):Connect(function()
			refreshBounty(player)
		end)
	)
	if player.Character then
		task.spawn(onCharacter, player, player.Character)
	end
end

local function unwatchPlayer(player: Player)
	local connections = watched[player]
	if connections then
		for _, connection in connections do
			connection:Disconnect()
		end
		watched[player] = nil
	end
	removeBounty(player)
	local highlight = radar.Highlights[player]
	if highlight then
		radar.Highlights[player] = nil
		highlight:Destroy()
	end
	if player.Character then
		removePose(player.Character)
	end
	if killcam.Killer == player then
		killcam.Killer = nil
	end
end

--------------------------------------------------------------------------
-- Boucle principale (une seule connexion RenderStepped)
--------------------------------------------------------------------------
local holeClock = 0
local camoClock = 0

local function stepEffects(dt: number)
	particleBudget = PARTICLE_BUDGET
	if #activeTracers > 0 then
		stepTracers(dt)
	end
	if #activeFlashes > 0 then
		stepFlashes()
	end
	if #bodies > 0 then
		stepBodies(dt)
	end
	if #activePops > 0 then
		stepPops(dt)
	end
	holeClock += dt
	if holeClock >= 0.1 then
		holeClock = 0
		stepHoles(os.clock())
	end
	camoClock += dt
	if camoClock >= CAMO_INTERVAL then
		camoClock = 0
		if next(camoParts) ~= nil then
			stepCamos(os.clock())
		end
	end
end

--------------------------------------------------------------------------
-- Init
--------------------------------------------------------------------------
local initialized = false

function Effects.Init()
	if initialized then
		return
	end
	initialized = true
	ensureHost()

	Remotes.ShotFx.OnClientEvent:Connect(onShotFx)
	Remotes.HitConfirm.OnClientEvent:Connect(onHitConfirm)
	Remotes.Killcam.OnClientEvent:Connect(onKillcam)
	Remotes.RewardFx.OnClientEvent:Connect(onRewardFx)
	ClientState.On("Changed:Mode", onModeChanged)

	for _, player in Players:GetPlayers() do
		watchPlayer(player)
	end
	Players.PlayerAdded:Connect(watchPlayer)
	Players.PlayerRemoving:Connect(unwatchPlayer)

	for _, instance in CollectionService:GetTagged(CAMO_TAG) do
		addCamoPart(instance)
	end
	CollectionService:GetInstanceAddedSignal(CAMO_TAG):Connect(addCamoPart)
	CollectionService:GetInstanceRemovedSignal(CAMO_TAG):Connect(removeCamoPart)

	RunService.RenderStepped:Connect(stepEffects)
	-- après la caméra (+1 = recul de GunController) : le buste suit l'inclinaison finale de la frame
	RunService:BindToRenderStep(POSE_BIND, Enum.RenderPriority.Camera.Value + 2, stepPoses)
end

return Effects
