-- HUD : pièces, niveau/XP, série, kill feed, annonces, notifications, récompense quotidienne.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Remotes = require(Shared.Remotes)
local Ui = require(script.Parent.Ui)

local player = Players.LocalPlayer

local Hud = {}

local gui: ScreenGui
local coinsLabel, levelLabel, xpFill, xpText, streakLabel
local killFeed, announceLabel, toastHolder, damageFlash
local dailyButton, dashBar
local dailyReadyAt = math.huge
local lastCoins
local uiSound

local function playUi()
	if uiSound then
		SoundService:PlayLocalSound(uiSound)
	end
end

local function buildTopBar()
	local bar = Ui.new("Frame", {
		Name = "TopBar",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 10),
		Size = UDim2.fromOffset(380, 54),
		BackgroundColor3 = Ui.Colors.Background,
		BackgroundTransparency = 0.15,
		Parent = gui,
	}, { Ui.corner(14), Ui.stroke(Config.Colors.Accent, 1.5, 0.6) })

	local badge = Ui.new("Frame", {
		Position = UDim2.fromOffset(7, 7),
		Size = UDim2.fromOffset(40, 40),
		BackgroundColor3 = Config.Colors.Accent,
		Parent = bar,
	}, {
		Ui.corner(20),
		Ui.new("UIGradient", { Color = ColorSequence.new(Config.Colors.Accent, Config.Colors.Accent2), Rotation = 45 }),
	})
	levelLabel = Ui.label({
		Size = UDim2.fromScale(1, 1),
		Font = Ui.FontBlack,
		Text = "1",
		Parent = badge,
	})
	Ui.padding(6).Parent = levelLabel

	local xpBack = Ui.new("Frame", {
		Position = UDim2.fromOffset(56, 30),
		Size = UDim2.new(1, -176, 0, 12),
		BackgroundColor3 = Ui.Colors.PanelLight,
		Parent = bar,
	}, { Ui.corner(6) })
	xpFill = Ui.new("Frame", {
		Size = UDim2.fromScale(0, 1),
		BackgroundColor3 = Config.Colors.Accent,
		Parent = xpBack,
	}, {
		Ui.corner(6),
		Ui.new("UIGradient", { Color = ColorSequence.new(Config.Colors.Accent, Config.Colors.Accent2) }),
	})
	xpText = Ui.label({
		Position = UDim2.fromOffset(56, 8),
		Size = UDim2.new(1, -176, 0, 18),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Ui.Colors.Muted,
		Text = "Niveau 1 • 0 / 100 XP",
		Parent = bar,
	})

	local coinsBox = Ui.new("Frame", {
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -8, 0.5, 0),
		Size = UDim2.fromOffset(106, 38),
		BackgroundColor3 = Ui.Colors.Panel,
		Parent = bar,
	}, { Ui.corner(10), Ui.stroke(Config.Colors.Gold, 1.5, 0.5), Ui.padding(6) })
	coinsLabel = Ui.label({
		Size = UDim2.fromScale(1, 1),
		TextColor3 = Config.Colors.Gold,
		Text = "💰 0",
		Parent = coinsBox,
	})

	streakLabel = Ui.label({
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 70),
		Size = UDim2.fromOffset(240, 26),
		Font = Ui.FontBlack,
		TextColor3 = Color3.fromRGB(255, 140, 50),
		TextStrokeTransparency = 0.6,
		Text = "",
		Parent = gui,
	})
end

local function buildSideButtons(onShop: () -> ())
	local holder = Ui.new("Frame", {
		AnchorPoint = Vector2.new(0, 0.5),
		Position = UDim2.new(0, 12, 0.5, 0),
		Size = UDim2.fromOffset(150, 120),
		BackgroundTransparency = 1,
		Parent = gui,
	}, { Ui.new("UIListLayout", { Padding = UDim.new(0, 10) }) })

	local shop = Ui.button({
		Size = UDim2.fromOffset(150, 52),
		Text = "🛒 Boutique",
		Parent = holder,
	}, Config.Colors.Accent2)
	shop.Activated:Connect(function()
		playUi()
		onShop()
	end)

	dailyButton = Ui.button({
		Size = UDim2.fromOffset(150, 52),
		Text = "🎁 Récompense",
		Parent = holder,
	}, Ui.Colors.PanelLight)
	dailyButton.Activated:Connect(function()
		playUi()
		local ok, value, streak = Remotes.ClaimDaily:InvokeServer()
		if ok then
			Hud.Announce(string.format("🎁 Jour %d : +%d 💰", streak, value), Config.Colors.Gold)
		elseif type(value) == "number" and value > 0 then
			Hud.Toast("Prochaine récompense dans " .. Ui.formatTime(value))
		end
	end)
