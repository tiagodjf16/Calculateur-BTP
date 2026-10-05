-- Contrôleur d'armes (client) : le cœur des sensations de jeu d'Arena Clash.
--
-- Responsabilités (voir ARCHITECTURE.md, « Propriétaires de la caméra », « Entrées », événements ClientState) :
--   • caméra « épaule » en mode Playing : Humanoid.CameraOffset (avec anti-collision côté épaule),
--     souris verrouillée au centre à chaque frame, personnage tourné vers la caméra (AutoRotate = false),
--     zoom fixe. Tout est restauré quand on quitte Playing ;
--   • champ de vision : paramètre Fov, bonus de sprint, mise en joue progressive, « punch » de tir et de dash ;
--   • sensibilité souris : paramètres joueur, visée, lunette ;
--   • armes : changement principale / secondaire, tir semi / auto, munitions prédites localement,
--     rechargement synchronisé avec les attributs du Tool (le serveur fait autorité) ;
--   • dispersion (visée, bloom, déplacement, saut), recul caméra à ressort, tremblements (« CameraShake ») ;
--   • sprint, dash, récompenses de série (radar, ciblage de la frappe orbitale) ;
--   • PC, manette et tactile (ContextActionService + boutons à l'écran).
--
-- API publique : GunController.Init()
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local ContextActionService = game:GetService("ContextActionService")
local GuiService = game:GetService("GuiService")
local TweenService = game:GetService("TweenService")
local Debris = game:GetService("Debris")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Weapons = require(Shared:WaitForChild("Weapons"))
local Remotes = require(Shared:WaitForChild("Remotes"))
local Ballistics = require(Shared:WaitForChild("Ballistics"))

local Controllers = script.Parent
local ClientState = require(Controllers:WaitForChild("ClientState"))
local Sfx = require(Controllers:WaitForChild("Sfx"))

-- Effets locaux (traceurs, flash, impacts…). Chargement protégé : si le module manque ou plante,
-- le tir fonctionne quand même (chaque appel est gardé par « if Effects.X »).
local Effects = {}
do
	local module = Controllers:FindFirstChild("EffectsController") or Controllers:WaitForChild("EffectsController", 2)
	if module and module:IsA("ModuleScript") then
		local ok, result = pcall(require, module)
		if ok and type(result) == "table" then
			Effects = result
		else
			warn("[GunController] EffectsController indisponible : " .. tostring(result))
		end
	end
end

local GunController = {}

local LocalPlayer = Players.LocalPlayer
local CameraConfig = Config.Camera
local Movement = Config.Movement

--------------------------------------------------------------------------
-- Réglages internes (ressenti) : regroupés dans une table (limite de 200 variables locales)
--------------------------------------------------------------------------
local Tune = {}

Tune.ACTION_PREFIX = "ArenaGun_"
Tune.ACTION_PRIORITY = Enum.ContextActionPriority.High.Value
Tune.RENDER_STEP_NAME = "ArenaGunCamera"

Tune.CAMERA_DISTANCE = 7.5 -- distance caméra / épaule (zoom verrouillé pendant la partie)
Tune.EQUIP_TIME = { Primary = 0.38, Secondary = 0.26 } -- délai avant de pouvoir tirer après un changement d'arme
Tune.SWITCH_COOLDOWN = 0.15
Tune.SPRINT_OUT_TIME = 0.14 -- délai entre la fin du sprint et le premier tir
Tune.SEMI_BUFFER = 0.2 -- un clic un peu trop tôt est mémorisé pendant ce délai
Tune.SPREAD_RECOVERY_DELAY = 0.08 -- le bloom ne redescend qu'après une courte pause de tir
Tune.MOVE_FAST_SPEED = Movement.WalkSpeed * 0.7 -- au-delà : dispersion x1,5
Tune.AIM_EXTRA_RANGE = 60

Tune.RELOAD_GRACE_UNSEEN = 0.5 -- le serveur n'a jamais confirmé : on termine quand même
Tune.RELOAD_GRACE_SEEN = 2.5 -- attente max de la fin côté serveur
Tune.AUTO_RELOAD_DELAY = 0.18
Tune.AMMO_SYNC_IDLE = 1 -- sans tir depuis X s : les munitions locales s'alignent sur le serveur
Tune.AMMO_SYNC_INTERVAL = 0.25
Tune.EMPTY_CLICK_COOLDOWN = 0.25

-- Recul
Tune.KICK_SPEED = 30 -- vitesse à laquelle la caméra rejoint le recul visé
Tune.FIRING_RECOVERY_SCALE = 0.35 -- retour plus lent pendant une rafale (le recul « grimpe »)
Tune.ADS_RECOIL_SCALE = 0.8
Tune.MAX_CAMERA_PITCH = math.rad(80)
Tune.FOV_PUNCH_DECAY = 14
Tune.FOV_PUNCH_MAX = 4
Tune.ROLL_PUNCH_DECAY = 16
Tune.HEAVY_RECOIL_SHAKE = 0.18 -- tremblement des armes lourdes (pompe, sniper, magnum)

-- Tremblements de caméra (« trauma » au carré)
Tune.SHAKE_DECAY = 1.4
Tune.SHAKE_FREQUENCY = 22
Tune.SHAKE_MAX_ANGLE = math.rad(2.6)
Tune.SHAKE_MAX_ROLL = math.rad(3.5)

-- Épaule : on rapproche la caméra si un mur est collé à droite
Tune.SHOULDER_MARGIN = 0.7

-- Dash
Tune.DASH_FOV_KICK = 7
Tune.DASH_FOV_DECAY = 5
Tune.DASH_FORCE_PER_MASS = 8000

-- Inclinaison de visée envoyée au serveur
Tune.PITCH_INTERVAL = 1 / math.max(1, CameraConfig.AimPitchSendRate or 10)
Tune.PITCH_LIMIT = 1.3

-- Récompenses de série
Tune.KILLSTREAKS = {}
for _, streak in Config.Killstreaks do
	Tune.KILLSTREAKS[streak.Id] = streak
end
Tune.ORBITAL = Tune.KILLSTREAKS.Orbital or {}
Tune.ORBITAL_RADIUS = Tune.ORBITAL.Radius or 22
Tune.ORBITAL_MAX_DISTANCE = (Tune.ORBITAL.MaxDistance or 600) - 2 -- petite marge sous la limite serveur
Tune.ORBITAL_BEAM_HEIGHT = 70
Tune.RADAR_KEY = (Tune.KILLSTREAKS.Radar and Tune.KILLSTREAKS.Radar.Key) or Enum.KeyCode.Three
Tune.ORBITAL_KEY = Tune.ORBITAL.Key or Enum.KeyCode.Four
Tune.MARKER_VALID_COLOR = Config.Colors.Bad
Tune.MARKER_INVALID_COLOR = Color3.fromRGB(150, 152, 165)
Tune.DOWN_RAY = Vector3.new(0, -1000, 0)

-- Teintes des boutons tactiles
Tune.TINT_DEFAULT = Color3.new(1, 1, 1)
Tune.TINT_FIRE = Color3.fromRGB(255, 140, 140)
Tune.TINT_ACTIVE = Config.Colors.Accent
Tune.TINT_SPRINT = Config.Colors.Good
Tune.TINT_REWARD = Config.Colors.Gold

-- États du Humanoid où le personnage ne doit pas être tourné vers la caméra
local NO_FACE_STATES = {
	[Enum.HumanoidStateType.Climbing] = true,
	[Enum.HumanoidStateType.Seated] = true,
	[Enum.HumanoidStateType.PlatformStanding] = true,
	[Enum.HumanoidStateType.Ragdoll] = true,
	[Enum.HumanoidStateType.FallingDown] = true,
	[Enum.HumanoidStateType.Physics] = true,
	[Enum.HumanoidStateType.GettingUp] = true,
	[Enum.HumanoidStateType.Dead] = true,
}

local SINK = Enum.ContextActionResult.Sink
local PASS = Enum.ContextActionResult.Pass

--------------------------------------------------------------------------
-- État
--------------------------------------------------------------------------
local camera: Camera? = workspace.CurrentCamera
local rng = Random.new()

-- personnage
local character: Model? = nil
local humanoid: Humanoid? = nil
local rootPart: BasePart? = nil
local head: BasePart? = nil
local characterConnections = {}
local dashAttachment: Attachment? = nil
local hiddenParts = nil -- pièces masquées pendant la visée à la lunette
local scopeHidden = false

-- arme en main
local currentTool: Tool? = nil
local currentWeapon = nil
local handle: BasePart? = nil
local muzzle: Attachment? = nil
local eject: Attachment? = nil
local toolConnections = {}

-- munitions / cadence (prédiction locale)
local ammo = 0
local reloading = false
local reloadSeenOnServer = false
local reloadEndsAt = 0
local equipReadyAt = 0
local nextFireAt = 0
local lastShotAt = -math.huge
local autoReloadAt: number? = nil
local lastEmptyClickAt = -math.huge
local lastAmmoSyncAt = 0
local lastSwitchAt = -math.huge

-- entrées
local triggerHeld = false
local fireQueuedAt: number? = nil
local wantAds = false
local sprintHeld = false -- Maj maintenu
local sprintToggled = false -- L3 / bouton tactile
local stillTime = 0

-- états dérivés
local adsActive = false
local sprinting = false
local sprintEndedAt = -math.huge
local adsAlpha = 0
local sprintAlpha = 0
local bloom = 0
local moveMult = 1
local currentSpread = 0
local lastSpreadSent = -1
local shoulderScale = 1

-- caméra
local playingApplied = false
local appliedHumanoid: Humanoid? = nil
local mouseLocked = false
local savedMinZoom: number? = nil
local savedMaxZoom: number? = nil
local fovPunch = 0
local dashFovKick = 0
local rollPunch = 0
local recoilTargetPitch, recoilTargetYaw = 0, 0
local recoilPitch, recoilYaw = 0, 0
local shakeTrauma = 0
local shakeTime = 0
local shakePitch, shakeYaw = 0, 0
local lastPitchSentAt = -math.huge
local lastPitchSent = math.huge

-- dash
local lastDashAt = -math.huge

-- ciblage orbital
local marker = nil -- { Model, Disc, Gui, Beam, Frames, Strokes, Tweens, Valid, Point }
local lastRewardUseAt = -math.huge

-- liaisons ContextActionService
local bound = false
local rewardTouch = {} -- [rewardId] = bouton tactile affiché ?
local touchButtons = {} -- [actionName] = ImageButton (cache rempli par la mise en page)
local touchTint = {} -- [actionName] = dernière teinte appliquée
local layoutToken = 0
local viewportConnection: RBXScriptConnection? = nil

-- paramètres de raycast (mis en cache, reconstruits régulièrement)
local shotParams: RaycastParams? = nil
local shotParamsAt = -math.huge
local worldParams: RaycastParams? = nil
local worldParamsAt = -math.huge

--------------------------------------------------------------------------
-- Utilitaires
--------------------------------------------------------------------------
local function smoothstep(t: number): number
	return t * t * (3 - 2 * t)
end

local function setting(name: string): any
	local settings = ClientState.Settings
	local value = if type(settings) == "table" then settings[name] else nil
	if value == nil then
		value = Config.DefaultSettings[name]
	end
	return value
end

local function getBaseFov(): number
	local fov = tonumber(setting("Fov")) or CameraConfig.BaseFov
	return math.clamp(fov, 40, 110)
end

-- FOV de visée : relatif au FOV de base (AdsFov est pensé pour 70) ; exact pour une lunette.
local function getAdsFov(weapon, baseFov: number): number
	local adsFov = weapon.AdsFov or baseFov
	if not weapon.Scope then
		adsFov = adsFov * baseFov / CameraConfig.BaseFov
	end
	return math.clamp(adsFov, 5, baseFov)
end

local function weaponOf(tool: Instance?)
	if not tool or not tool:IsA("Tool") then
		return nil
	end
	local weaponId = tool:GetAttribute("WeaponId")
	if type(weaponId) ~= "string" then
		return nil
	end
	return Weapons.ById[weaponId]
end

local function readAmmo(tool: Instance?): number
	if not tool then
		return 0
	end
	local value = tool:GetAttribute("Ammo")
	if type(value) ~= "number" or value ~= value then
		return 0
	end
	return math.max(0, math.floor(value))
end

local function findAttachment(container: Instance, name: string): Attachment?
	local found = container:FindFirstChild(name, true)
	if found and found:IsA("Attachment") then
		return found
	end
	return nil
end

local function clearConnections(list)
	for _, connection in list do
		connection:Disconnect()
	end
	table.clear(list)
end

-- Appel protégé d'une fonction d'EffectsController (une erreur d'effet ne doit jamais casser le tir).
local fxWarned = {}
local function fx(fn, ...)
	if not fn then
		return
	end
	local ok, err = pcall(fn, ...)
	if not ok and not fxWarned[fn] then
		fxWarned[fn] = true
		warn("[GunController] effet en erreur : " .. tostring(err))
	end
end

local function isAlive(): boolean
	local hum = humanoid
	local root = rootPart
	return hum ~= nil and hum.Parent ~= nil and hum.Health > 0 and root ~= nil and root.Parent ~= nil
end

-- Le joueur peut-il agir (tirer, viser, recharger…) ?
local function canAct(): boolean
	return ClientState.Mode == "Playing" and not ClientState.UiOpen and not GuiService.MenuIsOpen and isAlive()
end

-- Balles : décor + autres joueurs (on s'exclut soi-même).
local function getShotParams(): RaycastParams
	local now = os.clock()
	if not shotParams or now - shotParamsAt > 1 then
		shotParams = Ballistics.GetRaycastParams(if character then { character } else nil)
		shotParamsAt = now
	end
	return shotParams :: RaycastParams
end

-- Décor seulement (ciblage au sol de la frappe orbitale).
local function getWorldParams(): RaycastParams
	local now = os.clock()
	if not worldParams or now - worldParamsAt > 0.5 then
		worldParams = Ballistics.GetRaycastParams(Ballistics.GetCharacters())
		worldParamsAt = now
	end
	return worldParams :: RaycastParams
end

local function getClientFxFolder(): Instance
	local folder = workspace:FindFirstChild("ClientFX")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "ClientFX"
		folder.Parent = workspace
	end
	return folder
end

--------------------------------------------------------------------------
-- États partagés (ClientState)
--------------------------------------------------------------------------
local function resetInputs()
	triggerHeld = false
	fireQueuedAt = nil
	wantAds = false
	sprintHeld = false
	sprintToggled = false
	stillTime = 0
end

local function setAds(value: boolean)
	if adsActive ~= value then
		adsActive = value
		ClientState.Set("Ads", value)
	end
end

local function setSprinting(value: boolean, now: number)
	if sprinting ~= value then
		sprinting = value
		if not value then
			sprintEndedAt = now
		end
		ClientState.Set("Sprinting", value)
	end
end

local function publishSpread(value: number)
	local rounded = math.floor(value * 20 + 0.5) / 20
	if rounded ~= lastSpreadSent then
		lastSpreadSent = rounded
		ClientState.Set("Spread", rounded)
	end
end

--------------------------------------------------------------------------
-- Rechargement (le serveur fait autorité : attributs Reloading / Ammo du Tool)
--------------------------------------------------------------------------
local function startReload(fromServer: boolean): boolean
	local weapon, tool = currentWeapon, currentTool
	if not weapon or not tool or reloading then
		return false
	end
	if not fromServer then
		if not canAct() or ammo >= weapon.MagSize then
			return false
		end
		Remotes.Reload:FireServer()
	end
	reloading = true
	reloadSeenOnServer = fromServer
	reloadEndsAt = os.clock() + weapon.ReloadTime
	autoReloadAt = nil
	fireQueuedAt = nil
	ClientState.Set("Reloading", true)
	ClientState.Emit("ReloadStarted", weapon.ReloadTime)
	if handle and handle.Parent then
		Sfx.PlayAt(Config.Sounds.Reload, handle, 0.7, 0.03)
	end
	return true
end

local function finishReload()
	if not reloading then
		return
	end
	reloading = false
	reloadSeenOnServer = false
	if currentTool then
		ammo = readAmmo(currentTool)
	end
	bloom = 0
	ClientState.Set("Reloading", false)
	ClientState.Set("Ammo", ammo)
	ClientState.Emit("ReloadFinished")
end

-- Annulation locale (changement d'arme, mort…) : le serveur annule de son côté quand l'arme quitte la main.
local function cancelReload()
	if not reloading then
		return
	end
	reloading = false
	reloadSeenOnServer = false
	ClientState.Set("Reloading", false)
	ClientState.Emit("ReloadFinished")
end

local function emptyClick()
	local now = os.clock()
	if now - lastEmptyClickAt < Tune.EMPTY_CLICK_COOLDOWN then
		return
	end
	lastEmptyClickAt = now
	Sfx.Play2D(Config.Sounds.Empty, 0.6)
end

--------------------------------------------------------------------------
-- Lunette : on masque son propre personnage (il boucherait la vue zoomée)
--------------------------------------------------------------------------
local function updateScopeHide(hide: boolean)
	if hide then
		if not scopeHidden then
			scopeHidden = true
			hiddenParts = {}
			if character then
				for _, descendant in character:GetDescendants() do
					if descendant:IsA("BasePart") then
						table.insert(hiddenParts, descendant)
					end
				end
			end
		end
		-- réappliqué à chaque frame : le TransparencyController par défaut peut le remettre à 0
		for _, part in hiddenParts do
			if part.LocalTransparencyModifier ~= 1 then
				part.LocalTransparencyModifier = 1
			end
		end
	elseif scopeHidden then
		scopeHidden = false
		if hiddenParts then
			for _, part in hiddenParts do
				if part.Parent then
					part.LocalTransparencyModifier = 0
				end
			end
		end
		hiddenParts = nil
	end
end

--------------------------------------------------------------------------
-- Récompenses : radar et ciblage de la frappe orbitale
--------------------------------------------------------------------------
local function newEffectPart(name: string, size: Vector3, color: Color3, transparency: number, material: Enum.Material?): Part
	local part = Instance.new("Part")
	part.Name = name
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.CastShadow = false
	part.Size = size
	part.Color = color
	part.Transparency = transparency
	part.Material = material or Enum.Material.SmoothPlastic
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	return part
end

-- Marqueur rouge au sol (rayon = rayon de l'explosion) + colonne lumineuse, dans workspace.ClientFX.
local function createMarker()
	local diameter = Tune.ORBITAL_RADIUS * 2
	local model = Instance.new("Model")
	model.Name = "OrbitalTargetMarker"

	local disc = newEffectPart("Ring", Vector3.new(diameter, 0.1, diameter), Tune.MARKER_VALID_COLOR, 1)
	disc.Parent = model

	local gui = Instance.new("SurfaceGui")
	gui.Name = "RingGui"
	gui.Face = Enum.NormalId.Top
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 12
	gui.LightInfluence = 0
	gui.Brightness = 2.5
	gui.AlwaysOnTop = false
	gui.Parent = disc

	local frames, strokes, tweens = {}, {}, {}

	local function ring(scale: number, thickness: number, fillTransparency: number, strokeTransparency: number)
		local frame = Instance.new("Frame")
		frame.AnchorPoint = Vector2.new(0.5, 0.5)
		frame.Position = UDim2.fromScale(0.5, 0.5)
		frame.Size = UDim2.fromScale(scale, scale)
		frame.BackgroundColor3 = Tune.MARKER_VALID_COLOR
		frame.BackgroundTransparency = fillTransparency
		frame.BorderSizePixel = 0
		local corner = Instance.new("UICorner")
		corner.CornerRadius = UDim.new(0.5, 0)
		corner.Parent = frame
		local stroke = Instance.new("UIStroke")
		stroke.Thickness = thickness
		stroke.Color = Tune.MARKER_VALID_COLOR
		stroke.Transparency = strokeTransparency
		stroke.Parent = frame
		frame.Parent = gui
		table.insert(frames, frame)
		table.insert(strokes, stroke)
		return frame, stroke
	end

	ring(1, 10, 0.84, 0) -- bord = zone de l'explosion
	ring(0.55, 4, 1, 0.35)
	ring(0.07, 0, 0.05, 1) -- point central

	-- croix de visée
	for index = 1, 2 do
		local line = Instance.new("Frame")
		line.AnchorPoint = Vector2.new(0.5, 0.5)
		line.Position = UDim2.fromScale(0.5, 0.5)
		line.Size = if index == 1 then UDim2.new(0.9, 0, 0, 4) else UDim2.new(0, 4, 0.9, 0)
		line.BackgroundColor3 = Tune.MARKER_VALID_COLOR
		line.BackgroundTransparency = 0.35
		line.BorderSizePixel = 0
		line.Parent = gui
		table.insert(frames, line)
	end

	-- onde qui pulse du centre vers le bord
	local pulse, pulseStroke = ring(0.05, 6, 1, 0)
	local pulseInfo = TweenInfo.new(1.1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out, -1)
	local sizeTween = TweenService:Create(pulse, pulseInfo, { Size = UDim2.fromScale(1, 1) })
	local fadeTween = TweenService:Create(pulseStroke, pulseInfo, { Transparency = 1 })
	sizeTween:Play()
	fadeTween:Play()
	table.insert(tweens, sizeTween)
	table.insert(tweens, fadeTween)

	-- colonne verticale visible de loin
	local beam = newEffectPart(
		"Beam",
		Vector3.new(Tune.ORBITAL_BEAM_HEIGHT, 1.2, 1.2),
		Tune.MARKER_VALID_COLOR,
		0.55,
		Enum.Material.Neon
	)
	beam.Shape = Enum.PartType.Cylinder
	beam.Parent = model

	model.Parent = getClientFxFolder()

	return {
		Model = model,
		Disc = disc,
		Gui = gui,
		Beam = beam,
		Frames = frames,
		Strokes = strokes,
		Tweens = tweens,
		Valid = true,
		Point = nil,
	}
end

local function destroyMarker()
	if not marker then
		return
	end
	for _, tween in marker.Tweens do
		tween:Cancel()
	end
	marker.Model:Destroy()
	marker = nil
end

local function setMarkerValid(valid: boolean)
	if not marker or marker.Valid == valid then
		return
	end
	marker.Valid = valid
	local color = if valid then Tune.MARKER_VALID_COLOR else Tune.MARKER_INVALID_COLOR
	for _, frame in marker.Frames do
		frame.BackgroundColor3 = color
	end
	for _, stroke in marker.Strokes do
		stroke.Color = color
	end
	marker.Beam.Color = color
end

-- Point visé au sol (rayon depuis le centre de l'écran ; un mur renvoie au sol devant lui).
local function computeOrbitalTarget(cam: Camera): (Vector3?, Vector3?)
	local params = getWorldParams()
	local frame = cam.CFrame
	local origin, direction = frame.Position, frame.LookVector
	local result = workspace:Raycast(origin, direction * (Tune.ORBITAL_MAX_DISTANCE + 200), params)
	if result then
		if result.Normal.Y >= 0.55 then
			return result.Position, result.Normal
		end
		local down = workspace:Raycast(result.Position + result.Normal * 1.5, Tune.DOWN_RAY, params)
		if down then
			return down.Position, down.Normal
		end
		return result.Position, Vector3.yAxis
	end
	-- ciel : on projette au bout de la portée puis on cherche le sol en dessous
	local down = workspace:Raycast(origin + direction * Tune.ORBITAL_MAX_DISTANCE + Vector3.new(0, 300, 0), Tune.DOWN_RAY, params)
	if down then
		return down.Position, down.Normal
	end
	return nil, nil
end

local function updateMarker(cam: Camera, now: number)
	if not marker then
		marker = createMarker()
	end
	local point, normal = computeOrbitalTarget(cam)
	local visible = point ~= nil and normal ~= nil
	if marker.Gui.Enabled ~= visible then
		marker.Gui.Enabled = visible
		marker.Beam.Transparency = if visible then 0.55 else 1
	end
	if not point or not normal then
		marker.Point = nil
		return
	end
	local root = rootPart
	setMarkerValid(root ~= nil and (point - root.Position).Magnitude <= Tune.ORBITAL_MAX_DISTANCE)
	marker.Point = point

	-- repère aligné sur la pente du sol, qui tourne doucement
	local up = normal.Unit
	local right = Vector3.xAxis - up * up:Dot(Vector3.xAxis)
	if right.Magnitude < 1e-3 then
		right = Vector3.zAxis - up * up:Dot(Vector3.zAxis)
	end
	marker.Disc.CFrame = CFrame.fromMatrix(point + up * 0.15, right.Unit, up) * CFrame.Angles(0, now * 0.8, 0)
	marker.Beam.CFrame = CFrame.new(point + Vector3.new(0, Tune.ORBITAL_BEAM_HEIGHT / 2, 0)) * CFrame.Angles(0, 0, math.pi / 2)
end

local function cancelTargeting()
	destroyMarker()
	if ClientState.Targeting ~= nil then
		ClientState.Set("Targeting", nil)
	end
end

local function rewardAvailable(rewardId: string): boolean
	local rewards = ClientState.Rewards
	return type(rewards) == "table" and rewards[rewardId] == true
end

local function startTargeting()
	if not canAct() or not rewardAvailable("Orbital") then
		return
	end
	triggerHeld = false
	fireQueuedAt = nil
	wantAds = false
	sprintToggled = false
	if not marker then
		marker = createMarker()
	end
	ClientState.Set("Targeting", "Orbital")
end

local function confirmTargeting()
	if ClientState.Targeting ~= "Orbital" then
		return
	end
	local point = marker and marker.Point
	if not point or not marker.Valid or not rewardAvailable("Orbital") or not canAct() then
		emptyClick()
		return
	end
	Remotes.UseReward:FireServer("Orbital", point)
	cancelTargeting()
end

local function useRadar()
	if not canAct() or not rewardAvailable("Radar") then
		return
	end
	local now = os.clock()
	if now - lastRewardUseAt < 0.5 then
		return
	end
	lastRewardUseAt = now
	Remotes.UseReward:FireServer("Radar")
end

--------------------------------------------------------------------------
-- Changement d'arme (Tools du Backpack, slot Primary / Secondary)
--------------------------------------------------------------------------
local function findToolForSlot(slot: string): Tool?
	local backpack = LocalPlayer:FindFirstChildOfClass("Backpack")
	local containers = { backpack, character }
	for index = 1, 2 do
		local container = containers[index]
		if container then
			for _, child in container:GetChildren() do
				local weapon = weaponOf(child)
				if weapon and weapon.Slot == slot then
					return child :: Tool
				end
			end
		end
	end
	return nil
end

local function switchTo(slot: string)
	local hum = humanoid
	if not hum or not canAct() or ClientState.Targeting ~= nil then
		return
	end
	if currentWeapon and currentWeapon.Slot == slot and currentTool and currentTool.Parent == character then
		return
	end
	local now = os.clock()
	if now - lastSwitchAt < Tune.SWITCH_COOLDOWN then
		return
	end
	local tool = findToolForSlot(slot)
	if not tool or tool.Parent == character then
		return
	end
	lastSwitchAt = now
	fireQueuedAt = nil
	hum:EquipTool(tool)
end

local function toggleWeapon()
	local target = if currentWeapon and currentWeapon.Slot == "Primary" then "Secondary" else "Primary"
	if findToolForSlot(target) then
		switchTo(target)
	end
end

--------------------------------------------------------------------------
-- Dash (LinearVelocity horizontale de courte durée)
--------------------------------------------------------------------------
local function getDashAttachment(root: BasePart): Attachment
	if dashAttachment and dashAttachment.Parent == root then
		return dashAttachment
	end
	local existing = root:FindFirstChild("ArenaDashAttachment")
	local attachment: Attachment
	if existing and existing:IsA("Attachment") then
		attachment = existing
	else
		attachment = Instance.new("Attachment")
		attachment.Name = "ArenaDashAttachment"
		attachment.Parent = root
	end
	dashAttachment = attachment
	return attachment
end

local function tryDash()
	local hum, root, cam = humanoid, rootPart, camera
	if not hum or not root or not cam or not canAct() then
		return
	end
	local now = os.clock()
	if now - lastDashAt < Movement.DashCooldown then
		return
	end
	if hum.Sit or hum.PlatformStand or NO_FACE_STATES[hum:GetState()] then
		return
	end
	-- direction : celle du déplacement, sinon vers l'avant de la caméra
	local move = hum.MoveDirection
	local direction = Vector3.new(move.X, 0, move.Z)
	if direction.Magnitude < 0.1 then
		local look = cam.CFrame.LookVector
		direction = Vector3.new(look.X, 0, look.Z)
	end
	if direction.Magnitude < 1e-3 then
		return
	end
	direction = direction.Unit
	lastDashAt = now

	local velocity = Instance.new("LinearVelocity")
	velocity.Name = "ArenaDash"
	velocity.Attachment0 = getDashAttachment(root)
	velocity.RelativeTo = Enum.ActuatorRelativeTo.World
	velocity.VelocityConstraintMode = Enum.VelocityConstraintMode.Plane
	velocity.PrimaryTangentAxis = Vector3.xAxis
	velocity.SecondaryTangentAxis = Vector3.zAxis
	velocity.PlaneVelocity = Vector2.new(direction.X, direction.Z) * Movement.DashPower
	velocity.MaxForce = math.max(root.AssemblyMass, 1) * Tune.DASH_FORCE_PER_MASS
	velocity.Parent = root
	Debris:AddItem(velocity, Movement.DashDuration)

	dashFovKick = Tune.DASH_FOV_KICK
	ClientState.Emit("DashUsed", Movement.DashCooldown)
end

--------------------------------------------------------------------------
-- Tir
--------------------------------------------------------------------------
local function kickRecoil(weapon)
	local recoil = weapon.Recoil
	if type(recoil) ~= "table" then
		return
	end
	local adsEase = smoothstep(adsAlpha)
	local scale = 1 + (Tune.ADS_RECOIL_SCALE - 1) * adsEase
	local vertical = recoil.Vertical or 0
	local horizontal = recoil.Horizontal or 0

	recoilTargetPitch += math.rad(vertical) * scale * rng:NextNumber(0.85, 1.15)
	recoilTargetYaw += math.rad(horizontal) * scale * rng:NextNumber(-1, 1)

	-- « punch » : léger élargissement du champ de vision + roulis (moins marqué en visée)
	local fovNow = if camera then camera.FieldOfView else CameraConfig.BaseFov
	fovPunch = math.min(Tune.FOV_PUNCH_MAX, fovPunch + math.clamp(vertical * 0.45, 0.25, 2.8) * (fovNow / getBaseFov()))
	local rollSign = if rng:NextNumber() < 0.5 then -1 else 1
	rollPunch += math.rad(math.clamp(vertical * 0.35, 0.15, 2)) * rollSign * (1 - 0.6 * adsEase)

	if vertical >= 4 and setting("CameraShake") ~= false then
		shakeTrauma = math.min(1, shakeTrauma + Tune.HEAVY_RECOIL_SHAKE)
	end
end

local function fireShot(now: number, weapon): boolean
	local cam = camera
	local tool = currentTool
	local originPart = head
	if not originPart or not originPart.Parent then
		originPart = rootPart
	end
	if not cam or not tool or not originPart then
		return false
	end

	-- 1. point visé : rayon depuis le centre de l'écran, démarré au niveau de la tête
	--    (pour ne pas toucher ce qui se trouve entre la caméra et le personnage)
	local params = getShotParams()
	local origin = originPart.Position
	local viewport = cam.ViewportSize
	local ray = cam:ViewportPointToRay(viewport.X * 0.5, viewport.Y * 0.5)
	local cameraDirection = ray.Direction.Unit
	local start = ray.Origin
	local along = (origin - start):Dot(cameraDirection)
	if along > 0 then
		start += cameraDirection * along
	end
	local aimRange = weapon.Range + Tune.AIM_EXTRA_RANGE
	local aimResult = workspace:Raycast(start, cameraDirection * aimRange, params)
	local aimPoint = if aimResult then aimResult.Position else start + cameraDirection * aimRange

	-- 2. direction depuis la tête vers le point visé
	local toAim = aimPoint - origin
	local baseDirection = cameraDirection
	if toAim.Magnitude > 2 and toAim.Unit:Dot(cameraDirection) > 0.2 then
		baseDirection = toAim.Unit
	end

	-- 3. plombs : dispersion + raycast client jusqu'à la portée
	local count = math.max(1, weapon.Pellets or 1)
	local spread = currentSpread
	local pellets = table.create(count)
	for index = 1, count do
		local direction = Ballistics.ApplySpread(baseDirection, spread, rng)
		local result = workspace:Raycast(origin, direction * weapon.Range, params)
		if result then
			pellets[index] = {
				Direction = direction,
				Hit = result.Instance,
				Position = result.Position,
				Normal = result.Normal,
			}
		else
			pellets[index] = {
				Direction = direction,
				Position = origin + direction * weapon.Range,
				Normal = Vector3.zero,
			}
		end
	end

	-- 4. serveur (validation, dégâts, effets chez les autres)
	Remotes.Fire:FireServer(origin, pellets)

	-- 5. munitions / cadence / bloom
	ammo = math.max(0, ammo - 1)
	lastShotAt = now
	if weapon.Automatic then
		-- cadence exacte en rafale, sans jamais descendre sous 85 % du délai (validation serveur)
		if now - nextFireAt > weapon.FireDelay then
			nextFireAt = now
		end
		nextFireAt = math.max(nextFireAt + weapon.FireDelay, now + weapon.FireDelay * 0.85)
	else
		nextFireAt = now + weapon.FireDelay
	end
	bloom = math.min(bloom + (weapon.SpreadPerShot or 0), weapon.MaxSpread or 5)
	if ammo <= 0 then
		autoReloadAt = now + Tune.AUTO_RELOAD_DELAY
	end
	ClientState.Set("Ammo", ammo)

	-- 6. effets locaux instantanés
	local color = weapon.TracerColor or Color3.fromRGB(255, 220, 150)
	local muzzleAttachment = if muzzle and muzzle.Parent then muzzle else nil
	local muzzlePosition = if muzzleAttachment then muzzleAttachment.WorldPosition else origin + cameraDirection * 1.5
	if muzzleAttachment then
		fx(Effects.MuzzleFlash, muzzleAttachment, color)
	end
	if eject and eject.Parent then
		fx(Effects.Shell, eject, weapon.Id)
	end
	fx(Effects.PlayWeaponSound, weapon.Id, muzzleAttachment or originPart)
	for index = 1, count do
		local pellet = pellets[index]
		fx(Effects.Tracer, muzzlePosition, pellet.Position, color)
		local hit = pellet.Hit
		if hit then
			fx(Effects.Impact, pellet.Position, pellet.Normal, hit, Ballistics.GetHumanoid(hit) ~= nil)
		end
	end

	-- 7. recul + notification (HUD : recul du réticule)
	kickRecoil(weapon)
	ClientState.Emit("Shot", weapon)
	return true
end

local function tryFire(now: number, weapon): boolean
	if reloading or now < equipReadyAt or now < nextFireAt then
		return false
	end
	if sprinting or now - sprintEndedAt < Tune.SPRINT_OUT_TIME then
		return false
	end
	if ammo <= 0 then
		fireQueuedAt = nil
		startReload(false)
		return false
	end
	return fireShot(now, weapon)
end

--------------------------------------------------------------------------
-- Suivi de l'arme en main
--------------------------------------------------------------------------
local function unbindTool()
	clearConnections(toolConnections)
	currentTool = nil
	currentWeapon = nil
	handle = nil
	muzzle = nil
	eject = nil
	fireQueuedAt = nil
	autoReloadAt = nil
end

local function onToolAttributeChanged(tool: Tool, name: string)
	if tool ~= currentTool then
		return
	end
	if name == "Reloading" then
		if tool:GetAttribute("Reloading") == true then
			reloadSeenOnServer = true
			if not reloading then
				-- rechargement lancé côté serveur sans nous : on suit
				startReload(true)
			end
		end
		-- la fin du rechargement est gérée dans la boucle (attente de la confirmation serveur)
	elseif name == "Ammo" then
		if reloading then
			return
		end
		local serverAmmo = readAmmo(tool)
		-- pendant une rafale, des tirs sont encore en vol : on ne remonte jamais le compteur
		local value = if os.clock() - lastShotAt > Tune.AMMO_SYNC_IDLE then serverAmmo else math.min(ammo, serverAmmo)
		if value ~= ammo then
			ammo = value
			ClientState.Set("Ammo", ammo)
		end
	end
end

local function onToolEquipped(tool: Instance)
	if tool == currentTool or not tool:IsA("Tool") then
		return
	end
	local weapon = weaponOf(tool)
	if not weapon then
		return
	end
	cancelReload()
	unbindTool()

	currentTool = tool
	currentWeapon = weapon
	local handlePart = tool:FindFirstChild("Handle")
	handle = if handlePart and handlePart:IsA("BasePart") then handlePart else nil
	muzzle = findAttachment(tool, "Muzzle")
	eject = findAttachment(tool, "Eject")
	ammo = readAmmo(tool)

	local now = os.clock()
	equipReadyAt = now + (Tune.EQUIP_TIME[weapon.Slot] or 0.3)
	nextFireAt = 0
	bloom = 0
	lastAmmoSyncAt = now

	table.insert(
		toolConnections,
		tool.AttributeChanged:Connect(function(name)
			onToolAttributeChanged(tool, name)
		end)
	)

	ClientState.Set("Tool", tool)
	ClientState.Set("Weapon", weapon)
	ClientState.Set("Ammo", ammo)

	if tool:GetAttribute("Reloading") == true then
		startReload(true)
	elseif ammo <= 0 then
		autoReloadAt = equipReadyAt
	end
	if handle then
		Sfx.PlayAt(Config.Sounds.Equip, handle, 0.45, 0.05)
	end
end

local function onCharacterChildRemoved(child: Instance)
	if child ~= currentTool then
		return
	end
	cancelReload()
	unbindTool()
	-- différé : lors d'un changement d'arme, la nouvelle arme arrive dans la même frame (pas de clignotement du HUD)
	task.defer(function()
		if currentTool == nil then
			ClientState.Set("Tool", nil)
			ClientState.Set("Weapon", nil)
		end
	end)
end

--------------------------------------------------------------------------
-- Personnage (réassocié à chaque apparition)
--------------------------------------------------------------------------
local function unbindCharacter()
	clearConnections(characterConnections)
	if reloading then
		cancelReload()
	end
	local hadTool = currentTool ~= nil
	unbindTool()
	if hadTool then
		ClientState.Set("Tool", nil)
		ClientState.Set("Weapon", nil)
	end
	updateScopeHide(false)
	character = nil
	humanoid = nil
	rootPart = nil
	head = nil
	dashAttachment = nil
	shotParams = nil
end

local function bindCharacter(newCharacter: Model)
	unbindCharacter()
	character = newCharacter
	resetInputs()
	cancelTargeting()
	bloom = 0

	task.spawn(function()
		local hum = newCharacter:WaitForChild("Humanoid", 10)
		if character ~= newCharacter or not hum or not hum:IsA("Humanoid") then
			return
		end
		local root = newCharacter:WaitForChild("HumanoidRootPart", 10)
		if character ~= newCharacter or not root or not root:IsA("BasePart") then
			return
		end
		local headPart = newCharacter:WaitForChild("Head", 5)
		if character ~= newCharacter then
			return
		end

		humanoid = hum
		rootPart = root
		head = if headPart and headPart:IsA("BasePart") then headPart else nil
		shotParams = nil

		table.insert(characterConnections, newCharacter.ChildAdded:Connect(onToolEquipped))
		table.insert(characterConnections, newCharacter.ChildRemoved:Connect(onCharacterChildRemoved))
		table.insert(
			characterConnections,
			hum.Died:Connect(function()
				if humanoid ~= hum then
					return
				end
				resetInputs()
				cancelTargeting()
				cancelReload()
				setAds(false)
				setSprinting(false, os.clock())
				updateScopeHide(false)
			end)
		)

		-- arme déjà en main (équipée par le serveur avant que l'on soit prêt)
		local equipped = newCharacter:FindFirstChildOfClass("Tool")
		if equipped then
			onToolEquipped(equipped)
		end
	end)
end

--------------------------------------------------------------------------
-- Entrées (ContextActionService : clavier/souris, manette, boutons tactiles)
--------------------------------------------------------------------------
-- Gestionnaires d'actions (dans une table : limite de 200 variables locales)
local InputHandlers = {}

local function isPress(state: Enum.UserInputState): boolean
	return state == Enum.UserInputState.Begin
end

local function isRelease(state: Enum.UserInputState): boolean
	return state == Enum.UserInputState.End or state == Enum.UserInputState.Cancel
end

local function isTouch(input: InputObject?): boolean
	return input ~= nil and input.UserInputType == Enum.UserInputType.Touch
end

function InputHandlers.Fire(_, state: Enum.UserInputState, _input: InputObject)
	if isRelease(state) then
		triggerHeld = false
		return PASS
	end
	if not isPress(state) or not canAct() then
		return PASS
	end
	if ClientState.Targeting == "Orbital" then
		confirmTargeting()
		return SINK
	end
	triggerHeld = true
	fireQueuedAt = os.clock()
	sprintToggled = false
	if currentWeapon and ammo <= 0 and not reloading then
		emptyClick()
		startReload(false)
	end
	return SINK
end

function InputHandlers.Aim(_, state: Enum.UserInputState, input: InputObject)
	local touch = isTouch(input)
	if isRelease(state) then
		if not touch then
			wantAds = false
		end
		return PASS
	end
	if not isPress(state) or not canAct() then
		return PASS
	end
	if ClientState.Targeting ~= nil then
		cancelTargeting()
		return SINK
	end
	if touch then
		wantAds = not wantAds -- bascule sur tactile
	else
		wantAds = true -- maintien souris / manette
	end
	if wantAds then
		sprintToggled = false
	end
	return SINK
end

function InputHandlers.Reload(_, state: Enum.UserInputState, _input: InputObject)
	if not isPress(state) or not canAct() then
		return PASS
	end
	if ClientState.Targeting == nil then
		startReload(false)
	end
	return SINK
end

function InputHandlers.Primary(_, state: Enum.UserInputState, _input: InputObject)
	if not isPress(state) or not canAct() then
		return PASS
	end
	switchTo("Primary")
	return SINK
end

function InputHandlers.Secondary(_, state: Enum.UserInputState, _input: InputObject)
	if not isPress(state) or not canAct() then
		return PASS
	end
	switchTo("Secondary")
	return SINK
end

function InputHandlers.Switch(_, state: Enum.UserInputState, _input: InputObject)
	if not isPress(state) or not canAct() then
		return PASS
	end
	toggleWeapon()
	return SINK
end

function InputHandlers.Sprint(_, state: Enum.UserInputState, input: InputObject)
	if input and input.KeyCode == Enum.KeyCode.LeftShift then
		-- Maj : maintien. On absorbe la touche pour que le « verrouillage Maj » de Roblox
		-- (priorité plus basse) ne s'active pas en plus de notre caméra épaule.
		if isPress(state) then
			sprintHeld = true
		elseif isRelease(state) then
			sprintHeld = false
		end
		return SINK
	end
	-- L3 / bouton tactile : bascule
	if not isPress(state) or not canAct() then
		return PASS
	end
	sprintToggled = not sprintToggled
	stillTime = 0
	if sprintToggled and isTouch(input) then
		wantAds = false
	end
	return SINK
end

function InputHandlers.Dash(_, state: Enum.UserInputState, input: InputObject)
	if not isPress(state) or not canAct() then
		return PASS
	end
	if ClientState.Targeting ~= nil and input and input.KeyCode == Enum.KeyCode.ButtonB then
		cancelTargeting() -- B annule le ciblage à la manette
		return SINK
	end
	tryDash()
	return SINK
end

function InputHandlers.Radar(_, state: Enum.UserInputState, _input: InputObject)
	if not isPress(state) or not canAct() then
		return PASS
	end
	useRadar()
	return SINK
end

function InputHandlers.Orbital(_, state: Enum.UserInputState, _input: InputObject)
	if not isPress(state) or not canAct() then
		return PASS
	end
	if ClientState.Targeting == "Orbital" then
		cancelTargeting()
	else
		startTargeting()
	end
	return SINK
end

local ACTIONS = {
	{
		Name = "Fire",
		Title = "🔫",
		Touch = true,
		Handler = InputHandlers.Fire,
		Inputs = { Enum.UserInputType.MouseButton1, Enum.KeyCode.ButtonR2 },
	},
	{
		Name = "Aim",
		Title = "🎯",
		Touch = true,
		Handler = InputHandlers.Aim,
		Inputs = { Enum.UserInputType.MouseButton2, Enum.KeyCode.ButtonL2 },
	},
	{ Name = "Reload", Title = "↻", Touch = true, Handler = InputHandlers.Reload, Inputs = { Enum.KeyCode.R, Enum.KeyCode.ButtonX } },
	{ Name = "Primary", Handler = InputHandlers.Primary, Inputs = { Enum.KeyCode.One } },
	{ Name = "Secondary", Handler = InputHandlers.Secondary, Inputs = { Enum.KeyCode.Two } },
	{ Name = "Switch", Title = "⇄", Touch = true, Handler = InputHandlers.Switch, Inputs = { Enum.KeyCode.ButtonY } },
	{
		Name = "Sprint",
		Title = "🏃",
		Touch = true,
		Handler = InputHandlers.Sprint,
		Inputs = { Enum.KeyCode.LeftShift, Enum.KeyCode.ButtonL3 },
	},
	{ Name = "Dash", Title = "💨", Touch = true, Handler = InputHandlers.Dash, Inputs = { Enum.KeyCode.Q, Enum.KeyCode.ButtonB } },
}

-- Récompenses : touches toujours actives, bouton tactile seulement si la récompense est disponible.
local REWARD_ACTIONS = {
	{ Name = "Radar", RewardId = "Radar", Title = "📡", Handler = InputHandlers.Radar, Inputs = { Tune.RADAR_KEY, Enum.KeyCode.DPadLeft } },
	{
		Name = "Orbital",
		RewardId = "Orbital",
		Title = "🛰️",
		Handler = InputHandlers.Orbital,
		Inputs = { Tune.ORBITAL_KEY, Enum.KeyCode.DPadRight },
	},
}

-- Disposition tactile : décalage (px, petit écran) depuis le centre du bouton de saut par défaut,
-- en éventail au-dessus / à gauche de celui-ci (le bas droit est laissé libre par le HUD).
local TOUCH_LAYOUT = {
	Fire = { X = -100, Y = -10, Size = 80, Tint = Tune.TINT_FIRE },
	Aim = { X = -95, Y = -100, Size = 56 },
	Reload = { X = 0, Y = -92, Size = 52 },
	Switch = { X = 0, Y = -162, Size = 52 },
	Dash = { X = -182, Y = -78, Size = 56 },
	Sprint = { X = -190, Y = 6, Size = 52 },
	Radar = { X = -95, Y = -176, Size = 52, Tint = Tune.TINT_REWARD },
	Orbital = { X = -172, Y = -160, Size = 52, Tint = Tune.TINT_REWARD },
}

local AIM_ACTION = Tune.ACTION_PREFIX .. "Aim"
local SPRINT_ACTION = Tune.ACTION_PREFIX .. "Sprint"

-- Centre du bouton de saut (et facteur d'échelle) dans l'espace des AbsolutePosition.
local function getJumpAnchor(): (Vector2?, number)
	local playerGui = LocalPlayer:FindFirstChildOfClass("PlayerGui")
	local touchGui = playerGui and playerGui:FindFirstChild("TouchGui")
	local jump = touchGui and touchGui:FindFirstChild("JumpButton", true)
	if jump and jump:IsA("GuiObject") and jump.AbsoluteSize.X > 1 then
		local size = jump.AbsoluteSize
		return jump.AbsolutePosition + size / 2, math.clamp(size.X / 70, 1, 1.5)
	end
	-- repli : formule du module de contrôle tactile par défaut
	local cam = camera
	if not cam then
		return nil, 1
	end
	local inset = GuiService:GetGuiInset()
	local screen = cam.ViewportSize - Vector2.new(0, inset.Y)
	if math.min(screen.X, screen.Y) <= 500 then
		return Vector2.new(screen.X - 60, screen.Y - 55), 1
	end
	return Vector2.new(screen.X - 110, screen.Y - 150), 1.5
end

local function isTouchBound(spec): boolean
	if not bound then
		return false
	end
	if spec.RewardId then
		return rewardTouch[spec.RewardId] == true
	end
	return spec.Touch == true and UserInputService.TouchEnabled
end

local function styleTouchButton(button: GuiObject, spec, layout)
	local title = button:FindFirstChild("ActionTitle")
	if title and title:IsA("TextLabel") then
		title.TextScaled = true
		title.AnchorPoint = Vector2.zero
		title.Size = UDim2.fromScale(0.62, 0.62)
		title.Position = UDim2.fromScale(0.19, 0.19)
	end
	local name = Tune.ACTION_PREFIX .. spec.Name
	touchButtons[name] = button
	touchTint[name] = nil
	if button:IsA("ImageButton") then
		button.ImageColor3 = layout.Tint or Tune.TINT_DEFAULT
		touchTint[name] = layout.Tint or Tune.TINT_DEFAULT
	end
end

local function layoutPass()
	local anchor, unit = getJumpAnchor()
	if not anchor then
		return
	end
	local function place(spec)
		local layout = TOUCH_LAYOUT[spec.Name]
		if not layout or not isTouchBound(spec) then
			return
		end
		local name = Tune.ACTION_PREFIX .. spec.Name
		local ok, button = pcall(function()
			return ContextActionService:GetButton(name)
		end)
		if not ok or typeof(button) ~= "Instance" or not button:IsA("GuiObject") then
			return
		end
		local parent = button.Parent
		if not parent or not parent:IsA("GuiBase2d") then
			return
		end
		local size = math.floor(layout.Size * unit + 0.5)
		local center = anchor + Vector2.new(layout.X, layout.Y) * unit
		local topLeft = center - Vector2.new(size, size) / 2 - parent.AbsolutePosition
		button.AnchorPoint = Vector2.zero
		button.Size = UDim2.fromOffset(size, size)
		ContextActionService:SetPosition(name, UDim2.fromOffset(math.floor(topLeft.X), math.floor(topLeft.Y)))
		styleTouchButton(button, spec, layout)
	end
	for _, spec in ACTIONS do
		place(spec)
	end
	for _, spec in REWARD_ACTIONS do
		place(spec)
	end
end

-- Placement des boutons tactiles (différé : les boutons sont créés par les scripts du cœur Roblox).
local function layoutTouchButtons()
	if not UserInputService.TouchEnabled or not bound then
		return
	end
	layoutToken += 1
	local token = layoutToken
	task.spawn(function()
		task.wait()
		if token ~= layoutToken or not bound then
			return
		end
		layoutPass()
		-- seconde passe : le bouton de saut peut apparaître un peu après le personnage
		task.wait(1)
		if token ~= layoutToken or not bound then
			return
		end
		layoutPass()
	end)
end

local function setTouchTint(name: string, color: Color3)
	if touchTint[name] == color then
		return
	end
	local button = touchButtons[name]
	if not button or not button.Parent or not button:IsA("ImageButton") then
		return
	end
	touchTint[name] = color
	button.ImageColor3 = color
end

local function bindAction(spec, withTouch: boolean)
	local name = Tune.ACTION_PREFIX .. spec.Name
	ContextActionService:UnbindAction(name)
	touchButtons[name] = nil
	touchTint[name] = nil
	ContextActionService:BindActionAtPriority(name, spec.Handler, withTouch, Tune.ACTION_PRIORITY, table.unpack(spec.Inputs))
	if withTouch and spec.Title then
		ContextActionService:SetTitle(name, spec.Title)
	end
end

-- Lie les actions en partie (et sans panneau ouvert), les délie sinon (les boutons tactiles disparaissent).
local function refreshBindings()
	local shouldBind = playingApplied and ClientState.Mode == "Playing" and not ClientState.UiOpen
	if shouldBind then
		local changed = false
		if not bound then
			bound = true
			changed = true
			table.clear(rewardTouch)
			for _, spec in ACTIONS do
				bindAction(spec, spec.Touch == true and UserInputService.TouchEnabled)
			end
		end
		for _, spec in REWARD_ACTIONS do
			local showTouch = UserInputService.TouchEnabled and rewardAvailable(spec.RewardId)
			if rewardTouch[spec.RewardId] ~= showTouch then
				rewardTouch[spec.RewardId] = showTouch
				bindAction(spec, showTouch)
				changed = true
			end
		end
		if changed then
			layoutTouchButtons()
		end
	elseif bound then
		bound = false
		layoutToken += 1
		for _, spec in ACTIONS do
			ContextActionService:UnbindAction(Tune.ACTION_PREFIX .. spec.Name)
		end
		for _, spec in REWARD_ACTIONS do
			ContextActionService:UnbindAction(Tune.ACTION_PREFIX .. spec.Name)
		end
		table.clear(rewardTouch)
		table.clear(touchButtons)
		table.clear(touchTint)
		resetInputs()
	end
end

--------------------------------------------------------------------------
-- Caméra : entrée / sortie du mode Playing
--------------------------------------------------------------------------
local function updateMouse(lock: boolean)
	if lock then
		-- les scripts caméra par défaut réinitialisent MouseBehavior : on le réimpose à chaque frame
		UserInputService.MouseBehavior = Enum.MouseBehavior.LockCenter
		if UserInputService.MouseIconEnabled then
			UserInputService.MouseIconEnabled = false -- le HUD dessine le réticule
		end
		mouseLocked = true
	elseif mouseLocked then
		mouseLocked = false
		UserInputService.MouseBehavior = Enum.MouseBehavior.Default
		UserInputService.MouseIconEnabled = true
	end
end

local function setZoom(minZoom: number, maxZoom: number)
	-- l'ordre évite que le moteur ne corrige Min > Max entre les deux affectations
	if maxZoom >= LocalPlayer.CameraMinZoomDistance then
		LocalPlayer.CameraMaxZoomDistance = maxZoom
		LocalPlayer.CameraMinZoomDistance = minZoom
	else
		LocalPlayer.CameraMinZoomDistance = minZoom
		LocalPlayer.CameraMaxZoomDistance = maxZoom
	end
end

local function resetCameraEffects()
	recoilTargetPitch, recoilTargetYaw = 0, 0
	recoilPitch, recoilYaw = 0, 0
	shakeTrauma, shakeTime = 0, 0
	shakePitch, shakeYaw = 0, 0
	fovPunch, dashFovKick, rollPunch = 0, 0, 0
	adsAlpha, sprintAlpha = 0, 0
	bloom, moveMult, shoulderScale = 0, 1, 1
end

local function enterPlaying()
	local newHumanoid = humanoid
	local isNewLife = newHumanoid ~= nil and newHumanoid ~= appliedHumanoid
	playingApplied = true
	appliedHumanoid = newHumanoid
	resetCameraEffects()
	lastPitchSent = math.huge

	local cam = camera
	if cam then
		cam.CameraType = Enum.CameraType.Custom
		if newHumanoid and cam.CameraSubject ~= newHumanoid then
			cam.CameraSubject = newHumanoid
		end
		-- nouvelle vie : caméra replacée derrière le personnage (orientation du point d'apparition)
		local root = rootPart
		if isNewLife and root then
			local look = root.CFrame.LookVector
			local flat = Vector3.new(look.X, 0, look.Z)
			if flat.Magnitude > 1e-3 then
				flat = flat.Unit
				local focus = root.Position + Vector3.new(0, 1.5, 0)
				cam.CFrame = CFrame.lookAt(focus - flat * Tune.CAMERA_DISTANCE + Vector3.new(0, 1.5, 0), focus + flat * 20)
			end
		end
		cam.FieldOfView = getBaseFov()
	end
	setZoom(Tune.CAMERA_DISTANCE, Tune.CAMERA_DISTANCE)
	if newHumanoid then
		newHumanoid.AutoRotate = false
	end
	refreshBindings()
end

local function leavePlaying()
	playingApplied = false
	appliedHumanoid = nil
	resetInputs()
	cancelTargeting()
	cancelReload()
	setAds(false)
	setSprinting(false, os.clock())
	updateScopeHide(false)

	local hum = humanoid
	if hum and hum.Parent then
		hum.CameraOffset = Vector3.zero
		hum.AutoRotate = true
	end
	updateMouse(false)
	UserInputService.MouseDeltaSensitivity = 1
	if savedMinZoom and savedMaxZoom then
		setZoom(savedMinZoom, savedMaxZoom)
	end
	-- on ne touche au FOV que si personne n'a déjà pris la caméra (killcam, menu)
	local cam = camera
	if cam and cam.CameraType == Enum.CameraType.Custom then
		cam.FieldOfView = getBaseFov()
	end
	resetCameraEffects()
	lastPitchSent = math.huge
	refreshBindings()
end

--------------------------------------------------------------------------
-- Boucle de rendu (RenderPriority.Camera + 1 : juste après la caméra par défaut)
--------------------------------------------------------------------------

-- Recul + tremblements appliqués en rotations incrémentales (la caméra Classic repart de camera.CFrame).
local function applyCameraMotion(cam: Camera, dt: number, now: number, weapon)
	-- recul : la cible revient vers 0 (plus lentement pendant une rafale), la caméra la suit vite
	local recovery = 6
	if weapon and type(weapon.Recoil) == "table" then
		recovery = weapon.Recoil.Recovery or recovery
	end
	if weapon and now - lastShotAt < weapon.FireDelay + Tune.SPREAD_RECOVERY_DELAY then
		recovery *= Tune.FIRING_RECOVERY_SCALE
	end
	local decay = math.exp(-recovery * dt)
	recoilTargetPitch *= decay
	recoilTargetYaw *= decay
	local follow = 1 - math.exp(-Tune.KICK_SPEED * dt)
	local newPitch = recoilPitch + (recoilTargetPitch - recoilPitch) * follow
	local newYaw = recoilYaw + (recoilTargetYaw - recoilYaw) * follow
	local deltaPitch = newPitch - recoilPitch
	local deltaYaw = newYaw - recoilYaw
	recoilPitch, recoilYaw = newPitch, newYaw

	-- tremblements : bruit de Perlin pondéré par trauma²
	local roll = 0
	if shakeTrauma > 0 or shakePitch ~= 0 or shakeYaw ~= 0 then
		shakeTrauma = math.max(0, shakeTrauma - Tune.SHAKE_DECAY * dt)
		shakeTime += dt
		local amount = shakeTrauma * shakeTrauma
		local n = shakeTime * Tune.SHAKE_FREQUENCY
		local pitchShake = Tune.SHAKE_MAX_ANGLE * amount * math.clamp(math.noise(n, 3.7) * 2, -1, 1)
		local yawShake = Tune.SHAKE_MAX_ANGLE * amount * math.clamp(math.noise(n, 11.3) * 2, -1, 1)
		roll = Tune.SHAKE_MAX_ROLL * amount * math.clamp(math.noise(n, 19.9) * 2, -1, 1)
		deltaPitch += pitchShake - shakePitch
		deltaYaw += yawShake - shakeYaw
		shakePitch, shakeYaw = pitchShake, yawShake
	end
	rollPunch *= math.exp(-Tune.ROLL_PUNCH_DECAY * dt)
	roll += rollPunch

	if math.abs(deltaPitch) < 1e-6 and math.abs(deltaYaw) < 1e-6 and math.abs(roll) < 1e-5 then
		return
	end
	if cam.CameraType ~= Enum.CameraType.Custom then
		return
	end
	local frame = cam.CFrame
	local pitchNow = math.asin(math.clamp(frame.LookVector.Y, -1, 1))
	local pitchTarget = math.clamp(pitchNow + deltaPitch, -Tune.MAX_CAMERA_PITCH, Tune.MAX_CAMERA_PITCH)
	deltaPitch = pitchTarget - pitchNow
	-- lacet autour de l'axe vertical du monde, tangage et roulis en local (le roulis n'est pas conservé
	-- par la caméra par défaut, qui reconstruit un CFrame sans roulis à chaque frame)
	cam.CFrame = CFrame.new(frame.Position)
		* CFrame.Angles(0, deltaYaw, 0)
		* frame.Rotation
		* CFrame.Angles(deltaPitch, 0, roll)
end

-- Le personnage regarde dans la direction de la caméra.
local function faceCamera(cam: Camera, hum: Humanoid, root: BasePart)
	local skip = hum.Sit or hum.PlatformStand or NO_FACE_STATES[hum:GetState()] == true
	if hum.AutoRotate ~= skip then
		hum.AutoRotate = skip -- rendu au moteur pendant l'escalade / assis
	end
	if skip then
		return
	end
	local look = cam.CFrame.LookVector
	if math.abs(look.Y) > 0.995 then
		return
	end
	local yaw = math.atan2(-look.X, -look.Z)
	local rootLook = root.CFrame.LookVector
	local currentYaw = math.atan2(-rootLook.X, -rootLook.Z)
	local diff = (yaw - currentYaw + math.pi) % (2 * math.pi) - math.pi
	if math.abs(diff) < 1e-3 and math.abs(rootLook.Y) < 1e-3 then
		return
	end
	root.CFrame = CFrame.new(root.Position) * CFrame.Angles(0, yaw, 0)
end

local function onRenderStep(dt: number)
	if dt > 0.1 then
		dt = 0.1
	end
	if ClientState.Mode ~= "Playing" then
		if playingApplied then
			leavePlaying()
		end
		return
	end
	if not playingApplied or appliedHumanoid ~= humanoid then
		enterPlaying()
	end

	local now = os.clock()
	local uiOpen = ClientState.UiOpen == true or GuiService.MenuIsOpen
	updateMouse(not uiOpen and UserInputService.MouseEnabled)

	local cam, hum, root = camera, humanoid, rootPart
	if not cam or not hum or not root or not isAlive() then
		return
	end
	-- en partie, la caméra nous appartient (ARCHITECTURE.md) : on la reprend si un autre module l'a laissée
	if not uiOpen then
		if cam.CameraType ~= Enum.CameraType.Custom then
			cam.CameraType = Enum.CameraType.Custom
		end
		if cam.CameraSubject ~= hum then
			cam.CameraSubject = hum
		end
	end
	local weapon = currentWeapon
	if weapon and (not currentTool or currentTool.Parent ~= character) then
		weapon = nil
	end
	local targeting = ClientState.Targeting ~= nil

	------------------------------------------------------------------
	-- 1. Visée / sprint
	------------------------------------------------------------------
	local canAim = not uiOpen and weapon ~= nil and not targeting and not (reloading and weapon.Scope == true)
	local ads = wantAds and canAim

	local moveDirection = hum.MoveDirection
	local moving = moveDirection.Magnitude > 0.1
	local cameraLook = cam.CFrame.LookVector
	local flatLook = Vector3.new(cameraLook.X, 0, cameraLook.Z)
	local forward = moving and flatLook.Magnitude > 1e-3 and moveDirection.Unit:Dot(flatLook.Unit) > 0.35
	if sprintToggled then
		if moving then
			stillTime = 0
		else
			stillTime += dt
			if stillTime > 0.4 then
				sprintToggled = false -- le sprint en bascule s'arrête quand on s'immobilise
			end
		end
	end
	local sprint = (sprintHeld or sprintToggled)
		and not uiOpen
		and forward
		and not ads
		and not triggerHeld
		and fireQueuedAt == nil
		and not targeting
	setAds(ads)
	setSprinting(sprint, now)

	local adsTime = if weapon then math.max(weapon.AdsTime or 0.15, 0.01) else 0.15
	if ads then
		adsAlpha = math.min(1, adsAlpha + dt / adsTime)
	else
		adsAlpha = math.max(0, adsAlpha - dt / (adsTime * 0.8))
	end
	local adsEase = smoothstep(adsAlpha)
	if sprint then
		sprintAlpha = math.min(1, sprintAlpha + dt / 0.22)
	else
		sprintAlpha = math.max(0, sprintAlpha - dt / 0.18)
	end
	local sprintEase = smoothstep(sprintAlpha)

	------------------------------------------------------------------
	-- 2. Vitesse de déplacement
	------------------------------------------------------------------
	local speedScale = if weapon then weapon.SpeedScale or 1 else 1
	local speed = (Movement.WalkSpeed + (Movement.SprintSpeed - Movement.WalkSpeed) * sprintEase) * speedScale
	speed *= 1 + (Movement.AdsSpeedScale - 1) * adsEase
	if math.abs(hum.WalkSpeed - speed) > 0.05 then
		hum.WalkSpeed = speed
	end

	------------------------------------------------------------------
	-- 3. Recul + tremblements, puis personnage tourné vers la caméra
	------------------------------------------------------------------
	applyCameraMotion(cam, dt, now, weapon)
	faceCamera(cam, hum, root)

	------------------------------------------------------------------
	-- 4. Épaule (CameraOffset) avec anti-collision à droite
	------------------------------------------------------------------
	local offset = CameraConfig.ShoulderOffset:Lerp(CameraConfig.AdsShoulderOffset, adsEase)
	local allowed = 1
	if offset.X > 0.05 then
		local probeFrom = if head and head.Parent then head.Position else root.Position
		local hit = workspace:Raycast(probeFrom, cam.CFrame.RightVector * (offset.X + Tune.SHOULDER_MARGIN), getShotParams())
		if hit then
			allowed = math.clamp((hit.Distance - Tune.SHOULDER_MARGIN) / offset.X, 0, 1)
		end
	end
	local shoulderRate = if allowed < shoulderScale then 25 else 7
	shoulderScale += (allowed - shoulderScale) * (1 - math.exp(-shoulderRate * dt))
	local cameraOffset = Vector3.new(offset.X * shoulderScale, offset.Y, offset.Z)
	if (hum.CameraOffset - cameraOffset).Magnitude > 1e-3 then
		hum.CameraOffset = cameraOffset
	end

	------------------------------------------------------------------
	-- 5. Champ de vision + sensibilité
	------------------------------------------------------------------
	local baseFov = getBaseFov()
	local adsFov = if weapon then getAdsFov(weapon, baseFov) else baseFov
	local hipFov = baseFov + (CameraConfig.SprintFovBonus or 0) * sprintEase
	fovPunch *= math.exp(-Tune.FOV_PUNCH_DECAY * dt)
	dashFovKick *= math.exp(-Tune.DASH_FOV_DECAY * dt)
	local fov = math.clamp(hipFov + (adsFov - hipFov) * adsEase + fovPunch + dashFovKick, 5, 120)
	if math.abs(cam.FieldOfView - fov) > 1e-3 then
		cam.FieldOfView = fov
	end

	local sensitivity = math.clamp(tonumber(setting("Sensitivity")) or 1, 0.05, 5)
	local adsSensitivity = math.clamp(tonumber(setting("AdsSensitivity")) or 0.6, 0.05, 3)
	local multiplier = 1 + (adsSensitivity - 1) * adsEase
	if weapon and weapon.Scope then
		multiplier *= 1 + (adsFov / baseFov - 1) * adsEase -- lunette : vitesse proportionnelle au zoom
	end
	local mouseSensitivity = sensitivity * multiplier
	if math.abs(UserInputService.MouseDeltaSensitivity - mouseSensitivity) > 1e-4 then
		UserInputService.MouseDeltaSensitivity = mouseSensitivity
	end

	updateScopeHide(weapon ~= nil and weapon.Scope == true and adsEase > 0.65)

	------------------------------------------------------------------
	-- 6. Dispersion (degrés) : visée, bloom, déplacement rapide x1,5, en l'air x2
	------------------------------------------------------------------
	if weapon then
		if now - lastShotAt > weapon.FireDelay + Tune.SPREAD_RECOVERY_DELAY then
			bloom = math.max(0, bloom - (weapon.SpreadRecovery or 10) * dt)
		end
		local velocity = root.AssemblyLinearVelocity
		local horizontalSpeed = math.sqrt(velocity.X * velocity.X + velocity.Z * velocity.Z)
		local targetMult = 1
		if hum.FloorMaterial == Enum.Material.Air then
			targetMult = 2
		elseif horizontalSpeed > Tune.MOVE_FAST_SPEED then
			targetMult = 1.5
		end
		moveMult += (targetMult - moveMult) * (1 - math.exp(-12 * dt))
		local base = weapon.HipSpread + (weapon.AdsSpread - weapon.HipSpread) * adsEase
		local total = math.min(base + bloom, math.max(weapon.MaxSpread or base, base))
		currentSpread = total * moveMult
	else
		bloom = 0
		currentSpread = 0
	end
	publishSpread(currentSpread)

	------------------------------------------------------------------
	-- 7. Tir
	------------------------------------------------------------------
	if weapon and not uiOpen and not targeting then
		local wantsShot = fireQueuedAt ~= nil and now - fireQueuedAt <= Tune.SEMI_BUFFER
		if fireQueuedAt and not wantsShot then
			fireQueuedAt = nil
		end
		if weapon.Automatic and triggerHeld then
			wantsShot = true
		end
		if wantsShot and tryFire(now, weapon) then
			fireQueuedAt = nil
		end
	end

	------------------------------------------------------------------
	-- 8. Rechargement : fin (confirmée par le serveur), rechargement auto, resynchronisation
	------------------------------------------------------------------
	if reloading then
		local serverReloading = currentTool ~= nil and currentTool:GetAttribute("Reloading") == true
		if serverReloading then
			reloadSeenOnServer = true
		end
		if now >= reloadEndsAt then
			if not serverReloading and (reloadSeenOnServer or now >= reloadEndsAt + Tune.RELOAD_GRACE_UNSEEN) then
				finishReload()
			elseif now >= reloadEndsAt + Tune.RELOAD_GRACE_SEEN then
				finishReload()
			end
		end
	end
	if autoReloadAt and now >= autoReloadAt then
		autoReloadAt = nil
		if weapon and ammo <= 0 and not reloading then
			startReload(false)
		end
	end
	if not reloading and currentTool and now - lastAmmoSyncAt > Tune.AMMO_SYNC_INTERVAL then
		lastAmmoSyncAt = now
		if now - lastShotAt > Tune.AMMO_SYNC_IDLE then
			local serverAmmo = readAmmo(currentTool)
			if serverAmmo ~= ammo then
				ammo = serverAmmo
				ClientState.Set("Ammo", ammo)
			end
		end
	end

	------------------------------------------------------------------
	-- 9. Inclinaison de visée (pour le buste des autres joueurs)
	------------------------------------------------------------------
	if now - lastPitchSentAt >= Tune.PITCH_INTERVAL then
		local pitch = math.clamp(math.asin(math.clamp(cam.CFrame.LookVector.Y, -1, 1)), -Tune.PITCH_LIMIT, Tune.PITCH_LIMIT)
		pitch = math.floor(pitch * 100 + 0.5) / 100
		if pitch ~= lastPitchSent then
			lastPitchSent = pitch
			lastPitchSentAt = now
			Remotes.AimPitch:FireServer(pitch)
		end
	end

	------------------------------------------------------------------
	-- 10. Ciblage orbital + teinte des boutons tactiles en bascule
	------------------------------------------------------------------
	if ClientState.Targeting == "Orbital" then
		updateMarker(cam, now)
	elseif marker then
		destroyMarker()
	end
	if bound then
		setTouchTint(AIM_ACTION, if wantAds then Tune.TINT_ACTIVE else Tune.TINT_DEFAULT)
		setTouchTint(SPRINT_ACTION, if sprintToggled then Tune.TINT_SPRINT else Tune.TINT_DEFAULT)
	end
end

--------------------------------------------------------------------------
-- Initialisation
--------------------------------------------------------------------------
local function watchViewport()
	if viewportConnection then
		viewportConnection:Disconnect()
		viewportConnection = nil
	end
	local cam = camera
	if cam then
		viewportConnection = cam:GetPropertyChangedSignal("ViewportSize"):Connect(layoutTouchButtons)
	end
end

local function onCameraShake(intensity: any)
	if type(intensity) ~= "number" or intensity ~= intensity or setting("CameraShake") == false then
		return
	end
	shakeTrauma = math.min(1, shakeTrauma + math.clamp(intensity, 0, 1))
end

local initialized = false

function GunController.Init()
	if initialized then
		return
	end
	initialized = true

	savedMinZoom = LocalPlayer.CameraMinZoomDistance
	savedMaxZoom = LocalPlayer.CameraMaxZoomDistance

	-- Caméra « Classic » imposée et verrouillage Maj de Roblox désactivé : la caméra épaule est gérée ici.
	-- (protégé : si une de ces propriétés n'est pas modifiable côté client, on continue sans)
	pcall(function()
		LocalPlayer.DevEnableMouseLock = false
	end)
	pcall(function()
		LocalPlayer.DevComputerCameraMode = Enum.DevComputerCameraMovementMode.Classic
	end)
	pcall(function()
		LocalPlayer.DevTouchCameraMode = Enum.DevTouchCameraMovementMode.Classic
	end)

	workspace:GetPropertyChangedSignal("CurrentCamera"):Connect(function()
		camera = workspace.CurrentCamera
		watchViewport()
	end)
	watchViewport()

	LocalPlayer.CharacterAdded:Connect(bindCharacter)
	LocalPlayer.CharacterRemoving:Connect(function(oldCharacter)
		if oldCharacter == character then
			unbindCharacter()
		end
	end)
	if LocalPlayer.Character then
		bindCharacter(LocalPlayer.Character)
	end

	ClientState.On("Changed:Mode", function(mode)
		if mode ~= "Playing" and playingApplied then
			leavePlaying()
		end
	end)
	ClientState.On("Changed:UiOpen", function(open)
		if open then
			resetInputs()
			cancelTargeting()
		end
		refreshBindings()
	end)
	ClientState.On("Changed:Rewards", function(rewards)
		local targeting = ClientState.Targeting
		if targeting and (type(rewards) ~= "table" or rewards[targeting] ~= true) then
			cancelTargeting()
		end
		refreshBindings()
	end)
	ClientState.On("CameraShake", onCameraShake)

	-- molette : arme suivante / précédente (2 armes => bascule)
	UserInputService.InputChanged:Connect(function(input, processed)
		if processed or input.UserInputType ~= Enum.UserInputType.MouseWheel then
			return
		end
		if bound and canAct() and ClientState.Targeting == nil then
			toggleWeapon()
		end
	end)
	-- Échap annule le ciblage (le menu Roblox peut aussi l'intercepter : voir MenuOpened)
	UserInputService.InputBegan:Connect(function(input)
		if input.KeyCode == Enum.KeyCode.Escape and ClientState.Targeting ~= nil then
			cancelTargeting()
		end
	end)
	UserInputService.WindowFocusReleased:Connect(resetInputs)
	GuiService.MenuOpened:Connect(function()
		resetInputs()
		cancelTargeting()
	end)

	RunService:BindToRenderStep(Tune.RENDER_STEP_NAME, Enum.RenderPriority.Camera.Value + 1, onRenderStep)
end

return GunController
