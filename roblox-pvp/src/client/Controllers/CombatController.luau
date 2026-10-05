-- Côté client : envoi des coups, dash, recul, chiffres de dégâts, effets.
local ContextActionService = game:GetService("ContextActionService")
local Debris = game:GetService("Debris")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Remotes = require(Shared.Remotes)
local Weapons = require(Shared.Weapons)
local Ui = require(script.Parent.Ui)

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera

local Combat = {}

local hud
local lastSwing = 0
local lastDash = -math.huge
local hooked = setmetatable({}, { __mode = "k" })
local hitSound: Sound

local function getCharacterParts()
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if humanoid and root and humanoid.Health > 0 then
		return humanoid, root
	end
	return nil, nil
end

-- Pousse brièvement le personnage (dash / recul).
local function push(root: BasePart, velocity: Vector3, duration: number)
	local attachment = Instance.new("Attachment")
	attachment.Parent = root
	local mover = Instance.new("LinearVelocity")
	mover.Attachment0 = attachment
	mover.MaxForce = 1e5
	mover.VelocityConstraintMode = Enum.VelocityConstraintMode.Vector
	mover.RelativeTo = Enum.ActuatorRelativeTo.World
	mover.VectorVelocity = velocity
	mover.Parent = root
	Debris:AddItem(mover, duration)
	Debris:AddItem(attachment, duration)
end

local function hookTool(tool: Tool)
	if hooked[tool] or not tool:GetAttribute("WeaponId") then
		return
	end
	hooked[tool] = true
	tool.Activated:Connect(function()
		local weapon = Weapons.ById[tool:GetAttribute("WeaponId")]
		local now = os.clock()
		if not weapon or now - lastSwing < weapon.Cooldown then
			return
		end
		lastSwing = now
		Remotes.Swing:FireServer()
	end)
end

local function onDash(_, state: Enum.UserInputState)
	if state ~= Enum.UserInputState.Begin then
		return Enum.ContextActionResult.Pass
	end
	local humanoid, root = getCharacterParts()
	local now = os.clock()
	if not humanoid or now - lastDash < Config.DashCooldown then
		return Enum.ContextActionResult.Sink
	end
	lastDash = now

	local direction = humanoid.MoveDirection
	if direction.Magnitude < 0.1 then
		direction = root.CFrame.LookVector * Vector3.new(1, 0, 1)
	end
	push(root, direction.Unit * Config.DashPower, Config.DashDuration)

	local baseFov = 70
	camera.FieldOfView = baseFov + 12
	Ui.tween(camera, 0.35, { FieldOfView = baseFov })
	hud.DashCooldown(Config.DashCooldown)
	return Enum.ContextActionResult.Sink
end

local function showDamageNumber(position: Vector3, amount: number, crit: boolean)
	local anchor = Instance.new("Part")
	anchor.Anchored = true
	anchor.CanCollide = false
	anchor.CanQuery = false
	anchor.CanTouch = false
	anchor.Transparency = 1
	anchor.Size = Vector3.one * 0.2
	anchor.Position = position + Vector3.new(math.random(-10, 10) / 10, 0, math.random(-10, 10) / 10)
	anchor.Parent = workspace

	local billboard = Ui.new("BillboardGui", {
		Size = UDim2.fromOffset(120, 50),
		AlwaysOnTop = true,
		LightInfluence = 0,
		Parent = anchor,
	})
	local label = Ui.label({
		Size = UDim2.fromScale(1, 1),
		Font = Ui.FontBlack,
		Text = if crit then amount .. "!" else tostring(amount),
		TextColor3 = if crit then Config.Colors.Gold else Color3.new(1, 1, 1),
		TextStrokeTransparency = 0.3,
		Parent = billboard,
	})
	local scale = Ui.new("UIScale", { Scale = if crit then 1.6 else 1.2, Parent = label })
	Ui.tween(scale, 0.25, { Scale = if crit then 1.2 else 0.9 }, Enum.EasingStyle.Back)
	Ui.tween(anchor, 0.8, { Position = anchor.Position + Vector3.new(0, 3, 0) })
	task.delay(0.45, function()
		Ui.tween(label, 0.35, { TextTransparency = 1, TextStrokeTransparency = 1 })
	end)
	Debris:AddItem(anchor, 0.9)
end

local function onCharacter(character: Model)
	character.ChildAdded:Connect(function(child)
		if child:IsA("Tool") then
			hookTool(child)
		end
	end)
	for _, child in character:GetChildren() do
		if child:IsA("Tool") then
			hookTool(child)
		end
	end

	local humanoid = character:WaitForChild("Humanoid") :: Humanoid
	local lastHealth = humanoid.Health
	humanoid.HealthChanged:Connect(function(health)
		if health < lastHealth then
			hud.DamageFlash()
		end
		lastHealth = health
	end)
end

function Combat.Init(hudController)
	hud = hudController

	hitSound = Ui.new("Sound", { SoundId = Config.Sounds.Hit, Volume = 0.5, Parent = SoundService })

	ContextActionService:BindAction("Dash", onDash, true, Enum.KeyCode.Q, Enum.KeyCode.ButtonL1)
	ContextActionService:SetTitle("Dash", "Dash")
	ContextActionService:SetPosition("Dash", UDim2.new(1, -170, 1, -150))

	Remotes.HitConfirm.OnClientEvent:Connect(function(position: Vector3, amount: number, crit: boolean)
		showDamageNumber(position, amount, crit)
		SoundService:PlayLocalSound(hitSound)
	end)

	Remotes.Knockback.OnClientEvent:Connect(function(direction: Vector3)
		local _, root = getCharacterParts()
		if root then
			push(root, direction * Config.KnockbackPower + Vector3.new(0, 12, 0), 0.12)
		end
	end)

	player.CharacterAdded:Connect(onCharacter)
	if player.Character then
		task.spawn(onCharacter, player.Character)
	end
end

return Combat