end

local function buildFeedAndMessages()
	killFeed = Ui.new("Frame", {
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -12, 0, 60),
		Size = UDim2.fromOffset(320, 220),
		BackgroundTransparency = 1,
		Parent = gui,
	}, {
		Ui.new("UIListLayout", {
			Padding = UDim.new(0, 6),
			HorizontalAlignment = Enum.HorizontalAlignment.Right,
			SortOrder = Enum.SortOrder.LayoutOrder,
		}),
	})

	announceLabel = Ui.label({
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.27),
		Size = UDim2.new(0.8, 0, 0, 48),
		Font = Ui.FontBlack,
		TextTransparency = 1,
		TextStrokeTransparency = 1,
		Text = "",
		Parent = gui,
	})

	toastHolder = Ui.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -110),
		Size = UDim2.fromOffset(360, 160),
		BackgroundTransparency = 1,
		Parent = gui,
	}, {
		Ui.new("UIListLayout", {
			Padding = UDim.new(0, 6),
			HorizontalAlignment = Enum.HorizontalAlignment.Center,
			VerticalAlignment = Enum.VerticalAlignment.Bottom,
			SortOrder = Enum.SortOrder.LayoutOrder,
		}),
	})

	damageFlash = Ui.new("Frame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Config.Colors.Bad,
		BackgroundTransparency = 1,
		ZIndex = 0,
		Parent = gui,
	})

	local dashBack = Ui.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -80),
		Size = UDim2.fromOffset(120, 6),
		BackgroundColor3 = Ui.Colors.PanelLight,
		BackgroundTransparency = 0.3,
		Parent = gui,
	}, { Ui.corner(3) })
	dashBar = Ui.new("Frame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Config.Colors.Accent,
		Parent = dashBack,
	}, { Ui.corner(3) })
	Ui.label({
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 0, -2),
		Size = UDim2.fromOffset(160, 14),
		TextColor3 = Ui.Colors.Muted,
		Text = "[Q] Dash",
		Parent = dashBack,
	})
end

local feedOrder = 0
function Hud.KillFeed(killerName: string?, victimName: string, weaponName: string?)
	feedOrder += 1
	local involved = killerName == player.DisplayName or victimName == player.DisplayName
	local text = if killerName
		then string.format("<b>%s</b>  ⚔  %s", killerName, victimName)
		else string.format("💀 %s", victimName)

	local entry = Ui.new("Frame", {
		LayoutOrder = -feedOrder,
		Size = UDim2.fromOffset(0, 30),
		AutomaticSize = Enum.AutomaticSize.X,
		BackgroundColor3 = if involved then Config.Colors.Accent2 else Ui.Colors.Background,
		BackgroundTransparency = if involved then 0.3 else 0.25,
		Parent = killFeed,
	}, { Ui.corner(8), Ui.padding(6) })
	local label = Ui.label({
		Size = UDim2.fromOffset(0, 18),
		AutomaticSize = Enum.AutomaticSize.X,
		TextScaled = false,
		TextSize = 16,
		RichText = true,
		Text = text,
		Parent = entry,
	})
	if weaponName then
		label.Text ..= string.format("  <font color=\"#9AA0B5\">[%s]</font>", weaponName)
	end

	local entries = {}
	for _, child in killFeed:GetChildren() do
		if child:IsA("Frame") then
			table.insert(entries, child)
		end
	end
	table.sort(entries, function(a, b)
		return a.LayoutOrder < b.LayoutOrder
	end)
	for i = 7, #entries do
		entries[i]:Destroy()
	end

	task.delay(6, function()
		if entry.Parent then
			Ui.tween(entry, 0.4, { BackgroundTransparency = 1 })
			Ui.tween(label, 0.4, { TextTransparency = 1 }).Completed:Wait()
			entry:Destroy()
		end
	end)
end

local announceToken = 0
function Hud.Announce(text: string, color: Color3?)
	announceToken += 1
	local token = announceToken
	announceLabel.Text = text
	announceLabel.TextColor3 = color or Ui.Colors.Text
	announceLabel.TextTransparency = 0
	announceLabel.TextStrokeTransparency = 0.4
	announceLabel.Size = UDim2.new(0.8, 0, 0, 70)
	Ui.tween(announceLabel, 0.35, { Size = UDim2.new(0.8, 0, 0, 48) }, Enum.EasingStyle.Back)
	task.delay(2.6, function()
		if token == announceToken then
			Ui.tween(announceLabel, 0.5, { TextTransparency = 1, TextStrokeTransparency = 1 })
		end
	end)
