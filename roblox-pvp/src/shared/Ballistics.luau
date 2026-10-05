-- Calculs de tir partagés client / serveur : dispersion, dégâts, raycasts, détection tête.
-- Le client s'en sert pour prédire ses tirs, le serveur pour les valider avec EXACTEMENT les mêmes règles.
local Players = game:GetService("Players")

local Ballistics = {}

-- Dossiers dont le contenu ne doit jamais arrêter une balle.
local IGNORED_FOLDERS = { "ClientFX", "FX" }

-- Liste d'exclusion de base : murs invisibles de la map, effets visuels, + extra.
function Ballistics.GetIgnoreList(extra: { Instance }?): { Instance }
	local list = {}
	local arena = workspace:FindFirstChild("Arena")
	local passthrough = arena and arena:FindFirstChild("BulletPassthrough")
	if passthrough then
		table.insert(list, passthrough)
	end
	for _, name in IGNORED_FOLDERS do
		local folder = workspace:FindFirstChild(name)
		if folder then
			table.insert(list, folder)
		end
	end
	if extra then
		for _, instance in extra do
			table.insert(list, instance)
		end
	end
	return list
end

function Ballistics.GetRaycastParams(extra: { Instance }?): RaycastParams
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = Ballistics.GetIgnoreList(extra)
	params.IgnoreWater = true
	return params
end

-- Tous les personnages des joueurs (pour des raycasts « décor seulement »).
function Ballistics.GetCharacters(): { Instance }
	local list = {}
	for _, player in Players:GetPlayers() do
		if player.Character then
			table.insert(list, player.Character)
		end
	end
	return list
end

-- Retourne (Humanoid, Model) si la pièce appartient à un personnage, sinon nil.
function Ballistics.GetHumanoid(part: Instance?): (Humanoid?, Model?)
	if not part then
		return nil, nil
	end
	local model = part:FindFirstAncestorOfClass("Model")
	while model do
		local humanoid = model:FindFirstChildOfClass("Humanoid")
		if humanoid then
			return humanoid, model
		end
		model = model:FindFirstAncestorOfClass("Model")
	end
	return nil, nil
end

-- Tête, ou accessoire porté sur la tête (chapeau, cheveux).
function Ballistics.IsHeadshot(part: Instance?): boolean
	if not part then
		return false
	end
	if part.Name == "Head" then
		return true
	end
	local accessory = part.Parent
	if accessory and accessory:IsA("Accessory") then
		local weld = part:FindFirstChild("AccessoryWeld")
		return weld ~= nil and weld:IsA("JointInstance") and weld.Part1 ~= nil and weld.Part1.Name == "Head"
	end
	return false
end

-- Dégâts selon la distance (atténuation linéaire) et la zone touchée.
function Ballistics.DamageAt(weapon, distance: number, headshot: boolean): number
	local scale = 1
	if distance > weapon.FalloffStart then
		local span = math.max(1, weapon.FalloffEnd - weapon.FalloffStart)
		local t = math.clamp((distance - weapon.FalloffStart) / span, 0, 1)
		scale = 1 + (weapon.MinDamageScale - 1) * t
	end
	local damage = weapon.Damage * scale
	if headshot then
		damage *= weapon.HeadshotMultiplier
	end
	return math.floor(damage + 0.5)
end

-- Dévie une direction aléatoirement dans un cône (demi-angle en degrés), répartition uniforme.
function Ballistics.ApplySpread(direction: Vector3, degrees: number, rng: Random?): Vector3
	local unit = direction.Unit
	if degrees <= 0 then
		return unit
	end
	local random = rng or Random.new()
	local angle = math.rad(degrees) * math.sqrt(random:NextNumber())
	local spin = random:NextNumber() * math.pi * 2
	local frame = CFrame.lookAt(Vector3.zero, unit)
	return (frame * CFrame.Angles(0, 0, spin) * CFrame.Angles(angle, 0, 0)).LookVector
end

return Ballistics
