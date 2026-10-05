-- GunBuilder : modèles 3D procéduraux des 8 armes à feu (aucun mesh, aucun asset id).
-- Utilisé par le serveur (Tools donnés dans le Backpack) ET par le client (aperçus 3D en ViewportFrame).
--
-- Repère commun à toutes les armes (= repère de la main droite, Tool.Grip = CFrame.new()) :
--   origine = centre de la poignée pistolet (là où se referme la main droite)
--   -Z = vers l'avant (canon)   +Y = haut   +X = côté droit (fenêtre d'éjection)
-- Échelle « réaliste » par rapport à un personnage R15 (~5,5 studs) :
--   pistolet ~1,1 stud, UZI ~1,6, fusil d'assaut ~3,2, pompe ~3,4, M249 ~3,8, sniper ~4,6.
--
-- Chaque arme est décrite par une TABLE DE PIÈCES (nom, taille, position relative à la poignée,
-- style = couleur + matériau, camo oui/non) : pour retoucher un modèle, il suffit de modifier
-- les chiffres dans `Definitions` plus bas.
--
-- API publique :
--   GunBuilder.BuildModel(weaponId, camoId?)  -> Model (PrimaryPart = Handle)
--   GunBuilder.BuildTool(weaponId, camoId?)   -> Tool prêt à mettre dans le Backpack
--   GunBuilder.ApplyCamo(container, camoId?)  -> recolore les pièces Camo = true
--   GunBuilder.GetModelLength(weaponId)       -> longueur approximative (studs), pour cadrer un aperçu

local CollectionService = game:GetService("CollectionService")

local Weapons = require(script.Parent.Weapons)
local Camos = require(script.Parent.Camos)

local GunBuilder = {}

local ANIMATED_TAG = "AnimatedCamo"
local FALLBACK_WEAPON = "M1911"

local V3 = Vector3.new
local CF = CFrame.new
local rad = math.rad
local PI = math.pi

-- Un cylindre Roblox a son axe sur X local : ces rotations l'alignent sur un autre axe.
local ALONG_Z = CFrame.Angles(0, rad(90), 0) -- canons, tubes, lunette
local ALONG_Y = CFrame.Angles(0, 0, rad(90)) -- tourelles, poignée avant verticale

--------------------------------------------------------------------------
-- Styles (couleur + matériau). Les pièces « corps » prennent le camo par-dessus.
--------------------------------------------------------------------------
local Styles = {
	Hidden = { Color = Color3.fromRGB(40, 40, 44), Material = Enum.Material.SmoothPlastic, Transparency = 1 },
	Blued = { Color = Color3.fromRGB(38, 40, 46), Material = Enum.Material.Metal, Reflectance = 0.05 },
	Gunmetal = { Color = Color3.fromRGB(54, 56, 62), Material = Enum.Material.Metal, Reflectance = 0.03 },
	Anodized = { Color = Color3.fromRGB(46, 47, 52), Material = Enum.Material.Metal, Reflectance = 0.02 },
	DarkSteel = { Color = Color3.fromRGB(64, 66, 72), Material = Enum.Material.Metal, Reflectance = 0.04 },
	Steel = { Color = Color3.fromRGB(140, 143, 150), Material = Enum.Material.Metal, Reflectance = 0.1 },
	Stainless = { Color = Color3.fromRGB(184, 188, 196), Material = Enum.Material.Metal, Reflectance = 0.15 },
	Polymer = { Color = Color3.fromRGB(31, 32, 36), Material = Enum.Material.SmoothPlastic },
	Rubber = { Color = Color3.fromRGB(21, 21, 23), Material = Enum.Material.SmoothPlastic },
	Knurl = { Color = Color3.fromRGB(42, 43, 47), Material = Enum.Material.DiamondPlate },
	Rail = { Color = Color3.fromRGB(35, 36, 41), Material = Enum.Material.DiamondPlate },
	Optic = { Color = Color3.fromRGB(27, 28, 32), Material = Enum.Material.Metal, Reflectance = 0.02 },
	Wood = { Color = Color3.fromRGB(136, 74, 38), Material = Enum.Material.Wood },
	DarkWood = { Color = Color3.fromRGB(86, 45, 24), Material = Enum.Material.Wood },
	Walnut = { Color = Color3.fromRGB(112, 60, 32), Material = Enum.Material.WoodPlanks },
	Tan = { Color = Color3.fromRGB(158, 134, 98), Material = Enum.Material.SmoothPlastic },
	Coyote = { Color = Color3.fromRGB(120, 104, 78), Material = Enum.Material.SmoothPlastic },
	OliveDrab = { Color = Color3.fromRGB(82, 88, 56), Material = Enum.Material.Fabric },
	OliveDark = { Color = Color3.fromRGB(62, 68, 42), Material = Enum.Material.Fabric },
	Brass = { Color = Color3.fromRGB(214, 168, 74), Material = Enum.Material.Metal, Reflectance = 0.2 },
	ShellRed = { Color = Color3.fromRGB(172, 30, 34), Material = Enum.Material.SmoothPlastic },
	Hole = { Color = Color3.fromRGB(9, 9, 11), Material = Enum.Material.SmoothPlastic },
	Lens = { Color = Color3.fromRGB(70, 150, 255), Material = Enum.Material.Glass, Reflectance = 0.4, Transparency = 0.25 },
	GlassClear = { Color = Color3.fromRGB(180, 225, 255), Material = Enum.Material.Glass, Reflectance = 0.1, Transparency = 0.65 },
	NeonGreen = { Color = Color3.fromRGB(80, 255, 120), Material = Enum.Material.Neon },
	NeonRed = { Color = Color3.fromRGB(255, 45, 60), Material = Enum.Material.Neon },
	NeonOrange = { Color = Color3.fromRGB(255, 150, 40), Material = Enum.Material.Neon },
}

