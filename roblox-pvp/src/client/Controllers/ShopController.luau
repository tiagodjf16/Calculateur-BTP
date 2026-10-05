-- Fenêtre de boutique : acheter / équiper les armes.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Remotes = require(Shared.Remotes)
local Weapons = require(Shared.Weapons)
local Ui = require(script.Parent.Ui)

local player = Players.LocalPlayer

local Shop = {}

local window: Frame
local cards = {} -- [weaponId] = { button, price }
local currentData
local onMessage: (string, Color3?) -> ()

local function refresh()
	if not currentData then
		return
	end
	for id, card in cards do
		local weapon = Weapons.ById[id]
		local button = card.Button
		if currentData.Equipped == id then
			button.Text = "✔ Équipée"
			button.BackgroundColor3 = Ui.Colors.PanelLight
		elseif currentData.Owned[id] then
			button.Text = "Équiper"
			button.BackgroundColor3 = Config.Colors.Accent
		else
			button.Text = "💰 " .. Ui.formatNumber(weapon.Price)
			button.BackgroundColor3 = if currentData.Coins >= weapon.Price then Config.Colors.Good else Color3.fromRGB(90, 70, 75)
		end
	end
end

local function buildCard(weapon, parent: Instance)
	local card = Ui.new("Frame", {
		LayoutOrder = weapon.Order,
		BackgroundColor3 = Ui.Colors.Panel,
		Parent = parent,
	}, { Ui.corner(12), Ui.stroke(weapon.Color, 2, 0.4), Ui.padding(10) })

	local preview = Ui.new("Frame", {
		Size = UDim2.new(1, 0, 0, 56),
		BackgroundColor3 = Ui.Colors.Background,
		Parent = card,
	}, { Ui.corner(10) })
	Ui.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(0.75, 0, 0, 8),
		Rotation = -12,
		BackgroundColor3 = weapon.Color,
		Parent = preview,
	}, { Ui.corner(4) })

	Ui.label({
		Position = UDim2.fromOffset(0, 62),
		Size = UDim2.new(1, 0, 0, 22),
		Font = Ui.FontBlack,
		Text = weapon.Name,
		Parent = card,
	})
	Ui.label({
		Position = UDim2.fromOffset(0, 88),
		Size = UDim2.new(1, 0, 0, 50),
		TextScaled = false,
		TextSize = 14,
		TextWrapped = true,
		TextColor3 = Ui.Colors.Muted,
		Text = string.format(
			"⚔ %d dégâts\n⏱ %.2fs  •  📏 %.1f\n🔥 %.0f DPS",
			weapon.Damage,
			weapon.Cooldown,
			weapon.Range,
			weapon.Damage / weapon.Cooldown
		),
		Parent = card,
	})

	local button = Ui.button({
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.fromScale(0, 1),
		Size = UDim2.new(1, 0, 0, 36),
		Text = "...",
		Parent = card,
	}, Config.Colors.Good)

	button.Activated:Connect(function()
		if not currentData or currentData.Equipped == weapon.Id then
			return
		end
		local remote = if currentData.Owned[weapon.Id] then Remotes.EquipWeapon else Remotes.BuyWeapon
		local ok, message = remote:InvokeServer(weapon.Id)
		onMessage(message, if ok then Config.Colors.Good else Config.Colors.Bad)
	end)

	cards[weapon.Id] = { Button = button }
end

function Shop.Toggle()
	window.Visible = not window.Visible
	if window.Visible then
		local scale = window:FindFirstChildOfClass("UIScale")
		scale.Scale = 0.85
		Ui.tween(scale, 0.25, { Scale = 1 }, Enum.EasingStyle.Back)
	end
end

function Shop.OnData(data)
	currentData = data
	refresh()
end

function Shop.Init(messageCallback: (string, Color3?) -> ())
	onMessage = messageCallback

	local gui = Ui.new("ScreenGui", {
		Name = "Shop",
		ResetOnSpawn = false,
		DisplayOrder = 5,
		Parent = player:WaitForChild("PlayerGui"),
	})

	window = Ui.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromScale(0.9, 0.8),
		BackgroundColor3 = Ui.Colors.Background,
		BackgroundTransparency = 0.05,
		Visible = false,
		Parent = gui,
	}, {
		Ui.corner(18),
		Ui.stroke(Config.Colors.Accent, 2, 0.4),
		Ui.padding(16),
		Ui.new("UISizeConstraint", { MaxSize = Vector2.new(720, 470) }),
		Ui.new("UIScale"),
	})

	Ui.label({
		Size = UDim2.new(1, -50, 0, 34),
		Font = Ui.FontBlack,
		TextXAlignment = Enum.TextXAlignment.Left,
		Text = "🛒 ARSENAL",
		Parent = window,
	})

	local close = Ui.button({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(1, 0),
		Size = UDim2.fromOffset(36, 36),
		Text = "✕",
		Parent = window,
	}, Config.Colors.Bad)
	close.Activated:Connect(Shop.Toggle)

	local scroller = Ui.new("ScrollingFrame", {
		Position = UDim2.fromOffset(0, 46),
		Size = UDim2.new(1, 0, 1, -46),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = 6,
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		CanvasSize = UDim2.new(),
		Parent = window,
	}, {
		Ui.new("UIGridLayout", {
			CellSize = UDim2.fromOffset(200, 230),
			CellPadding = UDim2.fromOffset(12, 12),
			HorizontalAlignment = Enum.HorizontalAlignment.Center,
			SortOrder = Enum.SortOrder.LayoutOrder,
		}),
	})

	for _, weapon in Weapons.List do
		buildCard(weapon, scroller)
	end
end

return Shop