end

local toastOrder = 0
function Hud.Toast(text: string)
	toastOrder += 1
	local toast = Ui.new("Frame", {
		LayoutOrder = toastOrder,
		Size = UDim2.fromOffset(0, 32),
		AutomaticSize = Enum.AutomaticSize.X,
		BackgroundColor3 = Ui.Colors.Background,
		BackgroundTransparency = 0.2,
		Parent = toastHolder,
	}, { Ui.corner(10), Ui.padding(7), Ui.stroke(Config.Colors.Gold, 1.2, 0.5) })
	local label = Ui.label({
		Size = UDim2.fromOffset(0, 18),
		AutomaticSize = Enum.AutomaticSize.X,
		TextScaled = false,
		TextSize = 17,
		TextColor3 = Config.Colors.Gold,
		Text = text,
		Parent = toast,
	})
	task.delay(2.5, function()
		Ui.tween(toast, 0.4, { BackgroundTransparency = 1 })
		Ui.tween(label, 0.4, { TextTransparency = 1 }).Completed:Wait()
		toast:Destroy()
	end)
end

function Hud.DamageFlash()
	damageFlash.BackgroundTransparency = 0.75
	Ui.tween(damageFlash, 0.4, { BackgroundTransparency = 1 })
end

function Hud.DashCooldown(duration: number)
	dashBar.Size = UDim2.fromScale(0, 1)
	dashBar.BackgroundColor3 = Ui.Colors.Muted
	local tween = Ui.tween(dashBar, duration, { Size = UDim2.fromScale(1, 1) }, Enum.EasingStyle.Linear)
	tween.Completed:Connect(function(state)
		if state == Enum.PlaybackState.Completed then
			dashBar.BackgroundColor3 = Config.Colors.Accent
		end
	end)
end

function Hud.OnData(data)
	if not data then
		return
	end
	if lastCoins and data.Coins ~= lastCoins then
		local scale = coinsLabel.Parent:FindFirstChildOfClass("UIScale") or Ui.new("UIScale", { Parent = coinsLabel.Parent })
		scale.Scale = 1.15
		Ui.tween(scale, 0.3, { Scale = 1 }, Enum.EasingStyle.Back)
	end
	lastCoins = data.Coins
	coinsLabel.Text = "💰 " .. Ui.formatNumber(data.Coins)
	levelLabel.Text = tostring(data.Level)
	xpText.Text = string.format("Niveau %d • %d / %d XP%s", data.Level, data.Xp, data.XpNeeded, if data.Vip then "  👑 VIP" else "")
	Ui.tween(xpFill, 0.4, { Size = UDim2.fromScale(math.clamp(data.Xp / data.XpNeeded, 0, 1), 1) })
	dailyReadyAt = os.clock() + data.DailyIn
end

function Hud.Init(callbacks)
	gui = Ui.new("ScreenGui", {
		Name = "HUD",
		ResetOnSpawn = false,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		Parent = player:WaitForChild("PlayerGui"),
	})

	uiSound = Ui.new("Sound", { SoundId = Config.Sounds.Ui, Volume = 0.4, Parent = SoundService })

	buildTopBar()
	buildSideButtons(callbacks.OnShop)
	buildFeedAndMessages()

	Remotes.KillFeed.OnClientEvent:Connect(Hud.KillFeed)
	Remotes.Announce.OnClientEvent:Connect(Hud.Announce)
	Remotes.Toast.OnClientEvent:Connect(Hud.Toast)

	-- Série affichée depuis les leaderstats
	task.spawn(function()
		local leaderstats = player:WaitForChild("leaderstats")
		local streak = leaderstats:WaitForChild("Série") :: IntValue
		local function update()
			streakLabel.Text = if streak.Value > 0 then "🔥 Série : " .. streak.Value else ""
		end
		streak.Changed:Connect(update)
		update()
	end)

	-- Compte à rebours de la récompense quotidienne
	task.spawn(function()
		while true do
			local remaining = dailyReadyAt - os.clock()
			if remaining <= 0 then
				dailyButton.Text = "🎁 Récupérer !"
				dailyButton.BackgroundColor3 = Config.Colors.Good
			elseif remaining == math.huge then
				dailyButton.Text = "🎁 Récompense"
			else
				dailyButton.Text = "🎁 " .. Ui.formatTime(remaining)
				dailyButton.BackgroundColor3 = Ui.Colors.PanelLight
			end
			task.wait(1)
		end
	end)
end

return Hud