--------------------------------------------------------------------------
-- Constructeurs de pièces (renvoient une « spec », pas encore d'Instance)
--------------------------------------------------------------------------
type Spec = {
	Name: string,
	Kind: string, -- "Block" | "Cylinder" | "Ball" | "Wedge"
	Size: Vector3,
	CFrame: CFrame, -- relatif à la poignée (Handle = CFrame.new())
	Style: string,
	Camo: boolean,
}

local function toCFrame(where: any): CFrame
	if typeof(where) == "Vector3" then
		return CFrame.new(where)
	end
	return where
end

-- Bloc
local function Box(name: string, size: Vector3, where: any, style: string, camo: boolean?): Spec
	return { Name = name, Kind = "Block", Size = size, CFrame = toCFrame(where), Style = style, Camo = camo == true }
end

-- Cylindre couché le long du canon (axe Z)
local function Tube(name: string, length: number, diameter: number, where: any, style: string, camo: boolean?): Spec
	return {
		Name = name,
		Kind = "Cylinder",
		Size = V3(length, diameter, diameter),
		CFrame = toCFrame(where) * ALONG_Z,
		Style = style,
		Camo = camo == true,
	}
end

-- Cylindre vertical (axe Y)
local function Post(name: string, length: number, diameter: number, where: any, style: string, camo: boolean?): Spec
	return {
		Name = name,
		Kind = "Cylinder",
		Size = V3(length, diameter, diameter),
		CFrame = toCFrame(where) * ALONG_Y,
		Style = style,
		Camo = camo == true,
	}
end

-- Cylindre transversal (axe X : goupilles, molettes latérales)
local function Pin(name: string, length: number, diameter: number, where: any, style: string, camo: boolean?): Spec
	return {
		Name = name,
		Kind = "Cylinder",
		Size = V3(length, diameter, diameter),
		CFrame = toCFrame(where),
		Style = style,
		Camo = camo == true,
	}
end

-- Sphère
local function Ball(name: string, diameter: number, where: any, style: string, camo: boolean?): Spec
	return {
		Name = name,
		Kind = "Ball",
		Size = V3(diameter, diameter, diameter),
		CFrame = toCFrame(where),
		Style = style,
		Camo = camo == true,
	}
end

-- Biseau (WedgePart) : par défaut, face haute à l'arrière (+Z) et pente qui descend vers l'avant (-Z).
--   * CFrame.Angles(0, PI, 0) : rampe qui monte vers l'avant (guidon)
--   * CFrame.Angles(0, 0, PI) : dessus plat, pente vers le bas-avant (dessous de crosse)
--   * CFrame.Angles(PI, 0, 0) : dessus plat, haut à l'avant, pente vers le bas-arrière
local function Wedge(name: string, size: Vector3, where: any, style: string, camo: boolean?): Spec
	return { Name = name, Kind = "Wedge", Size = size, CFrame = toCFrame(where), Style = style, Camo = camo == true }
end

-- Barre rectangulaire tendue entre deux points (montants, entretoises)
local function Strut(name: string, p0: Vector3, p1: Vector3, width: number, height: number, style: string, camo: boolean?): Spec
	local offset = p1 - p0
	local up = if math.abs(offset.Unit.Y) > 0.98 then Vector3.xAxis else Vector3.yAxis
	local cframe = CFrame.lookAt((p0 + p1) / 2, p1, up)
	return Box(name, V3(width, height, offset.Magnitude), cframe, style, camo)
end

-- Repère incliné d'une poignée pistolet : le haut part vers l'avant, le bas recule.
local function GripFrame(angleDeg: number, offset: Vector3): CFrame
	return CF(offset) * CFrame.Angles(rad(-angleDeg), 0, 0)
end

-- Chargeur (droit ou courbe « banane ») : segments empilés, chacun incliné de `stepDeg` vers l'avant.
-- Pièces : "Magazine", "Magazine2", ... + "MagazineBase".
local function Magazine(
	top: Vector3,
	width: number,
	depth: number,
	segment: number,
	count: number,
	stepDeg: number,
	style: string,
	baseStyle: string,
	camo: boolean?
): { Spec }
	local list = {}
	local frame = CF(top)
	for index = 1, count do
		if index > 1 then
			frame = frame * CFrame.Angles(rad(stepDeg), 0, 0)
		end
		local name = if index == 1 then "Magazine" else "Magazine" .. index
		-- +0.03 de hauteur : les segments se chevauchent pour masquer les jointures dans les courbes
		table.insert(list, Box(name, V3(width, segment + 0.03, depth), frame * CF(0, -segment / 2, 0), style, camo))
		frame = frame * CF(0, -segment, 0)
	end
	table.insert(list, Box("MagazineBase", V3(width + 0.015, 0.03, depth + 0.015), frame * CF(0, -0.01, 0), baseStyle, false))
	return list
end

--------------------------------------------------------------------------
-- Repères de la main gauche (Attachment "LeftGrip" = cible d'un IKControl de type Transform :
-- la LeftHand R15 vient se caler sur ce repère, position ET orientation).
-- Au repos, la main R15 a : paume vers +X, poignet vers +Y, pouce vers -Z.
--------------------------------------------------------------------------
local PALM_UP = CFrame.fromMatrix(Vector3.zero, Vector3.yAxis, Vector3.zAxis, Vector3.xAxis)

-- Main sous le garde-main : paume vers le haut, doigts vers l'avant, avant-bras vers l'arrière-bas-gauche.
local function SupportHand(position: Vector3): CFrame
	return CF(position) * CFrame.Angles(0, rad(-25), 0) * CFrame.Angles(rad(20), 0, 0) * PALM_UP
end

-- Main sur une poignée avant verticale : paume vers la poignée (+X), pouce en haut.
local function ForegripHand(position: Vector3): CFrame
	return CF(position) * CFrame.Angles(0, rad(-20), 0) * CFrame.Angles(rad(105), 0, 0)
end

-- Main d'appui au pistolet (prise à deux mains) : doigts vers l'avant, paume vers la main droite.
local function PistolHand(position: Vector3): CFrame
	return CF(position) * CFrame.Angles(0, rad(-20), 0) * CFrame.Angles(0, 0, rad(20)) * CFrame.Angles(rad(90), 0, 0)
end

--------------------------------------------------------------------------
-- Définitions des armes
-- HandleSize : la poignée invisible (pièce "Handle" au repère identité, tenue par la main droite).
-- Parts : la liste des pièces visibles (les sous-listes sont aplaties automatiquement).
-- Muzzle / Eject : { Part, Position } (orientation = celle de l'arme : -Z avant, +X droite, +Y haut).
-- LeftGrip : { Part, CFrame } (repère complet de la main gauche).
--------------------------------------------------------------------------
local Definitions = {}

-- M1911 : acier bronzé, plaquettes en noyer, organes de visée 3 points tritium.
do
	local grip = GripFrame(18, V3(0, -0.04, 0.03))
	Definitions.M1911 = {
		HandleSize = V3(0.15, 0.5, 0.24),
		Parts = {
			Box("Grip", V3(0.15, 0.56, 0.25), grip, "Blued", true),
			Box("GripPanelL", V3(0.02, 0.42, 0.2), grip * CF(-0.08, -0.02, 0), "Walnut"),
			Box("GripPanelR", V3(0.02, 0.42, 0.2), grip * CF(0.08, -0.02, 0), "Walnut"),
			Box("MagBase", V3(0.13, 0.03, 0.22), grip * CF(0, -0.29, 0), "DarkSteel"),
			Box("Frame", V3(0.15, 0.1, 0.86), V3(0, 0.2, -0.31), "Blued", true),
			Box("Slide", V3(0.16, 0.12, 1.02), V3(0, 0.31, -0.33), "Blued", true),
			Tube("SlideTop", 1.02, 0.14, V3(0, 0.345, -0.33), "Blued", true),
			Box("Serrations", V3(0.165, 0.08, 0.16), V3(0, 0.31, 0.07), "Knurl"),
			Box("EjectPort", V3(0.012, 0.07, 0.2), V3(0.078, 0.33, -0.12), "Hole"),
			Box("Chamber", V3(0.006, 0.04, 0.1), V3(0.084, 0.33, -0.1), "Steel"),
			Tube("Bushing", 0.05, 0.12, V3(0, 0.31, -0.855), "DarkSteel"),
			Tube("Barrel", 0.06, 0.07, V3(0, 0.31, -0.89), "Steel"),
			Tube("Bore", 0.01, 0.045, V3(0, 0.31, -0.922), "Hole"),
			Box("FrontSight", V3(0.03, 0.045, 0.05), V3(0, 0.43, -0.78), "Blued"),
			Box("FrontDot", V3(0.014, 0.014, 0.006), V3(0, 0.44, -0.753), "NeonGreen"),
			Box("RearSightL", V3(0.04, 0.045, 0.05), V3(-0.035, 0.43, 0.12), "Blued"),
			Box("RearSightR", V3(0.04, 0.045, 0.05), V3(0.035, 0.43, 0.12), "Blued"),
			Box("RearDotL", V3(0.012, 0.012, 0.006), V3(-0.035, 0.44, 0.146), "NeonGreen"),
			Box("RearDotR", V3(0.012, 0.012, 0.006), V3(0.035, 0.44, 0.146), "NeonGreen"),
			Box("Hammer", V3(0.045, 0.09, 0.05), CF(0, 0.37, 0.2) * CFrame.Angles(rad(30), 0, 0), "DarkSteel"),
			Wedge("Beavertail", V3(0.13, 0.05, 0.11), CF(0, 0.235, 0.205) * CFrame.Angles(PI, 0, 0), "Blued", true),
			Box("TriggerGuardBottom", V3(0.035, 0.03, 0.25), V3(0, 0.045, -0.25), "Blued", true),
			Box("TriggerGuardFront", V3(0.035, 0.12, 0.03), V3(0, 0.09, -0.36), "Blued", true),
			Box("Trigger", V3(0.03, 0.075, 0.03), V3(0, 0.11, -0.2), "Steel"),
			Box("SlideStop", V3(0.015, 0.03, 0.14), V3(-0.083, 0.24, -0.22), "DarkSteel"),
			Box("Safety", V3(0.015, 0.035, 0.07), V3(-0.083, 0.245, 0.07), "DarkSteel"),
		},
		Muzzle = { Part = "Barrel", Position = V3(0, 0.31, -0.927) },
		Eject = { Part = "Slide", Position = V3(0.085, 0.33, -0.12) },
		LeftGrip = { Part = "Handle", CFrame = PistolHand(V3(-0.13, -0.05, -0.04)) },
	}
end

-- Magnum .357 : revolver inox, barillet cannelé, canon à rampe ventilée, poignée caoutchouc.
do
	local grip = GripFrame(25, V3(0, -0.05, 0.06))
	local flutes = {}
	for index = 0, 5 do
		local angle = rad(index * 60)
		table.insert(
			flutes,
			Tube("Flute" .. (index + 1), 0.19, 0.04, V3(0.122 * math.cos(angle), 0.235 + 0.122 * math.sin(angle), -0.235), "DarkSteel")
		)
	end
	Definitions.Magnum = {
		HandleSize = V3(0.14, 0.42, 0.2),
		Parts = {
			Box("Grip", V3(0.15, 0.42, 0.21), grip, "Rubber"),
			Pin("GripBottom", 0.15, 0.21, grip * CF(0, -0.21, 0), "Rubber"),
			Box("GripGrooves", V3(0.155, 0.28, 0.04), grip * CF(0, -0.02, -0.095), "Knurl"),
			Box("FrameRear", V3(0.13, 0.22, 0.1), V3(0, 0.2, 0.04), "Stainless", true),
			Box("RecoilShield", V3(0.15, 0.3, 0.09), V3(0, 0.23, -0.055), "Stainless", true),
			Tube("Cylinder", 0.27, 0.27, V3(0, 0.235, -0.235), "Stainless", true),
			flutes,
			Box("TopStrap", V3(0.12, 0.05, 0.36), V3(0, 0.395, -0.24), "Stainless", true),
			Box("FrameLower", V3(0.12, 0.06, 0.36), V3(0, 0.075, -0.22), "Stainless", true),
			Box("FrameFront", V3(0.14, 0.34, 0.07), V3(0, 0.24, -0.405), "Stainless", true),
			Tube("Barrel", 0.62, 0.12, V3(0, 0.33, -0.75), "Stainless", true),
			Box("Underlug", V3(0.1, 0.1, 0.6), V3(0, 0.245, -0.74), "Stainless", true),
			Box("Rib", V3(0.05, 0.03, 0.62), V3(0, 0.4, -0.75), "Stainless", true),
			Wedge("FrontRamp", V3(0.04, 0.07, 0.12), CF(0, 0.45, -0.98) * CFrame.Angles(0, PI, 0), "Stainless", true),
			Box("FrontInsert", V3(0.042, 0.02, 0.025), V3(0, 0.46, -1.015), "NeonRed"),
			Box("RearSight", V3(0.08, 0.035, 0.05), V3(0, 0.435, -0.09), "Blued"),
			Tube("Crown", 0.02, 0.125, V3(0, 0.33, -1.068), "Steel"),
			Tube("Bore", 0.01, 0.05, V3(0, 0.33, -1.08), "Hole"),
			Tube("EjectorRod", 0.03, 0.05, V3(0, 0.245, -1.05), "Steel"),
			Box("Hammer", V3(0.045, 0.13, 0.06), CF(0, 0.33, 0.07) * CFrame.Angles(rad(30), 0, 0), "DarkSteel"),
			Box("TriggerGuardBottom", V3(0.035, 0.03, 0.25), V3(0, 0, -0.215), "Stainless", true),
			Box("TriggerGuardFront", V3(0.035, 0.08, 0.03), V3(0, 0.045, -0.33), "Stainless", true),
			Box("Trigger", V3(0.03, 0.085, 0.035), V3(0, 0.06, -0.19), "Steel"),
			Box("CylinderLatch", V3(0.02, 0.05, 0.08), V3(-0.08, 0.27, -0.03), "Steel"),
		},
		Muzzle = { Part = "Crown", Position = V3(0, 0.33, -1.08) },
		Eject = { Part = "Cylinder", Position = V3(0.14, 0.24, -0.2) },
		LeftGrip = { Part = "Handle", CFrame = PistolHand(V3(-0.13, -0.06, -0.03)) },
	}
end

-- UZI : boîtier embouti, chargeur dans la poignée, crosse métallique repliée.
do
	local grip = GripFrame(8, V3(0, -0.02, 0))
	Definitions.UZI = {
		HandleSize = V3(0.15, 0.5, 0.24),
		Parts = {
			Box("Grip", V3(0.16, 0.52, 0.25), grip, "Polymer", true),
			Box("Magazine", V3(0.11, 0.26, 0.17), grip * CF(0, -0.38, -0.01), "Gunmetal", true),
			Box("MagazineBase", V3(0.125, 0.03, 0.19), grip * CF(0, -0.52, -0.01), "DarkSteel"),
			Box("GripSafety", V3(0.07, 0.24, 0.03), grip * CF(0, 0.03, 0.13), "DarkSteel"),
			Box("Receiver", V3(0.2, 0.23, 1.2), V3(0, 0.335, -0.2), "Gunmetal", true),
			Box("TopCover", V3(0.18, 0.04, 1.1), V3(0, 0.47, -0.22), "Knurl", true),
			Box("RibL", V3(0.01, 0.035, 0.95), V3(-0.103, 0.3, -0.22), "DarkSteel"),
			Box("RibR", V3(0.01, 0.035, 0.95), V3(0.103, 0.3, -0.22), "DarkSteel"),
			Box("EjectPort", V3(0.012, 0.08, 0.2), V3(0.102, 0.38, -0.12), "Hole"),
			Box("CockingKnob", V3(0.07, 0.05, 0.09), V3(0, 0.515, -0.4), "Knurl"),
			Box("RearSight", V3(0.12, 0.07, 0.07), V3(0, 0.525, 0.32), "Gunmetal", true),
			Box("FrontEarL", V3(0.03, 0.09, 0.06), V3(-0.06, 0.535, -0.72), "Gunmetal", true),
			Box("FrontEarR", V3(0.03, 0.09, 0.06), V3(0.06, 0.535, -0.72), "Gunmetal", true),
			Box("FrontPost", V3(0.02, 0.07, 0.03), V3(0, 0.525, -0.72), "DarkSteel"),
			Box("Handguard", V3(0.21, 0.12, 0.36), V3(0, 0.19, -0.6), "Polymer", true),
			Tube("BarrelNut", 0.08, 0.17, V3(0, 0.33, -0.84), "DarkSteel"),
			Tube("Barrel", 0.2, 0.08, V3(0, 0.33, -0.98), "Steel"),
			Tube("Bore", 0.01, 0.05, V3(0, 0.33, -1.082), "Hole"),
			Box("TriggerGuardBottom", V3(0.04, 0.035, 0.32), V3(0, 0.02, -0.29), "Gunmetal", true),
			Box("TriggerGuardFront", V3(0.04, 0.2, 0.035), V3(0, 0.11, -0.44), "Gunmetal", true),
			Box("Trigger", V3(0.035, 0.1, 0.035), V3(0, 0.12, -0.22), "Steel"),
			Box("Selector", V3(0.02, 0.05, 0.06), V3(-0.09, 0.19, -0.02), "Steel"),
			Pin("StockHinge", 0.25, 0.07, V3(0, 0.26, 0.42), "DarkSteel"),
			Box("StockArmL", V3(0.025, 0.04, 0.82), V3(-0.115, 0.27, 0.03), "DarkSteel"),
			Box("StockArmR", V3(0.025, 0.04, 0.82), V3(0.115, 0.27, 0.03), "DarkSteel"),
			Box("ButtPlate", V3(0.25, 0.1, 0.04), V3(0, 0.24, -0.4), "DarkSteel"),
		},
		Muzzle = { Part = "Barrel", Position = V3(0, 0.33, -1.085) },
		Eject = { Part = "Receiver", Position = V3(0.105, 0.38, -0.12) },
		LeftGrip = { Part = "Handguard", CFrame = SupportHand(V3(-0.03, 0.02, -0.6)) },
	}
end

-- Pompe 12G : boîtier arrondi, crosse polymère + poignée pistolet, pompe rainurée,
-- tube magasin, bande ventilée avec guidon fibre optique, porte-cartouches latéral.
do
	local grip = GripFrame(20, V3(0, 0, 0.03))
	local shells = {}
	for index = 1, 4 do
		table.insert(shells, Post("Shell" .. index, 0.2, 0.075, V3(-0.1675, 0.37, -0.14 - (index - 1) * 0.09), "ShellRed"))
	end
	local pumpRibs = {}
	for index = 1, 4 do
		table.insert(pumpRibs, Tube("PumpRib" .. index, 0.025, 0.218, V3(0, 0.3, -0.81 - (index - 1) * 0.11), "Rubber"))
	end
	Definitions.Shotgun = {
		HandleSize = V3(0.15, 0.5, 0.22),
		Parts = {
			Box("Grip", V3(0.16, 0.54, 0.24), grip, "Polymer", true),
			Box("Receiver", V3(0.2, 0.26, 0.78), V3(0, 0.35, -0.21), "Blued", true),
			Tube("ReceiverTop", 0.78, 0.2, V3(0, 0.46, -0.21), "Blued", true),
			Box("EjectPort", V3(0.012, 0.1, 0.3), V3(0.1, 0.43, -0.25), "Hole"),
			Box("LoadingPort", V3(0.1, 0.012, 0.3), V3(0, 0.218, -0.4), "Hole"),
			Box("TriggerGuardBottom", V3(0.04, 0.035, 0.3), V3(0, 0.07, -0.27), "Blued", true),
			Box("TriggerGuardFront", V3(0.04, 0.15, 0.035), V3(0, 0.145, -0.42), "Blued", true),
			Box("Trigger", V3(0.035, 0.1, 0.035), V3(0, 0.16, -0.24), "Steel"),
			Box("StockTop", V3(0.16, 0.16, 0.95), V3(0, 0.43, 0.655), "Polymer", true),
			Wedge("StockLower", V3(0.15, 0.32, 0.62), CF(0, 0.19, 0.82) * CFrame.Angles(0, 0, PI), "Polymer", true),
			Box("ButtPad", V3(0.17, 0.5, 0.07), V3(0, 0.27, 1.165), "Rubber"),
			Box("SideSaddle", V3(0.03, 0.15, 0.36), V3(-0.115, 0.36, -0.275), "Polymer"),
			shells,
			Box("ShellBrass", V3(0.08, 0.05, 0.35), V3(-0.1675, 0.245, -0.275), "Brass"),
			Tube("Barrel", 1.6, 0.12, V3(0, 0.44, -1.4), "Blued"),
			Box("VentRib", V3(0.05, 0.03, 1.55), V3(0, 0.515, -1.38), "Blued"),
			Ball("Bead", 0.04, V3(0, 0.545, -2.13), "NeonOrange"),
			Tube("MagTube", 1.38, 0.12, V3(0, 0.31, -1.29), "Blued"),
			Tube("MagCap", 0.08, 0.13, V3(0, 0.31, -2.02), "Steel"),
			Box("BarrelClamp", V3(0.09, 0.22, 0.05), V3(0, 0.37, -1.9), "DarkSteel"),
			Tube("Pump", 0.62, 0.21, V3(0, 0.3, -0.98), "Polymer", true),
			pumpRibs,
			Tube("Choke", 0.06, 0.135, V3(0, 0.44, -2.17), "Steel"),
			Tube("Bore", 0.01, 0.085, V3(0, 0.44, -2.202), "Hole"),
		},
		Muzzle = { Part = "Choke", Position = V3(0, 0.44, -2.205) },
		Eject = { Part = "Receiver", Position = V3(0.105, 0.43, -0.25) },
		LeftGrip = { Part = "Pump", CFrame = SupportHand(V3(-0.03, 0.09, -0.98)) },
	}
end

-- AK-47 : boîtier acier, bois (crosse, garde-mains, poignée), chargeur banane, frein de bouche,
-- hausse à curseur, baguette de nettoyage sous le canon.
do
	local grip = GripFrame(20, V3(0, 0, 0.03))
	local stock = CF(0, 0.36, 0.72) * CFrame.Angles(rad(8), 0, 0) -- crosse légèrement tombante
	Definitions.AK47 = {
		HandleSize = V3(0.14, 0.5, 0.2),
		Parts = {
			Box("Grip", V3(0.15, 0.56, 0.22), grip, "DarkWood", true),
			Box("Receiver", V3(0.19, 0.22, 1.0), V3(0, 0.34, -0.25), "Blued", true),
			Tube("DustCover", 0.9, 0.17, V3(0, 0.45, -0.2), "Blued", true),
			Box("RearSightBlock", V3(0.16, 0.1, 0.16), V3(0, 0.47, -0.76), "Blued", true),
			Box("RearSightLeaf", V3(0.09, 0.02, 0.22), CF(0, 0.53, -0.72) * CFrame.Angles(rad(-4), 0, 0), "Steel"),
			Box("LowerHandguard", V3(0.21, 0.19, 0.6), V3(0, 0.3, -1.08), "Wood", true),
			Box("HandguardGrooveL", V3(0.012, 0.03, 0.46), V3(-0.105, 0.33, -1.08), "DarkWood"),
			Box("HandguardGrooveR", V3(0.012, 0.03, 0.46), V3(0.105, 0.33, -1.08), "DarkWood"),
			Tube("UpperHandguard", 0.48, 0.15, V3(0, 0.5, -1.09), "Wood", true),
			Tube("GasTube", 0.32, 0.08, V3(0, 0.5, -1.48), "Blued"),
			Box("GasBlock", V3(0.1, 0.19, 0.1), V3(0, 0.445, -1.66), "Blued"),
			Tube("Barrel", 1.2, 0.1, V3(0, 0.38, -1.35), "Blued"),
			Box("FrontSightBase", V3(0.1, 0.15, 0.1), V3(0, 0.45, -1.86), "Blued"),
			Box("FrontEarL", V3(0.025, 0.1, 0.06), V3(-0.04, 0.575, -1.86), "Blued"),
			Box("FrontEarR", V3(0.025, 0.1, 0.06), V3(0.04, 0.575, -1.86), "Blued"),
			Box("FrontPost", V3(0.015, 0.07, 0.02), V3(0, 0.56, -1.86), "DarkSteel"),
			Tube("MuzzleBrake", 0.12, 0.11, V3(0, 0.38, -2.01), "DarkSteel"),
			Tube("Bore", 0.01, 0.05, V3(0, 0.38, -2.072), "Hole"),
			Tube("CleaningRod", 0.62, 0.03, V3(0, 0.31, -1.62), "Steel"),
			Box("TriggerGuardBottom", V3(0.035, 0.03, 0.31), V3(0, 0.065, -0.265), "Blued", true),
			Box("TriggerGuardFront", V3(0.035, 0.17, 0.03), V3(0, 0.15, -0.42), "Blued", true),
			Box("Trigger", V3(0.03, 0.1, 0.035), V3(0, 0.165, -0.24), "Steel"),
			Magazine(V3(0, 0.24, -0.6), 0.12, 0.26, 0.2, 3, 13, "Blued", "DarkSteel", true),
			Box("StockUpper", V3(0.15, 0.17, 0.95), stock, "Wood", true),
			Wedge("StockLower", V3(0.14, 0.24, 0.62), stock * CF(0, -0.205, 0.165) * CFrame.Angles(0, 0, PI), "Wood", true),
			Box("ButtPlate", V3(0.16, 0.43, 0.04), stock * CF(0, -0.12, 0.495), "DarkSteel"),
			Pin("ChargingHandle", 0.09, 0.05, V3(0.14, 0.42, -0.55), "Steel"),
			Box("EjectPort", V3(0.012, 0.08, 0.3), V3(0.096, 0.41, -0.33), "Hole"),
			Box("Selector", V3(0.012, 0.05, 0.38), CF(0.1, 0.39, -0.17) * CFrame.Angles(rad(6), 0, 0), "Steel"),
		},
		Muzzle = { Part = "MuzzleBrake", Position = V3(0, 0.38, -2.075) },
		Eject = { Part = "Receiver", Position = V3(0.1, 0.41, -0.33) },
		LeftGrip = { Part = "LowerHandguard", CFrame = SupportHand(V3(-0.03, 0.09, -1.05)) },
	}
end

-- M4A1 : boîtiers aluminium, garde-main à 4 rails, poignée avant verticale, viseur holographique,
-- crosse télescopique et accessoires couleur terre (FDE), cache-flamme « birdcage ».
do
	local grip = GripFrame(22, V3(0, 0, 0.03))
	Definitions.M4A1 = {
		HandleSize = V3(0.13, 0.5, 0.2),
		Parts = {
			Box("Grip", V3(0.14, 0.56, 0.22), grip, "Tan", true),
			Box("Lower", V3(0.17, 0.2, 0.76), V3(0, 0.31, -0.15), "Anodized", true),
			Box("Magwell", V3(0.16, 0.16, 0.26), V3(0, 0.15, -0.42), "Anodized", true),
			Magazine(V3(0, 0.09, -0.42), 0.12, 0.22, 0.19, 2, 9, "Tan", "Polymer", true),
			Box("Upper", V3(0.16, 0.17, 0.78), V3(0, 0.495, -0.15), "Anodized", true),
			Box("TopRail", V3(0.09, 0.04, 0.78), V3(0, 0.6, -0.15), "Rail"),
			Tube("ForwardAssist", 0.12, 0.06, V3(0.095, 0.53, 0.14), "DarkSteel"),
			Box("EjectPort", V3(0.012, 0.085, 0.26), V3(0.081, 0.49, -0.12), "Hole"),
			Box("ChargingHandle", V3(0.15, 0.04, 0.06), V3(0, 0.56, 0.27), "DarkSteel"),
			Box("Handguard", V3(0.15, 0.17, 0.9), V3(0, 0.48, -1.0), "Anodized", true),
			Box("RailTop", V3(0.08, 0.06, 0.9), V3(0, 0.59, -1.0), "Rail"),
			Box("RailBottom", V3(0.08, 0.035, 0.9), V3(0, 0.38, -1.0), "Rail"),
			Box("RailL", V3(0.035, 0.08, 0.9), V3(-0.0925, 0.48, -1.0), "Rail"),
			Box("RailR", V3(0.035, 0.08, 0.9), V3(0.0925, 0.48, -1.0), "Rail"),
			Post("Foregrip", 0.3, 0.1, V3(0, 0.215, -1.12), "Tan", true),
			Tube("Barrel", 0.5, 0.075, V3(0, 0.47, -1.7), "Blued"),
			Box("FrontSight", V3(0.05, 0.1, 0.05), V3(0, 0.67, -1.4), "DarkSteel"),
			Tube("FlashHider", 0.2, 0.1, V3(0, 0.47, -2.05), "Blued"),
			Box("FlashSlotsH", V3(0.104, 0.018, 0.12), V3(0, 0.47, -2.08), "Hole"),
			Box("FlashSlotsV", V3(0.018, 0.104, 0.12), V3(0, 0.47, -2.08), "Hole"),
			Tube("Bore", 0.01, 0.05, V3(0, 0.47, -2.152), "Hole"),
			-- Viseur holographique (fenêtre vitrée + point rouge)
			Box("OpticBase", V3(0.12, 0.06, 0.32), V3(0, 0.65, -0.22), "Optic"),
			Box("OpticWallL", V3(0.02, 0.11, 0.2), V3(-0.055, 0.735, -0.27), "Optic"),
			Box("OpticWallR", V3(0.02, 0.11, 0.2), V3(0.055, 0.735, -0.27), "Optic"),
			Box("OpticHood", V3(0.13, 0.022, 0.22), V3(0, 0.801, -0.27), "Optic"),
			Box("OpticGlass", V3(0.09, 0.11, 0.008), V3(0, 0.735, -0.36), "GlassClear"),
			Box("Reticle", V3(0.012, 0.012, 0.004), V3(0, 0.74, -0.354), "NeonRed"),
			-- Crosse télescopique
			Tube("BufferTube", 0.72, 0.11, V3(0, 0.5, 0.6), "Anodized"),
			Tube("CastleNut", 0.04, 0.14, V3(0, 0.5, 0.27), "Steel"),
			Box("StockBody", V3(0.13, 0.22, 0.42), V3(0, 0.47, 0.85), "Tan", true),
			Wedge("StockBottom", V3(0.12, 0.17, 0.36), CF(0, 0.275, 0.88) * CFrame.Angles(0, 0, PI), "Tan", true),
			Box("ButtPad", V3(0.135, 0.42, 0.05), V3(0, 0.38, 1.085), "Rubber"),
			Box("TriggerGuardBottom", V3(0.035, 0.03, 0.18), V3(0, 0.11, -0.215), "Anodized", true),
			Box("Trigger", V3(0.03, 0.09, 0.03), V3(0, 0.17, -0.2), "Steel"),
		},
		Muzzle = { Part = "FlashHider", Position = V3(0, 0.47, -2.155) },
		Eject = { Part = "Upper", Position = V3(0.085, 0.49, -0.12) },
		LeftGrip = { Part = "Foregrip", CFrame = ForegripHand(V3(-0.06, 0.2, -1.1)) },
	}
end

-- Sniper .50 : châssis couleur coyote, canon lourd cannelé, frein de bouche double chambre,
-- lunette x6 (verres bleutés), culasse à levier, crosse squelette, bipied replié.
do
	local grip = GripFrame(15, V3(0, 0, 0.03))
	Definitions.Sniper = {
		HandleSize = V3(0.15, 0.5, 0.22),
		Parts = {
			Box("Grip", V3(0.16, 0.56, 0.24), grip, "Polymer", true),
			Box("Chassis", V3(0.2, 0.17, 1.3), V3(0, 0.285, -0.3), "Coyote", true),
			Tube("Receiver", 1.0, 0.2, V3(0, 0.42, -0.25), "Blued", true),
			Box("Forend", V3(0.21, 0.2, 0.9), V3(0, 0.36, -1.35), "Coyote", true),
			Tube("Barrel", 1.15, 0.13, V3(0, 0.42, -2.35), "Blued"),
			Box("Flutes", V3(0.134, 0.02, 0.95), V3(0, 0.42, -2.35), "Hole"),
			Box("MuzzleBrake", V3(0.2, 0.15, 0.22), V3(0, 0.42, -3.0), "DarkSteel"),
			Box("BrakePort1", V3(0.205, 0.07, 0.05), V3(0, 0.42, -2.95), "Hole"),
			Box("BrakePort2", V3(0.205, 0.07, 0.05), V3(0, 0.42, -3.04), "Hole"),
			Tube("Bore", 0.01, 0.06, V3(0, 0.42, -3.112), "Hole"),
			-- Lunette
			Box("ScopeRail", V3(0.1, 0.08, 0.9), V3(0, 0.56, -0.25), "Rail"),
			Tube("ScopeRing1", 0.07, 0.2, V3(0, 0.7, -0.02), "Optic"),
			Tube("ScopeRing2", 0.07, 0.2, V3(0, 0.7, -0.5), "Optic"),
			Tube("ScopeTube", 0.95, 0.13, V3(0, 0.7, -0.25), "Optic"),
			Tube("ObjectiveTaper", 0.08, 0.19, V3(0, 0.7, -0.76), "Optic"),
			Tube("ObjectiveBell", 0.26, 0.24, V3(0, 0.7, -0.92), "Optic"),
			Tube("ObjectiveLens", 0.015, 0.21, V3(0, 0.7, -1.052), "Lens"),
			Tube("Eyepiece", 0.22, 0.18, V3(0, 0.7, 0.33), "Optic"),
			Tube("EyeLens", 0.01, 0.15, V3(0, 0.7, 0.443), "Lens"),
			Post("TurretTop", 0.1, 0.11, V3(0, 0.8, -0.25), "Knurl"),
			Pin("TurretSide", 0.1, 0.11, V3(0.1, 0.7, -0.25), "Knurl"),
			-- Culasse
			Tube("BoltShroud", 0.12, 0.17, V3(0, 0.42, 0.31), "Blued"),
			Box("BoltArm", V3(0.14, 0.03, 0.035), V3(0.15, 0.43, 0.2), "Steel"),
			Ball("BoltKnob", 0.08, V3(0.24, 0.42, 0.21), "Polymer"),
			Box("EjectPort", V3(0.012, 0.07, 0.22), V3(0.097, 0.45, -0.25), "Hole"),
			Box("TriggerGuardBottom", V3(0.04, 0.035, 0.3), V3(0, 0.06, -0.255), "Coyote", true),
			Box("TriggerGuardFront", V3(0.04, 0.15, 0.035), V3(0, 0.125, -0.4), "Coyote", true),
			Box("Trigger", V3(0.03, 0.1, 0.03), V3(0, 0.14, -0.22), "Steel"),
			Box("Magazine", V3(0.17, 0.3, 0.3), V3(0, 0.07, -0.62), "DarkSteel", true),
			Box("MagazineBase", V3(0.18, 0.03, 0.31), V3(0, -0.095, -0.62), "Polymer"),
			-- Crosse squelette
			Box("StockSpine", V3(0.14, 0.16, 0.42), V3(0, 0.34, 0.55), "Coyote", true),
			Box("StockTop", V3(0.15, 0.12, 0.86), V3(0, 0.48, 0.94), "Coyote", true),
			Box("StockBottom", V3(0.12, 0.08, 0.72), V3(0, 0.03, 1.0), "Coyote", true),
			Strut("StockStrut", V3(0, 0.04, 0.68), V3(0, 0.3, 0.46), 0.11, 0.08, "Coyote", true),
			Box("ButtPlate", V3(0.15, 0.6, 0.07), V3(0, 0.25, 1.395), "Coyote", true),
			Box("ButtPad", V3(0.16, 0.62, 0.05), V3(0, 0.25, 1.455), "Rubber"),
			-- Bipied replié le long du canon
			Box("BipodMount", V3(0.12, 0.07, 0.12), V3(0, 0.225, -1.72), "DarkSteel"),
			Tube("BipodLegL", 0.72, 0.045, V3(-0.045, 0.2, -2.1), "DarkSteel"),
			Tube("BipodLegR", 0.72, 0.045, V3(0.045, 0.2, -2.1), "DarkSteel"),
		},
		Muzzle = { Part = "MuzzleBrake", Position = V3(0, 0.42, -3.115) },
		Eject = { Part = "Receiver", Position = V3(0.1, 0.45, -0.25) },
		LeftGrip = { Part = "Forend", CFrame = SupportHand(V3(-0.03, 0.15, -1.3)) },
	}
end

-- M249 : mitrailleuse légère, capot d'alimentation à rail, poignée de transport, bipied replié,
-- sacoche de 100 cartouches avec bande de munitions en laiton.
do
	local grip = GripFrame(18, V3(0, 0, 0.03))
	local rounds = {}
	for index = 1, 5 do
		table.insert(rounds, Tube("Round" .. index, 0.22, 0.05, V3(-0.17, 0.28 + (index - 1) * 0.06, -0.45), "Brass"))
	end
	Definitions.M249 = {
		HandleSize = V3(0.15, 0.5, 0.22),
		Parts = {
			Box("Grip", V3(0.16, 0.6, 0.24), grip, "Polymer", true),
			Box("Receiver", V3(0.24, 0.3, 1.0), V3(0, 0.4, -0.2), "Gunmetal", true),
			Box("FeedCover", V3(0.24, 0.08, 0.62), V3(0, 0.59, -0.16), "Gunmetal", true),
			Box("FeedRail", V3(0.09, 0.035, 0.5), V3(0, 0.6475, -0.16), "Rail"),
			Box("FeedLatch", V3(0.2, 0.05, 0.06), V3(0, 0.6, 0.19), "Steel"),
			Box("EjectPort", V3(0.012, 0.08, 0.25), V3(0.121, 0.42, -0.2), "Hole"),
			Box("ChargingHandle", V3(0.1, 0.05, 0.06), V3(0.17, 0.44, -0.5), "Steel"),
			Tube("Barrel", 1.65, 0.11, V3(0, 0.45, -1.525), "Blued"),
			Box("Handguard", V3(0.24, 0.2, 0.5), V3(0, 0.33, -0.95), "Polymer", true),
			Box("HeatShield", V3(0.15, 0.04, 0.5), V3(0, 0.525, -0.95), "Rail"),
			Tube("GasTube", 0.85, 0.09, V3(0, 0.34, -1.625), "Blued"),
			Box("GasBlock", V3(0.12, 0.22, 0.12), V3(0, 0.4, -2.05), "Blued"),
			Box("FrontSight", V3(0.03, 0.12, 0.04), V3(0, 0.57, -2.07), "Blued"),
			Strut("CarryPostRear", V3(0, 0.54, -0.78), V3(0, 0.76, -0.86), 0.05, 0.05, "DarkSteel"),
			Strut("CarryPostFront", V3(0, 0.54, -1.14), V3(0, 0.76, -1.06), 0.05, 0.05, "DarkSteel"),
			Box("CarryHandle", V3(0.06, 0.06, 0.26), V3(0, 0.76, -0.96), "Polymer", true),
			Tube("FlashHider", 0.18, 0.12, V3(0, 0.45, -2.44), "Blued"),
			Box("FlashSlots", V3(0.124, 0.02, 0.12), V3(0, 0.45, -2.46), "Hole"),
			Tube("Bore", 0.01, 0.06, V3(0, 0.45, -2.532), "Hole"),
			Box("BipodMount", V3(0.14, 0.07, 0.1), V3(0, 0.255, -1.95), "DarkSteel"),
			Pin("BipodHinge", 0.2, 0.05, V3(0, 0.23, -1.95), "Steel"),
			Tube("BipodLegL", 0.5, 0.05, V3(-0.06, 0.23, -2.2), "DarkSteel"),
			Tube("BipodLegR", 0.5, 0.05, V3(0.06, 0.23, -2.2), "DarkSteel"),
			Box("AmmoPouch", V3(0.3, 0.34, 0.4), V3(-0.07, 0.04, -0.62), "OliveDrab"),
			Box("PouchLid", V3(0.31, 0.04, 0.41), V3(-0.07, 0.23, -0.62), "OliveDark"),
			rounds,
			Box("BeltLinks", V3(0.02, 0.29, 0.14), V3(-0.14, 0.4, -0.45), "DarkSteel"),
			Box("TriggerGuardBottom", V3(0.04, 0.035, 0.29), V3(0, 0.07, -0.26), "Gunmetal", true),
			Box("TriggerGuardFront", V3(0.04, 0.18, 0.035), V3(0, 0.16, -0.4), "Gunmetal", true),
			Box("Trigger", V3(0.035, 0.11, 0.035), V3(0, 0.17, -0.22), "Steel"),
			Box("StockBody", V3(0.17, 0.24, 0.8), V3(0, 0.42, 0.7), "Polymer", true),
			Wedge("StockLower", V3(0.16, 0.28, 0.6), CF(0, 0.16, 0.8) * CFrame.Angles(0, 0, PI), "Polymer", true),
			Box("ButtPad", V3(0.185, 0.56, 0.1), V3(0, 0.27, 1.15), "Rubber"),
		},
		Muzzle = { Part = "FlashHider", Position = V3(0, 0.45, -2.535) },
		Eject = { Part = "Receiver", Position = V3(0.125, 0.42, -0.2) },
		LeftGrip = { Part = "Handguard", CFrame = SupportHand(V3(-0.03, 0.12, -0.95)) },
	}
end

--------------------------------------------------------------------------
-- Préparation : aplatit les listes et calcule la longueur de chaque modèle (une seule fois)
--------------------------------------------------------------------------
local function flatten(list: { any }, out: { Spec }): { Spec }
	for _, item in list do
		if item.Name ~= nil then
			table.insert(out, item)
		else
			flatten(item, out)
		end
	end
	return out
end

local CORNERS = {
	V3(-1, -1, -1), V3(1, -1, -1), V3(-1, 1, -1), V3(1, 1, -1),
	V3(-1, -1, 1), V3(1, -1, 1), V3(-1, 1, 1), V3(1, 1, 1),
}

local function computeLength(parts: { Spec }): number
	local minZ, maxZ = math.huge, -math.huge
	for _, spec in parts do
		if Styles[spec.Style] and (Styles[spec.Style].Transparency or 0) < 1 then
			local half = spec.Size / 2
			for _, corner in CORNERS do
				local z = (spec.CFrame * (half * corner)).Z
				minZ = math.min(minZ, z)
				maxZ = math.max(maxZ, z)
			end
		end
	end
	if minZ > maxZ then
		return 1
	end
	return maxZ - minZ
end

for _, definition in Definitions do
	definition.Parts = flatten(definition.Parts, {})
	definition.Length = computeLength(definition.Parts)
end

--------------------------------------------------------------------------
-- Construction des Instances
--------------------------------------------------------------------------
local function resolveWeaponId(weaponId: string?): string
	if type(weaponId) == "string" and Definitions[weaponId] and Weapons.ById[weaponId] then
		return weaponId
	end
	warn("[GunBuilder] Arme inconnue : " .. tostring(weaponId) .. " (remplacée par " .. FALLBACK_WEAPON .. ")")
	return FALLBACK_WEAPON
end

local function resolveCamo(camoId: string?)
	if type(camoId) ~= "string" then
		return nil
	end
	local camo = Camos.ById[camoId]
	if not camo or camo.Color == nil then
		return nil -- "Default" ou inconnu : couleurs d'origine
	end
	return camo
end

local function makePart(spec: Spec): BasePart
	local part: BasePart
	if spec.Kind == "Wedge" then
		part = Instance.new("WedgePart")
	else
		local block = Instance.new("Part")
		if spec.Kind == "Cylinder" then
			block.Shape = Enum.PartType.Cylinder
		elseif spec.Kind == "Ball" then
			block.Shape = Enum.PartType.Ball
		end
		part = block
	end

	local style = Styles[spec.Style] or Styles.Gunmetal
	local reflectance = style.Reflectance or 0
	local transparency = style.Transparency or 0

	part.Name = spec.Name
	part.Size = spec.Size
	part.CFrame = spec.CFrame
	part.Color = style.Color
	part.Material = style.Material
	part.Reflectance = reflectance
	part.Transparency = transparency
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Anchored = false
	part.CanCollide = false
	part.CanTouch = false
	part.CanQuery = false
	part.Massless = true
	-- Pas d'ombre pour les petits détails, le verre, le néon et les pièces invisibles (perf)
	part.CastShadow = transparency == 0
		and style.Material ~= Enum.Material.Neon
		and math.min(spec.Size.X, spec.Size.Y, spec.Size.Z) >= 0.03

	part:SetAttribute("BaseColor", style.Color)
	part:SetAttribute("BaseMaterial", style.Material.Name)
	part:SetAttribute("BaseReflectance", reflectance)
	if spec.Camo then
		part:SetAttribute("Camo", true)
	end
	return part
end

local function addAttachment(name: string, parts: { [string]: BasePart }, handle: BasePart, info: any)
	if not info then
		return
	end
	local part = parts[info.Part] or handle
	local target: CFrame = info.CFrame or CFrame.new(info.Position or Vector3.zero)
	local attachment = Instance.new("Attachment")
	attachment.Name = name
	-- Toutes les pièces sont encore au repère « poignée = identité » : conversion directe
	attachment.CFrame = part.CFrame:ToObjectSpace(target)
	attachment.Parent = part
end

-- Modèle détaillé de l'arme (PrimaryPart = Handle, au repère identité).
function GunBuilder.BuildModel(weaponId: string, camoId: string?): Model
	local id = resolveWeaponId(weaponId)
	local definition = Definitions[id]
	local weapon = Weapons.ById[id]

	local model = Instance.new("Model")
	model.Name = if weapon then weapon.Name else id

	-- Poignée invisible au repère identité (= repère de la main droite)
	local handle = makePart({
		Name = "Handle",
		Kind = "Block",
		Size = definition.HandleSize,
		CFrame = CFrame.new(),
		Style = "Hidden",
		Camo = false,
	})
	handle.Parent = model

	local parts: { [string]: BasePart } = { Handle = handle }
	for _, spec in definition.Parts do
		local part = makePart(spec)
		-- Positionnée relativement au Handle (identité) PUIS soudée
		local weld = Instance.new("WeldConstraint")
		weld.Part0 = handle
		weld.Part1 = part
		weld.Parent = part
		part.Parent = model
		parts[spec.Name] = part
	end

	addAttachment("Muzzle", parts, handle, definition.Muzzle)
	addAttachment("Eject", parts, handle, definition.Eject)
	addAttachment("LeftGrip", parts, handle, definition.LeftGrip)

	model.PrimaryPart = handle
	model:SetAttribute("WeaponId", id)
	GunBuilder.ApplyCamo(model, camoId)
	return model
end

-- Tool prêt à l'emploi (pièces directement sous le Tool, Handle enfant direct).
function GunBuilder.BuildTool(weaponId: string, camoId: string?): Tool
	local id = resolveWeaponId(weaponId)
	local weapon = Weapons.ById[id]
	local model = GunBuilder.BuildModel(id, camoId)

	local tool = Instance.new("Tool")
	tool.Name = weapon.Name
	tool.ToolTip = weapon.Category
	tool.CanBeDropped = false
	tool.RequiresHandle = true
	tool.Grip = CFrame.new()

	for _, child in model:GetChildren() do
		child.Parent = tool
	end
	model:Destroy()

	local camo = resolveCamo(camoId)
	tool:SetAttribute("WeaponId", id)
	tool:SetAttribute("CamoId", if camo then camo.Id else "Default")
	tool:SetAttribute("Ammo", weapon.MagSize)
	tool:SetAttribute("Reloading", false)
	return tool
end

-- Applique (ou retire) un camouflage sur toutes les pièces Camo = true du conteneur
-- (Tool, Model, ou n'importe quel ancêtre). "Default" / nil / inconnu = couleurs d'origine.
function GunBuilder.ApplyCamo(container: Instance, camoId: string?)
	if typeof(container) ~= "Instance" then
		return
	end
	local camo = resolveCamo(camoId)
	local animated = camo ~= nil and camo.Animated == true

	local function apply(part: BasePart)
		if part:GetAttribute("Camo") ~= true then
			return
		end
		if camo then
			part.Color = camo.Color
			part.Material = camo.Material or part.Material
			part.Reflectance = camo.Reflectance or 0
		else
			local baseColor = part:GetAttribute("BaseColor")
			if typeof(baseColor) == "Color3" then
				part.Color = baseColor
			end
			local baseMaterial = part:GetAttribute("BaseMaterial")
			if type(baseMaterial) == "string" then
				local ok, material = pcall(function()
					return (Enum.Material :: any)[baseMaterial]
				end)
				if ok and material then
					part.Material = material
				end
			end
			local baseReflectance = part:GetAttribute("BaseReflectance")
			part.Reflectance = if type(baseReflectance) == "number" then baseReflectance else 0
		end
		if animated then
			CollectionService:AddTag(part, ANIMATED_TAG)
		elseif CollectionService:HasTag(part, ANIMATED_TAG) then
			CollectionService:RemoveTag(part, ANIMATED_TAG)
		end
	end

	if container:IsA("BasePart") then
		apply(container)
	end
	for _, descendant in container:GetDescendants() do
		if descendant:IsA("BasePart") then
			apply(descendant)
		end
	end

	if container:IsA("Tool") or container:IsA("Model") then
		container:SetAttribute("CamoId", if camo then camo.Id else "Default")
	end
end

-- Longueur approximative du modèle en studs (de la plaque de couche au bout du canon).
function GunBuilder.GetModelLength(weaponId: string): number
	local definition = type(weaponId) == "string" and Definitions[weaponId] or nil
	if not definition then
		return 2
	end
	return definition.Length
end

return GunBuilder
